// @ts-nocheck

const express = require('express');
const router = express.Router();
const { createLogger } = require('../dist/utils/logger');
const { cacheMiddleware } = require('../middleware/cache');

const logger = createLogger('AIRoutes');

// Import AI providers (Claude - with MCP tool support)
const { claudeProvider } = require('../dist/providers/claude');
const { claudeLegacyProvider } = require('../dist/providers/claude-legacy');

// Provider registry - current SDK implementation and legacy fallback
/** @type {Record<string, typeof claudeProvider>} */
const providers = {
  claude: claudeProvider,
  'claude-legacy': claudeLegacyProvider
};

// Get available providers (cached for 1 hour)
router.get('/providers', cacheMiddleware(3600000), (req, res) => {
  try {
    const availableProviders = [];
    
    for (const [name, provider] of Object.entries(providers)) {
      if (provider.isAvailable()) {
        availableProviders.push({
          name,
          displayName: provider.getDisplayName(),
          models: provider.getModels(),
          status: 'available'
        });
      }
    }

    res.json({
      success: true,
      providers: availableProviders,
      total: availableProviders.length
    });
  } catch (error) {
    console.error('Error getting providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get providers',
      message: error.message
    });
  }
});

// Get models for a specific provider
router.get('/providers/:provider/models', (req, res) => {
  try {
    const { provider: providerName } = req.params;
    const provider = providers[providerName];

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        provider: providerName
      });
    }

    if (!provider.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Provider not available',
        provider: providerName,
        reason: 'API key not configured'
      });
    }

    const models = provider.getModels();
    
    res.json({
      success: true,
      provider: providerName,
      models: models
    });
  } catch (error) {
    console.error(`Error getting models for ${req.params.provider}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: error.message
    });
  }
});

// Chat completion endpoint
router.post('/chat', async (req, res) => {
  try {
    const {
      provider: providerName = 'claude',
      model = '',
      messages = [],
      temperature = 0.7,
      max_tokens = 1000,
      stream = false
    } = req.body;

    // Validate request
    if (!messages || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required and cannot be empty'
      });
    }

    // Get provider
    const provider = providers[providerName];
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'Provider not found',
        provider: providerName,
        available: Object.keys(providers)
      });
    }

    if (!provider.isAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'Provider not available',
        provider: providerName,
        reason: 'API key not configured'
      });
    }

    const modelToUse = model || provider.getDefaultModel();

    // Get userId from request (for MCP server configuration)
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if tools are available
    const hasTools = provider.getAvailableTools ?
      (await provider.getAvailableTools(userId)).length > 0 : false;
    
    // With tools, we use SSE for progress updates but not for streaming content
    let actualStream = stream;

    logger.info('Processing chat request', {
      provider: providerName,
      model: modelToUse,
      messageCount: messages.length,
      userId,
      stream: actualStream,
      hasTools
    });

    // Handle streaming response with tools (SSE for progress updates)
    if (stream && hasTools) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (payload) => {
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch (error) {
            logger.error('Error writing SSE event', error);
          }
        }
      };

      try {
        let toolsWereCalled = false;
        let isFirstTool = true;

        // Execute chat with tool callbacks
        const response = await provider.chat({
          model: modelToUse,
          messages,
          temperature,
          max_tokens,
          userId,
          onToolStart: (toolName, toolInput) => {
            logger.info('Tool execution started', { toolName });
            
            // Send initial status only when first tool is called
            if (isFirstTool) {
              sendEvent({
                type: 'status',
                message: '🔧 Calling tools to complete your request...\n'
              });
              isFirstTool = false;
            }
            
            toolsWereCalled = true;
            sendEvent({
              type: 'tool_start',
              toolName,
              toolInput,
              message: `Executing ${toolName}...`
            });
          },
          onToolEnd: (toolName, toolResult) => {
            logger.info('Tool execution completed', { toolName });
            sendEvent({
              type: 'tool_end',
              toolName,
              message: `${toolName} completed`
            });
          }
        });

        // Send final response as content chunks
        if (response.content) {
          // Add spacing after tool execution if tools were used
          const contentWithSpacing = toolsWereCalled 
            ? '\n' + response.content 
            : response.content;
          
          sendEvent({
            type: 'content',
            text: contentWithSpacing
          });
        }

        // Send metadata
        sendEvent({
          type: 'metadata',
          model: response.model || modelToUse,
          provider: providerName,
          usage: response.usage,
          metadata: response.metadata
        });

        // Send done signal
        sendEvent({ type: 'done' });

      } catch (error) {
        logger.error('Tool execution error', error);
        sendEvent({
          type: 'error',
          message: error.message || 'Tool execution failed'
        });
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }

      return;
    }

    // Handle streaming response (without tools)
    if (actualStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const abortController = new AbortController();
      let isClientConnected = true;

      const cleanup = () => {
        res.removeListener('close', handleClose);
        res.removeListener('error', handleError);
        req.removeListener('aborted', handleAbort);
      };

      /**
       * @param {'closed'|'error'|'aborted'|'write_failed'} reason
       * @param {Error|undefined} [disconnectError]
       */
      const terminate = (reason, disconnectError) => {
        if (!isClientConnected) {
          return;
        }

        isClientConnected = false;
        if (!abortController.signal.aborted) {
          abortController.abort();
        }

        if (disconnectError) {
          logger.warn(`Streaming connection ${reason}`, { message: disconnectError.message });
        } else {
          logger.info(`Streaming connection ${reason}`);
        }
      };

      const handleClose = () => terminate('closed');
      /**
       * @param {Error} err
       */
      const handleError = (err) => terminate('error', err);
      const handleAbort = () => terminate('aborted');

      res.on('close', handleClose);
      res.on('error', handleError);
      req.on('aborted', handleAbort);

      /**
       * @param {unknown} payload
       */
      const sendEvent = (payload) => {
        if (!isClientConnected || res.writableEnded) {
          return;
        }

        try {
          if (payload === '[DONE]') {
            res.write('data: [DONE]\n\n');
          } else {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        } catch (writeError) {
          terminate('write_failed', /** @type {Error} */ (writeError));
        }
      };

      try {
        const response = await provider.chat({
          model: modelToUse,
          messages,
          temperature,
          max_tokens,
          userId,
          stream: true,
          signal: abortController.signal,
          onStream: (chunk) => sendEvent(chunk)
        });

        if (isClientConnected) {
          sendEvent({
            type: 'metadata',
            model: response.model || modelToUse,
            provider: providerName,
            usage: response.usage,
            metadata: response.metadata
          });
          sendEvent('[DONE]');
        }
      } catch (error) {
        if (abortController.signal.aborted || !isClientConnected) {
          logger.debug('Streaming aborted', { reason: error && error.message });
        } else {
          logger.error('Streaming error', error);
          sendEvent({
            type: 'error',
            message: error instanceof Error ? error.message : 'Streaming request failed'
          });
        }
      } finally {
        cleanup();
        if (!res.writableEnded) {
          res.end();
        }
      }

      return;
    }

    // Pure non-streaming response (no tools, streaming not requested)
    const response = await provider.chat({
      model: modelToUse,
      messages,
      temperature,
      max_tokens,
      userId
    });

    res.json({
      success: true,
      message: {
        content: response.content,
        model: response.model || modelToUse,
        provider: providerName
      },
      usage: response.usage,
      metadata: response.metadata
    });

  } catch (error) {
    logger.error('Chat completion error', error);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Network error',
        message: 'Unable to connect to AI provider'
      });
    }

    if (error.response) {
      const status = error.response.status || 500;
      const message = error.response.data?.error?.message || 
                     error.response.data?.message || 
                     'AI provider returned an error';
      
      return res.status(status).json({
        success: false,
        error: 'AI provider error',
        message: message,
        statusCode: status
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Model information endpoint
router.get('/models', (req, res) => {
  try {
    const allModels = [];

    for (const [providerName, provider] of Object.entries(providers)) {
      if (provider.isAvailable()) {
        const models = provider.getModels();
        models.forEach(model => {
          allModels.push({
            ...model,
            provider: providerName,
            providerDisplayName: provider.getDisplayName()
          });
        });
      }
    }

    // Sort by provider and then by model name
    allModels.sort((a, b) => {
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      models: allModels,
      total: allModels.length,
      byProvider: Object.keys(providers).reduce((acc, name) => {
        if (providers[name].isAvailable()) {
          acc[name] = providers[name].getModels().length;
        }
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error getting all models:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: error.message
    });
  }
});

module.exports = router;
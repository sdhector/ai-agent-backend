// @ts-nocheck

const express = require('express');
const router = express.Router();
const { createLogger } = require('../dist/utils/logger');
const { cacheMiddleware } = require('../middleware/cache');

const logger = createLogger('AIRoutes');

// Helper to sanitize error messages for production
const isProduction = process.env.NODE_ENV === 'production';
function getSafeErrorMessage(error, fallbackMessage) {
  // In production, don't expose internal error details
  if (isProduction) {
    return fallbackMessage;
  }
  // In development, show detailed error for debugging
  return error?.message || fallbackMessage;
}

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
    logger.error('Error getting providers', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get providers',
      message: getSafeErrorMessage(error, 'Unable to retrieve providers')
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
    logger.error(`Error getting models for ${req.params.provider}`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: getSafeErrorMessage(error, 'Unable to retrieve models')
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
            const data = `data: ${JSON.stringify(payload)}\n\n`;
            res.write(data);
            logger.debug('Sent SSE event', { type: payload.type || 'unknown' });
          } catch (error) {
            logger.error('Error writing SSE event', error);
          }
        } else {
          logger.warn('Response stream already ended, cannot send event', { type: payload.type || 'unknown' });
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
        logger.info('Tool execution completed', {
          hasContent: response.content !== undefined && response.content !== null,
          contentLength: response.content?.length || 0,
          contentType: typeof response.content,
          toolsWereCalled
        });

        // Always send content event - provider should always return content
        // If content is empty, send a fallback message
        const contentToSend = response.content !== undefined && response.content !== null && response.content !== ''
          ? response.content
          : (toolsWereCalled 
              ? 'Tool execution completed successfully.'
              : 'No response generated.');

        // Add spacing after tool execution if tools were used
        const contentWithSpacing = toolsWereCalled && contentToSend 
          ? '\n' + contentToSend 
          : contentToSend;
        
        logger.info('Sending content event', {
          contentLength: contentWithSpacing.length,
          preview: contentWithSpacing.substring(0, 100),
          isFallback: !response.content || response.content === ''
        });
        
        sendEvent({
          type: 'content',
          text: contentWithSpacing
        });

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
          const eventType = typeof payload === 'object' && payload !== null && payload !== undefined
            ? (payload.type || 'unknown')
            : 'unknown';
          logger.debug('Cannot send event - client disconnected or stream ended', {
            isClientConnected,
            writableEnded: res.writableEnded,
            type: eventType
          });
          return;
        }

        try {
          let data;
          if (payload === '[DONE]') {
            data = 'data: [DONE]\n\n';
          } else {
            data = `data: ${JSON.stringify(payload)}\n\n`;
          }
          res.write(data);
          const eventType = typeof payload === 'object' && payload !== null && payload !== undefined
            ? (payload.type || 'unknown')
            : 'unknown';
          logger.debug('Sent SSE event', {
            type: eventType
          });
        } catch (writeError) {
          terminate('write_failed', writeError);
        }
      };

      try {
        let contentReceived = false;
        
        const response = await provider.chat({
          model: modelToUse,
          messages,
          temperature,
          max_tokens,
          userId,
          stream: true,
          signal: abortController.signal,
          onStream: (chunk) => {
            const chunkText = chunk && typeof chunk === 'object' && 'text' in chunk
              ? chunk.text
              : undefined;
            logger.debug('Stream chunk received', { 
              type: chunk && typeof chunk === 'object' && 'type' in chunk ? chunk.type : 'unknown',
              hasText: !!chunkText,
              textLength: chunkText ? chunkText.length : 0
            });
            
            if (chunk && typeof chunk === 'object' && chunk.type === 'content') {
              contentReceived = true;
            }
            
            sendEvent(chunk);
          }
        });

        logger.info('Streaming completed', {
          contentReceived,
          model: response.model || modelToUse,
          usage: response.usage
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
      message: getSafeErrorMessage(error, 'An error occurred processing your request')
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
    logger.error('Error getting all models', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: getSafeErrorMessage(error, 'Unable to retrieve models')
    });
  }
});

module.exports = router;
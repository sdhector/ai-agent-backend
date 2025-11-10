import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { BaseAIProvider } from './base-provider';
import { getModelsForProvider } from '../config/models';
import { db } from '../config/database';
import config from '../config';
import { ConnectionManager } from '../services/mcp/ConnectionManager';
import { ToolRegistry } from '../services/mcp/ToolRegistry';
import { OAuthHandler } from '../services/mcp/OAuthHandler';
import { createEncryptionService } from '../services/encryption';
import type {
  ChatMessage,
  MessageContent,
  NormalizedChatParams,
  ProviderRawResponse,
  ProviderTool,
  StreamCallback,
  Model,
  ProviderErrorHandlers,
  ToolSchema
} from '../types/provider';
import type { Pool } from 'pg';
import type { ClientCredentials, OAuthMetadata } from '../types/mcp';

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ToolCacheRow {
  tool_name: string;
  tool_description: string | null;
  input_schema: unknown;
  server_url: string;
}

interface MCPServerRow {
  id: string;
  url: string;
  name: string;
  client_credentials: unknown;
  oauth_metadata: unknown;
}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface ConvertedMessages {
  system?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: MessageContent;
  }>;
}

/**
 * Claude provider using the official Anthropic SDK
 * 
 * This is the primary Claude implementation using the official SDK.
 * Key features:
 * - Uses @anthropic-ai/sdk instead of direct axios HTTP calls
 * - Built-in type safety with SDK types
 * - Automatic retry logic
 * - Simplified streaming with SDK helpers
 * - Better error handling with specific error classes
 * - Built-in datetime tool for providing current date/time/timezone
 * 
 * MCP integration for external tools is fully supported.
 */
export class ClaudeProvider extends BaseAIProvider {
  private readonly anthropic: Anthropic;
  private readonly maxToolIterations = 10;

  constructor() {
    super({
      name: 'claude',
      displayName: 'Claude',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      baseURL: 'https://api.anthropic.com/v1'
    });

    // Initialize Anthropic client with API key
    this.anthropic = new Anthropic({
      apiKey: this.apiKey,
      maxRetries: 2, // SDK handles retries automatically
    });
  }

  public getModels(): Model[] {
    return getModelsForProvider('claude');
  }

  public override getErrorMessages(): ProviderErrorHandlers {
    const base = super.getErrorMessages();
    return {
      ...base,
      529: () => `${this.getDisplayName()} API overloaded, try again later`
    };
  }

  /**
   * Get built-in tools that don't require MCP servers
   */
  private getBuiltInTools(): ProviderTool[] {
    return [
      {
        name: 'get_current_datetime',
        description: 'Get the current date, time, and timezone information. Use this when you need to know what time it is now, what day it is, or perform any time-based operations.',
        input_schema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Optional timezone to get the time for (e.g., "America/New_York", "Europe/London"). If not provided, uses the system timezone.',
            }
          }
        }
      }
    ];
  }

  /**
   * Execute built-in tools
   */
  private executeBuiltInTool(toolName: string, toolInput: Record<string, unknown>): unknown {
    if (toolName === 'get_current_datetime') {
      const timezone = toolInput.timezone as string | undefined;
      
      const now = new Date();
      const timeZone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          weekday: 'long',
          timeZoneName: 'long'
        });
        
        const parts = formatter.formatToParts(now);
        const partsMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
        
        return {
          datetime: now.toISOString(),
          timezone: timeZone,
          formatted: formatter.format(now),
          components: {
            year: partsMap.year,
            month: partsMap.month,
            day: partsMap.day,
            weekday: partsMap.weekday,
            hour: partsMap.hour,
            minute: partsMap.minute,
            second: partsMap.second,
            timeZoneName: partsMap.timeZoneName
          },
          unix_timestamp: Math.floor(now.getTime() / 1000)
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Invalid timezone "${timezone}": ${message}`);
      }
    }
    
    throw new Error(`Unknown built-in tool: ${toolName}`);
  }

  public async getAvailableTools(userId: string): Promise<ProviderTool[]> {
    // Start with built-in tools
    const builtInTools = this.getBuiltInTools();
    
    const pool = this.getDatabasePool();

    if (!pool) {
      this.logger.debug('Database not available, returning only built-in tools');
      return builtInTools;
    }

    try {
      const result = await pool.query<ToolCacheRow>(
        `SELECT DISTINCT 
           tc.tool_name,
           tc.tool_description,
           tc.input_schema,
           s.url as server_url
         FROM mcp_tool_cache tc
         JOIN mcp_servers s ON tc.server_id = s.id
         WHERE s.user_id = $1 AND s.status = 'connected'
         ORDER BY tc.tool_name`,
        [userId]
      );

      const mcpTools = result.rows.map((row) => ({
        name: row.tool_name,
        description: row.tool_description ?? `Execute ${row.tool_name} tool`,
        input_schema: this.normalizeInputSchema(row.input_schema)
      }));
      
      // Combine built-in tools with MCP tools
      return [...builtInTools, ...mcpTools];
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug('Failed to fetch MCP tools, returning only built-in tools', { error: message });
      return builtInTools;
    }
  }

  public async executeTool(toolName: string, toolInput: Record<string, unknown>, userId: string): Promise<unknown> {
    // Check if this is a built-in tool
    const builtInTools = this.getBuiltInTools();
    const isBuiltIn = builtInTools.some(tool => tool.name === toolName);
    
    if (isBuiltIn) {
      this.logger.info('Executing built-in tool', { toolName });
      return this.executeBuiltInTool(toolName, toolInput);
    }
    
    // Otherwise, execute as MCP tool
    const pool = this.getDatabasePool();
    if (!pool) {
      throw new Error('Database not available for MCP tool execution');
    }

    try {
      const serverResult = await pool.query<MCPServerRow>(
        `SELECT s.id, s.url, s.name, s.client_credentials, s.oauth_metadata
         FROM mcp_servers s
         JOIN mcp_tool_cache tc ON s.id = tc.server_id
         WHERE s.user_id = $1 AND s.status = 'connected' AND tc.tool_name = $2
         LIMIT 1`,
        [userId, toolName]
      );

      if (serverResult.rows.length === 0) {
        throw new Error(`Tool ${toolName} not found or server not connected`);
      }

      const serverRow = serverResult.rows[0];
      const oauthMetadata = this.ensureOAuthMetadata(serverRow.oauth_metadata);
      const clientCredentials = this.ensureClientCredentials(serverRow.client_credentials);

      const tokenResult = await pool.query<TokenRow>(
        `SELECT access_token, refresh_token, expires_at
         FROM mcp_tokens
         WHERE server_id = $1 AND user_id = $2
         LIMIT 1`,
        [serverRow.id, userId]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error(`No OAuth token found for server ${serverRow.name}`);
      }

      const tokenData = tokenResult.rows[0];
      
      // Decrypt tokens if encryption is enabled
      let accessToken = tokenData.access_token;
      let refreshToken = tokenData.refresh_token;
      
      if (config.mcp?.encryption?.masterKey) {
        try {
          const encryptionService = createEncryptionService(config.mcp.encryption.masterKey);
          accessToken = encryptionService.decryptToken(accessToken);
          if (refreshToken) {
            refreshToken = encryptionService.decryptToken(refreshToken);
          }
          this.logger.info('Tokens decrypted successfully', { 
            server: serverRow.name,
            tokenLength: accessToken.length 
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Failed to decrypt tokens', null, { error: message });
          throw new Error('Token decryption failed. Please reconnect.');
        }
      }

      const expiresAt = new Date(tokenData.expires_at);
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

      if (expiresAt <= fiveMinutesFromNow) {
        this.logger.info('Access token expired or expiring soon, refreshing...', {
          expiresAt: expiresAt.toISOString(),
          server: serverRow.name
        });

        const oauthHandler = this.createOAuthHandler();

        try {
          const refreshed = await oauthHandler.refreshAccessToken(
            oauthMetadata.token_endpoint,
            clientCredentials,
            refreshToken  // Use decrypted refresh token
          );

          // Encrypt the new tokens before saving
          let newAccessToken = refreshed.access_token;
          let newRefreshToken = refreshed.refresh_token;
          
          if (config.mcp?.encryption?.masterKey) {
            const encryptionService = createEncryptionService(config.mcp.encryption.masterKey);
            newAccessToken = encryptionService.encryptToken(refreshed.access_token);
            if (refreshed.refresh_token) {
              newRefreshToken = encryptionService.encryptToken(refreshed.refresh_token);
            }
          }

          await pool.query(
            `UPDATE mcp_tokens 
             SET access_token = $1, refresh_token = $2, expires_at = $3, last_refreshed_at = CURRENT_TIMESTAMP
             WHERE server_id = $4 AND user_id = $5`,
            [newAccessToken, newRefreshToken || refreshToken, refreshed.expires_at, serverRow.id, userId]
          );

          accessToken = refreshed.access_token;  // Use plain token for connection
          this.logger.info('Token refreshed successfully', { server: serverRow.name });
        } catch (refreshError) {
          const message = refreshError instanceof Error ? refreshError.message : 'Unknown error';
          this.logger.error('Failed to refresh token', null, { error: message, server: serverRow.name });
          throw new Error(`Token refresh failed: ${message}`);
        }
      }

      const toolRegistry = new ToolRegistry();
      const oauthHandler = this.createOAuthHandler();
      const connectionManager = new ConnectionManager(oauthHandler, toolRegistry);
      const client = await connectionManager.connect(serverRow.url, accessToken);

      this.logger.info('Executing tool via MCP', { toolName, server: serverRow.name });
      return toolRegistry.executeTool(toolName, toolInput, client);
    } catch (error) {
      this.logger.error('Tool execution failed', error instanceof Error ? error : new Error(String(error)));
      throw error instanceof Error ? error : new Error('Tool execution failed');
    }
  }

  protected async callProvider(params: NormalizedChatParams): Promise<ProviderRawResponse> {
    const tools = params.userId ? await this.getAvailableTools(params.userId) : [];

    if (tools.length === 0) {
      return this.callProviderWithoutTools({ ...params, tools: undefined });
    }

    if (!params.userId) {
      throw new Error('User ID is required to execute MCP tools');
    }

    return this.callProviderWithTools({ ...params, tools });
  }

  private async callProviderWithoutTools(params: NormalizedChatParams & { tools?: undefined }): Promise<ProviderRawResponse> {
    const { system, messages } = this.convertMessages(params.messages);

    this.logger.info('Processing chat request (no tools)', {
      model: params.model,
      messageCount: messages.length,
      stream: params.stream ?? false
    });

    // Use SDK for API call
    if (params.stream && params.onStream) {
      return this.streamResponse(
        params.model,
        messages,
        system,
        params.max_tokens,
        params.temperature,
        params.onStream,
        params.signal ?? null
      );
    }

    // Non-streaming call using SDK
    const response = await this.anthropic.messages.create({
      model: params.model,
      max_tokens: Math.min(params.max_tokens, 4096),
      temperature: Math.max(0, Math.min(1, params.temperature)),
      messages: messages as Anthropic.MessageParam[],
      system: system,
    });

    // Extract text content from response
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n') || 'No content generated';

    return {
      content,
      model: response.model,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason ?? undefined
    };
  }

  private async streamResponse(
    model: string,
    messages: Array<{ role: 'user' | 'assistant'; content: MessageContent }>,
    system: string | undefined,
    maxTokens: number,
    temperature: number,
    onStream: StreamCallback,
    signal: AbortSignal | null
  ): Promise<ProviderRawResponse> {
    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let modelUsed = model;

    try {
      // Create streaming request using SDK
      const stream = await this.anthropic.messages.create({
        model,
        max_tokens: Math.min(maxTokens, 4096),
        temperature: Math.max(0, Math.min(temperature, 1)),
        messages: messages as Anthropic.MessageParam[],
        system: system,
        stream: true,
      });

      // Check for abort before starting
      if (signal?.aborted) {
        throw new Error('Stream aborted');
      }

      // Process stream events using SDK helpers
      for await (const event of stream) {
        // Check for abort during iteration
        if (signal?.aborted) {
          throw new Error('Stream aborted');
        }

        if (event.type === 'message_start') {
          modelUsed = event.message.model;
          promptTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullContent += text;
            try {
              onStream({ type: 'content', text });
            } catch (callbackError) {
              const err = callbackError instanceof Error ? callbackError : new Error(String(callbackError));
              this.logger.error('Stream chunk callback failed', err);
              throw new Error('Stream callback failed');
            }
          }
        } else if (event.type === 'message_delta') {
          completionTokens = event.usage.output_tokens;
        }
      }

      // Send done signal
      try {
        onStream({ type: 'done' });
      } catch (callbackError) {
        const err = callbackError instanceof Error ? callbackError : new Error(String(callbackError));
        this.logger.error('Stream completion callback failed', err);
      }

      return {
        content: fullContent,
        model: modelUsed,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        },
        finishReason: 'end_turn'
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('aborted')) {
        throw new Error('Stream aborted');
      }
      throw error;
    }
  }

  private async callProviderWithTools(params: NormalizedChatParams & { tools: ProviderTool[] }): Promise<ProviderRawResponse> {
    const converted = this.convertMessages(params.messages);
    let claudeMessages = converted.messages;
    const system = converted.system;

    const anthropicTools: Anthropic.Tool[] = params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema
    }));

    this.logger.info('Processing chat request with tools', {
      model: params.model,
      messageCount: claudeMessages.length,
      toolCount: anthropicTools.length
    });

    let iteration = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let toolCallsMade = 0;

    while (iteration < this.maxToolIterations) {
      iteration += 1;

      this.logger.info('API call iteration', {
        iteration,
        messageCount: claudeMessages.length
      });

      // Use SDK for tool calling
      const response = await this.anthropic.messages.create({
        model: params.model,
        max_tokens: Math.min(params.max_tokens, 4096),
        temperature: Math.max(0, Math.min(1, params.temperature)),
        messages: claudeMessages as Anthropic.MessageParam[],
        tools: anthropicTools,
        system: system,
      });

      promptTokens += response.usage.input_tokens;
      completionTokens += response.usage.output_tokens;

      const stopReason = response.stop_reason;
      const content = response.content;

      if (stopReason === 'tool_use') {
        // Add assistant message with tool use
        claudeMessages = [
          ...claudeMessages,
          {
            role: 'assistant' as const,
            content: content as MessageContent
          }
        ];

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of content) {
          if (block.type === 'tool_use') {
            toolCallsMade += 1;
            this.logger.info('Executing tool', {
              toolName: block.name,
              toolId: block.id,
              iteration
            });

            // Notify tool start
            if (params.onToolStart) {
              params.onToolStart(block.name, block.input as Record<string, unknown>);
            }

            try {
              const result = await this.executeTool(
                block.name,
                this.normalizeToolArgs(block.input),
                params.userId!
              );
              
              // Notify tool end
              if (params.onToolEnd) {
                params.onToolEnd(block.name, result);
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(result)
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              this.logger.error('Tool execution error', error instanceof Error ? error : new Error(message));
              
              // Notify tool end with error
              if (params.onToolEnd) {
                params.onToolEnd(block.name, { error: message });
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ error: message }),
                is_error: true
              });
            }
          }
        }

        // Add user message with tool results
        claudeMessages = [
          ...claudeMessages,
          {
            role: 'user' as const,
            content: toolResults as MessageContent
          }
        ];

        continue;
      }

      // Extract final text response
      const textBlocks = content.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const textContent = textBlocks.length > 0
        ? textBlocks.map((block) => block.text).join('\n')
        : 'Tool executed successfully';

      this.logger.info('Final response', {
        stopReason,
        textBlockCount: textBlocks.length,
        contentLength: textContent.length,
        toolCallsMade
      });

      return {
        content: textContent,
        model: response.model,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        },
        finishReason: stopReason ?? undefined,
        metadata: {
          tool_calls_made: toolCallsMade > 0,
          tool_calls_count: toolCallsMade,
          iterations: iteration
        }
      };
    }

    throw new Error(`Maximum tool iterations (${this.maxToolIterations}) exceeded`);
  }

  private convertMessages(messages: ChatMessage[]): ConvertedMessages {
    let system: string | undefined;
    const claudeMessages: ConvertedMessages['messages'] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        system = typeof message.content === 'string' ? message.content : system;
        continue;
      }

      claudeMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content
      });
    }

    // Ensure first message is from user
    if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
      claudeMessages.unshift({
        role: 'user',
        content: 'Hello'
      });
    }

    return { system, messages: claudeMessages };
  }

  private getDatabasePool(): Pool | null {
    try {
      return db.getPool();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug('Database pool unavailable', { error: message });
      return null;
    }
  }

  private normalizeInputSchema(value: unknown): ToolSchema {
    if (!value) {
      return { type: 'object', properties: {} } as ToolSchema;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as ToolSchema;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug('Failed to parse tool input schema JSON', { error: message });
        return { type: 'object', properties: {} } as ToolSchema;
      }
    }

    if (typeof value === 'object') {
      return value as ToolSchema;
    }

    return { type: 'object', properties: {} } as ToolSchema;
  }

  private normalizeToolArgs(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private parseJSON<T>(value: unknown): T | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.debug('Failed to parse JSON value', { error: message });
        return null;
      }
    }

    if (typeof value === 'object') {
      return value as T;
    }

    return null;
  }

  private ensureOAuthMetadata(metadata: unknown): OAuthMetadata {
    const parsed = this.parseJSON<OAuthMetadata>(metadata);
    if (!parsed?.token_endpoint) {
      throw new Error('Missing OAuth configuration for server');
    }
    return parsed;
  }

  private ensureClientCredentials(credentials: unknown): ClientCredentials {
    const parsed = this.parseJSON<ClientCredentials>(credentials);
    if (!parsed?.client_id || !parsed.client_secret) {
      throw new Error('Missing OAuth client credentials for server');
    }
    return parsed;
  }

  private createOAuthHandler(): OAuthHandler {
    const redirectUri = config.mcp?.oauth?.redirectUri;
    if (!redirectUri) {
      throw new Error('OAuth redirect URI is not configured');
    }
    return new OAuthHandler(redirectUri);
  }
}

const claudeProvider = new ClaudeProvider();

export { claudeProvider };

// Maintain compatibility with CommonJS consumers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any) = claudeProvider;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any).ClaudeProvider = ClaudeProvider;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any).claudeProvider = claudeProvider;

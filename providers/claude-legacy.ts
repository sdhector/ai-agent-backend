import axios from 'axios';
import { Readable } from 'stream';
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

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

interface ClaudeAPIResponse {
  id?: string;
  content: ClaudeContentBlock[];
  model: string;
  usage?: ClaudeUsage;
  stop_reason?: string;
}

type ClaudeStreamEvent =
  | {
      type: 'content_block_delta';
      delta?: {
        text?: string;
      };
    }
  | {
      type: 'message_start';
      message?: {
        model?: string;
        usage?: {
          input_tokens?: number;
        };
      };
    }
  | {
      type: 'message_delta';
      usage?: {
        output_tokens?: number;
      };
    };

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

interface AnthropicRequestPayload {
  model: string;
  max_tokens: number;
  temperature: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content: MessageContent;
  }>;
  stream?: boolean;
  system?: string;
  tools?: Array<Pick<ProviderTool, 'name' | 'description' | 'input_schema'>>;
}

const MAX_STREAM_RESPONSE_SIZE_BYTES = 100 * 1024; // 100KB
const STREAM_INACTIVITY_TIMEOUT_MS = 60_000; // 60 seconds

export class ClaudeLegacyProvider extends BaseAIProvider {
  private readonly maxToolIterations = 10;

  constructor() {
    super({
      name: 'claude-legacy',
      displayName: 'Claude (Legacy)',
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      baseURL: 'https://api.anthropic.com/v1'
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

  public async getAvailableTools(userId: string): Promise<ProviderTool[]> {
    const pool = this.getDatabasePool();

    if (!pool) {
      this.logger.debug('Database not available, skipping tool fetch');
      return [];
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

      return result.rows.map((row) => ({
        name: row.tool_name,
        description: row.tool_description ?? `Execute ${row.tool_name} tool`,
        input_schema: this.normalizeInputSchema(row.input_schema)
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug('Failed to fetch available tools, continuing without tools', { error: message });
      return [];
    }
  }

  public async executeTool(toolName: string, toolInput: Record<string, unknown>, userId: string): Promise<unknown> {
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

    const requestData: AnthropicRequestPayload = {
      model: params.model,
      max_tokens: Math.min(params.max_tokens, 4096),
      temperature: Math.max(0, Math.min(1, params.temperature)),
      messages,
      stream: params.stream ?? false
    };

    if (system) {
      requestData.system = system;
    }

    this.logger.info('Processing chat request (no tools)', {
      model: params.model,
      messageCount: messages.length,
      stream: requestData.stream
    });

    if (requestData.stream && params.onStream) {
      return this.streamResponse(requestData, params.onStream, params.signal ?? null);
    }

    const response = await axios.post<ClaudeAPIResponse>(`${this.baseURL}/messages`, requestData, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      timeout: this.timeout,
      signal: params.signal ?? undefined
    });

    if (!response.data?.content?.length) {
      throw new Error('No response generated from Claude API');
    }

    const content = response.data.content
      .filter((item) => this.isTextContentBlock(item))
      .map((item) => item.text)
      .join('\n') || 'No content generated';

    return {
      content,
      model: response.data.model,
      usage: {
        prompt_tokens: response.data.usage?.input_tokens ?? 0,
        completion_tokens: response.data.usage?.output_tokens ?? 0,
        total_tokens:
          (response.data.usage?.input_tokens ?? 0) + (response.data.usage?.output_tokens ?? 0)
      },
      finishReason: response.data.stop_reason
    };
  }

  private async streamResponse(
    requestData: AnthropicRequestPayload,
    onStream: StreamCallback,
    signal: AbortSignal | null
  ): Promise<ProviderRawResponse> {
    const axiosController = new AbortController();

    const abortAxiosRequest = () => {
      if (!axiosController.signal.aborted) {
        axiosController.abort();
      }
    };

    if (signal) {
      if (signal.aborted) {
        abortAxiosRequest();
      } else {
        signal.addEventListener('abort', abortAxiosRequest, { once: true });
      }
    }

    let axiosResponse: { data: Readable };
    try {
      axiosResponse = await axios.post<Readable>(`${this.baseURL}/messages`, requestData, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        responseType: 'stream',
        timeout: this.timeout,
        signal: axiosController.signal
      });
    } catch (error) {
      signal?.removeEventListener('abort', abortAxiosRequest);

      if (this.isAbortError(error)) {
        throw new Error('Stream aborted');
      }

      throw error instanceof Error ? error : new Error('Streaming request failed');
    }

    const stream = axiosResponse.data as Readable;

    signal?.removeEventListener('abort', abortAxiosRequest);

    return new Promise<ProviderRawResponse>((resolve, reject) => {
      let fullContent = '';
      let model = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let buffer = '';
      let totalBytes = 0;
      let timeoutId: NodeJS.Timeout | null = null;
      let finished = false;
      let abortStreamListener: (() => void) | null = null;

      const clearTimeoutIfNeeded = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const cleanup = () => {
        clearTimeoutIfNeeded();
        stream.removeListener('data', handleData);
        stream.removeListener('end', handleEnd);
        stream.removeListener('error', handleError);
        if (abortStreamListener && signal) {
          signal.removeEventListener('abort', abortStreamListener);
        }
      };

      const abortAxiosAndStream = (reason: Error) => {
        if (!stream.destroyed) {
          stream.destroy(reason);
        }

        if (!axiosController.signal.aborted) {
          abortAxiosRequest();
        }
      };

      const endWithError = (reason: Error) => {
        if (finished) {
          return;
        }

        finished = true;
        this.logger.warn('Aborting Claude stream', { reason: reason.message });
        cleanup();
        abortAxiosAndStream(reason);
        reject(reason);
      };

      const endWithSuccess = () => {
        if (finished) {
          return;
        }

        finished = true;
        cleanup();
        try {
          onStream({ type: 'done' });
        } catch (callbackError) {
          const err = callbackError instanceof Error ? callbackError : new Error(String(callbackError));
          this.logger.error('Stream completion callback failed', err);
        }

        resolve({
          content: fullContent,
          model: model || requestData.model,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          },
          finishReason: 'end_turn'
        });
      };

      const resetTimeout = () => {
        clearTimeoutIfNeeded();
        timeoutId = setTimeout(() => {
          endWithError(new Error('Stream timeout'));
        }, STREAM_INACTIVITY_TIMEOUT_MS);
      };

      const processPayload = (payload: string) => {
        if (finished) {
          return;
        }

        try {
          const parsed = JSON.parse(payload) as ClaudeStreamEvent;

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            try {
              onStream({ type: 'content', text: parsed.delta.text });
            } catch (callbackError) {
              const err = callbackError instanceof Error ? callbackError : new Error(String(callbackError));
              this.logger.error('Stream chunk callback failed', err);
              endWithError(new Error('Stream callback failed'));
              return;
            }
          } else if (parsed.type === 'message_start') {
            model = parsed.message?.model ?? model;
            promptTokens = parsed.message?.usage?.input_tokens ?? promptTokens;
          } else if (parsed.type === 'message_delta') {
            completionTokens = parsed.usage?.output_tokens ?? completionTokens;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.debug('Skipping incomplete stream chunk', { message });
        }
      };

      const handleData = (chunk: Buffer) => {
        if (finished) {
          return;
        }

        if (signal?.aborted) {
          endWithError(new Error('Stream aborted'));
          return;
        }

        resetTimeout();

        totalBytes += chunk.length;
        if (totalBytes > MAX_STREAM_RESPONSE_SIZE_BYTES) {
          endWithError(new Error('Response size limit exceeded'));
          return;
        }

        buffer += chunk.toString();
        const segments = buffer.split('\n');
        buffer = segments.pop() ?? '';

        for (const segment of segments) {
          const line = segment.trim();
          if (!line || !line.startsWith('data:')) {
            continue;
          }

          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') {
            continue;
          }

          processPayload(payload);
          if (finished) {
            return;
          }
        }
      };

      const handleEnd = () => {
        if (buffer.trim().length > 0) {
          const remainder = buffer.trim();
          if (remainder.startsWith('data:')) {
            const payload = remainder.slice(5).trim();
            if (payload && payload !== '[DONE]') {
              processPayload(payload);
            }
          }
        }

        endWithSuccess();
      };

      const handleError = (error: unknown) => {
        const err = error instanceof Error ? error : new Error('Streaming request failed');
        endWithError(err);
      };

      if (signal) {
        if (signal.aborted) {
          endWithError(new Error('Stream aborted'));
          return;
        }

        abortStreamListener = () => endWithError(new Error('Stream aborted'));
        signal.addEventListener('abort', abortStreamListener, { once: true });
      }

      stream.on('data', (chunk: Buffer) => {
        try {
          handleData(chunk);
        } catch (error) {
          const err = error instanceof Error ? error : new Error('Streaming request failed');
          endWithError(err);
        }
      });

      stream.on('end', handleEnd);
      stream.on('error', handleError);

      resetTimeout();
    });
  }

  private async callProviderWithTools(params: NormalizedChatParams & { tools: ProviderTool[] }): Promise<ProviderRawResponse> {
    const converted = this.convertMessages(params.messages);
    let claudeMessages = converted.messages;
    const system = converted.system;

    const anthropicTools = params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
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

      const requestData: AnthropicRequestPayload = {
        model: params.model,
        max_tokens: Math.min(params.max_tokens, 4096),
        temperature: Math.max(0, Math.min(1, params.temperature)),
        messages: claudeMessages,
        tools: anthropicTools
      };

      if (system) {
        requestData.system = system;
      }

      this.logger.info('API call iteration', {
        iteration,
        messageCount: claudeMessages.length
      });

      const response = await axios.post<ClaudeAPIResponse>(`${this.baseURL}/messages`, requestData, {
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: this.timeout,
        signal: params.signal ?? undefined
      });

      if (!response.data?.content?.length) {
        throw new Error('No response generated from Claude API');
      }

      promptTokens += response.data.usage?.input_tokens ?? 0;
      completionTokens += response.data.usage?.output_tokens ?? 0;

      const stopReason = response.data.stop_reason;
      const content = response.data.content;

      if (stopReason === 'tool_use') {
        claudeMessages = [
          ...claudeMessages,
          {
            role: 'assistant' as const,
            content
          }
        ];

        const toolResults: ClaudeContentBlock[] = [];

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
              params.onToolStart(block.name, block.input);
            }

            try {
              const result = await this.executeTool(block.name, this.normalizeToolArgs(block.input), params.userId!);
              
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

        claudeMessages = [
          ...claudeMessages,
          {
            role: 'user' as const,
            content: toolResults
          }
        ];

        continue;
      }

      const textBlocks = content.filter((item) => this.isTextContentBlock(item));
      const textContent = textBlocks.length > 0
        ? textBlocks.map((item) => item.text).join('\n')
        : 'Tool executed successfully';

      this.logger.info('Final response', {
        stopReason,
        textBlockCount: textBlocks.length,
        contentLength: textContent.length,
        toolCallsMade
      });

      return {
        content: textContent,
        model: response.data.model,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        },
        finishReason: stopReason,
        metadata: {
          tool_calls_made: toolCallsMade > 0,
          tool_calls_count: toolCallsMade,
          iterations: iteration
        }
      };
    }

    throw new Error(`Maximum tool iterations (${this.maxToolIterations}) exceeded`);
  }

  private isAbortError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'ERR_CANCELED') {
        return true;
      }
    }

    if (error instanceof Error) {
      return error.name === 'CanceledError' || /abort(ed)?/i.test(error.message);
    }

    return false;
  }

  private isTextContentBlock(block: ClaudeContentBlock): block is Extract<ClaudeContentBlock, { type: 'text' }> {
    return block.type === 'text';
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

const claudeLegacyProvider = new ClaudeLegacyProvider();

export { claudeLegacyProvider };

// Maintain compatibility with CommonJS consumers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any) = claudeLegacyProvider;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any).ClaudeLegacyProvider = ClaudeLegacyProvider;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(module.exports as any).claudeLegacyProvider = claudeLegacyProvider;

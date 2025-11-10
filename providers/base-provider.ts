import { API_TIMEOUT_MS, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '../constants/limits';
import { createLogger, Logger } from '../utils/logger';
import { normalizeProviderResponse } from '../utils/response-formatter';
import type {
  ProviderConfig,
  ChatParams,
  NormalizedChatParams,
  ProviderResponse,
  ProviderRawResponse,
  ProviderErrorHandlers,
  Model
} from '../types/provider';

interface ErrorResponseData {
  error?: {
    message?: string;
  };
  message?: string;
  [key: string]: unknown;
}

interface ErrorResponse {
  status?: number;
  data?: ErrorResponseData;
}

type ErrorWithResponse = Error & {
  response?: ErrorResponse;
  code?: string;
};

export abstract class BaseAIProvider {
  public readonly name: string;
  public readonly displayName: string;
  public readonly apiKey?: string;
  public readonly baseURL: string;
  public readonly timeout: number;
  public readonly defaultModel?: string;
  protected readonly logger: Logger;

  protected constructor({ name, displayName, apiKey, baseURL, defaultModel, timeout = API_TIMEOUT_MS }: ProviderConfig) {
    if (!name) {
      throw new Error('Provider name is required');
    }

    if (!displayName) {
      throw new Error('Provider displayName is required');
    }

    this.name = name;
    this.displayName = displayName;
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.defaultModel = defaultModel;
    this.timeout = timeout;
    this.logger = createLogger(displayName);
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public getDefaultModel(): string {
    if (this.defaultModel) {
      return this.defaultModel;
    }

    const models = this.getModels();
    if (Array.isArray(models) && models.length > 0) {
      const defaultModel = models.find(model => model?.isDefault);
      if (defaultModel?.id) {
        return defaultModel.id;
      }

      return models[0]?.id ?? '';
    }

    return '';
  }

  public async chat(params?: ChatParams): Promise<ProviderResponse> {
    const normalized = this.normalizeChatParams(params);
    this.validateChatParams(normalized);

    if (!this.isAvailable()) {
      throw new Error(`${this.getDisplayName()} provider is not available. Configure the API key to enable it.`);
    }

    try {
      const rawResponse = await this.callProvider(normalized);
      return normalizeProviderResponse(rawResponse, this.name);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  protected normalizeChatParams(params?: ChatParams): NormalizedChatParams {
    const messages = Array.isArray(params?.messages) ? params?.messages : [];
    const temperature = typeof params?.temperature === 'number' ? params.temperature : DEFAULT_TEMPERATURE;
    const maxTokens = typeof params?.max_tokens === 'number' ? params.max_tokens : DEFAULT_MAX_TOKENS;

    const model = params?.model ?? this.getDefaultModel();
    const stream = params?.stream === true;

    return {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
      tools: params?.tools,
      userId: params?.userId,
      onStream: params?.onStream ?? null,
      signal: params?.signal ?? null,
      onToolStart: params?.onToolStart,
      onToolEnd: params?.onToolEnd
    };
  }

  protected validateChatParams(params: NormalizedChatParams): void {
    if (!Array.isArray(params.messages) || params.messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    const invalidMessage = params.messages.some(message => {
      if (!message) {
        return true;
      }

      const { content } = message;

      if (Array.isArray(content)) {
        return content.length === 0;
      }

      return typeof content !== 'string' || content.trim() === '';
    });

    if (invalidMessage) {
      throw new Error('Each message must include non-empty content');
    }

    if (!params.model) {
      throw new Error('Model is required for chat requests');
    }
  }

  protected getErrorMessages(): ProviderErrorHandlers {
    const provider = this.getDisplayName();

    return {
      400: (error) => {
        const data = this.getResponseData(error);
        const message = data?.error?.message ?? data?.message;
        return `Bad request: ${message || `Invalid request to ${provider}`}`;
      },
      401: () => `Invalid API key for ${provider}`,
      403: () => `Access denied - check ${provider} API key permissions`,
      429: () => `Rate limit exceeded for ${provider} API`,
      503: () => `${provider} API temporarily unavailable`
    };
  }

  protected handleError(error: unknown): Error {
    const normalizedError = this.ensureError(error);

    this.logger.error('API Error', normalizedError, {
      status: normalizedError.response?.status,
      data: normalizedError.response?.data
    });

    const status = normalizedError.response?.status;
    if (status) {
      const handlers = this.getErrorMessages();
      const handler = handlers[status];

      if (handler) {
        const message = typeof handler === 'function' ? handler(normalizedError) : handler;
        return new Error(message);
      }

      const fallbackMessage = normalizedError.response?.data?.error?.message ?? normalizedError.response?.data?.message;
      if (fallbackMessage) {
        return new Error(fallbackMessage);
      }
    }

    if (normalizedError.code === 'ENOTFOUND' || normalizedError.code === 'ECONNREFUSED') {
      return new Error(`Network error connecting to ${this.getDisplayName()} API`);
    }

    return normalizedError;
  }

  private ensureError(error: unknown): ErrorWithResponse {
    if (error instanceof Error) {
      return error as ErrorWithResponse;
    }

    if (error && typeof error === 'object') {
      const potentialMessage = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : 'An unexpected error occurred while calling the AI provider';

      const fallback = new Error(potentialMessage) as ErrorWithResponse;

      if ('response' in error && typeof (error as { response?: unknown }).response === 'object') {
        fallback.response = (error as { response?: ErrorResponse }).response;
      }

      if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
        fallback.code = (error as { code: string }).code;
      }

      return fallback;
    }

    return new Error('An unexpected error occurred while calling the AI provider') as ErrorWithResponse;
  }

  private getResponseData(error: unknown): ErrorResponseData | undefined {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as ErrorWithResponse).response?.data;
    }

    return undefined;
  }

  protected abstract callProvider(params: NormalizedChatParams): Promise<ProviderRawResponse>;

  public abstract getModels(): Model[];
}

import { ChatMessage, TokenUsage, ResponseMetadata } from './provider';

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

export interface ProvidersResponse {
  success: boolean;
  providers: Array<{
    name: string;
    displayName: string;
    models: Array<{
      id: string;
      name: string;
      description: string;
      contextLength: number;
      pricing: {
        input: number;
        output: number;
        currency: string;
      };
      capabilities: string[];
      isDefault?: boolean;
      category?: string;
    }>;
    status: string;
  }>;
}

export interface ChatRequest {
  provider: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface ChatResponse {
  success: boolean;
  message: {
    content: string;
    model: string;
    provider: string;
  };
  usage: TokenUsage;
  metadata: ResponseMetadata;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

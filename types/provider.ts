export interface ProviderConfig {
  name: string;
  displayName: string;
  apiKey?: string;
  baseURL: string;
  defaultModel?: string;
  timeout?: number;
}

export type ToolSchema = Record<string, unknown>;

export interface ProviderTool {
  name: string;
  description?: string;
  input_schema: ToolSchema;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type MessageContent = string | Array<TextContent | ToolUseContent | ToolResultContent>;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent;
}

export type StreamChunk =
  | { type: 'content'; text: string }
  | { type: 'done' };

export type StreamCallback = (chunk: StreamChunk) => void;

export interface ChatParams {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ProviderTool[];
  userId?: string;
  onStream?: StreamCallback | null;
  signal?: AbortSignal | null;
  onToolStart?: (toolName: string, toolInput: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, toolResult: unknown) => void;
}

export interface NormalizedChatParams {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  tools?: ProviderTool[];
  userId?: string;
  onStream: StreamCallback | null;
  signal?: AbortSignal | null;
  onToolStart?: (toolName: string, toolInput: Record<string, unknown>) => void;
  onToolEnd?: (toolName: string, toolResult: unknown) => void;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResponseMetadata {
  finishReason: string;
  provider: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface ProviderResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  metadata: ResponseMetadata;
  finishReason?: string;
  [key: string]: unknown;
}

export interface ProviderUsageLike {
  promptTokens?: number;
  prompt_tokens?: number;
  completionTokens?: number;
  completion_tokens?: number;
  totalTokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface ProviderRawResponse {
  content?: string;
  model?: string;
  usage?: ProviderUsageLike;
  finishReason?: string;
  finish_reason?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Model {
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
}

export interface Provider {
  name: string;
  displayName: string;
  models: Model[];
  status: string;
}

export type ProviderErrorHandlers = Record<number, string | ((error: unknown) => string)>;

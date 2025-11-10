import type {
  ProviderRawResponse,
  ProviderResponse,
  ProviderUsageLike,
  ResponseMetadata,
  TokenUsage
} from '../types/provider';

export function normalizeUsage(usage: ProviderUsageLike = {}): TokenUsage {
  return {
    promptTokens: usage.promptTokens ?? usage.prompt_tokens ?? 0,
    completionTokens: usage.completionTokens ?? usage.completion_tokens ?? 0,
    totalTokens: usage.totalTokens ?? usage.total_tokens ?? 0
  };
}

function extractProviderMetadata(rawResponse: ProviderRawResponse): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (rawResponse.id) {
    metadata.responseId = rawResponse.id;
  }

  if (rawResponse.created) {
    metadata.created = rawResponse.created;
  }

  if (rawResponse.system_fingerprint) {
    metadata.systemFingerprint = rawResponse.system_fingerprint;
  }

  if (rawResponse.provider_metadata) {
    metadata.providerSpecific = rawResponse.provider_metadata;
  }

  return metadata;
}

export function normalizeProviderResponse(
  rawResponse: ProviderRawResponse,
  providerName: string
): ProviderResponse {
  const metadata: ResponseMetadata = {
    finishReason: rawResponse.finishReason ?? rawResponse.finish_reason ?? 'stop',
    provider: providerName,
    timestamp: new Date().toISOString()
  };

  return {
    content: rawResponse.content ?? '',
    model: rawResponse.model ?? '',
    usage: normalizeUsage(rawResponse.usage ?? {}),
    metadata: {
      ...metadata,
      ...extractProviderMetadata(rawResponse)
    },
    finishReason: rawResponse.finishReason ?? rawResponse.finish_reason
  };
}

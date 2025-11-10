import { describe, expect, it } from 'vitest';
import { BaseAIProvider } from '../../providers/base-provider';
import { rateLimitError, timeoutError, networkError, malformedResponse } from '../fixtures/mock-provider-responses';

class TestProvider extends BaseAIProvider {
  constructor() {
    super({
      name: 'test-provider',
      displayName: 'Test Provider',
      apiKey: 'test-key',
      baseURL: 'http://localhost',
    });
  }

  protected async callProvider() {
    return { content: 'ok' } as any;
  }

  public getModels() {
    return [
      {
        id: 'test-model',
        name: 'Test Model',
        description: 'A model used for testing',
        contextLength: 1,
        pricing: { input: 0, output: 0, currency: 'USD' },
        capabilities: [],
      },
    ];
  }

  public normalizeError(error: unknown) {
    return this.handleError(error);
  }
}

describe('BaseAIProvider error handling', () => {
  const provider = new TestProvider();

  it('returns a friendly message for rate limiting', () => {
    const error = provider.normalizeError(rateLimitError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Rate limit exceeded for Test Provider');
  });

  it('preserves timeout error details', () => {
    const error = provider.normalizeError(timeoutError);
    expect(error.message).toContain('timeout of 30000ms exceeded');
  });

  it('normalizes network errors', () => {
    const error = provider.normalizeError(networkError);
    expect(error.message).toBe('Network error connecting to Test Provider API');
  });

  it('falls back to generic message for malformed responses', () => {
    const error = provider.normalizeError(malformedResponse);
    expect(error.message).toBe('An unexpected error occurred while calling the AI provider');
  });
});

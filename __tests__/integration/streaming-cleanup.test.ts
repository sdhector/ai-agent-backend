import { describe, expect, it, beforeEach, vi } from 'vitest';

const axiosPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    post: axiosPost,
  },
}));

// Claude provider is exported via CommonJS default instance
// eslint-disable-next-line @typescript-eslint/no-var-requires
const claudeProvider = require('../../providers/claude.ts');

type StreamHandler = (chunk?: any) => void;

describe('Claude provider streaming cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with aggregated content on normal completion', async () => {
    const handlers: Record<string, StreamHandler[]> = {
      data: [],
      end: [],
      error: [],
    };

    const stream = {
      on: vi.fn((event: string, handler: StreamHandler) => {
        handlers[event].push(handler);
        return stream;
      }),
    };

    axiosPost.mockResolvedValueOnce({ data: stream });

    const onStream = vi.fn();
    const promise = claudeProvider.streamResponse(
      {
        model: 'claude-3',
        max_tokens: 100,
        temperature: 0.2,
        messages: [],
        stream: true,
      },
      onStream,
    );

    handlers.data[0](Buffer.from('data: {"type":"message_start","message":{"model":"claude-3"}}\n\n'));
    handlers.data[0](Buffer.from('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n\n'));
    handlers.data[0](Buffer.from('data: {"type":"message_delta","usage":{"output_tokens": 5}}\n\n'));
    handlers.end[0]();

    const result = await promise;

    expect(onStream).toHaveBeenCalledWith({ type: 'content', text: 'Hello' });
    expect(onStream).toHaveBeenCalledWith({ type: 'done' });
    expect(result.content).toBe('Hello');
    expect(result.finishReason).toBe('end_turn');
  });

  it('rejects when stream emits an error', async () => {
    const handlers: Record<string, StreamHandler[]> = {
      data: [],
      end: [],
      error: [],
    };

    const stream = {
      on: vi.fn((event: string, handler: StreamHandler) => {
        handlers[event].push(handler);
        return stream;
      }),
    };

    axiosPost.mockResolvedValueOnce({ data: stream });

    const onStream = vi.fn();
    const promise = claudeProvider.streamResponse(
      {
        model: 'claude-3',
        max_tokens: 100,
        temperature: 0.2,
        messages: [],
        stream: true,
      },
      onStream,
    );

    const error = new Error('stream failure');
    handlers.error[0](error);

    await expect(promise).rejects.toThrow('stream failure');
  });
});

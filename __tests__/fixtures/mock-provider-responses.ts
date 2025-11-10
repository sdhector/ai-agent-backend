export const rateLimitError = {
  response: {
    status: 429,
    data: {
      error: {
        message: 'Rate limit exceeded',
      },
    },
  },
};

export const timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), {
  code: 'ECONNABORTED',
});

export const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND anthropic.com'), {
  code: 'ENOTFOUND',
});

export const malformedResponse = {
  response: {
    status: 200,
    data: {
      unexpected: 'structure',
    },
  },
};

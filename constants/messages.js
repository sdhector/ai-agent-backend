module.exports = {
  ERROR_MESSAGES: {
    NO_MESSAGES: 'Messages array is required and cannot be empty',
    INVALID_PROVIDER: 'Provider not found',
    PROVIDER_UNAVAILABLE: 'Provider not available - API key not configured',
    NETWORK_ERROR: 'Unable to connect to AI provider',
    RATE_LIMIT: 'Rate limit exceeded. Please try again later.',
    INVALID_API_KEY: 'Invalid API key',
    ACCESS_DENIED: 'Access denied - check API key permissions',
    BAD_REQUEST: 'Bad request',
    SERVICE_UNAVAILABLE: 'API temporarily unavailable',
  },

  SUCCESS_MESSAGES: {
    SERVER_STARTED: 'AI Assistant Backend Server Started',
    PROVIDER_LOADED: 'Provider loaded successfully',
    REQUEST_PROCESSED: 'Request processed successfully',
  }
};

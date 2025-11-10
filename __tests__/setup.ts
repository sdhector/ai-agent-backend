import { afterEach, vi } from 'vitest';

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV || 'test',
  LOG_LEVEL: process.env.LOG_LEVEL || 'ERROR',
  MCP_ENABLED: 'true',
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || 'test-claude-key',
  JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '1h',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || 'test-token-key',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_NAME: process.env.DB_NAME || 'test_db',
  DB_USER: process.env.DB_USER || 'test_user',
  DB_PASSWORD: process.env.DB_PASSWORD || 'test_password',
  DB_SSL: process.env.DB_SSL || 'false',
  DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS || '5',
  OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/oauth/callback',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3001',
});

vi.mock('../utils/logger', () => {
  const noop = () => undefined;
  const createLogger = () => ({
    debug: vi.fn(noop),
    info: vi.fn(noop),
    warn: vi.fn(noop),
    error: vi.fn(noop),
  });
  return { createLogger };
});

afterEach(() => {
  vi.clearAllMocks();
});

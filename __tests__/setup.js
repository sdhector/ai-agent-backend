"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'ERROR';
process.env.MCP_ENABLED = 'true';
process.env.CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 'test-claude-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'test-token-key';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'test_db';
process.env.DB_USER = process.env.DB_USER || 'test_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test_password';
process.env.DB_SSL = process.env.DB_SSL || 'false';
process.env.DB_MAX_CONNECTIONS = process.env.DB_MAX_CONNECTIONS || '5';
process.env.OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3001/oauth/callback';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
vitest_1.vi.mock('../utils/logger', function () {
    var noop = function () { return undefined; };
    var createLogger = function () { return ({
        debug: vitest_1.vi.fn(noop),
        info: vitest_1.vi.fn(noop),
        warn: vitest_1.vi.fn(noop),
        error: vitest_1.vi.fn(noop),
    }); };
    return { createLogger: createLogger };
});
(0, vitest_1.afterEach)(function () {
    vitest_1.vi.clearAllMocks();
});

import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockPool, createQueryResult } from '../helpers';
import { expiredToken } from '../fixtures/mock-oauth-tokens';

let pool: MockPool;
let router: express.Router;
let updatedTokenParams: any[] = [];

const connectMock = vi.fn(() => pool);
const getPoolMock = vi.fn(() => pool);
const disconnectMock = vi.fn();

vi.mock('../../config/database', () => ({
  db: {
    connect: connectMock,
    getPool: getPoolMock,
    disconnect: disconnectMock,
  },
}));

const isTokenExpiredMock = vi.fn(() => true);
const refreshTokensMock = vi.fn(async () => ({
  access_token: 'refreshed-token',
  refresh_token: 'rotated-refresh-token',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
}));

vi.mock('../../services/mcp/OAuthHandler', () => ({
  OAuthHandler: vi.fn().mockImplementation(() => ({
    isTokenExpired: isTokenExpiredMock,
    refreshTokens: refreshTokensMock,
    refreshAccessToken: refreshTokensMock,
    discoverServer: vi.fn(),
    fetchMetadata: vi.fn(),
    registerClient: vi.fn(),
    generatePKCE: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
  })),
}));

const executeToolMock = vi.fn(async () => ({ output: 'success' }));
const discoverToolsMock = vi.fn(async () => []);

vi.mock('../../services/mcp/ToolRegistry', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    discoverTools: discoverToolsMock,
    executeTool: executeToolMock,
    removeToolsForServer: vi.fn(),
    clear: vi.fn(),
    getTool: vi.fn(),
    getAllTools: vi.fn(() => []),
  })),
}));

const connectManagerConnectMock = vi.fn(async () => ({ callTool: vi.fn() }));
const isConnectedMock = vi.fn(() => true);
const disconnectServerMock = vi.fn();

vi.mock('../../services/mcp/ConnectionManager', () => ({
  ConnectionManager: vi.fn().mockImplementation(() => ({
    connect: connectManagerConnectMock,
    isConnected: isConnectedMock,
    disconnect: disconnectServerMock,
    disconnectAll: vi.fn(),
    getConnection: vi.fn(() => ({ callTool: vi.fn() })),
    getConnectionCount: vi.fn(() => 1),
  })),
}));

function buildPool(): MockPool {
  updatedTokenParams = [];
  return new MockPool(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM mcp_servers')) {
      return createQueryResult([
        {
          id: 'server-1',
          user_id: 'user-1',
          name: 'Test Server',
          url: 'https://mock.server',
          status: 'connected',
          oauth_metadata: { token_endpoint: 'https://auth/token' },
          client_credentials: { client_id: 'client', client_secret: 'secret' },
        },
      ]);
    }

    if (sql.includes('FROM mcp_tokens')) {
      return createQueryResult([{ ...expiredToken }]);
    }

    if (sql.startsWith('UPDATE mcp_tokens')) {
      updatedTokenParams = params || [];
      return {
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [],
      };
    }

    return undefined as any;
  });
}

describe('MCP token refresh integration', () => {
  beforeEach(async () => {
    vi.resetModules();
    pool = buildPool();
    connectMock.mockImplementation(() => pool);
    getPoolMock.mockImplementation(() => pool);
    refreshTokensMock.mockClear();
    executeToolMock.mockClear();
    connectManagerConnectMock.mockClear();

    const module = await import('../../routes/mcp');
    router = module.default;
  });

  it('refreshes expired tokens before executing tools', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { userId: 'user-1' };
      next();
    });
    app.use('/api/mcp', router);

    const response = await request(app)
      .post('/api/mcp/tools/execute')
      .send({ serverId: 'server-1', toolName: 'test-tool', arguments: { foo: 'bar' } });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    expect(refreshTokensMock).toHaveBeenCalledTimes(1);
    expect(updatedTokenParams[0]).toBe('refreshed-token');
    expect(updatedTokenParams[1]).toBe('rotated-refresh-token');
    expect(executeToolMock).toHaveBeenCalledWith('test-tool', { foo: 'bar' }, expect.any(Object));
  });

  it('propagates refresh failures as errors', async () => {
    refreshTokensMock.mockRejectedValueOnce(new Error('Refresh failed'));
    pool = buildPool();
    connectMock.mockImplementation(() => pool);
    getPoolMock.mockImplementation(() => pool);

    const module = await import('../../routes/mcp');
    router = module.default;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { userId: 'user-1' };
      next();
    });
    app.use('/api/mcp', router);

    const response = await request(app)
      .post('/api/mcp/tools/execute')
      .send({ serverId: 'server-1', toolName: 'test-tool', arguments: {} });

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('Refresh failed');
  });
});

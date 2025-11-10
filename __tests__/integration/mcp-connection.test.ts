import { describe, it, beforeEach, expect, vi } from 'vitest';
import { ConnectionManager } from '../../services/mcp/ConnectionManager';

const clientInstances: Array<{
  serverUrl: string;
  accessToken: string | null;
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getConnectionState: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
}> = [];

const MCPClientMock = vi.fn((serverUrl: string, token: string | null) => {
  const instance = {
    serverUrl,
    accessToken: token,
    connect: vi.fn(async () => undefined),
    close: vi.fn(),
    getConnectionState: vi.fn(() => true),
    callTool: vi.fn(),
    listTools: vi.fn(async () => []),
  };
  clientInstances.push(instance);
  return instance;
});

vi.mock('../../services/mcp/MCPClient', () => ({
  MCPClient: MCPClientMock,
}));

describe('ConnectionManager', () => {
  const toolRegistry = {
    discoverTools: vi.fn(async () => []),
    removeToolsForServer: vi.fn(),
  };

  const oauthHandler = {} as any;

  beforeEach(() => {
    clientInstances.length = 0;
    vi.clearAllMocks();
    MCPClientMock.mockImplementation((serverUrl: string, token: string | null) => {
      const instance = {
        serverUrl,
        accessToken: token,
        connect: vi.fn(async () => undefined),
        close: vi.fn(),
        getConnectionState: vi.fn(() => true),
        callTool: vi.fn(),
        listTools: vi.fn(async () => []),
      };
      clientInstances.push(instance);
      return instance;
    });
  });

  it('establishes a new connection when none exists', async () => {
    const manager = new ConnectionManager(oauthHandler, toolRegistry as any);

    const client = await manager.connect('https://server.one', 'token-1');

    expect(clientInstances.length).toBe(1);
    expect(client).toBe(clientInstances[0]);
    expect(clientInstances[0].connect).toHaveBeenCalledTimes(1);
    expect(toolRegistry.discoverTools).toHaveBeenCalledWith('https://server.one', clientInstances[0]);
  });

  it('reuses an existing live connection', async () => {
    const manager = new ConnectionManager(oauthHandler, toolRegistry as any);

    const first = await manager.connect('https://server.one', 'token-1');
    expect(clientInstances.length).toBe(1);

    const reused = await manager.connect('https://server.one', 'token-1');

    expect(reused).toBe(first);
    expect(clientInstances.length).toBe(1);
  });

  it('replaces stale connections', async () => {
    const manager = new ConnectionManager(oauthHandler, toolRegistry as any);

    const first = await manager.connect('https://server.one', 'token-1');
    (first as any).getConnectionState.mockReturnValue(false);

    const second = await manager.connect('https://server.one', 'token-1');

    expect(clientInstances.length).toBe(2);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second).toBe(clientInstances[1]);
  });

  it('propagates connection failures and closes the client', async () => {
    const manager = new ConnectionManager(oauthHandler, toolRegistry as any);

    const error = new Error('failed');
    clientInstances.length = 0;

    const connectSpy = vi.fn(async () => {
      throw error;
    });

    MCPClientMock.mockImplementationOnce(() => {
      const instance = {
        serverUrl: 'https://server.one',
        accessToken: 'token-1',
        connect: connectSpy,
        close: vi.fn(),
        getConnectionState: vi.fn(() => true),
        callTool: vi.fn(),
        listTools: vi.fn(async () => []),
      };
      clientInstances.push(instance);
      return instance;
    });

    await expect(manager.connect('https://server.one', 'token-1')).rejects.toThrow('failed');
    expect(clientInstances[0].close).toHaveBeenCalledTimes(1);
  });

  it('disconnects and removes cached connections', async () => {
    const manager = new ConnectionManager(oauthHandler, toolRegistry as any);

    await manager.connect('https://server.one', 'token-1');
    expect(manager.getConnectionCount()).toBe(1);

    manager.disconnect('https://server.one');

    expect(manager.getConnectionCount()).toBe(0);
    expect(toolRegistry.removeToolsForServer).toHaveBeenCalledWith('https://server.one');
  });
});

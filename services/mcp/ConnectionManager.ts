import { createLogger } from '../../utils/logger';
import { OAuthHandler } from './OAuthHandler';
import { MCPClient } from './MCPClient';
import { ToolRegistry } from './ToolRegistry';

const logger = createLogger('ConnectionManager');

interface ConnectionInfo {
  client: MCPClient;
  serverUrl: string;
  isAuthenticated: boolean;
  connectedAt: Date;
}

export class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private toolRegistry: ToolRegistry;
  private oauthHandler: OAuthHandler;

  constructor(oauthHandler: OAuthHandler, toolRegistry: ToolRegistry) {
    this.oauthHandler = oauthHandler;
    this.toolRegistry = toolRegistry;
  }

  async connect(
    serverUrl: string,
    accessToken: string | null = null
  ): Promise<MCPClient> {
    if (this.connections.has(serverUrl)) {
      const existing = this.connections.get(serverUrl)!;
      if (existing.client.getConnectionState()) {
        logger.info('Reusing existing connection', { serverUrl });
        return existing.client;
      } else {
        logger.info('Removing stale connection', { serverUrl });
        this.disconnect(serverUrl);
      }
    }

    logger.info('Creating new connection', { serverUrl, hasToken: !!accessToken });

    const client = new MCPClient(serverUrl, accessToken);

    try {
      await client.connect();

      this.connections.set(serverUrl, {
        client,
        serverUrl,
        isAuthenticated: !!accessToken,
        connectedAt: new Date(),
      });

      logger.info('Connection established, discovering tools...', { serverUrl });
      
      try {
        await this.toolRegistry.discoverTools(serverUrl, client);
        logger.info('Tools discovered successfully', { serverUrl });
      } catch (toolError: any) {
        logger.warn('Tool discovery failed, but connection established', new Error(toolError?.message || 'Unknown error'));
      }

      return client;
    } catch (error: any) {
      logger.error('Failed to establish connection', error, { serverUrl });
      client.close();
      throw error;
    }
  }

  disconnect(serverUrl: string): void {
    const connection = this.connections.get(serverUrl);
    
    if (connection) {
      logger.info('Disconnecting from server', { serverUrl });
      connection.client.close();
      this.connections.delete(serverUrl);
      this.toolRegistry.removeToolsForServer(serverUrl);
    }
  }

  getConnection(serverUrl: string): MCPClient | undefined {
    const connection = this.connections.get(serverUrl);
    return connection?.client;
  }

  isConnected(serverUrl: string): boolean {
    const connection = this.connections.get(serverUrl);
    return connection ? connection.client.getConnectionState() : false;
  }

  getAllConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  disconnectAll(): void {
    logger.info('Disconnecting all servers');
    for (const serverUrl of this.connections.keys()) {
      this.disconnect(serverUrl);
    }
  }

  getConnectionInfo(serverUrl: string): ConnectionInfo | undefined {
    return this.connections.get(serverUrl);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}

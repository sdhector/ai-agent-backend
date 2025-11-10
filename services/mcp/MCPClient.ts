import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { createLogger } from '../../utils/logger';

const logger = createLogger('MCPClient');

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export class MCPClient {
  private client: Client;
  private transport: SSEClientTransport;
  private baseUrl: string;
  private accessToken: string | null;
  private isConnected = false;

  constructor(baseUrl: string, accessToken: string | null = null) {
    this.baseUrl = baseUrl;
    this.accessToken = accessToken;

    this.client = new Client({
      name: 'ai-assistant-pwa',
      version: '1.0.0',
    }, {
      capabilities: {
        sampling: {},
      }
    });

    this.transport = this.createTransport();
  }

  private createTransport(): SSEClientTransport {
    const url = this.normalizeUrl(this.baseUrl);
    logger.info('Creating SSE transport', { 
      url, 
      hasToken: !!this.accessToken 
    });

    // Create headers object for both fetch requests and EventSource
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
      logger.info('Adding Authorization header to transport', {
        tokenLength: this.accessToken.length,
        tokenPreview: `${this.accessToken.substring(0, 10)}...`
      });
    }

    const transportOptions: any = {
      requestInit: {
        headers,  // Apply headers to all fetch requests
      }
    };

    // Note: EventSource doesn't natively support custom headers in browsers,
    // but the MCP SDK may use a polyfill that does. We'll include it anyway.
    if (this.accessToken) {
      transportOptions.eventSourceInit = {
        headers,
      };
    }

    const transport = new SSEClientTransport(new URL(url), transportOptions);

    transport.onerror = (error: Error) => {
      logger.error('Transport error', error);
    };

    transport.onclose = () => {
      logger.info('Transport closed');
      this.isConnected = false;
    };

    return transport;
  }

  private normalizeUrl(baseUrl: string): string {
    let url = baseUrl;
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    
    if (url.endsWith('/sse/sse')) {
      return url;
    }
    
    if (url.endsWith('/sse')) {
      return `${url}/sse`;
    }
    
    if (url.endsWith('/')) {
      return `${url}sse/sse`;
    }
    
    return `${url}/sse/sse`;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('Already connected');
      return;
    }

    try {
      logger.info('Connecting to MCP server', { baseUrl: this.baseUrl });
      await this.client.connect(this.transport);
      this.isConnected = true;
      logger.info('Connected successfully');
    } catch (error: any) {
      logger.error('Connection failed', error);
      throw new Error(`Failed to connect to MCP server: ${error.message}`);
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      logger.info('Listing tools');
      const result = await this.client.listTools();
      logger.info('Tools listed', { count: result.tools.length });
      
      return result.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error: any) {
      logger.error('Failed to list tools', error);
      throw error;
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      logger.info('Calling tool', { 
        name, 
        args,
        hasToken: !!this.accessToken,
        baseUrl: this.baseUrl
      });
      
      const result = await this.client.callTool({
        name,
        arguments: args,
      });
      
      logger.info('Tool executed successfully', { name });
      return result;
    } catch (error: any) {
      logger.error('Tool execution failed', error, { 
        name,
        statusCode: error.statusCode || error.code,
        hasToken: !!this.accessToken
      });
      throw error;
    }
  }

  async listResources(): Promise<MCPResource[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      logger.info('Listing resources');
      const result = await this.client.listResources();
      logger.info('Resources listed', { count: result.resources.length });
      
      return result.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      }));
    } catch (error: any) {
      logger.error('Failed to list resources', error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<any> {
    if (!this.isConnected) {
      throw new Error('Not connected to MCP server');
    }

    try {
      logger.info('Reading resource', { uri });
      const result = await this.client.readResource({ uri });
      logger.info('Resource read successfully', { uri });
      return result;
    } catch (error: any) {
      logger.error('Failed to read resource', error);
      throw error;
    }
  }

  close(): void {
    if (this.isConnected) {
      logger.info('Closing MCP client');
      this.client.close();
      this.isConnected = false;
    }
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }
}

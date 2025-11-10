import { createLogger } from '../../utils/logger';
import type { MCPTool } from '../../types/mcp';
import type { MCPClient } from './MCPClient';

const logger = createLogger('ToolRegistry');

export class ToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private serverTools: Map<string, Set<string>> = new Map();

  async discoverTools(serverUrl: string, client: MCPClient): Promise<MCPTool[]> {
    try {
      logger.info('Discovering tools from server', { serverUrl });

      const tools = await client.listTools();

      if (!tools || tools.length === 0) {
        logger.warn('No tools found', { serverUrl });
        return [];
      }

      const toolNames = new Set<string>();
      const discoveredTools: MCPTool[] = [];

      for (const tool of tools) {
        const mcpTool: MCPTool = {
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          serverUrl,
        };

        this.tools.set(tool.name, mcpTool);
        toolNames.add(tool.name);
        discoveredTools.push(mcpTool);
      }

      this.serverTools.set(serverUrl, toolNames);

      logger.info('Tools discovered', {
        serverUrl,
        count: discoveredTools.length,
        tools: discoveredTools.map((t) => t.name),
      });

      return discoveredTools;
    } catch (error: any) {
      logger.error('Failed to discover tools', error, { serverUrl });
      throw error;
    }
  }

  getTool(toolName: string): MCPTool | undefined {
    return this.tools.get(toolName);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getToolsForServer(serverUrl: string): MCPTool[] {
    const toolNames = this.serverTools.get(serverUrl);
    if (!toolNames) {
      return [];
    }

    const tools: MCPTool[] = [];
    for (const toolName of toolNames) {
      const tool = this.tools.get(toolName);
      if (tool) {
        tools.push(tool);
      }
    }

    return tools;
  }

  async executeTool(
    toolName: string,
    args: Record<string, any>,
    client: MCPClient
  ): Promise<any> {
    const tool = this.getTool(toolName);
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    logger.info('Executing tool', { toolName, serverUrl: tool.serverUrl });

    try {
      const response = await client.callTool(toolName, args);

      logger.info('Tool executed successfully', { toolName });
      return response;
    } catch (error: any) {
      logger.error('Tool execution failed', error, { toolName });
      throw error;
    }
  }

  removeToolsForServer(serverUrl: string): void {
    const toolNames = this.serverTools.get(serverUrl);
    
    if (toolNames) {
      for (const toolName of toolNames) {
        this.tools.delete(toolName);
      }
      this.serverTools.delete(serverUrl);
      
      logger.info('Tools removed for server', { serverUrl, count: toolNames.size });
    }
  }

  clear(): void {
    this.tools.clear();
    this.serverTools.clear();
    logger.info('Tool registry cleared');
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getServerCount(): number {
    return this.serverTools.size;
  }
}

// @ts-nocheck

const { db } = require('../dist/config/database');
const { createLogger } = require('../dist/utils/logger');

const logger = createLogger('MCPConfigBuilder');

/**
 * Build MCP server configuration from database for a given user
 * @param {string} userId - The user ID to fetch MCP servers for
 * @returns {Promise<Object>} Object with MCP server configurations
 */
async function buildMCPServerConfig(userId) {
  try {
    logger.info('Building MCP server config', { userId });

    // Get connected MCP servers for user
    const serversResult = await db.getPool().query(
      `SELECT id, name, url
       FROM mcp_servers
       WHERE user_id = $1 AND status = $2`,
      [userId, 'connected']
    );

    const mcpServers = {};

    for (const server of serversResult.rows) {
      // Get OAuth token if needed
      const tokenResult = await db.getPool().query(
        `SELECT access_token
         FROM mcp_tokens
         WHERE server_id = $1 AND user_id = $2`,
        [server.id, userId]
      );

      const serverConfig = {
        url: server.url,
      };

      // Add auth headers if OAuth token exists
      if (tokenResult.rows.length > 0 && tokenResult.rows[0].access_token) {
        serverConfig.headers = {
          Authorization: `Bearer ${tokenResult.rows[0].access_token}`,
        };
      }

      mcpServers[server.name] = serverConfig;
    }

    logger.info('Built MCP server config', {
      userId,
      serverCount: Object.keys(mcpServers).length,
      servers: Object.keys(mcpServers),
    });

    return mcpServers;
  } catch (error) {
    logger.error('Error building MCP server config', error);
    // Return empty config on error to allow graceful degradation
    return {};
  }
}

module.exports = { buildMCPServerConfig };

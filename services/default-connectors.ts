import { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('DefaultConnectors');

export interface DefaultConnector {
  name: string;
  url: string;
  auth_type: 'oauth' | 'none';
}

/**
 * Get default MCP connectors from environment variables
 * Falls back to unified Google Tools MCP if not configured
 */
export function getDefaultConnectors(): DefaultConnector[] {
  const connectors: DefaultConnector[] = [];

  // Unified Google Tools MCP Server (handles Gmail, Drive, Calendar, Maps, etc.)
  const googleToolsUrl = process.env.MCP_GOOGLE_TOOLS_URL || 'https://google-tools-mcp-27273678741.us-central1.run.app/';

  connectors.push({
    name: 'Google Tools',
    url: googleToolsUrl,
    auth_type: 'oauth'
  });

  return connectors;
}

/**
 * Auto-provision default MCP connectors for new users
 * Provides immediate access to Google service integrations without manual setup
 */
export async function provisionDefaultConnectors(userId: string, pool: Pool): Promise<void> {
  const defaultConnectors = getDefaultConnectors();

  if (defaultConnectors.length === 0) {
    logger.info('No default connectors configured, skipping provisioning', { userId });
    return;
  }

  try {
    for (const connector of defaultConnectors) {
      // Check if connector already exists for this user
      const existingResult = await pool.query(
        'SELECT id FROM mcp_servers WHERE user_id = $1 AND name = $2',
        [userId, connector.name]
      );

      if (existingResult.rows.length > 0) {
        logger.debug('Connector already exists, skipping', {
          userId,
          connector: connector.name
        });
        continue;
      }

      // Insert new connector
      await pool.query(
        `INSERT INTO mcp_servers (user_id, name, url, status, auth_type)
         VALUES ($1, $2, $3, 'disconnected', $4)`,
        [userId, connector.name, connector.url, connector.auth_type]
      );
    }

    logger.info('Provisioned default connectors for user', {
      userId,
      count: defaultConnectors.length,
      connectors: defaultConnectors.map(c => c.name)
    });
  } catch (error) {
    logger.error('Failed to provision default connectors', error as Error, { userId });
    // Don't throw - user creation should still succeed even if connector provisioning fails
  }
}

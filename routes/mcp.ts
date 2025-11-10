import express, { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import type { AddMCPServerRequest, ExecuteMCPToolRequest } from '../types/mcp';
import { db } from '../config/database';
import config from '../config';
import { OAuthHandler } from '../services/mcp/OAuthHandler';
import { ConnectionManager } from '../services/mcp/ConnectionManager';
import { ToolRegistry } from '../services/mcp/ToolRegistry';
import { createEncryptionService } from '../services/encryption';
import { provisionDefaultConnectors } from '../services/default-connectors';
import { validateMCPServerURL } from '../utils/url-validator';

const logger = createLogger('MCPRoutes');
const router = express.Router();

// Initialize shared services
const toolRegistry = new ToolRegistry();
let connectionManager: ConnectionManager | null = null;

// Validate encryption key at startup if MCP is enabled
if (config.mcp?.enabled && !config.mcp?.encryption?.masterKey) {
  logger.error('TOKEN_ENCRYPTION_KEY is required when MCP is enabled');
  throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required when MCP_ENABLED=true');
}

const encryptionService = config.mcp?.encryption?.masterKey
  ? createEncryptionService(config.mcp.encryption.masterKey)
  : null;

if (config.mcp?.enabled && !encryptionService) {
  logger.error('Failed to initialize encryption service despite having master key');
  throw new Error('Encryption service initialization failed');
}

function getConnectionManager(): ConnectionManager {
  if (!connectionManager) {
    if (!config.mcp?.oauth?.redirectUri) {
      throw new Error('OAuth configuration missing');
    }
    const oauthHandler = new OAuthHandler(config.mcp.oauth.redirectUri);
    connectionManager = new ConnectionManager(oauthHandler, toolRegistry);
  }
  return connectionManager;
}

async function getValidAccessToken(serverId: string, userId: string): Promise<string> {
  const tokenResult = await db.getPool().query(
    'SELECT access_token, refresh_token, expires_at FROM mcp_tokens WHERE server_id = $1 AND user_id = $2',
    [serverId, userId]
  );

  if (tokenResult.rows.length === 0) {
    throw new Error('No access token found. Please reconnect.');
  }

  let { access_token, refresh_token, expires_at } = tokenResult.rows[0];

  if (encryptionService) {
    try {
      access_token = encryptionService.decryptToken(access_token);
      if (refresh_token) {
        refresh_token = encryptionService.decryptToken(refresh_token);
      }
    } catch (error) {
      logger.error('Failed to decrypt tokens', error as Error);
      throw new Error('Token decryption failed. Please reconnect.');
    }
  }

  if (!config.mcp?.oauth?.redirectUri) {
    throw new Error('OAuth configuration missing');
  }

  const oauthHandler = new OAuthHandler(config.mcp.oauth.redirectUri);
  const bufferMinutes = config.mcp?.tokenRefreshBufferMinutes || 5;

  if (oauthHandler.isTokenExpired(expires_at, bufferMinutes)) {
    if (!refresh_token) {
      throw new Error('Access token expired and no refresh token available. Please reconnect.');
    }

    logger.info('Access token expired, refreshing...', { serverId, bufferMinutes });

    const serverResult = await db.getPool().query(
      'SELECT oauth_metadata, client_credentials FROM mcp_servers WHERE id = $1',
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      throw new Error('Server not found');
    }

    const { oauth_metadata, client_credentials } = serverResult.rows[0];

    if (!oauth_metadata?.token_endpoint || !client_credentials) {
      throw new Error('OAuth metadata or client credentials not found');
    }

    let decryptedClientSecret = client_credentials.client_secret;
    if (encryptionService && client_credentials.client_secret) {
      try {
        decryptedClientSecret = encryptionService.decryptToken(client_credentials.client_secret);
      } catch (error) {
        logger.warn('Client secret not encrypted or decryption failed', error as Error);
      }
    }

    const newTokens = await oauthHandler.refreshTokens(
      oauth_metadata.token_endpoint,
      client_credentials.client_id,
      decryptedClientSecret,
      refresh_token
    );

    const encryptedAccessToken = encryptionService 
      ? encryptionService.encryptToken(newTokens.access_token)
      : newTokens.access_token;
    
    const encryptedRefreshToken = newTokens.refresh_token && encryptionService
      ? encryptionService.encryptToken(newTokens.refresh_token)
      : newTokens.refresh_token;

    await db.getPool().query(
      `UPDATE mcp_tokens
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = CURRENT_TIMESTAMP
       WHERE server_id = $4 AND user_id = $5`,
      [
        encryptedAccessToken,
        encryptedRefreshToken || refresh_token,
        newTokens.expires_at || null,
        serverId,
        userId
      ]
    );

    logger.info('Access token refreshed successfully', { serverId });
    return newTokens.access_token;
  }

  return access_token;
}

/**
 * Auto-provision default MCP connectors for users who don't have any connectors yet
 * Called on every GET /servers request to ensure users always have default connectors
 */
async function ensureDefaultConnectors(userId: string): Promise<void> {
  try {
    // Check if user has any connectors
    const existingServers = await db.getPool().query(
      'SELECT COUNT(*) as count FROM mcp_servers WHERE user_id = $1',
      [userId]
    );

    const serverCount = parseInt(existingServers.rows[0].count);

    // If no connectors exist, provision the defaults
    if (serverCount === 0) {
      logger.info('No connectors found for user, provisioning defaults', { userId });
      await provisionDefaultConnectors(userId, db.getPool());
    }
  } catch (error) {
    logger.error('Failed to ensure default connectors', error as Error, { userId });
    // Don't throw - server list should still be returned even if provisioning fails
  }
}

// Initialize database connection
if (config.mcp) {
  db.connect(config.mcp.database);
  logger.info('Database connection initialized for MCP');
}

router.get('/servers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Ensure user has default connectors if they don't have any
    await ensureDefaultConnectors(userId);

    // Query servers with token expiration info
    const result = await db.getPool().query(
      `SELECT 
        s.id, s.name, s.url, s.status, s.auth_type, s.created_at, s.updated_at,
        t.expires_at
       FROM mcp_servers s
       LEFT JOIN mcp_tokens t ON s.id = t.server_id AND t.user_id = $1
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [userId]
    );

    const oauthHandler = new OAuthHandler(config.mcp?.oauth?.redirectUri || '');
    const bufferMinutes = config.mcp?.tokenRefreshBufferMinutes || 5;
    const servers = [];
    const serversToDisconnect = [];

    for (const row of result.rows) {
      let status = row.status;
      
      // If server is marked as "connected", verify token is still valid
      if (status === 'connected' && row.auth_type === 'oauth') {
        if (!row.expires_at) {
          // No token found for connected OAuth server - disconnect it
          logger.warn('Connected OAuth server has no token', { serverId: row.id });
          status = 'disconnected';
          serversToDisconnect.push(row.id);
        } else if (oauthHandler.isTokenExpired(row.expires_at, bufferMinutes)) {
          // Token has expired - disconnect the server
          logger.info('Token expired for server, disconnecting', { 
            serverId: row.id, 
            expiresAt: row.expires_at,
            bufferMinutes 
          });
          status = 'disconnected';
          serversToDisconnect.push(row.id);
        }
      }
      
      servers.push({
        id: row.id,
        name: row.name,
        url: row.url,
        status,
        auth_type: row.auth_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    }

    // Update database status for expired/invalid tokens
    if (serversToDisconnect.length > 0) {
      await db.getPool().query(
        `UPDATE mcp_servers 
         SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP 
         WHERE id = ANY($1)`,
        [serversToDisconnect]
      );
      
      logger.info('Disconnected servers with expired/missing tokens', { 
        count: serversToDisconnect.length,
        serverIds: serversToDisconnect 
      });
    }

    logger.info('Fetched MCP servers', { 
      userId, 
      count: result.rows.length,
      disconnected: serversToDisconnect.length 
    });

    return res.json({
      success: true,
      servers
    });
  } catch (error) {
    logger.error('Error fetching MCP servers', error as Error);
    return next(error);
  }
});

router.post('/servers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { name, url }: AddMCPServerRequest = req.body;

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Name and URL are required'
      });
    }

    // Validate MCP server URL to prevent SSRF attacks
    const urlValidation = validateMCPServerURL(url);
    if (!urlValidation.valid) {
      logger.warn('Invalid MCP server URL rejected', {
        userId,
        url,
        error: urlValidation.error
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid server URL',
        details: urlValidation.error
      });
    }

    logger.info('Adding MCP server', { userId, name, url });

    // Insert server into database
    const result = await db.getPool().query(
      `INSERT INTO mcp_servers (user_id, name, url, status, auth_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, url, status, auth_type, created_at, updated_at`,
      [userId, name, url, 'disconnected', 'oauth']
    );

    const newServer = result.rows[0];

    logger.info('Added MCP server', { userId, serverId: newServer.id });

    return res.json({
      success: true,
      server: newServer
    });
  } catch (error) {
    logger.error('Error adding MCP server', error as Error);
    return next(error);
  }
});

router.post('/servers/:serverId/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { serverId } = req.params;

    logger.info('Connecting to MCP server', { userId, serverId });

    // Check if this is a default server (not in database yet)
    if (serverId.startsWith('default-')) {
      return res.json({
        success: false,
        error: 'Cannot connect to default servers. Please add them to your account first.',
        message: 'Use the "Add Server" button to save this server to your account before connecting.'
      });
    }

    // Get server details from database
    const serverResult = await db.getPool().query(
      'SELECT * FROM mcp_servers WHERE id = $1 AND user_id = $2',
      [serverId, userId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const server = serverResult.rows[0];
 
    // Initialize OAuth handler
    if (!config.mcp?.oauth?.redirectUri) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }
 
    const oauthHandler = new OAuthHandler(config.mcp.oauth.redirectUri);


    // Discover if OAuth is required
    const serverInfo = await oauthHandler.discoverServer(server.url);

    if (serverInfo.requiresAuth) {
      // OAuth flow
      logger.info('Server requires OAuth', { serverId, serverUrl: server.url });

      const metadata = await oauthHandler.fetchMetadata(server.url);
      const clientCreds = await oauthHandler.registerClient(metadata.registration_endpoint);
      const pkce = oauthHandler.generatePKCE();

      const authResult = oauthHandler.buildAuthorizationUrl(
        metadata.authorization_endpoint,
        clientCreds.client_id,
        pkce.code_challenge,
        server.url
      );

      // Store PKCE, client creds, and state for later (in OAuth callback)
      const metadataWithState = { ...metadata, state: authResult.state };
      
      const encryptedClientSecret = encryptionService && clientCreds.client_secret
        ? encryptionService.encryptToken(clientCreds.client_secret)
        : clientCreds.client_secret;
      
      const encryptedPkceVerifier = encryptionService
        ? encryptionService.encryptToken(pkce.code_verifier)
        : pkce.code_verifier;

      const clientCredsToStore = { ...clientCreds, client_secret: encryptedClientSecret };

      await db.getPool().query(
        `UPDATE mcp_servers
         SET oauth_metadata = $1, client_credentials = $2, pkce_verifier = $3
         WHERE id = $4`,
        [
          JSON.stringify(metadataWithState),
          JSON.stringify(clientCredsToStore),
          encryptedPkceVerifier,
          serverId
        ]
      );

      logger.info('Redirecting to OAuth authorization', { serverId, authUrl: authResult.url });

      return res.json({
        success: true,
        requiresAuth: true,
        authorizationUrl: authResult.url
      });
    } else {
      // Authless - connect directly via SSE
      logger.info('Server does not require OAuth, connecting directly', { serverId });

      const connectionManager = new ConnectionManager(oauthHandler, toolRegistry);
      await connectionManager.connect(server.url);

      // Update status
      await db.getPool().query(
        'UPDATE mcp_servers SET status = $1 WHERE id = $2',
        ['connected', serverId]
      );

      logger.info('Connected to authless server', { serverId });

      return res.json({
        success: true,
        requiresAuth: false,
        message: 'Connected successfully'
      });
    }
  } catch (error) {
    logger.error('Error connecting to MCP server', error as Error);
    return next(error);
  }
});

router.post('/servers/:serverId/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { serverId } = req.params;

    logger.info('Disconnecting MCP server', { userId, serverId });

    // Get server details
    const serverResult = await db.getPool().query(
      'SELECT * FROM mcp_servers WHERE id = $1 AND user_id = $2',
      [serverId, userId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const server = serverResult.rows[0];

    // Close connection if exists
    const connMgr = getConnectionManager();
    if (connMgr.isConnected(server.url)) {
      connMgr.disconnect(server.url);
    }

    // Update status to disconnected (keep server and credentials)
    await db.getPool().query(
      'UPDATE mcp_servers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['disconnected', serverId]
    );

    logger.info('Disconnected MCP server', { userId, serverId });

    return res.json({
      success: true,
      message: 'Server disconnected',
      server: {
        id: serverId,
        name: server.name,
        status: 'disconnected'
      }
    });
  } catch (error) {
    logger.error('Error disconnecting MCP server', error as Error);
    return next(error);
  }
});

router.delete('/servers/:serverId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { serverId } = req.params;

    logger.info('Removing MCP server', { userId, serverId });

    // Check if this is a default server (not in database)
    if (serverId.startsWith('default-')) {
      return res.json({
        success: false,
        error: 'Cannot remove default servers. They are examples only.',
        message: 'Default servers are not saved to your account and cannot be removed.'
      });
    }

    // Get server details to disconnect first
    const serverResult = await db.getPool().query(
      'SELECT url FROM mcp_servers WHERE id = $1 AND user_id = $2',
      [serverId, userId]
    );

    if (serverResult.rows.length > 0) {
      const server = serverResult.rows[0];
      
      // Close connection if exists
      const connMgr = getConnectionManager();
      if (connMgr.isConnected(server.url)) {
        connMgr.disconnect(server.url);
      }
    }

    // Delete server from database (cascade will delete related tokens and tools)
    const result = await db.getPool().query(
      'DELETE FROM mcp_servers WHERE id = $1 AND user_id = $2 RETURNING id',
      [serverId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    logger.info('Removed MCP server', { userId, serverId });

    return res.json({
      success: true,
      message: 'Server removed'
    });
  } catch (error) {
    logger.error('Error removing MCP server', error as Error);
    return next(error);
  }
});

router.get('/servers/:serverId/tools', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { serverId } = req.params;

    logger.info('Getting tools for server', { userId, serverId });

    const serverResult = await db.getPool().query(
      'SELECT * FROM mcp_servers WHERE id = $1 AND user_id = $2',
      [serverId, userId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const server = serverResult.rows[0];

    if (server.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'Server is not connected. Please connect first.',
        status: server.status
      });
    }

    const cacheResult = await db.getPool().query(
      'SELECT tool_name, tool_description, input_schema, cached_at FROM mcp_tool_cache WHERE server_id = $1 ORDER BY tool_name',
      [serverId]
    );

    if (cacheResult.rows.length > 0) {
      logger.info('Returning cached tools', { serverId, count: cacheResult.rows.length });
      return res.json({
        success: true,
        tools: cacheResult.rows.map(row => ({
          name: row.tool_name,
          description: row.tool_description,
          inputSchema: row.input_schema,
          cachedAt: row.cached_at
        })),
        cached: true
      });
    }

    try {
      const accessToken = await getValidAccessToken(serverId, userId);

      const connMgr = getConnectionManager();
      const client = await connMgr.connect(server.url, accessToken);

      const tools = await toolRegistry.discoverTools(server.url, client);

      for (const tool of tools) {
        await db.getPool().query(
          `INSERT INTO mcp_tool_cache (server_id, tool_name, tool_description, input_schema)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (server_id, tool_name)
           DO UPDATE SET tool_description = EXCLUDED.tool_description, input_schema = EXCLUDED.input_schema, cached_at = CURRENT_TIMESTAMP`,
          [serverId, tool.name, tool.description, tool.inputSchema]
        );
      }

      logger.info('Tools discovered and cached', { serverId, count: tools.length });

      return res.json({
        success: true,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        cached: false
      });
    } catch (error: any) {
      logger.error('Failed to discover tools', error);
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }
  } catch (error) {
    logger.error('Error getting tools for server', error as Error);
    return next(error);
  }
});


router.post('/tools/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    const { serverId, toolName, arguments: args }: ExecuteMCPToolRequest = req.body;

    if (!serverId || !toolName) {
      return res.status(400).json({
        success: false,
        error: 'serverId and toolName are required'
      });
    }

    logger.info('Executing MCP tool', { userId, serverId, toolName });

    const serverResult = await db.getPool().query(
      'SELECT * FROM mcp_servers WHERE id = $1 AND user_id = $2',
      [serverId, userId]
    );

    if (serverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const server = serverResult.rows[0];

    if (server.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'Server is not connected'
      });
    }

    try {
      const access_token = await getValidAccessToken(serverId, userId);
      
      const connMgr = getConnectionManager();
      const client = await connMgr.connect(server.url, access_token);
      
      const result = await toolRegistry.executeTool(toolName, args || {}, client);

      logger.info('Tool executed successfully', { serverId, toolName });

      return res.json({
        success: true,
        result
      });
    } catch (error: any) {
      logger.error('Failed to execute tool', error);
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }
  } catch (error) {
    logger.error('Error executing MCP tool', error as Error);
    return next(error);
  }
});

router.get('/oauth/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=authentication_required`);
    }
    
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=missing_parameters`);
    }

    logger.info('Processing OAuth callback', { userId, state });

    // Find server by state (state was saved during connect)
    const serverResult = await db.getPool().query(
      `SELECT * FROM mcp_servers
       WHERE user_id = $1
       AND oauth_metadata->>'state' = $2`,
      [userId, state]
    );

    if (serverResult.rows.length === 0) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=invalid_state`);
    }

    const server = serverResult.rows[0];
    const oauthMetadata = server.oauth_metadata;
    const clientCreds = server.client_credentials;
    let pkceVerifier = server.pkce_verifier;

    if (!oauthMetadata || !clientCreds || !pkceVerifier) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=missing_oauth_config`);
    }

    if (encryptionService) {
      try {
        pkceVerifier = encryptionService.decryptToken(pkceVerifier);
      } catch (error) {
        logger.warn('PKCE verifier not encrypted or decryption failed', error as Error);
      }
    }

    let decryptedClientSecret = clientCreds.client_secret;
    if (encryptionService && clientCreds.client_secret) {
      try {
        decryptedClientSecret = encryptionService.decryptToken(clientCreds.client_secret);
      } catch (error) {
        logger.warn('Client secret not encrypted or decryption failed', error as Error);
      }
    }

    // Initialize OAuth handler
    if (!config.mcp?.oauth?.redirectUri) {
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }

    const oauthHandler = new OAuthHandler(config.mcp.oauth.redirectUri);

    logger.info('Exchanging authorization code for tokens', { 
      serverId: server.id, 
      tokenEndpoint: oauthMetadata.token_endpoint 
    });

    // Exchange code for tokens
    let tokens: any;
    try {
      tokens = await oauthHandler.exchangeCodeForTokens(
        oauthMetadata.token_endpoint,
        code,
        clientCreds.client_id,
        decryptedClientSecret,
        pkceVerifier
      );
    } catch (exchangeError: any) {
      // Log error without sensitive response data (Issue #11)
      logger.error('Token exchange failed', exchangeError, {
        serverId: server.id,
        tokenEndpoint: oauthMetadata.token_endpoint,
        statusCode: exchangeError.response?.status,
        // Don't log actual error response data - may contain sensitive info
      });
      const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/oauth/error?error=token_exchange_failed`);
    }


    logger.info('Received tokens, saving to database', { serverId: server.id });

    const encryptedAccessToken = encryptionService 
      ? encryptionService.encryptToken(tokens.access_token)
      : tokens.access_token;
    
    const encryptedRefreshToken = tokens.refresh_token && encryptionService
      ? encryptionService.encryptToken(tokens.refresh_token)
      : tokens.refresh_token;

    // Store tokens in database
    await db.getPool().query(
      `INSERT INTO mcp_tokens (server_id, user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (server_id, user_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [
        server.id,
        userId,
        encryptedAccessToken,
        encryptedRefreshToken || null,
        tokens.expires_at || null
      ]
    );

    // Update server status to connected
    await db.getPool().query(
      'UPDATE mcp_servers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['connected', server.id]
    );

    logger.info('OAuth flow completed successfully, initiating connection for tool discovery', { serverId: server.id });

    try {
      const connMgr = getConnectionManager();
      const client = await connMgr.connect(server.url, tokens.access_token);
      
      const tools = await toolRegistry.discoverTools(server.url, client);
      
      for (const tool of tools) {
        await db.getPool().query(
          `INSERT INTO mcp_tool_cache (server_id, tool_name, tool_description, input_schema)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (server_id, tool_name)
           DO UPDATE SET tool_description = EXCLUDED.tool_description, input_schema = EXCLUDED.input_schema, cached_at = CURRENT_TIMESTAMP`,
          [server.id, tool.name, tool.description, tool.inputSchema]
        );
      }

      logger.info('Tools discovered and cached after OAuth', { serverId: server.id, toolCount: tools.length });
    } catch (toolError: any) {
      logger.warn('Tool discovery failed after OAuth, will retry on tools endpoint', toolError);
    }

    const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
    return res.redirect(`${frontendUrl}/oauth/success?server=${encodeURIComponent(server.name)}`);
  } catch (error) {
    logger.error('Error processing OAuth callback', error as Error);
    const frontendUrl = config.mcp?.oauth?.frontendUrl || 'http://localhost:3001';
    return res.redirect(`${frontendUrl}/oauth/error?error=server_error`);
  }
});

// POST /oauth/callback - Handle OAuth callback from frontend
router.post('/oauth/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { code, state } = req.body as { code?: string; state?: string };

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing code or state parameter'
      });
    }

    logger.info('Processing OAuth callback from frontend', { userId, state });

    // Find server by state (state was saved during connect)
    const serverResult = await db.getPool().query(
      `SELECT * FROM mcp_servers
       WHERE user_id = $1
       AND oauth_metadata->>'state' = $2`,
      [userId, state]
    );

    if (serverResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter'
      });
    }

    const server = serverResult.rows[0];
    const oauthMetadata = server.oauth_metadata;
    const clientCreds = server.client_credentials;
    let pkceVerifier = server.pkce_verifier;

    if (!oauthMetadata || !clientCreds || !pkceVerifier) {
      return res.status(400).json({
        success: false,
        error: 'Missing OAuth configuration'
      });
    }

    if (encryptionService) {
      try {
        pkceVerifier = encryptionService.decryptToken(pkceVerifier);
      } catch (error) {
        logger.warn('PKCE verifier not encrypted or decryption failed', error as Error);
      }
    }

    let decryptedClientSecret = clientCreds.client_secret;
    if (encryptionService && clientCreds.client_secret) {
      try {
        decryptedClientSecret = encryptionService.decryptToken(clientCreds.client_secret);
      } catch (error) {
        logger.warn('Client secret not encrypted or decryption failed', error as Error);
      }
    }

    // Initialize OAuth handler
    if (!config.mcp?.oauth?.redirectUri) {
      return res.status(500).json({
        success: false,
        error: 'OAuth configuration missing'
      });
    }

    const oauthHandler = new OAuthHandler(config.mcp.oauth.redirectUri);

    logger.info('Exchanging authorization code for tokens', { 
      serverId: server.id, 
      tokenEndpoint: oauthMetadata.token_endpoint 
    });

    // Exchange code for tokens
    let tokens: any;
    try {
      tokens = await oauthHandler.exchangeCodeForTokens(
        oauthMetadata.token_endpoint,
        code,
        clientCreds.client_id,
        decryptedClientSecret,
        pkceVerifier
      );
    } catch (exchangeError: any) {
      logger.error('Token exchange failed', exchangeError, {
        serverId: server.id,
        tokenEndpoint: oauthMetadata.token_endpoint,
        errorMessage: exchangeError.message,
        errorResponse: exchangeError.response?.data
      });
      return res.status(400).json({
        success: false,
        error: 'Token exchange failed',
        details: exchangeError.message
      });
    }

    logger.info('Received tokens, saving to database', { serverId: server.id });

    const encryptedAccessToken = encryptionService 
      ? encryptionService.encryptToken(tokens.access_token)
      : tokens.access_token;
    
    const encryptedRefreshToken = tokens.refresh_token && encryptionService
      ? encryptionService.encryptToken(tokens.refresh_token)
      : tokens.refresh_token;

    // Store tokens in database
    await db.getPool().query(
      `INSERT INTO mcp_tokens (server_id, user_id, access_token, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (server_id, user_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      [
        server.id,
        userId,
        encryptedAccessToken,
        encryptedRefreshToken || null,
        tokens.expires_at || null
      ]
    );

    // Update server status to connected
    await db.getPool().query(
      'UPDATE mcp_servers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['connected', server.id]
    );

    logger.info('OAuth flow completed successfully, initiating connection for tool discovery', { serverId: server.id });

    // Try to discover tools
    try {
      const connMgr = getConnectionManager();
      const client = await connMgr.connect(server.url, tokens.access_token);
      
      const tools = await toolRegistry.discoverTools(server.url, client);
      
      for (const tool of tools) {
        await db.getPool().query(
          `INSERT INTO mcp_tool_cache (server_id, tool_name, tool_description, input_schema)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (server_id, tool_name)
           DO UPDATE SET tool_description = EXCLUDED.tool_description, input_schema = EXCLUDED.input_schema, cached_at = CURRENT_TIMESTAMP`,
          [server.id, tool.name, tool.description, tool.inputSchema]
        );
      }

      logger.info('Tools discovered and cached after OAuth', { serverId: server.id, toolCount: tools.length });
    } catch (toolError: any) {
      logger.warn('Tool discovery failed after OAuth, will retry on tools endpoint', toolError);
    }

    return res.json({
      success: true,
      message: 'Successfully connected to MCP server',
      server: {
        id: server.id,
        name: server.name,
        status: 'connected'
      }
    });
  } catch (error) {
    logger.error('Error processing OAuth callback from frontend', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

export default router;

import express, { Request, Response } from 'express';
import { generateToken } from '../middleware/auth';
import { createLogger } from '../utils/logger';
import { db } from '../config/database';
import config from '../config';
import crypto from 'crypto';
import { provisionDefaultConnectors } from '../services/default-connectors';
import { validateRedirectURL } from '../utils/url-validator';

const logger = createLogger('AuthRoutes');
const router = express.Router();

const GOOGLE_CLIENT_ID = config.mcp?.appOAuth?.clientId || process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = config.mcp?.appOAuth?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
// Use config.mcp.appOAuth values which have environment-aware auto-detection for App Login
const GOOGLE_REDIRECT_URI = config.mcp?.appOAuth?.redirectUri || '';

// Diagnostic endpoint
router.get('/config-check', (req: Request, res: Response) => {
  const isCloudRun = !!process.env.K_SERVICE;
  
  res.json({
    environment: {
      isCloudRun,
      K_SERVICE: process.env.K_SERVICE || 'not set',
      NODE_ENV: process.env.NODE_ENV || 'not set'
    },
    oauth: {
      redirectUri: GOOGLE_REDIRECT_URI,
      hasClientId: !!GOOGLE_CLIENT_ID,
      clientIdPrefix: GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 10) + '...' : 'not set',
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      frontendUrl: config.mcp?.oauth?.frontendUrl || 'not set'
    },
    config: {
      mcpEnabled: !!config.mcp,
      hasAppOAuth: !!config.mcp?.appOAuth,
      appOAuthRedirectUri: config.mcp?.appOAuth?.redirectUri || 'not set'
    }
  });
});

// Auth status endpoint - returns current user info based on JWT token
router.get('/status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided'
      });
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error'
      });
    }

    try {
      const decoded = require('jsonwebtoken').verify(token, jwtSecret) as { userId: string };
      
      // Fetch user from database
      const result = await db.getPool().query(
        'SELECT id, email, name, picture FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = result.rows[0];
      
      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } catch (jwtError) {
      logger.warn('Invalid or expired token', jwtError as Error);
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error('Error checking auth status', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Logout endpoint - clears session (client handles token removal)
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // In a stateless JWT setup, logout is primarily client-side (remove token)
    // This endpoint can be used for server-side cleanup if needed in the future
    // (e.g., token blacklisting, session invalidation, etc.)
    
    logger.info('User logged out');
    
    return res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Error during logout', error as Error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

router.get('/google', (req: Request, res: Response) => {
  const state = crypto.randomBytes(32).toString('hex');
  
  logger.info('Initiating Google OAuth', { 
    state,
    redirectUri: GOOGLE_REDIRECT_URI,
    isCloudRun: !!process.env.K_SERVICE,
    K_SERVICE: process.env.K_SERVICE
  });
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  res.redirect(authUrl);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const frontendUrl = config.mcp?.oauth?.frontendUrl || '';

  // Validate redirect URL to prevent open redirect attacks
  const allowedRedirectURLs = process.env.ALLOWED_REDIRECT_URLS
    ? process.env.ALLOWED_REDIRECT_URLS.split(',').map(url => url.trim())
    : [frontendUrl];

  const redirectValidation = validateRedirectURL(frontendUrl, allowedRedirectURLs);
  if (!redirectValidation.valid) {
    logger.error('Invalid frontend redirect URL', null, {
      frontendUrl,
      error: redirectValidation.error
    });
    return res.status(400).json({
      success: false,
      error: 'Invalid redirect configuration'
    });
  }

  try {
    const { code, error, state } = req.query;

    logger.info('Google OAuth callback received', { 
      hasCode: !!code, 
      hasError: !!error,
      hasState: !!state,
      redirectUri: GOOGLE_REDIRECT_URI 
    });

    if (error) {
      logger.error('Google OAuth error from provider', null, { error: String(error) });
      return res.redirect(`${frontendUrl}/login?error=oauth_failed&details=${encodeURIComponent(String(error))}`);
    }

    if (!code) {
      logger.error('No authorization code received from Google');
      return res.redirect(`${frontendUrl}/login?error=missing_code`);
    }

    logger.info('Exchanging authorization code for tokens', { 
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI
    });

    const tokenParams = new URLSearchParams({
      code: code as string,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Token exchange failed', null, { 
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorBody: errorText
      });
      return res.redirect(`${frontendUrl}/login?error=token_exchange_failed&status=${tokenResponse.status}`);
    }

    const tokens: any = await tokenResponse.json();
    logger.info('Successfully exchanged code for tokens');

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info', null, { status: userInfoResponse.status });
      return res.redirect(`${frontendUrl}/login?error=userinfo_failed`);
    }

    const userInfo: any = await userInfoResponse.json();
    logger.info('Retrieved user info from Google', { email: userInfo.email });

    let user = await db.getPool().query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [userInfo.email]
    );

    let userId: string;

    if (user.rows.length === 0) {
      logger.info('Creating new user', { email: userInfo.email });
      const result = await db.getPool().query(
        `INSERT INTO users (email, name, google_id, picture)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [userInfo.email, userInfo.name, userInfo.id, userInfo.picture]
      );
      userId = result.rows[0].id;
      logger.info('New user created via Google OAuth', { email: userInfo.email, userId });

      // Auto-provision default connectors for new users
      await provisionDefaultConnectors(userId, db.getPool());
    } else {
      userId = user.rows[0].id;
      logger.info('Existing user logged in via Google OAuth', { email: userInfo.email, userId });
    }

    const jwtToken = generateToken(userId);
    const redirectUrl = `${frontendUrl}/oauth-callback?token=${jwtToken}`;
    logger.info('Generated JWT token, redirecting to frontend', { userId, redirectUrl });

    return res.redirect(redirectUrl);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    
    logger.error('Google OAuth callback error', error as Error, { 
      message: errorMessage,
      stack: errorStack,
      redirectUri: GOOGLE_REDIRECT_URI,
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      frontendUrl
    });
    
    return res.redirect(`${frontendUrl}/login?error=auth_failed&details=${encodeURIComponent(errorMessage)}`);
  }
});

export default router;

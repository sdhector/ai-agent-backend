import axios from 'axios';
import crypto from 'crypto';
import { createLogger } from '../../utils/logger';
import type { OAuthMetadata, ClientCredentials, PKCEChallenge, TokenData } from '../../types/mcp';

const logger = createLogger('OAuthHandler');

export class OAuthHandler {
  private redirectUri: string;
  private pendingStates: Map<string, { timestamp: number; serverUrl: string }>;

  constructor(redirectUri: string) {
    this.redirectUri = redirectUri;
    this.pendingStates = new Map();
    
    this.cleanupExpiredStates();
  }

  async discoverServer(serverUrl: string): Promise<{ requiresAuth: boolean; authType: string }> {
    try {
      const response = await axios.get(`${serverUrl}/sse/sse`, {
        validateStatus: (status) => status === 200 || status === 401,
      });

      if (response.status === 401) {
        logger.info('Server requires OAuth', { serverUrl });
        return { requiresAuth: true, authType: 'oauth' };
      }

      logger.info('Server is authless', { serverUrl });
      return { requiresAuth: false, authType: 'authless' };
    } catch (error: any) {
      logger.error('Server discovery failed', error, { serverUrl });
      throw new Error(`Failed to connect to server: ${error.message}`);
    }
  }

  async fetchMetadata(serverUrl: string): Promise<OAuthMetadata> {
    const metadataUrl = `${serverUrl}/.well-known/oauth-authorization-server`;
    
    logger.info('Fetching OAuth metadata', { metadataUrl });

    const response = await axios.get(metadataUrl);
    return response.data;
  }

  async registerClient(registrationEndpoint: string): Promise<ClientCredentials> {
    logger.info('Registering OAuth client', { registrationEndpoint });

    const response = await axios.post(registrationEndpoint, {
      redirect_uris: [this.redirectUri],
      client_name: 'AI Assistant PWA',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    });

    return response.data;
  }

  generatePKCE(): PKCEChallenge {
    const codeVerifier = this.base64UrlEncode(crypto.randomBytes(32));
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = this.base64UrlEncode(hash);

    return {
      code_verifier: codeVerifier,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    };
  }

  buildAuthorizationUrl(
    authorizationEndpoint: string,
    clientId: string,
    codeChallenge: string,
    serverUrl: string
  ): { url: string; state: string } {
    const state = this.base64UrlEncode(crypto.randomBytes(16));

    this.pendingStates.set(state, {
      timestamp: Date.now(),
      serverUrl,
    });

    const url = new URL(authorizationEndpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return {
      url: url.toString(),
      state,
    };
  }

  validateState(state: string): string {
    const stateData = this.pendingStates.get(state);

    if (!stateData) {
      throw new Error('Invalid state parameter - possible CSRF attack');
    }

    const age = Date.now() - stateData.timestamp;
    if (age > 10 * 60 * 1000) {
      this.pendingStates.delete(state);
      throw new Error('State parameter expired');
    }

    this.pendingStates.delete(state);
    return stateData.serverUrl;
  }

  async exchangeCodeForToken(
    tokenEndpoint: string,
    clientCreds: ClientCredentials,
    authCode: string,
    codeVerifier: string
  ): Promise<TokenData> {
    logger.info('Exchanging authorization code for token');

    const response = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri,
        client_id: clientCreds.client_id,
        client_secret: clientCreds.client_secret,
        code_verifier: codeVerifier,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data;
  }

  async exchangeCodeForTokens(
    tokenEndpoint: string,
    code: string,
    clientId: string,
    clientSecret: string,
    codeVerifier: string
  ): Promise<TokenData> {
    logger.info('Exchanging authorization code for tokens', { tokenEndpoint });

    try {
      const response = await axios.post(
        tokenEndpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: codeVerifier,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const tokenData = response.data;
      
      if (tokenData.expires_in) {
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
        tokenData.expires_at = expiresAt.toISOString();
      }

      logger.info('Token exchange successful');
      return tokenData;
    } catch (error: any) {
      logger.error('Token exchange failed', error, {
        tokenEndpoint,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      });
      
      if (error.response?.data) {
        throw new Error(`Token exchange failed: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  async refreshAccessToken(
    tokenEndpoint: string,
    clientCreds: ClientCredentials,
    refreshToken: string
  ): Promise<TokenData> {
    logger.info('Refreshing access token');

    const response = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientCreds.client_id,
        client_secret: clientCreds.client_secret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const tokenData = response.data;
    
    if (tokenData.expires_in) {
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      tokenData.expires_at = expiresAt.toISOString();
    }

    return tokenData;
  }

  async refreshTokens(
    tokenEndpoint: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ): Promise<TokenData> {
    logger.info('Refreshing tokens');

    const response = await axios.post(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const tokenData = response.data;
    
    if (tokenData.expires_in) {
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
      tokenData.expires_at = expiresAt.toISOString();
    }

    return tokenData;
  }

  isTokenExpired(expiresAt: string | null, bufferMinutes: number = 5): boolean {
    if (!expiresAt) {
      return false;
    }

    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const bufferTime = bufferMinutes * 60 * 1000;
    
    return now >= (expiryTime - bufferTime);
  }

  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private cleanupExpiredStates(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [state, data] of this.pendingStates.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
          this.pendingStates.delete(state);
        }
      }
    }, 5 * 60 * 1000);
  }
}

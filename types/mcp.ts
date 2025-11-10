export interface MCPServer {
  id: string;
  user_id: string;
  name: string;
  url: string;
  auth_type: 'oauth' | 'authless';
  status: 'connected' | 'disconnected' | 'error';
  oauth_metadata?: OAuthMetadata;
  client_credentials?: ClientCredentials;
  created_at: Date;
  updated_at: Date;
}

export interface MCPToken {
  id: string;
  user_id: string;
  server_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  expires_at: Date;
  last_refreshed_at: Date;
  created_at: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
  serverUrl: string;
}

export interface MCPConnection {
  server: MCPServer;
  token: MCPToken | null;
  tools: MCPTool[];
  isConnected: boolean;
}

export interface AddMCPServerRequest {
  name: string;
  url: string;
}

export interface AddMCPServerResponse {
  server: MCPServer;
  requiresAuth: boolean;
  authorizationUrl?: string;
}

export interface ExecuteMCPToolRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, any>;
}

export interface ExecuteMCPToolResponse {
  success: boolean;
  result: any;
  error?: string;
}

export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint?: string;
}

export interface ClientCredentials {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

export interface PKCEChallenge {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: 'S256';
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: string;
  token_type?: string;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

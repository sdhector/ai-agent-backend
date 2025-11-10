CREATE TYPE auth_type_enum AS ENUM ('oauth', 'authless');
CREATE TYPE server_status_enum AS ENUM ('connected', 'disconnected', 'error');

CREATE TABLE IF NOT EXISTS mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  auth_type auth_type_enum NOT NULL,
  status server_status_enum DEFAULT 'disconnected',
  oauth_metadata JSONB,
  client_credentials JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, url)
);

CREATE INDEX idx_mcp_servers_user_id ON mcp_servers(user_id);
CREATE INDEX idx_mcp_servers_status ON mcp_servers(status);

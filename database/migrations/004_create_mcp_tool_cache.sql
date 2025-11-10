CREATE TABLE IF NOT EXISTS mcp_tool_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name VARCHAR(255) NOT NULL,
  tool_description TEXT,
  input_schema JSONB NOT NULL,
  cached_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_id, tool_name)
);

CREATE INDEX idx_mcp_tool_cache_server_id ON mcp_tool_cache(server_id);

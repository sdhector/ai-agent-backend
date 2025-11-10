-- Add pkce_verifier column to mcp_servers table for OAuth PKCE flow
ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS pkce_verifier TEXT;

-- Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'mcp_servers' 
  AND column_name = 'pkce_verifier';

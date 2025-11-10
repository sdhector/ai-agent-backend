-- Migration: Fix mcp_tokens column names to match code
-- Date: 2025-10-11
-- Reason: Code uses access_token/refresh_token but schema has encrypted_access_token/encrypted_refresh_token

-- Rename columns and make refresh_token nullable
ALTER TABLE mcp_tokens 
  RENAME COLUMN encrypted_access_token TO access_token;

ALTER TABLE mcp_tokens 
  RENAME COLUMN encrypted_refresh_token TO refresh_token;

-- Make refresh_token nullable (not all OAuth flows return refresh tokens)
ALTER TABLE mcp_tokens 
  ALTER COLUMN refresh_token DROP NOT NULL;

-- Make expires_at nullable (not all servers return expiry)
ALTER TABLE mcp_tokens 
  ALTER COLUMN expires_at DROP NOT NULL;

-- Update the primary key constraint to use (server_id, user_id) instead of id
-- This matches the code's expectation
ALTER TABLE mcp_tokens DROP CONSTRAINT IF EXISTS mcp_tokens_pkey;
ALTER TABLE mcp_tokens ADD PRIMARY KEY (server_id, user_id);

-- Drop the id column as it's not needed
ALTER TABLE mcp_tokens DROP COLUMN IF EXISTS id;

-- Add updated_at column (used by the code for tracking token updates)
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

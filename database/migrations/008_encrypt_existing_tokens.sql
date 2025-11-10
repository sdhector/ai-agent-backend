-- Migration: Encrypt existing tokens in database
-- This migration is a placeholder for the Node.js encryption script
-- Run: node backend/database/migrate-encrypt-tokens.js

-- This SQL file documents the migration but the actual encryption
-- must be done via the encryption service in Node.js

-- The Node.js script will:
-- 1. Read all rows from mcp_tokens
-- 2. Decrypt any plaintext tokens
-- 3. Encrypt with TokenEncryptionService
-- 4. Update database with encrypted values

-- Rollback procedure:
-- If needed, run: node backend/database/migrate-decrypt-tokens.js
-- to reverse the encryption (not recommended for production)

BEGIN;

-- Add a flag to track migration status
ALTER TABLE IF NOT EXISTS mcp_tokens 
ADD COLUMN IF NOT EXISTS encrypted_at TIMESTAMP;

-- Update timestamp for already-encrypted tokens
UPDATE mcp_tokens 
SET encrypted_at = CURRENT_TIMESTAMP 
WHERE encrypted_at IS NULL;

COMMIT;

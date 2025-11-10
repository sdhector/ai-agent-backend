-- Migration: Make password_hash nullable for OAuth users
-- This allows users to sign in with Google OAuth without a password

BEGIN;

-- Make password_hash nullable
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Add a constraint to ensure either password_hash or google_id is present
-- (You can't have neither - user must authenticate somehow)
ALTER TABLE users ADD CONSTRAINT users_auth_method_check 
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);

COMMIT;

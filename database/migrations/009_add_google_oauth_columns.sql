-- Migration: Add Google OAuth columns to existing users table
-- Run this if you already have a users table

BEGIN;

-- Add google_id column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='google_id') THEN
    ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
  END IF;
END $$;

-- Add picture column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='picture') THEN
    ALTER TABLE users ADD COLUMN picture TEXT;
  END IF;
END $$;

-- Add name column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='name') THEN
    ALTER TABLE users ADD COLUMN name VARCHAR(255);
  END IF;
END $$;

-- Add last_login column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='users' AND column_name='last_login') THEN
    ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
  END IF;
END $$;

-- Create index on google_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- Create index on email if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

COMMIT;

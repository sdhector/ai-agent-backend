-- Migration: Add Google OAuth columns to existing users table
-- Run each statement separately if needed

-- Add google_id column
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);

-- Add name column
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Add picture column
ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;

-- Add last_login column
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Add unique constraint to google_id (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_google_id_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_google_id_key UNIQUE (google_id);
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

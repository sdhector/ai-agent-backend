-- Schema Validation Script for mcp_tokens
-- Run this before attempting OAuth flow to verify schema is correct
-- Usage: docker exec -i ai-assistant-postgres psql -U postgres -d ai_assistant_pwa -f backend/database/validate-schema.sql

\echo '==========================================';
\echo 'MCP Tokens Schema Validation';
\echo '==========================================';
\echo '';

-- Check table exists
\echo '1. Checking if mcp_tokens table exists...';
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mcp_tokens') 
    THEN '   ✅ Table exists'
    ELSE '   ❌ TABLE MISSING!'
  END as result;

\echo '';
\echo '2. Checking required columns...';

-- Check all required columns
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'server_id') 
    THEN '✅' ELSE '❌' 
  END || ' server_id (uuid, not null)' as check
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'user_id') 
    THEN '✅' ELSE '❌' 
  END || ' user_id (uuid, not null)'
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'access_token') 
    THEN '✅' ELSE '❌' 
  END || ' access_token (text, not null)'
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'refresh_token') 
    THEN '✅' ELSE '❌' 
  END || ' refresh_token (text, nullable)'
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'expires_at') 
    THEN '✅' ELSE '❌' 
  END || ' expires_at (timestamp, nullable)'
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'updated_at') 
    THEN '✅' ELSE '❌' 
  END || ' updated_at (timestamp, nullable)'
UNION ALL
SELECT 
  '   ' || CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mcp_tokens' AND column_name = 'created_at') 
    THEN '✅' ELSE '❌' 
  END || ' created_at (timestamp, nullable)';

\echo '';
\echo '3. Checking primary key constraint...';

SELECT 
  '   ' || CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'mcp_tokens' 
        AND tc.constraint_type = 'PRIMARY KEY'
        AND kcu.column_name IN ('server_id', 'user_id')
      HAVING COUNT(*) = 2
    )
    THEN '✅ Primary key on (server_id, user_id)'
    ELSE '❌ Primary key incorrect or missing!'
  END as result;

\echo '';
\echo '4. Testing actual queries used in code...';

-- Test SELECT query
DO $$
BEGIN
  PERFORM access_token, refresh_token, expires_at 
  FROM mcp_tokens 
  WHERE server_id = '00000000-0000-0000-0000-000000000000' 
    AND user_id = '00000000-0000-0000-0000-000000000000';
  
  RAISE NOTICE '   ✅ SELECT query works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '   ❌ SELECT query failed: %', SQLERRM;
END $$;

-- Test INSERT query
DO $$
BEGIN
  -- This will fail with unique constraint violation if row exists, which is fine
  -- We just want to test that the columns exist
  INSERT INTO mcp_tokens (server_id, user_id, access_token, refresh_token, expires_at)
  VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'test', 'test', NOW())
  ON CONFLICT (server_id, user_id)
  DO UPDATE SET
    access_token = EXCLUDED.access_token,
    refresh_token = EXCLUDED.refresh_token,
    expires_at = EXCLUDED.expires_at,
    updated_at = CURRENT_TIMESTAMP;
  
  RAISE NOTICE '   ✅ INSERT query works';
  
  -- Clean up test data
  DELETE FROM mcp_tokens 
  WHERE server_id = '00000000-0000-0000-0000-000000000000';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '   ❌ INSERT query failed: %', SQLERRM;
END $$;

-- Test UPDATE query
DO $$
BEGIN
  UPDATE mcp_tokens
  SET access_token = 'test', refresh_token = 'test', expires_at = NOW(), updated_at = CURRENT_TIMESTAMP
  WHERE server_id = '00000000-0000-0000-0000-000000000000' 
    AND user_id = '00000000-0000-0000-0000-000000000000';
  
  RAISE NOTICE '   ✅ UPDATE query works';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '   ❌ UPDATE query failed: %', SQLERRM;
END $$;

\echo '';
\echo '==========================================';
\echo 'Validation Complete!';
\echo '==========================================';
\echo '';
\echo 'If all checks show ✅, the schema is correct and OAuth should work.';
\echo 'If any checks show ❌, run the migration:';
\echo '  backend/database/migrations/005_fix_mcp_tokens_columns.sql';
\echo '';

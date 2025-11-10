import { Pool } from 'pg';

async function checkSchema() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ai_assistant_pwa',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    // Check mcp_tokens table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'mcp_tokens'
      ORDER BY ordinal_position;
    `);

    console.log('\nMCP Tokens Table Structure:');
    console.log('============================');
    result.rows.forEach(row => {
      console.log(`${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check if conversations table exists
    const convCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'conversations'
      );
    `);

    console.log('\nConversations table exists:', convCheck.rows[0].exists);

    // Check schema migrations
    const migrations = await pool.query(`
      SELECT version, applied_at
      FROM schema_migrations
      ORDER BY version;
    `);

    console.log('\nApplied Migrations:');
    console.log('==================');
    migrations.rows.forEach(row => {
      console.log(`${row.version} - ${row.applied_at}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkSchema();

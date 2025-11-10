/**
 * Test script to validate MCP token expiration checking on server list fetch
 * This simulates what happens on app startup/refresh
 */

const axios = require('axios');
const { Pool } = require('pg');

const BACKEND_URL = 'http://localhost:3002';

// Database connection (using same config as backend)
const pool = new Pool({
  host: process.env.DB_HOST || 'ep-wild-flower-a6jqruyd-pooler.us-east-1.aws.neon.tech',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'neondb',
  user: process.env.DB_USER || 'neondb_owner',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, // Enable SSL for Neon
});

async function setupTestData() {
  console.log('\n📋 Setting up test data...\n');
  
  try {
    // Get first user (or you can specify a test user ID)
    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database. Please create a user first.');
      return null;
    }
    
    const userId = userResult.rows[0].id;
    console.log(`✅ Using test user ID: ${userId}`);
    
    // Check for existing MCP servers
    const serverResult = await pool.query(
      'SELECT id, name, status, auth_type FROM mcp_servers WHERE user_id = $1',
      [userId]
    );
    
    console.log(`\n📊 Found ${serverResult.rows.length} existing MCP servers:`);
    for (const server of serverResult.rows) {
      console.log(`  - ${server.name} (${server.status}, ${server.auth_type})`);
      
      // Check if server has a token
      const tokenResult = await pool.query(
        'SELECT expires_at FROM mcp_tokens WHERE server_id = $1 AND user_id = $2',
        [server.id, userId]
      );
      
      if (tokenResult.rows.length > 0) {
        const expiresAt = tokenResult.rows[0].expires_at;
        const now = new Date();
        const expiryTime = new Date(expiresAt);
        const minutesUntilExpiry = Math.floor((expiryTime - now) / 1000 / 60);
        
        console.log(`    Token expires: ${expiresAt}`);
        console.log(`    Time until expiry: ${minutesUntilExpiry} minutes`);
        
        if (minutesUntilExpiry < 5) {
          console.log(`    ⚠️  Token will be considered expired (within 5-min buffer)`);
        } else if (minutesUntilExpiry < 0) {
          console.log(`    ❌ Token is expired!`);
        } else {
          console.log(`    ✅ Token is valid`);
        }
      } else {
        console.log(`    ℹ️  No token found`);
      }
    }
    
    return userId;
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    return null;
  }
}

async function testServerListEndpoint(userId) {
  console.log('\n\n🧪 TEST 1: Fetching server list (simulating app startup)\n');
  console.log('─'.repeat(60));
  
  try {
    // Note: In real app, this would include JWT token in Authorization header
    // For testing, we'll call the endpoint directly assuming auth middleware is bypassed
    // or you need to get a real JWT token
    
    console.log(`GET ${BACKEND_URL}/api/mcp/servers`);
    console.log('(Note: This requires a valid JWT token in Authorization header)');
    console.log('\nWithout authentication, the request will fail with 401.');
    console.log('But we can check the database directly to see what the endpoint would return...\n');
    
    // Query what the endpoint would return
    const result = await pool.query(
      `SELECT 
        s.id, s.name, s.url, s.status, s.auth_type, s.created_at, s.updated_at,
        t.expires_at
       FROM mcp_servers s
       LEFT JOIN mcp_tokens t ON s.id = t.server_id AND t.user_id = $1
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [userId]
    );
    
    console.log('📦 Raw database query results:');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // Simulate what the endpoint logic would do
    console.log('\n\n🔍 Simulating endpoint token validation logic:\n');
    
    const bufferMinutes = 5;
    const serversToDisconnect = [];
    
    for (const row of result.rows) {
      let status = row.status;
      const originalStatus = row.status;
      
      console.log(`\n📍 Server: ${row.name}`);
      console.log(`   Current DB status: ${originalStatus}`);
      console.log(`   Auth type: ${row.auth_type}`);
      
      if (status === 'connected' && row.auth_type === 'oauth') {
        if (!row.expires_at) {
          console.log('   ❌ No token found - will disconnect');
          status = 'disconnected';
          serversToDisconnect.push(row.id);
        } else {
          const expiryTime = new Date(row.expires_at).getTime();
          const now = Date.now();
          const bufferTime = bufferMinutes * 60 * 1000;
          const isExpired = now >= (expiryTime - bufferTime);
          
          const minutesUntilExpiry = Math.floor((expiryTime - now) / 1000 / 60);
          console.log(`   Token expires at: ${row.expires_at}`);
          console.log(`   Minutes until expiry: ${minutesUntilExpiry}`);
          console.log(`   Buffer time: ${bufferMinutes} minutes`);
          console.log(`   Considered expired: ${isExpired}`);
          
          if (isExpired) {
            console.log('   ❌ Token expired - will disconnect');
            status = 'disconnected';
            serversToDisconnect.push(row.id);
          } else {
            console.log('   ✅ Token valid - stays connected');
          }
        }
      } else {
        console.log(`   ℹ️  Not an OAuth server or not connected - no validation needed`);
      }
      
      console.log(`   Returned status: ${status}${status !== originalStatus ? ' (CHANGED)' : ''}`);
    }
    
    if (serversToDisconnect.length > 0) {
      console.log(`\n\n🔄 Would disconnect ${serversToDisconnect.length} server(s) in database:`);
      console.log(`   Server IDs: ${serversToDisconnect.join(', ')}`);
      console.log('\n   SQL that would be executed:');
      console.log(`   UPDATE mcp_servers`);
      console.log(`   SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP`);
      console.log(`   WHERE id = ANY(ARRAY[${serversToDisconnect.map(id => `'${id}'`).join(', ')}])`);
    } else {
      console.log('\n\n✅ No servers need to be disconnected');
    }
    
    console.log('\n\n📤 Response that would be sent to frontend:');
    const responseServers = result.rows.map(row => {
      let status = row.status;
      if (status === 'connected' && row.auth_type === 'oauth') {
        if (!row.expires_at) {
          status = 'disconnected';
        } else {
          const expiryTime = new Date(row.expires_at).getTime();
          const now = Date.now();
          const bufferTime = bufferMinutes * 60 * 1000;
          if (now >= (expiryTime - bufferTime)) {
            status = 'disconnected';
          }
        }
      }
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        status,
        auth_type: row.auth_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });
    
    console.log(JSON.stringify({ success: true, servers: responseServers }, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function createExpiredTokenScenario(userId) {
  console.log('\n\n🧪 TEST 2: Creating expired token scenario\n');
  console.log('─'.repeat(60));
  
  try {
    // Find a connected OAuth server
    const serverResult = await pool.query(
      `SELECT id, name FROM mcp_servers 
       WHERE user_id = $1 AND auth_type = 'oauth' 
       LIMIT 1`,
      [userId]
    );
    
    if (serverResult.rows.length === 0) {
      console.log('ℹ️  No OAuth servers found to test with');
      return;
    }
    
    const server = serverResult.rows[0];
    console.log(`📍 Using server: ${server.name}`);
    
    // Set token to expire 10 minutes ago (definitely expired)
    const result = await pool.query(
      `UPDATE mcp_tokens 
       SET expires_at = NOW() - INTERVAL '10 minutes'
       WHERE server_id = $1 AND user_id = $2
       RETURNING expires_at`,
      [server.id, userId]
    );
    
    if (result.rows.length > 0) {
      console.log(`✅ Set token expiration to: ${result.rows[0].expires_at}`);
      console.log('   (10 minutes in the past)');
      
      // Ensure server is marked as connected in DB
      await pool.query(
        `UPDATE mcp_servers SET status = 'connected' WHERE id = $1`,
        [server.id]
      );
      console.log('✅ Ensured server is marked as "connected" in database');
      
      console.log('\n📝 Now testing what happens when fetching server list...\n');
      await testServerListEndpoint(userId);
    } else {
      console.log('❌ No token found for this server');
    }
    
  } catch (error) {
    console.error('❌ Error creating test scenario:', error.message);
  }
}

async function main() {
  console.log('🧪 MCP Token Validation Test\n');
  console.log('=' .repeat(60));
  
  try {
    const userId = await setupTestData();
    
    if (!userId) {
      console.log('\n❌ Cannot run tests without a valid user');
      return;
    }
    
    await testServerListEndpoint(userId);
    
    // Optionally create an expired token scenario
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    readline.question('\n\nDo you want to create an expired token scenario? (y/n) ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        await createExpiredTokenScenario(userId);
      }
      
      console.log('\n\n✅ Tests complete!\n');
      readline.close();
      await pool.end();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();

/**
 * Test script to validate MCP token expiration checking on server list fetch
 * This simulates what happens on app startup/refresh
 */

// Load environment first
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '../.credentials/.env' });

const { db } = require('./dist/config/database.js');
const { OAuthHandler } = require('./dist/services/mcp/OAuthHandler.js');
const config = require('./dist/config/index.js').config;

async function setupTestData() {
  console.log('\n📋 Setting up test data...\n');
  
  try {
    // Connect to database
    await db.connect(config.mcp.database);
    const pool = db.getPool();
    
    // Get first user (or you can specify a test user ID)
    const userResult = await pool.query('SELECT id, email FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database. Please create a user first.');
      return null;
    }
    
    const userId = userResult.rows[0].id;
    console.log(`✅ Using test user: ${userResult.rows[0].email} (ID: ${userId})`);
    
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
    console.error(error.stack);
    return null;
  }
}

async function testServerListEndpoint(userId) {
  console.log('\n\n🧪 TEST: Simulating GET /api/mcp/servers (app startup)\n');
  console.log('─'.repeat(60));
  
  try {
    const pool = db.getPool();
    
    console.log('📥 Executing query from GET /servers endpoint...\n');
    
    // This is the exact query from the updated endpoint
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
    
    console.log(`✅ Query returned ${result.rows.length} servers\n`);
    
    // Simulate the token validation logic
    console.log('🔍 Applying token validation logic:\n');
    
    const oauthHandler = new OAuthHandler(config.mcp?.oauth?.redirectUri || '');
    const bufferMinutes = config.mcp?.tokenRefreshBufferMinutes || 5;
    const servers = [];
    const serversToDisconnect = [];
    
    console.log(`📋 Config: Token refresh buffer = ${bufferMinutes} minutes\n`);
    
    for (const row of result.rows) {
      let status = row.status;
      const originalStatus = row.status;
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📍 Server: ${row.name}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Current DB status: "${originalStatus}"`);
      console.log(`   Auth type: ${row.auth_type}`);
      
      // If server is marked as "connected", verify token is still valid
      if (status === 'connected' && row.auth_type === 'oauth') {
        if (!row.expires_at) {
          // No token found for connected OAuth server - disconnect it
          console.log(`   ❌ ISSUE: No token found for connected OAuth server`);
          console.log(`   ACTION: Disconnect server`);
          status = 'disconnected';
          serversToDisconnect.push(row.id);
        } else {
          const isExpired = oauthHandler.isTokenExpired(row.expires_at, bufferMinutes);
          
          const expiryTime = new Date(row.expires_at).getTime();
          const now = Date.now();
          const minutesUntilExpiry = Math.floor((expiryTime - now) / 1000 / 60);
          
          console.log(`   Token info:`);
          console.log(`     Expires at: ${row.expires_at}`);
          console.log(`     Minutes until expiry: ${minutesUntilExpiry}`);
          console.log(`     Buffer applied: ${bufferMinutes} minutes`);
          console.log(`     Is considered expired: ${isExpired}`);
          
          if (isExpired) {
            // Token has expired - disconnect the server
            console.log(`   ❌ Token expired (within buffer window)`);
            console.log(`   ACTION: Disconnect server`);
            status = 'disconnected';
            serversToDisconnect.push(row.id);
          } else {
            console.log(`   ✅ Token is valid`);
            console.log(`   ACTION: Keep connected`);
          }
        }
      } else {
        console.log(`   ℹ️  Validation skipped:`);
        if (status !== 'connected') {
          console.log(`      - Server not connected (status: "${status}")`);
        }
        if (row.auth_type !== 'oauth') {
          console.log(`      - Not an OAuth server (type: ${row.auth_type})`);
        }
      }
      
      console.log(`   \n   📤 Status returned to frontend: "${status}"${status !== originalStatus ? ' ⚠️  CHANGED' : ''}`);
      
      servers.push({
        id: row.id,
        name: row.name,
        url: row.url,
        status,
        auth_type: row.auth_type,
        created_at: row.created_at,
        updated_at: row.updated_at
      });
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    if (serversToDisconnect.length > 0) {
      console.log(`\n🔄 Database Update Required:`);
      console.log(`   ${serversToDisconnect.length} server(s) will be disconnected\n`);
      console.log(`   SQL to execute:`);
      console.log(`   UPDATE mcp_servers`);
      console.log(`   SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP`);
      console.log(`   WHERE id = ANY($1)`);
      console.log(`   Parameters: [${serversToDisconnect.map(id => `'${id}'`).join(', ')}]`);
      
      // Actually update the database (commented out - uncomment to apply changes)
      // await pool.query(
      //   `UPDATE mcp_servers 
      //    SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP 
      //    WHERE id = ANY($1)`,
      //   [serversToDisconnect]
      // );
      // console.log('\n   ✅ Database updated');
      console.log('\n   ℹ️  (Database update not applied in test mode)');
    } else {
      console.log(`\n✅ No database updates needed - all servers have valid status\n`);
    }
    
    console.log(`\n📤 JSON Response to Frontend:\n`);
    console.log(JSON.stringify({ success: true, servers }, null, 2));
    
    return { servers, disconnectedCount: serversToDisconnect.length };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return null;
  }
}

async function createExpiredTokenScenario(userId) {
  console.log('\n\n🧪 TEST: Creating expired token scenario\n');
  console.log('─'.repeat(60));
  
  try {
    const pool = db.getPool();
    
    // Find a connected OAuth server
    const serverResult = await pool.query(
      `SELECT s.id, s.name, s.status, t.expires_at
       FROM mcp_servers s
       LEFT JOIN mcp_tokens t ON s.id = t.server_id AND t.user_id = $1
       WHERE s.user_id = $1 AND s.auth_type = 'oauth' 
       LIMIT 1`,
      [userId]
    );
    
    if (serverResult.rows.length === 0) {
      console.log('ℹ️  No OAuth servers found to test with');
      return;
    }
    
    const server = serverResult.rows[0];
    console.log(`📍 Using server: ${server.name}`);
    console.log(`   Current status: ${server.status}`);
    
    if (server.expires_at) {
      console.log(`   Current token expiry: ${server.expires_at}`);
    } else {
      console.log(`   ℹ️  No token currently exists for this server`);
    }
    
    // Set token to expire 10 minutes ago (definitely expired)
    const result = await pool.query(
      `UPDATE mcp_tokens 
       SET expires_at = NOW() - INTERVAL '10 minutes'
       WHERE server_id = $1 AND user_id = $2
       RETURNING expires_at`,
      [server.id, userId]
    );
    
    if (result.rows.length > 0) {
      console.log(`\n✅ Updated token expiration to: ${result.rows[0].expires_at}`);
      console.log('   (10 minutes in the past - definitely expired)');
      
      // Ensure server is marked as connected in DB
      await pool.query(
        `UPDATE mcp_servers SET status = 'connected' WHERE id = $1`,
        [server.id]
      );
      console.log('✅ Set server status to "connected" in database');
      
      console.log('\n📝 Now simulating server list fetch with expired token...\n');
      await testServerListEndpoint(userId);
    } else {
      console.log('❌ No token found for this server - cannot create test scenario');
    }
    
  } catch (error) {
    console.error('❌ Error creating test scenario:', error.message);
    console.error(error.stack);
  }
}

async function main() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  🧪 MCP Token Validation Test');
  console.log('     Testing GET /api/mcp/servers endpoint logic');
  console.log('═'.repeat(60));
  
  try {
    const userId = await setupTestData();
    
    if (!userId) {
      console.log('\n❌ Cannot run tests without a valid user');
      await db.disconnect();
      process.exit(1);
    }
    
    const result = await testServerListEndpoint(userId);
    
    if (result && result.disconnectedCount === 0) {
      // Optionally create an expired token scenario
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n\n' + '═'.repeat(60));
      readline.question('\n💡 Create expired token scenario to test disconnection? (y/n) ', async (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await createExpiredTokenScenario(userId);
        }
        
        console.log('\n\n✅ Tests complete!\n');
        readline.close();
        await db.disconnect();
        process.exit(0);
      });
    } else {
      console.log('\n\n✅ Tests complete!\n');
      await db.disconnect();
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    await db.disconnect();
    process.exit(1);
  }
}

main();

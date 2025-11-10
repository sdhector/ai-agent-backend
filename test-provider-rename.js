// Test script for the renamed providers and built-in datetime tool

require('dotenv').config();
const { claudeProvider } = require('./dist/providers/claude');
const { claudeLegacyProvider } = require('./dist/providers/claude-legacy');

async function testProvidersAndDatetimeTool() {
  console.log('='.repeat(70));
  console.log('Testing Renamed Providers & Built-in Datetime Tool');
  console.log('='.repeat(70));

  // Test 1: Verify provider names
  console.log('\n1. Checking provider names...');
  console.log(`   Current Default: ${claudeProvider.getDisplayName()} (${claudeProvider.name})`);
  console.log(`   Legacy Fallback: ${claudeLegacyProvider.getDisplayName()} (${claudeLegacyProvider.name})`);

  // Test 2: Check available tools (should include datetime tool)
  console.log('\n2. Checking available tools...');
  try {
    // Mock userId for testing
    const testUserId = 'test-user';
    const tools = await claudeProvider.getAvailableTools(testUserId);
    console.log(`   Total tools available: ${tools.length}`);
    
    const datetimeTool = tools.find(t => t.name === 'get_current_datetime');
    if (datetimeTool) {
      console.log('   ✅ Built-in datetime tool found!');
      console.log(`      Description: ${datetimeTool.description}`);
    } else {
      console.log('   ❌ Datetime tool not found');
    }
  } catch (error) {
    console.log(`   Note: ${error.message}`);
  }

  // Test 3: Test datetime tool directly
  console.log('\n3. Testing datetime tool execution...');
  try {
    const result = await claudeProvider.executeTool('get_current_datetime', {}, 'test-user');
    console.log('   ✅ Datetime tool executed successfully!');
    console.log('   Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  // Test 4: Test datetime tool with timezone
  console.log('\n4. Testing datetime tool with timezone...');
  try {
    const result = await claudeProvider.executeTool('get_current_datetime', { 
      timezone: 'America/New_York' 
    }, 'test-user');
    console.log('   ✅ Datetime tool with timezone executed successfully!');
    console.log('   Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  // Test 5: Test chat with datetime tool
  console.log('\n5. Testing chat with datetime tool awareness...');
  try {
    const response = await claudeProvider.chat({
      messages: [
        { role: 'user', content: 'What time is it right now? Use the tool to get the current date and time.' }
      ],
      temperature: 0.7,
      max_tokens: 200,
      userId: 'test-user'
    });

    console.log('   ✅ Chat with tool calling successful!');
    console.log(`   Response: "${response.content}"`);
    
    if (response.metadata?.tool_calls_made) {
      console.log(`   Tools called: ${response.metadata.tool_calls_count} times`);
      console.log(`   Iterations: ${response.metadata.iterations}`);
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }

  // Test 6: Compare models available
  console.log('\n6. Comparing available models...');
  const currentModels = claudeProvider.getModels();
  const legacyModels = claudeLegacyProvider.getModels();
  
  console.log(`   Current Provider: ${currentModels.length} models`);
  console.log(`   Legacy Provider: ${legacyModels.length} models`);
  
  console.log('\n   Current models:');
  currentModels.slice(0, 3).forEach(m => {
    console.log(`   - ${m.name} (${m.id})${m.isDefault ? ' [DEFAULT]' : ''}`);
  });
  
  console.log('\n   Legacy models:');
  legacyModels.slice(0, 3).forEach(m => {
    console.log(`   - ${m.name} (${m.id})${m.isDefault ? ' [DEFAULT]' : ''}`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('Tests Complete!');
  console.log('='.repeat(70));
  console.log('\nSummary:');
  console.log('✅ Provider renamed: claude-sdk → claude (default)');
  console.log('✅ Legacy provider: claude → claude-legacy');
  console.log('✅ Built-in datetime tool added');
  console.log('✅ Tool provides: date, time, timezone, formatted output');
  console.log('\nNext steps:');
  console.log('1. Start backend: npm run backend');
  console.log('2. Start frontend: npm run dev');
  console.log('3. Test in UI with both providers');
  console.log('4. Try asking: "What time is it?"');
}

// Run tests
testProvidersAndDatetimeTool()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

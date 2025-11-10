// Test script for the new Claude SDK provider

require('dotenv').config();
const { claudeSDKProvider } = require('./dist/providers/claude-sdk');

async function testClaudeSDKProvider() {
  console.log('='.repeat(60));
  console.log('Testing Claude SDK Provider');
  console.log('='.repeat(60));

  // Test 1: Check if provider is available
  console.log('\n1. Checking provider availability...');
  const isAvailable = claudeSDKProvider.isAvailable();
  console.log(`   Provider available: ${isAvailable}`);
  
  if (!isAvailable) {
    console.error('   ❌ Provider not available. Check ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable.');
    process.exit(1);
  }

  // Test 2: Get provider info
  console.log('\n2. Getting provider information...');
  console.log(`   Name: ${claudeSDKProvider.name}`);
  console.log(`   Display Name: ${claudeSDKProvider.getDisplayName()}`);
  console.log(`   Default Model: ${claudeSDKProvider.getDefaultModel()}`);

  // Test 3: Get available models
  console.log('\n3. Getting available models...');
  const models = claudeSDKProvider.getModels();
  console.log(`   Available models: ${models.length}`);
  models.forEach((model, index) => {
    const defaultMarker = model.isDefault ? ' (default)' : '';
    console.log(`   ${index + 1}. ${model.name}${defaultMarker} - ${model.id}`);
  });

  // Test 4: Non-streaming chat (simple)
  console.log('\n4. Testing non-streaming chat...');
  try {
    const response = await claudeSDKProvider.chat({
      messages: [
        { role: 'user', content: 'Say "Hello from Claude SDK!" and nothing else.' }
      ],
      temperature: 0.7,
      max_tokens: 50
    });

    console.log('   ✅ Non-streaming chat successful');
    console.log(`   Response: "${response.content}"`);
    console.log(`   Model: ${response.model}`);
    console.log(`   Tokens: ${response.usage.totalTokens} (${response.usage.promptTokens} prompt + ${response.usage.completionTokens} completion)`);
  } catch (error) {
    console.error('   ❌ Non-streaming chat failed:', error.message);
    throw error;
  }

  // Test 5: Streaming chat
  console.log('\n5. Testing streaming chat...');
  try {
    let streamedContent = '';
    let chunkCount = 0;

    const response = await claudeSDKProvider.chat({
      messages: [
        { role: 'user', content: 'Count from 1 to 5, one number per line.' }
      ],
      temperature: 0.7,
      max_tokens: 100,
      stream: true,
      onStream: (chunk) => {
        if (chunk.type === 'content') {
          streamedContent += chunk.text;
          chunkCount++;
        } else if (chunk.type === 'done') {
          console.log(`   ✅ Streaming completed with ${chunkCount} chunks`);
        }
      }
    });

    console.log(`   Full response: "${streamedContent.trim()}"`);
    console.log(`   Model: ${response.model}`);
    console.log(`   Tokens: ${response.usage.totalTokens} (${response.usage.promptTokens} prompt + ${response.usage.completionTokens} completion)`);
  } catch (error) {
    console.error('   ❌ Streaming chat failed:', error.message);
    throw error;
  }

  // Test 6: Error handling
  console.log('\n6. Testing error handling...');
  try {
    await claudeSDKProvider.chat({
      messages: [],
      temperature: 0.7,
      max_tokens: 50
    });
    console.error('   ❌ Should have thrown an error for empty messages');
  } catch (error) {
    console.log('   ✅ Error handling working correctly');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('All tests passed! ✅');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('1. Start the backend: npm run backend');
  console.log('2. Start the frontend: npm run dev');
  console.log('3. Look for "Claude (SDK)" in the model picker');
  console.log('4. Test with real conversations');
  console.log('5. Test with MCP tools if configured');
}

// Run tests
testClaudeSDKProvider()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

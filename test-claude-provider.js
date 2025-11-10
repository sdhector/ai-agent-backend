// @ts-nocheck

/**
 * Test the Claude provider directly
 */

require('./config/env-loader').loadEnvironment();

async function testClaudeProvider() {
  console.log('\n🧪 Testing Claude Provider\n');

  // Load the provider (use dist for compiled version)
  const claudeProvider = require('./dist/providers/claude');

  console.log('Provider info:');
  console.log('  Name:', claudeProvider.name);
  console.log('  Display Name:', claudeProvider.getDisplayName());
  console.log('  Available:', claudeProvider.isAvailable());
  console.log('  Default Model:', claudeProvider.getDefaultModel());
  console.log('');

  if (!claudeProvider.isAvailable()) {
    console.error('❌ Provider not available - check API key');
    process.exit(1);
  }

  console.log('📡 Sending test message...\n');

  try {
    const response = await claudeProvider.chat({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'Say "Hello from Claude!" and nothing else.' }
      ],
      temperature: 0.7,
      max_tokens: 50
    });

    console.log('✅ SUCCESS!\n');
    console.log('Response:', response.content);
    console.log('');
    console.log('Details:');
    console.log('  Model:', response.model);
    console.log('  Tokens:', response.usage.prompt_tokens, 'in,', response.usage.completion_tokens, 'out');
    console.log('  Finish reason:', response.finishReason);
    console.log('');
    console.log('✨ Claude provider is working correctly!');

  } catch (error) {
    console.error('❌ FAILED!\n');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    console.error('');
    process.exit(1);
  }
}

testClaudeProvider().then(() => process.exit(0));

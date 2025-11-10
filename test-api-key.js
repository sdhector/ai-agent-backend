// @ts-nocheck

/**
 * Quick test to verify Anthropic API key is working
 */

require('./config/env-loader').loadEnvironment();

const axios = require('axios');

async function testAnthropicAPIKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

  console.log('\n🔑 Testing Anthropic API Key...\n');

  if (!apiKey) {
    console.error('❌ No API key found!');
    console.error('   Set ANTHROPIC_API_KEY or CLAUDE_API_KEY in your .env file');
    return;
  }

  console.log('✅ API Key found (length:', apiKey.length, ')');
  console.log('   Prefix:', apiKey.substring(0, 15) + '...');
  console.log('');

  console.log('📡 Making test request to Anthropic API...\n');

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Say "Hello!" and nothing else.' }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      }
    );

    const content = response.data.content[0].text;

    console.log('✅ API Request Successful!\n');
    console.log('Response:', content);
    console.log('');
    console.log('Model:', response.data.model);
    console.log('Tokens used:', response.data.usage.input_tokens, 'in,', response.data.usage.output_tokens, 'out');
    console.log('');
    console.log('✨ Your Anthropic API key is working correctly!');

  } catch (error) {
    console.error('❌ API Request Failed!\n');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);

      if (error.response.status === 401) {
        console.error('\n💡 Your API key appears to be invalid or expired.');
        console.error('   Get a new one at: https://console.anthropic.com/');
      }
    } else if (error.code === 'ENOTFOUND') {
      console.error('Network error: Cannot reach Anthropic API');
    } else {
      console.error('Error:', error.message);
    }
  }
}

testAnthropicAPIKey().then(() => process.exit(0)).catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

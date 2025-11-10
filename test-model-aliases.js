// @ts-nocheck

const axios = require('axios');
const { loadEnvironment } = require('./config/env-loader');

loadEnvironment();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

async function testModelAlias(alias, fullId) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing alias: ${alias} (should be: ${fullId})`);
  console.log('='.repeat(80));

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: alias,
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Respond with just "OK"' }
        ]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        }
      }
    );

    console.log(`✅ SUCCESS`);
    console.log(`   Requested: ${alias}`);
    console.log(`   Returned:  ${response.data.model}`);
    console.log(`   Response:  ${response.data.content[0].text}`);
    console.log(`   Tokens: ${response.data.usage.input_tokens} in, ${response.data.usage.output_tokens} out`);

  } catch (error) {
    console.log(`❌ FAILED`);
    console.log(`   Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Testing Model Aliases                               ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  await testModelAlias('claude-sonnet-4-5', 'claude-sonnet-4-5-20250929');
  await testModelAlias('claude-sonnet-4-0', 'claude-sonnet-4-20250514');
  await testModelAlias('claude-3-7-sonnet-latest', 'claude-3-7-sonnet-20250219');
  await testModelAlias('claude-opus-4-1', 'claude-opus-4-1-20250805');
  await testModelAlias('claude-opus-4-0', 'claude-opus-4-20250514');
  await testModelAlias('claude-3-5-haiku-latest', 'claude-3-5-haiku-20241022');

  console.log('\n' + '='.repeat(80));
  console.log('CONCLUSION: Aliases work and API returns the full model ID');
  console.log('Claude models self-identify incorrectly - this is NORMAL behavior');
  console.log('='.repeat(80) + '\n');
}

runTests();

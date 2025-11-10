// @ts-nocheck

const axios = require('axios');
const { loadEnvironment } = require('./config/env-loader');

// Load environment variables
loadEnvironment();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ No API key found. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable.');
  process.exit(1);
}

const MODELS_TO_TEST = [
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-20241022'
];

async function testModelIdentity(modelId) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing model: ${modelId}`);
  console.log('='.repeat(80));

  try {
    const requestData = {
      model: modelId,
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'In one sentence, tell me: What is your exact model name and version? Be specific about whether you are Claude 3.5, Claude 4, Claude 4.5, or another version.'
        }
      ]
    };

    console.log('\n📤 Request:');
    console.log(JSON.stringify(requestData, null, 2));

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      requestData,
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        timeout: 30000
      }
    );

    console.log('\n📥 Response:');
    console.log(`Status: ${response.status}`);
    console.log(`Model returned in response: ${response.data.model}`);
    console.log(`Stop reason: ${response.data.stop_reason}`);
    
    const content = response.data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
    
    console.log(`\n🤖 Model's self-identification:`);
    console.log(content);

    console.log(`\n📊 Usage:`);
    console.log(`  Input tokens: ${response.data.usage.input_tokens}`);
    console.log(`  Output tokens: ${response.data.usage.output_tokens}`);

    // Verify if model ID matches
    const requestedModel = modelId;
    const returnedModel = response.data.model;
    
    if (requestedModel === returnedModel) {
      console.log(`\n✅ Model ID matches: Requested "${requestedModel}" and got "${returnedModel}"`);
    } else {
      console.log(`\n⚠️  Model ID mismatch: Requested "${requestedModel}" but got "${returnedModel}"`);
    }

    // Check if response contains version numbers
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('3.5')) {
      console.log('🔍 Response mentions: Claude 3.5');
    } else if (lowerContent.includes('4.5')) {
      console.log('🔍 Response mentions: Claude 4.5');
    } else if (lowerContent.includes('claude 4')) {
      console.log('🔍 Response mentions: Claude 4');
    } else if (lowerContent.includes('3.7')) {
      console.log('🔍 Response mentions: Claude 3.7');
    }

    return {
      success: true,
      requestedModel: modelId,
      returnedModel: response.data.model,
      selfIdentification: content,
      match: requestedModel === returnedModel
    };

  } catch (error) {
    console.log('\n❌ Error:');
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error type: ${error.response.data?.error?.type}`);
      console.log(`Error message: ${error.response.data?.error?.message}`);
    } else {
      console.log(`Error: ${error.message}`);
    }

    return {
      success: false,
      requestedModel: modelId,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     Claude Model Identity Test Suite                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\nThis test will verify that the correct model is being called for each model ID.');
  console.log('We will ask each model to identify itself and compare with the API response.\n');

  const results = [];

  for (const modelId of MODELS_TO_TEST) {
    const result = await testModelIdentity(modelId);
    results.push(result);
    
    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              TEST SUMMARY                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  const matchCount = results.filter(r => r.success && r.match).length;
  const mismatchCount = results.filter(r => r.success && !r.match).length;

  console.log(`Total models tested: ${results.length}`);
  console.log(`Successful requests: ${successCount}`);
  console.log(`Failed requests: ${failCount}`);
  console.log(`Model ID matches: ${matchCount}`);
  console.log(`Model ID mismatches: ${mismatchCount}`);

  console.log('\n' + '─'.repeat(80) + '\n');
  console.log('Detailed Results:\n');

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.requestedModel}`);
    if (result.success) {
      console.log(`   ✅ Success`);
      console.log(`   Returned model: ${result.returnedModel}`);
      if (result.match) {
        console.log(`   ✅ Model ID matches`);
      } else {
        console.log(`   ⚠️  Model ID MISMATCH`);
      }
      console.log(`   Self-ID: ${result.selfIdentification.substring(0, 80)}...`);
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
    console.log('');
  });

  console.log('─'.repeat(80) + '\n');

  // Specific check for Sonnet 4.5
  const sonnet45Result = results.find(r => r.requestedModel === 'claude-sonnet-4-5-20250929');
  if (sonnet45Result && sonnet45Result.success) {
    console.log('🔍 CLAUDE SONNET 4.5 VERIFICATION:');
    console.log(`   Requested: ${sonnet45Result.requestedModel}`);
    console.log(`   Returned:  ${sonnet45Result.returnedModel}`);
    console.log(`   Self-ID:   ${sonnet45Result.selfIdentification}`);
    
    if (sonnet45Result.match) {
      console.log('   ✅ Sonnet 4.5 is working correctly!');
    } else {
      console.log('   ⚠️  WARNING: Model ID mismatch for Sonnet 4.5!');
    }
  } else if (sonnet45Result) {
    console.log('🔍 CLAUDE SONNET 4.5 VERIFICATION:');
    console.log(`   ❌ Failed to test: ${sonnet45Result.error}`);
  }

  console.log('\n');
}

// Run the tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});

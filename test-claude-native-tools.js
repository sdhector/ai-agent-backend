// @ts-nocheck

const claudeProvider = require('./providers/claude');

async function testClaudeWithoutTools() {
  console.log('\n=== Testing Claude without tools ===');
  
  try {
    const response = await claudeProvider.chat({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'What is 2+2?' }
      ],
      temperature: 0.7,
      max_tokens: 100,
      userId: null
    });

    console.log('Response:', response.content);
    console.log('Usage:', response.usage);
    console.log('Metadata:', response.metadata);
    console.log('✅ Test passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testClaudeWithToolsButNoneAvailable() {
  console.log('\n=== Testing Claude with userId but no tools available ===');
  
  try {
    const response = await claudeProvider.chat({
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        { role: 'user', content: 'What is the capital of France?' }
      ],
      temperature: 0.7,
      max_tokens: 100,
      userId: '00000000-0000-0000-0000-000000000001'
    });

    console.log('Response:', response.content);
    console.log('Usage:', response.usage);
    console.log('Metadata:', response.metadata);
    console.log('✅ Test passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function runTests() {
  console.log('Starting Claude provider tests...\n');
  
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    console.error('❌ No API key found. Set ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable.');
    process.exit(1);
  }

  await testClaudeWithoutTools();
  await testClaudeWithToolsButNoneAvailable();
  
  console.log('\n=== All tests completed ===');
}

runTests();

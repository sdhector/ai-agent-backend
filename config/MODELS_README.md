# Model Configuration Guide

This file documents the centralized model configuration system for the AI Assistant PWA.

## Overview

All AI model configurations are centralized in `backend/config/models.js`. This allows you to add, remove, or edit models in a single place, and the changes will automatically apply to both the backend and frontend.

## File Location

```
backend/config/models.js
```

## How It Works

1. **Backend Providers** - Each provider (OpenAI, Claude, Gemini, OpenRouter) imports and uses the centralized config
2. **API Endpoints** - The `/api/ai/providers` endpoint automatically serves the models from the config
3. **Frontend** - The frontend fetches models from the API, so no frontend changes are needed

## Model Configuration Structure

Each model in the configuration has the following structure:

```javascript
{
  id: 'model-id',                    // Unique identifier for the model
  name: 'Model Name',                // Display name shown in UI
  description: 'Model description',  // Brief description of capabilities
  contextLength: 128000,             // Maximum context window size
  pricing: {
    input: 1.25,                     // Cost per 1M input tokens in USD
    output: 10.00,                   // Cost per 1M output tokens in USD
    currency: 'USD'
  },
  capabilities: [                    // Array of capability tags
    'text',
    'vision',
    'code',
    'reasoning',
    'tool-calling'
  ],
  isDefault: true,                   // (Optional) Set as default model for provider
  category: 'free'                   // (Optional) Used by OpenRouter to categorize
}
```

## Adding a New Model

To add a new model to a provider:

1. Open `backend/config/models.js`
2. Find the provider section (e.g., `openai`, `claude`, `gemini`, `openrouter`)
3. Add a new model object to the array:

```javascript
{
  id: 'new-model-id',
  name: 'New Model Name',
  description: 'What this model does best',
  contextLength: 100000,
  pricing: {
    input: 0.50,
    output: 2.00,
    currency: 'USD'
  },
  capabilities: ['text', 'code'],
  isDefault: false
}
```

4. Save the file
5. Restart the backend server
6. The new model will automatically appear in the model picker

## Editing an Existing Model

To edit a model:

1. Open `backend/config/models.js`
2. Find the model you want to edit
3. Modify any fields (name, description, pricing, capabilities, etc.)
4. Save the file
5. Restart the backend server

## Removing a Model

To remove a model:

1. Open `backend/config/models.js`
2. Find the model you want to remove
3. Delete the entire model object from the array
4. Save the file
5. Restart the backend server

## Setting a Default Model

Each provider should have exactly one default model. To change which model is default:

1. Find the current default model (has `isDefault: true`)
2. Change it to `isDefault: false` or remove the property
3. Add `isDefault: true` to your preferred model
4. Save and restart

## Available Capability Tags

Common capability tags you can use:

- `text` - General text generation
- `vision` - Image understanding
- `code` - Code generation and analysis
- `reasoning` - Advanced reasoning and problem-solving
- `tool-calling` - Function/tool calling support
- `analysis` - Data and document analysis
- `creative-writing` - Creative content generation
- `quick-responses` - Optimized for speed
- `web-search` - Web search integration
- `current-info` - Access to current information
- `multilingual` - Strong multilingual support

## Currently Configured Providers

### OpenAI
- GPT-5 (default)
- GPT-5 Mini
- GPT-5 Nano
- GPT-4.1
- GPT-4.1 Mini
- o4-mini

### Anthropic Claude
- Claude Haiku 4.5 (default)
- Claude Sonnet 4.5
- Claude Opus 4.1
- Claude 3.5 Sonnet
- Claude 3 Haiku

### Google Gemini
- Gemini 2.0 Flash Experimental (default)
- Gemini 1.5 Flash
- Gemini 1.5 Pro
- Gemini 1.5 Flash-8B

### OpenRouter
- Gemini 2.0 Flash Free (default)
- Llama 3.2 3B Free
- Claude 3.5 Sonnet (OR)
- GPT-4o (OR)
- Gemini Pro 1.5 (OR)
- Mixtral 8x7B
- Llama 3.1 Sonar (Online)

## Troubleshooting

### Models not showing in UI
1. Check that the backend server is running
2. Verify the model config syntax is correct (valid JavaScript)
3. Check browser console for API errors
4. Ensure the provider has a valid API key configured

### Wrong models showing
1. Clear browser cache and refresh
2. Check that you restarted the backend after making changes
3. Verify you edited the correct config file

### API errors when selecting a model
1. Verify the model ID matches what the AI provider expects
2. Check that your API key has access to that model
3. Some models may be in beta and require special access

## Best Practices

1. **Keep pricing updated** - Model pricing can change, update regularly
2. **Test new models** - Always test a model works before making it default
3. **Use descriptive names** - Help users understand what each model is good for
4. **Set appropriate capabilities** - Accurate capability tags help with model selection
5. **Document special requirements** - Note if a model needs beta access or special setup

## Need Help?

If you encounter issues with the model configuration system, check:
1. Backend server logs for errors
2. Browser developer console for API errors
3. Verify your API keys are configured correctly in `.env`

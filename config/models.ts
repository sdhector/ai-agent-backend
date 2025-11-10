import type { Model } from '../types/provider';

type ProviderKey = 'claude' | 'claude-legacy';

type ModelConfigMap = Record<ProviderKey, Model[]>;

export const MODEL_CONFIGS: ModelConfigMap = {
  claude: [
    {
      id: 'claude-haiku-4-5',
      name: 'Haiku 4.5',
      description: 'Fast and efficient model with near-frontier performance',
      contextLength: 200000,
      pricing: {
        input: 1.0,
        output: 5.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking'],
      isDefault: true
    },
    {
      id: 'claude-sonnet-4-5',
      name: 'Sonnet 4.5',
      description: 'Our best model for complex agents and coding',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking'],
      isDefault: false
    },
    {
      id: 'claude-sonnet-4-0',
      name: 'Sonnet 4',
      description: 'High-performance model with balanced capabilities',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-3-7-sonnet-latest',
      name: 'Sonnet 3.7',
      description: 'High-performance model with early extended thinking',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-opus-4-1',
      name: 'Opus 4.1',
      description: 'Exceptional model for specialized complex tasks',
      contextLength: 200000,
      pricing: {
        input: 15.0,
        output: 75.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'creative-writing', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-opus-4-0',
      name: 'Opus 4',
      description: 'Our previous flagship model',
      contextLength: 200000,
      pricing: {
        input: 15.0,
        output: 75.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-3-5-haiku-latest',
      name: 'Haiku 3.5',
      description: 'Our fastest model',
      contextLength: 200000,
      pricing: {
        input: 0.8,
        output: 4.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'quick-responses', 'tool-calling']
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Haiku 3',
      description: 'Fast and compact model for near-instant responsiveness',
      contextLength: 200000,
      pricing: {
        input: 0.25,
        output: 1.25,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'quick-responses']
    }
  ],
  'claude-legacy': [
    {
      id: 'claude-haiku-4-5',
      name: 'Haiku 4.5 (Legacy)',
      description: 'Fast and efficient model with near-frontier performance',
      contextLength: 200000,
      pricing: {
        input: 1.0,
        output: 5.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking'],
      isDefault: true
    },
    {
      id: 'claude-sonnet-4-5',
      name: 'Sonnet 4.5 (Legacy)',
      description: 'Our best model for complex agents and coding',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking'],
      isDefault: false
    },
    {
      id: 'claude-sonnet-4-0',
      name: 'Sonnet 4 (Legacy)',
      description: 'High-performance model with balanced capabilities',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-3-7-sonnet-latest',
      name: 'Sonnet 3.7 (Legacy)',
      description: 'High-performance model with early extended thinking',
      contextLength: 200000,
      pricing: {
        input: 3.0,
        output: 15.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-opus-4-1',
      name: 'Opus 4.1 (Legacy)',
      description: 'Exceptional model for specialized complex tasks',
      contextLength: 200000,
      pricing: {
        input: 15.0,
        output: 75.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'creative-writing', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-opus-4-0',
      name: 'Opus 4 (Legacy)',
      description: 'Our previous flagship model',
      contextLength: 200000,
      pricing: {
        input: 15.0,
        output: 75.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking']
    },
    {
      id: 'claude-3-5-haiku-latest',
      name: 'Haiku 3.5 (Legacy)',
      description: 'Our fastest model',
      contextLength: 200000,
      pricing: {
        input: 0.8,
        output: 4.0,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'quick-responses', 'tool-calling']
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Haiku 3 (Legacy)',
      description: 'Fast and compact model for near-instant responsiveness',
      contextLength: 200000,
      pricing: {
        input: 0.25,
        output: 1.25,
        currency: 'USD'
      },
      capabilities: ['text', 'vision', 'code', 'quick-responses']
    }
  ]
};

function isProviderKey(value: string): value is ProviderKey {
  return Object.prototype.hasOwnProperty.call(MODEL_CONFIGS, value);
}

export function getModelsForProvider(providerName: string): Model[] {
  if (!isProviderKey(providerName)) {
    return [];
  }

  return MODEL_CONFIGS[providerName];
}

export function getAllProviders(): ProviderKey[] {
  return Object.keys(MODEL_CONFIGS) as ProviderKey[];
}

module.exports = {
  MODEL_CONFIGS,
  getModelsForProvider,
  getAllProviders
};

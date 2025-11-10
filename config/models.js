"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_CONFIGS = void 0;
exports.getModelsForProvider = getModelsForProvider;
exports.getAllProviders = getAllProviders;
exports.MODEL_CONFIGS = {
    claude: [
        {
            id: 'claude-sonnet-4-5',
            name: 'Claude Sonnet 4.5',
            description: 'Our best model for complex agents and coding',
            contextLength: 200000,
            pricing: {
                input: 3.0,
                output: 15.0,
                currency: 'USD'
            },
            capabilities: ['text', 'vision', 'code', 'reasoning', 'analysis', 'tool-calling', 'extended-thinking'],
            isDefault: true
        },
        {
            id: 'claude-sonnet-4-0',
            name: 'Claude Sonnet 4',
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
            name: 'Claude Sonnet 3.7',
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
            name: 'Claude Opus 4.1',
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
            name: 'Claude Opus 4',
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
            name: 'Claude Haiku 3.5',
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
            name: 'Claude Haiku 3',
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
function isProviderKey(value) {
    return Object.prototype.hasOwnProperty.call(exports.MODEL_CONFIGS, value);
}
function getModelsForProvider(providerName) {
    if (!isProviderKey(providerName)) {
        return [];
    }
    return exports.MODEL_CONFIGS[providerName];
}
function getAllProviders() {
    return Object.keys(exports.MODEL_CONFIGS);
}
module.exports = {
    MODEL_CONFIGS: exports.MODEL_CONFIGS,
    getModelsForProvider: getModelsForProvider,
    getAllProviders: getAllProviders
};

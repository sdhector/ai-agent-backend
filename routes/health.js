const express = require('express');
const router = express.Router();
const { cacheMiddleware } = require('../middleware/cache');

// Health check endpoint (cached for 5 minutes)
router.get('/', cacheMiddleware(300000), (req, res) => {
  const requiredKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY'];
  const availableProviders = requiredKeys
    .filter(key => process.env[key])
    .map(key => key.replace('_API_KEY', '').toLowerCase());

  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    server: 'AI Assistant PWA Backend',
    version: '1.1.0',
    providers: {
      available: availableProviders,
      total: availableProviders.length,
      configured: requiredKeys.length
    }
  });
});

// Detailed status endpoint (cached for 1 minute)
router.get('/status', cacheMiddleware(60000), (req, res) => {
  const requiredKeys = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'CLAUDE_API_KEY', 'OPENROUTER_API_KEY'];
  
  const providerStatus = requiredKeys.map(key => {
    const provider = key.replace('_API_KEY', '').toLowerCase();
    const isConfigured = !!process.env[key];
    const keyLength = process.env[key] ? process.env[key].length : 0;
    
    return {
      provider,
      configured: isConfigured,
      keyLength: isConfigured ? keyLength : 0,
      status: isConfigured ? 'ready' : 'missing'
    };
  });

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    server: {
      name: 'AI Assistant PWA Backend',
      version: '1.1.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      port: process.env.BACKEND_PORT || 3002
    },
    providers: providerStatus,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

module.exports = router;
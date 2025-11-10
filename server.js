// server.js - Async wrapper to load environment before starting the app
const { loadEnvironment } = require('./dist/config/env-loader');

async function startServer() {
  // Load environment variables (from .env locally or Secret Manager on Cloud Run)
  await loadEnvironment();
  
  // Now require and start the actual server app
  require('./server-app');
}

// Start the server
startServer().catch((error) => {
  console.error('Fatal error during server startup:', error);
  process.exit(1);
});


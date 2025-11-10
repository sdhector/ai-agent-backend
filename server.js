// server.js - Async wrapper to load environment before starting the app
const { loadEnvironment } = require('./dist/config/env-loader');

async function startServer() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting server initialization...`);

  try {
    // Load environment variables (from .env locally or Secret Manager on Cloud Run)
    console.log(`[${new Date().toISOString()}] Loading environment variables...`);
    await loadEnvironment();
    console.log(`[${new Date().toISOString()}] Environment loaded in ${Date.now() - startTime}ms`);

    // Now require and start the actual server app
    console.log(`[${new Date().toISOString()}] Loading server application...`);
    require('./server-app');
    console.log(`[${new Date().toISOString()}] Server application loaded successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during startup:`, error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

// Start the server
console.log(`[${new Date().toISOString()}] Node.js version: ${process.version}`);
console.log(`[${new Date().toISOString()}] Platform: ${process.platform}`);
console.log(`[${new Date().toISOString()}] CWD: ${process.cwd()}`);

startServer().catch((error) => {
  console.error(`[${new Date().toISOString()}] Fatal error during server startup:`, error);
  console.error('Error details:', {
    message: error?.message,
    code: error?.code,
    stack: error?.stack
  });
  process.exit(1);
});


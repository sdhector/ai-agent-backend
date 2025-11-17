// @ts-nocheck

const express = require('express');
const cors = require('cors');
const helmetModule = require('helmet');
const rateLimitModule = require('express-rate-limit');
const csrfModule = require('csurf');
const cookieParserModule = require('cookie-parser');

/** @type {any} */
const configModule = require('./dist/config');
const helmet = helmetModule.default || helmetModule;
const rateLimit = rateLimitModule.default || rateLimitModule;
const csrf = csrfModule.default || csrfModule;
const cookieParser = cookieParserModule.default || cookieParserModule;
const config = configModule.appConfig || configModule.default || configModule;
const validateConfig = configModule.validateConfig || (config && config.validateConfig);

const aiRoutes = require('./routes/ai');
const healthRoutes = require('./routes/health');
const { authMiddleware } = require('./dist/middleware/auth');
const { errorHandler } = require('./dist/utils/errors');
const { requestLogger } = require('./middleware/request-logger');
const { notFoundHandler } = require('./middleware/not-found');
const { MAX_REQUEST_SIZE } = require('./constants/limits');
const messages = require('./constants/messages');
const { createLogger } = require('./dist/utils/logger');
const { db, ensureDatabaseConnection } = require('./dist/config/database');

const SUCCESS_MESSAGES = messages.SUCCESS_MESSAGES;
const logger = createLogger('Server');

const resolvedValidateConfig = typeof validateConfig === 'function'
  ? validateConfig
  : () => ({ success: true, errors: [], warnings: [] });

const validationResult = resolvedValidateConfig({ logger, logSuccess: false });
/** @type {string[]} */
const validationErrors = Array.isArray(validationResult.errors) ? validationResult.errors : [];
/** @type {string[]} */
const validationWarnings = Array.isArray(validationResult.warnings) ? validationResult.warnings : [];

if (!validationResult.success) {
  logger.error('Configuration validation failed; shutting down.', null, {
    errors: validationErrors,
  });
  process.exit(1);
}

validationWarnings.forEach((warning) => {
  logger.warn(warning);
});

const app = express();
const PORT = config.server.port;
const HOST = config.server.host;
const isProduction = config.server.environment === 'production';
const isMcpEnabled = config.mcp?.enabled === true;

// Only initialize database connection if MCP is enabled
if (isMcpEnabled) {
  try {
    ensureDatabaseConnection();
    logger.info('Database connection initialized');
  } catch (error) {
    logger.error('Failed to initialize database connection', error instanceof Error ? error : null, {
      message: error && typeof error === 'object' && 'message' in error ? error.message : undefined,
    });
    process.exit(1);
  }
} else {
  logger.info('Database connection skipped (MCP disabled)');
}

// Middleware order is critical: CORS → parsers → cookies → logging → security → rate limiting → CSRF → auth → routes → 404 → errors.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({
  origin: config.server.cors.origins,
  credentials: true,
}));

app.use(express.json({ limit: MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_REQUEST_SIZE }));
app.use(cookieParser());
app.use(requestLogger);

const helmetConfig = /** @type {import('helmet').HelmetOptions} */ ({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", 'https://api.anthropic.com'],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: isProduction
    ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
    : false,
});

app.use(helmet(helmetConfig));

// Root endpoint - API information
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'AI Assistant Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health or /api/health',
      auth: {
        google: '/api/auth/google',
        callback: '/api/auth/google/callback',
        status: '/api/auth/status',
        logout: '/api/auth/logout',
        configCheck: '/api/auth/config-check'
      },
      ai: '/api/ai',
      mcp: '/api/mcp',
      conversations: '/api/conversations'
    },
    documentation: 'See README.md for full API documentation'
  });
});

app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

if (config.features.rateLimit !== false) {
  /** @type {import('express-rate-limit').RateLimitExceededEventHandler} */
  const apiLimitHandler = (req, res) => {
    logger.warn('API rate limit exceeded', { path: req.path, ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  };

  /** @type {import('express-rate-limit').RateLimitExceededEventHandler} */
  const aiLimitHandler = (req, res) => {
    logger.warn('AI rate limit exceeded', { path: req.path, ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many AI requests, please try again later',
    });
  };

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: apiLimitHandler,
  });

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    handler: aiLimitHandler,
  });

  /** @type {import('express-rate-limit').RateLimitExceededEventHandler} */
  const authLimitHandler = (req, res) => {
    logger.warn('Auth rate limit exceeded', { path: req.path, ip: req.ip });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later',
    });
  };

  // Stricter rate limiting for auth endpoints to prevent brute force (Issue #9)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Only 10 auth attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful auth attempts
    handler: authLimitHandler,
  });

  /** @type {import('express').RequestHandler} */
  const generalApiLimiter = (req, res, next) => {
    const path = req.path || '';
    if (path.startsWith('/health') || path === '/csrf-token') {
      next();
      return;
    }
    return apiLimiter(req, res, next);
  };

  app.use('/api', generalApiLimiter);
  app.use('/api/ai', aiLimiter);
  app.use('/api/auth', authLimiter); // Rate limit auth endpoints (Issue #9)
}

const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production, 'lax' for local dev
    secure: isProduction, // Required when sameSite is 'none'
  },
});

/** @type {import('express').RequestHandler} */
const csrfTokenHandler = (req, res) => {
  const csrfToken = (/** @type {import('express').Request & { csrfToken(): string }} */ (req)).csrfToken();

  res.cookie('XSRF-TOKEN', csrfToken, {
    httpOnly: false,
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-origin in production, 'lax' for local dev
    secure: isProduction, // Required when sameSite is 'none'
    maxAge: 60 * 60 * 1000,
  });

  res.json({ csrfToken });
};

app.get('/api/csrf-token', csrfProtection, csrfTokenHandler);

const csrfProtectedRoutes = ['/api/ai'];
if (config.mcp?.enabled) {
  csrfProtectedRoutes.push('/api/mcp', '/api/conversations');
}

// Apply CSRF protection to routes
csrfProtectedRoutes.forEach((route) => {
  app.use(route, (req, res, next) => {
    // Exclude OAuth callback from CSRF protection
    // OAuth has its own security (state parameter + PKCE verifier)
    if (req.path === '/oauth/callback' && req.method === 'POST') {
      return next();
    }
    return csrfProtection(req, res, next);
  });
});

app.use('/api/ai', authMiddleware);

const authModule = require('./dist/routes/auth');
const authRoutes = authModule.default || authModule;

app.use('/api/auth', authRoutes);
logger.info('Auth routes enabled');

if (config.mcp?.enabled) {
  const mcpModule = require('./dist/routes/mcp');
  const conversationsModule = require('./dist/routes/conversations');
  const mcpRoutes = mcpModule.default || mcpModule;
  const conversationsRoutes = conversationsModule.default || conversationsModule;

  app.use('/api/mcp', authMiddleware);
  app.use('/api/conversations', authMiddleware);

  app.use('/api/mcp', mcpRoutes);
  app.use('/api/conversations', conversationsRoutes);

  logger.info('MCP routes enabled');
  logger.info('Conversations routes enabled');
}

app.use('/api/ai', aiRoutes);

app.use(notFoundHandler);

/** @type {import('express').ErrorRequestHandler} */
const csrfErrorHandler = (err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    logger.warn('Invalid CSRF token', { path: req.path, ip: req.ip });
    res.status(403).json({ success: false, error: 'Invalid CSRF token' });
    return;
  }

  next(err);
};

app.use(csrfErrorHandler);
app.use(errorHandler);

/** @type {import('http').Server | null} */
let serverInstance = null;
let shuttingDown = false;

/**
 * @param {import('http').Server} server
 * @returns {Promise<void>}
 */
function closeHttpServer(server) {
  return new Promise((resolve) => {
    server.close((err) => {
      if (err) {
        logger.error('Error closing HTTP server', err);
      } else {
        logger.info('HTTP server closed');
      }
      resolve();
    });
  });
}

/**
 * @param {NodeJS.Signals | 'uncaughtException' | 'unhandledRejection'} signal
 * @param {number} exitCode
 */
async function gracefulShutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info(`${signal} received, starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    logger.error('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30_000);
  shutdownTimeout.unref();

  try {
    if (serverInstance) {
      await closeHttpServer(serverInstance);
    }

    if (config.mcp?.enabled && typeof db?.disconnect === 'function') {
      await db.disconnect();
    }

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    logger.error('Error during shutdown', error instanceof Error ? error : null, {
      error,
    });
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  logger.error('FATAL: Uncaught exception', error);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('FATAL: Unhandled rejection', reason instanceof Error ? reason : null, {
    reason: reason instanceof Error ? undefined : reason,
  });
  logger.warn('Unhandled promise reference', { promise });
  gracefulShutdown('unhandledRejection', 1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
process.on('SIGINT', () => gracefulShutdown('SIGINT', 0));

serverInstance = app.listen(PORT, HOST, () => {
  logger.info(`🚀 ${SUCCESS_MESSAGES.SERVER_STARTED}`, {
    host: HOST,
    port: PORT,
    environment: config.server.environment,
  });

  const enabledProviders = Object.entries(config.providers)
    .filter(([, providerConfig]) => providerConfig.enabled)
    .map(([name]) => name);

  const totalProviders = Object.keys(config.providers).length;

  logger.info('Provider configuration', {
    enabled: enabledProviders,
    total: totalProviders,
  });

  const missingProviders = Object.entries(config.providers)
    .filter(([, providerConfig]) => !providerConfig.enabled)
    .map(([name]) => name);

  if (missingProviders.length > 0) {
    logger.warn('Missing provider API keys', { missingProviders });
  }

  logger.info('CORS configured', { origins: config.server.cors.origins });
  logger.info('Press Ctrl+C to stop the server');
});

module.exports = app;

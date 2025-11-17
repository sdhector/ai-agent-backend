import { z } from 'zod';
import type { Logger } from '../utils/logger';
import { createLogger } from '../utils/logger';

export interface ServerConfig {
  port: number;
  host: string;
  environment: string;
  cors: {
    origins: Array<string | RegExp>;
  };
}

export interface APIConfig {
  timeout: number;
  maxTokens: number;
  defaultTemperature: number;
}

export interface ProviderAPIConfig {
  apiKey: string | undefined;
  enabled: boolean;
}

export interface ProvidersConfig {
  claude: ProviderAPIConfig;
}

export interface FeaturesConfig {
  rateLimit: boolean;
  caching: boolean;
  logging: boolean;
}

export interface MCPConfig {
  enabled: boolean;
  tokenRefreshBufferMinutes: number; // Minutes before expiration to consider token "expired"
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
  };
  encryption: {
    masterKey: string;
  };
  auth: {
    jwtSecret: string;
    jwtExpiry: string;
  };
  oauth: {
    // MCP OAuth - for connecting to MCP servers
    redirectUri: string;
    frontendUrl: string;
  };
  appOAuth: {
    // App Login OAuth - for user authentication
    redirectUri: string;
    clientId: string;
    clientSecret: string;
  };
}

export interface AppConfig {
  server: ServerConfig;
  api: APIConfig;
  providers: ProvidersConfig;
  features: FeaturesConfig;
  mcp?: MCPConfig;
}

export interface ConfigValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigValidationOptions {
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  logSuccess?: boolean;
}

const validationLogger = createLogger('ConfigValidation');

// Helper function to get URLs based on environment
function getEnvironmentUrls() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isCloudRun = Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';
  
  // In production/Cloud Run, both URLs must be explicitly configured
  if (isProduction || isCloudRun) {
    const backendUrl = process.env.BACKEND_URL;
    const frontendUrl = process.env.FRONTEND_URL;

    if (!backendUrl) {
      throw new Error('BACKEND_URL environment variable is required. Set it in GCP Secret Manager.');
    }

    if (!frontendUrl) {
      throw new Error('FRONTEND_URL environment variable is required. Set it in GCP Secret Manager.');
    }

    return {
      frontendUrl: frontendUrl.trim(),
      backendUrl: backendUrl.trim(),
      mcpOAuthRedirect: process.env.MCP_OAUTH_REDIRECT_URI || `${backendUrl}/oauth/callback`,
      appOAuthRedirect: process.env.APP_OAUTH_REDIRECT_URI || `${backendUrl}/api/auth/google/callback`
    };
  }

  // Local development: always use localhost URLs (ignore Secret Manager URLs for local dev)
  const backendPort = process.env.BACKEND_PORT || process.env.PORT || '8080';
  const localBackendUrl = `http://localhost:${backendPort}`;
  const localFrontendUrl = 'http://localhost:8081';

  return {
    frontendUrl: localFrontendUrl,
    backendUrl: localBackendUrl,
    // Always use localhost for OAuth redirects in local development
    // This ensures OAuth works locally even if Secret Manager has Cloud Run URLs
    mcpOAuthRedirect: `${localBackendUrl}/oauth/callback`,
    appOAuthRedirect: `${localBackendUrl}/api/auth/google/callback`
  };
}

function getCorsOrigins(): Array<string | RegExp> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isCloudRun = process.env.K_SERVICE !== undefined;

  if (isProduction || isCloudRun) {
    // Production: Use explicit ALLOWED_ORIGINS or FRONTEND_URL
    const allowedOrigins = process.env.ALLOWED_ORIGINS;

    if (allowedOrigins) {
      // Parse comma-separated list of allowed origins
      return allowedOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
    }

    // Fall back to FRONTEND_URL if ALLOWED_ORIGINS not set
    const serviceUrl = process.env.FRONTEND_URL?.trim();
    if (serviceUrl) {
      // Include both .web.app and .firebaseapp.com domains
      const origins = [serviceUrl];

      // Add alternate Firebase domain if using Firebase Hosting
      if (serviceUrl.includes('.firebaseapp.com')) {
        origins.push(serviceUrl.replace('.firebaseapp.com', '.web.app'));
      } else if (serviceUrl.includes('.web.app')) {
        origins.push(serviceUrl.replace('.web.app', '.firebaseapp.com'));
      }

      return origins;
    }

    // No CORS origins configured - fail safely
    throw new Error('ALLOWED_ORIGINS or FRONTEND_URL must be configured in production');
  }

  // Local development origins - support multiple frontend configurations
  return [
    // Legacy Next.js frontend
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://0.0.0.0:3001',

    // Expo web development (React Native)
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://0.0.0.0:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'http://0.0.0.0:19006',

    // Local network patterns for mobile testing
    /^http:\/\/192\.168\.\d+\.\d+:3001$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:3001$/,
    /^http:\/\/192\.168\.\d+\.\d+:8081$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:8081$/,
    /^http:\/\/192\.168\.\d+\.\d+:19006$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:19006$/
  ];
}

const urls = getEnvironmentUrls();

// On Cloud Run, always use the PORT environment variable
const isCloudRun = Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';
const serverPort = isCloudRun 
  ? parseInt(process.env.PORT || '8080', 10)
  : parseInt(process.env.BACKEND_PORT || process.env.PORT || '8080', 10);

const config: AppConfig = {
  server: {
    port: serverPort,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    cors: {
      origins: getCorsOrigins()
    }
  },

  api: {
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
    maxTokens: parseInt(process.env.MAX_TOKENS || '4000', 10),
    defaultTemperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7')
  },

  providers: {
    claude: {
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
      enabled: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY)
    }
  },

  features: {
    rateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    caching: process.env.ENABLE_CACHING === 'true',
    logging: process.env.ENABLE_LOGGING !== 'false'
  },

  mcp: (() => {
    // Always configure app OAuth if Google credentials are present
    // This ensures user login works regardless of MCP_ENABLED flag
    const hasGoogleOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const isProduction = process.env.NODE_ENV === 'production';
    const isCloudRun = Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';
    let isMcpEnabled = process.env.MCP_ENABLED === 'true';

    // In development, auto-disable MCP if required variables are missing
    if (!isProduction && !isCloudRun && isMcpEnabled) {
      const hasRequiredVars = !!(process.env.ENCRYPTION_KEY && process.env.DATABASE_URL);
      if (!hasRequiredVars) {
        console.warn('⚠️  MCP_ENABLED is true but required variables (ENCRYPTION_KEY, DATABASE_URL) are missing. Disabling MCP for local development.');
        isMcpEnabled = false;
      }
    }

    if (!isMcpEnabled && !hasGoogleOAuth) {
      return undefined;
    }

    return {
      enabled: isMcpEnabled,
      tokenRefreshBufferMinutes: parseInt(process.env.MCP_TOKEN_REFRESH_BUFFER_MINUTES || '5', 10),
      database: isMcpEnabled ? {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'ai_assistant_pwa',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10)
      } : {
        host: '',
        port: 5432,
        database: '',
        user: '',
        password: '',
        ssl: false,
        maxConnections: 20
      },
      encryption: {
        masterKey: process.env.TOKEN_ENCRYPTION_KEY || ''
      },
      auth: {
        jwtSecret: process.env.JWT_SECRET || '',
        jwtExpiry: process.env.JWT_EXPIRY || '7d'
      },
      oauth: {
        // MCP OAuth - for connecting to MCP servers
        redirectUri: urls.mcpOAuthRedirect,
        frontendUrl: urls.frontendUrl
      },
      appOAuth: {
        // App Login OAuth - for user authentication
        // This is always configured if Google OAuth credentials exist
        redirectUri: urls.appOAuthRedirect,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
      }
    };
  })()
};

const envSchema = z.object({
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((val) => new Set(val).size > 1, 'JWT_SECRET cannot be all the same character'),
  ANTHROPIC_API_KEY: z
    .string({ required_error: 'ANTHROPIC_API_KEY is required' })
    .min(1, 'ANTHROPIC_API_KEY is required')
    .refine((val) => val.startsWith('sk-'), 'ANTHROPIC_API_KEY must start with sk-'),
  ENCRYPTION_KEY: z
    .string()
    .refine((val) => {
      if (!val) return true; // Optional, validation handled in validateConfig
      try {
        return Buffer.from(val, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'ENCRYPTION_KEY must be base64-encoded 32 bytes')
    .optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z
    .preprocess((val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      return val;
    }, z.string().url('DATABASE_URL must be a valid URL').optional()),
  MCP_ENABLED: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_REDIRECT_URI: z.string().optional(),
  FRONTEND_URL: z.string().optional()
});

function logWarnings(logger: Pick<Logger, 'warn'>, warnings: string[]): void {
  warnings.forEach((warning) => logger.warn(warning));
}

function logErrors(logger: Pick<Logger, 'error'>, errors: string[]): void {
  errors.forEach((message) => logger.error(message));
}

function validateUrlValue(url: string | undefined, name: string, requireHttps: boolean, errors: string[]): void {
  if (!url) {
    errors.push(`${name} is required when MCP is enabled`);
    return;
  }

  try {
    const parsed = new URL(url);
    if (requireHttps && parsed.protocol !== 'https:') {
      errors.push(`${name} must use HTTPS in production`);
    }
  } catch {
    errors.push(`${name} is not a valid URL: ${url}`);
  }
}

export function validateConfig(options: ConfigValidationOptions = {}): ConfigValidationResult {
  const logger = options.logger ?? validationLogger;
  const logSuccess = options.logSuccess ?? true;
  const errors: string[] = [];
  const warnings: string[] = [];

  const envValues = {
    JWT_SECRET: process.env.JWT_SECRET?.trim(),
    ANTHROPIC_API_KEY: (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)?.trim(),
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY?.trim(),
    TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY?.trim(),
    DATABASE_URL: process.env.DATABASE_URL?.trim(),
    MCP_ENABLED: process.env.MCP_ENABLED?.trim(),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID?.trim(),
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET?.trim(),
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI?.trim(),
    FRONTEND_URL: process.env.FRONTEND_URL?.trim()
  } as const;

  // In development, be lenient with DATABASE_URL and ENCRYPTION_KEY validation
  // since they're only required when MCP is enabled
  const isProduction = config.server.environment === 'production';
  const isCloudRun = Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';
  const isDevelopment = !isProduction && !isCloudRun;

  const parsed = envSchema.safeParse(envValues);

  if (!parsed.success) {
    parsed.error.errors.forEach((issue) => {
      const path = issue.path.join('.') || 'value';
      // In development, skip DATABASE_URL and ENCRYPTION_KEY schema errors
      // They will be validated conditionally in validateConfig based on MCP_ENABLED
      if (isDevelopment && (path === 'DATABASE_URL' || path === 'ENCRYPTION_KEY')) {
        // Skip these errors in development - they'll be validated conditionally
        return;
      }
      errors.push(`${path}: ${issue.message}`);
    });
  }

  const env = parsed.success ? parsed.data : envValues;

  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    warnings.push('ANTHROPIC_API_KEY not set; using CLAUDE_API_KEY for Claude provider.');
  }

  if (config.server.port < 1024 || config.server.port > 65535) {
    errors.push('BACKEND_PORT must be between 1024 and 65535');
  }

  const enabledProviders = Object.values(config.providers).filter((provider) => provider.enabled);
  if (enabledProviders.length === 0) {
    errors.push('At least one AI provider must be configured');
  }

  const isMcpEnabled = config.mcp?.enabled === true;
  const hasAppOAuth = !!(config.mcp?.appOAuth?.clientId && config.mcp?.appOAuth?.clientSecret);

  if (isMcpEnabled) {
    // Validate ENCRYPTION_KEY when MCP is enabled
    const encryptionKey = env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      errors.push('ENCRYPTION_KEY is required when MCP is enabled');
    } else {
      try {
        if (Buffer.from(encryptionKey, 'base64').length !== 32) {
          errors.push('ENCRYPTION_KEY must be base64-encoded 32 bytes');
        }
      } catch {
        errors.push('ENCRYPTION_KEY must be base64-encoded 32 bytes');
      }
    }

    // Validate DATABASE_URL when MCP is enabled
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      errors.push('DATABASE_URL is required when MCP is enabled');
    } else {
      try {
        new URL(databaseUrl);
      } catch {
        errors.push('DATABASE_URL must be a valid URL');
      }
    }

    const tokenKey = env.TOKEN_ENCRYPTION_KEY;
    if (!tokenKey) {
      errors.push('TOKEN_ENCRYPTION_KEY is required when MCP is enabled');
    } else if (tokenKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(tokenKey)) {
      errors.push('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
    }

    const dbPassword = process.env.DB_PASSWORD?.trim();
    if (!dbPassword) {
      errors.push('DB_PASSWORD is required when MCP is enabled');
    }

    const requireHttps = config.server.environment === 'production';

    // Validate MCP OAuth redirect URI
    validateUrlValue(config.mcp?.oauth?.redirectUri, 'MCP_OAUTH_REDIRECT_URI', requireHttps, errors);
    validateUrlValue(config.mcp?.oauth?.frontendUrl, 'FRONTEND_URL', requireHttps, errors);
  }

  // Validate app OAuth (user authentication) - independent of MCP
  if (hasAppOAuth) {
    if (!env.GOOGLE_CLIENT_ID) {
      errors.push('GOOGLE_CLIENT_ID is required for app OAuth');
    }

    if (!env.GOOGLE_CLIENT_SECRET) {
      errors.push('GOOGLE_CLIENT_SECRET is required for app OAuth');
    }

    const requireHttps = config.server.environment === 'production';
    validateUrlValue(config.mcp?.appOAuth?.redirectUri, 'APP_OAUTH_REDIRECT_URI', requireHttps, errors);
  }

  const success = errors.length === 0;

  if (!success) {
    logErrors(logger, errors);
    if (process.env.CONFIG_VALIDATED) {
      delete process.env.CONFIG_VALIDATED;
    }
  } else {
    if (logSuccess) {
      logger.info('Configuration validation passed', { warnings: warnings.length });
    }
    process.env.CONFIG_VALIDATED = 'true';
  }

  if (warnings.length > 0) {
    logWarnings(logger, warnings);
  }

  return { success, errors, warnings };
}

if (process.env.NODE_ENV === 'production') {
  const result = validateConfig({ logSuccess: false });
  if (!result.success) {
    validationLogger.error('Startup aborted due to invalid configuration', null, { errors: result.errors });
    process.exit(1);
  }
}

export default config;
module.exports = config;
module.exports.validateConfig = validateConfig;
module.exports.appConfig = config;
module.exports.config = config;

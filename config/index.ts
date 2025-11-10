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
  const isCloudRun = !!process.env.K_SERVICE;

  // Both backend and frontend URLs should be explicitly configured
  let backendUrl = process.env.BACKEND_URL;
  let frontendUrl = process.env.FRONTEND_URL;

  // For Cloud Run, if BACKEND_URL is not set, construct it from K_SERVICE
  if (!backendUrl && isCloudRun) {
    const serviceName = process.env.K_SERVICE;
    const region = process.env.GOOGLE_CLOUD_REGION || 'us-central1';
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || 'professional-website-462321';
    backendUrl = `https://${serviceName}-${projectId}.${region}.run.app`;
    console.log(`⚠️  BACKEND_URL not set, using constructed URL: ${backendUrl}`);
  }

  if (!backendUrl) {
    throw new Error('BACKEND_URL environment variable is required');
  }

  // For initial deployment, allow FRONTEND_URL to be missing but warn about it
  if (!frontendUrl) {
    if (isCloudRun) {
      console.warn('⚠️  FRONTEND_URL not set - OAuth and CORS may not work correctly');
      // Use a placeholder that won't match any real origin
      frontendUrl = 'https://placeholder.example.com';
    } else {
      throw new Error('FRONTEND_URL environment variable is required');
    }
  }

  return {
    frontendUrl: frontendUrl.trim(),
    backendUrl: backendUrl.trim(),
    mcpOAuthRedirect: process.env.MCP_OAUTH_REDIRECT_URI || `${backendUrl}/oauth/callback`,
    appOAuthRedirect: process.env.APP_OAUTH_REDIRECT_URI || `${backendUrl}/api/auth/google/callback`
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
    const isMcpEnabled = process.env.MCP_ENABLED === 'true';

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
    .string({ required_error: 'ENCRYPTION_KEY is required' })
    .refine((val) => {
      try {
        return Buffer.from(val, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'ENCRYPTION_KEY must be base64-encoded 32 bytes'),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .url('DATABASE_URL must be a valid URL'),
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

  const parsed = envSchema.safeParse(envValues);

  if (!parsed.success) {
    parsed.error.errors.forEach((issue) => {
      const path = issue.path.join('.') || 'value';
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

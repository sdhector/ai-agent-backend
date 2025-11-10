import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const LOCAL_ENV_PATHS: string[] = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '.env.local')
];

const CREDENTIALS_ENV_PATHS: string[] = [
  "C:/Users/Hector's PC/Documents/Github/.credentials/.env",
  "/mnt/c/Users/Hector's PC/Documents/Github/.credentials/.env",
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.ai-agent', '.env'),
  path.join(process.cwd(), '..', '.env'),
  path.join(process.cwd(), '..', '..', '.env')
];

export const ENV_SEARCH_PATHS: string[] = [...LOCAL_ENV_PATHS, ...CREDENTIALS_ENV_PATHS];

const isCloudRun = (): boolean => Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';

async function loadSecretsFromGCP(): Promise<boolean> {
  try {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    const client = new SecretManagerServiceClient();

    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'professional-website-462321';

  const secrets = [
    'DB_PASSWORD',
    'DATABASE_URL',
    'TOKEN_ENCRYPTION_KEY',
    'ENCRYPTION_KEY',
    'JWT_SECRET',
    'ANTHROPIC_API_KEY',
    'CLAUDE_API_KEY',
    'OPENAI_API_KEY',
    'GEMINI_API_KEY',
    'OPENROUTER_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'BACKEND_URL',
    'FRONTEND_URL',
    'OAUTH_REDIRECT_URI',
    'APP_OAUTH_REDIRECT_URI',
    'MCP_ENABLED',
    'MCP_TOKEN_REFRESH_INTERVAL',
    'BACKEND_PORT',
    'FRONTEND_PORT',
    'API_TIMEOUT',
    'MAX_TOKENS',
    'JWT_EXPIRY',
    'ENABLE_RATE_LIMIT',
    'ENABLE_LOGGING',
    'ENABLE_CACHING',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_SSL',
    'DB_MAX_CONNECTIONS'
  ];


    console.log('☁️  Loading secrets from GCP Secret Manager...');

    for (const secretKey of secrets) {
      if (process.env[secretKey]) {
        console.log(`✅ ${secretKey} already set (skipping)`);
        continue;
      }

      const secretName = secretKey.toLowerCase().replace(/_/g, '-');
      const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

      try {
        const [version] = await client.accessSecretVersion({ name });
        const payload = version?.payload?.data?.toString('utf8');
        if (payload) {
          // Trim to remove any trailing newlines or whitespace
          process.env[secretKey] = payload.trim();
          console.log(`✅ Loaded ${secretKey} from Secret Manager`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️  Failed to load ${secretKey}: ${message}`);
      }
    }

    if (process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
      console.log('✅ Set ANTHROPIC_API_KEY from CLAUDE_API_KEY for Agent SDK');
    }

    const availableKeys: string[] = [];
    if (process.env.ANTHROPIC_API_KEY) availableKeys.push('ANTHROPIC_API_KEY');
    if (process.env.CLAUDE_API_KEY) availableKeys.push('CLAUDE_API_KEY');
    if (process.env.OPENAI_API_KEY) availableKeys.push('OPENAI_API_KEY');
    if (process.env.GEMINI_API_KEY) availableKeys.push('GEMINI_API_KEY');
    if (availableKeys.length > 0) {
      console.log(`✅ Available API keys: ${availableKeys.join(', ')}`);
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to load secrets from GCP Secret Manager:', message);
    return false;
  }
}

function loadEnvironmentLocal(): boolean {
  let localEnvLoaded = false;
  let credentialsEnvLoaded = false;

  for (const envPath of LOCAL_ENV_PATHS) {
    if (fs.existsSync(envPath)) {
      console.log(`📁 Loading local .env from: ${envPath}`);
      dotenv.config({ path: envPath });
      localEnvLoaded = true;
      break;
    }
  }

  for (const envPath of CREDENTIALS_ENV_PATHS) {
    if (fs.existsSync(envPath)) {
      console.log(`📁 Loading credentials .env from: ${envPath}`);
      dotenv.config({ path: envPath });
      credentialsEnvLoaded = true;
      break;
    }
  }

  if (!localEnvLoaded && !credentialsEnvLoaded) {
    console.log('⚠️  No .env file found in standard locations');
    dotenv.config();
  }

  if (process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
    console.log('✅ Set ANTHROPIC_API_KEY from CLAUDE_API_KEY for Agent SDK');
  }

  const availableKeys: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) availableKeys.push('ANTHROPIC_API_KEY');
  if (process.env.CLAUDE_API_KEY) availableKeys.push('CLAUDE_API_KEY');
  if (process.env.OPENAI_API_KEY) availableKeys.push('OPENAI_API_KEY');
  if (process.env.GEMINI_API_KEY) availableKeys.push('GEMINI_API_KEY');
  if (availableKeys.length > 0) {
    console.log(`✅ Available API keys: ${availableKeys.join(', ')}`);
  }

  return localEnvLoaded || credentialsEnvLoaded;
}

export async function loadEnvironment(): Promise<boolean> {
  if (isCloudRun()) {
    console.log('☁️  Detected Cloud Run environment');
    return loadSecretsFromGCP();
  }

  console.log('💻 Running in local environment');
  return loadEnvironmentLocal();
}

module.exports = { loadEnvironment, ENV_SEARCH_PATHS };

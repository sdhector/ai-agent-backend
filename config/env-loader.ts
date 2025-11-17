import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

/**
 * NOTE: Local .env file paths are kept for reference but are NO LONGER USED.
 * 
 * GCP Secret Manager is the SINGLE SOURCE OF TRUTH for all secrets.
 * Local .env files are not loaded - all secrets must be stored in Secret Manager.
 * 
 * This ensures consistent secret management across all environments (local and Cloud Run).
 */
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

// DEPRECATED: These paths are no longer used. Secrets come from GCP Secret Manager only.
export const ENV_SEARCH_PATHS: string[] = [...LOCAL_ENV_PATHS, ...CREDENTIALS_ENV_PATHS];

const isCloudRun = (): boolean => Boolean(process.env.K_SERVICE) || process.env.CLOUD_RUN === 'true';

/**
 * Load secrets from GCP Secret Manager.
 * 
 * This is the SINGLE SOURCE OF TRUTH for all secrets.
 * 
 * Secret naming convention:
 * - Environment variable: GOOGLE_CLIENT_ID
 * - Secret name in GCP: google-client-id (lowercase with dashes)
 * 
 * Required GCP authentication:
 * - Local: gcloud auth application-default login
 * - Cloud Run: Automatic via service account
 * 
 * @returns Promise<{success: boolean, loadedCount: number}>
 */
async function loadSecretsFromGCP(): Promise<{ success: boolean; loadedCount: number }> {
  try {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    const client = new SecretManagerServiceClient();

    // Project ID for Secret Manager - single source of truth for all secrets
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

    let loadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const secretKey of secrets) {
      if (process.env[secretKey]) {
        console.log(`✅ ${secretKey} already set (skipping)`);
        skippedCount++;
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
          loadedCount++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Only log as warning if it's a permission/not found error, not a critical error
        if (message.includes('NOT_FOUND') || message.includes('PERMISSION_DENIED')) {
          console.warn(`⚠️  Secret ${secretKey} not found or no permission (this is okay if not needed)`);
        } else {
          console.warn(`⚠️  Failed to load ${secretKey}: ${message}`);
        }
        failedCount++;
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

    console.log(`📊 Secret Manager summary: ${loadedCount} loaded, ${skippedCount} skipped, ${failedCount} failed`);

    // Return success if we were able to connect to Secret Manager (even if some secrets failed)
    return { success: true, loadedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Failed to connect to GCP Secret Manager:', message);
    console.error('   Secret Manager is required. Ensure you are authenticated with: gcloud auth application-default login');
    return { success: false, loadedCount: 0 };
  }
}

/**
 * DEPRECATED: Local .env file loading is no longer used.
 * 
 * GCP Secret Manager is the SINGLE SOURCE OF TRUTH for all secrets.
 * This function is kept for reference but should not be called.
 * 
 * All secrets must be stored in GCP Secret Manager.
 * To add or update secrets, use:
 * - gcloud secrets create <secret-name> --data-file=-
 * - gcloud secrets versions add <secret-name> --data-file=-
 */
function loadEnvironmentLocal(): boolean {
  console.warn('⚠️  WARNING: Local .env file loading is deprecated.');
  console.warn('⚠️  GCP Secret Manager is the single source of truth for all secrets.');
  console.warn('⚠️  This function should not be called. All secrets must be in Secret Manager.');
  return false;
}

/**
 * Load environment variables from GCP Secret Manager.
 * 
 * IMPORTANT: GCP Secret Manager is the SINGLE SOURCE OF TRUTH for all secrets.
 * 
 * This function ALWAYS loads secrets from GCP Secret Manager, whether running:
 * - Locally (requires gcloud auth application-default login)
 * - On Cloud Run (automatic authentication via service account)
 * 
 * There is NO fallback to local .env files. All secrets must be stored in GCP Secret Manager.
 * 
 * To set up local development:
 * 1. Authenticate with GCP: `gcloud auth application-default login`
 * 2. Ensure secrets exist in Secret Manager for project: professional-website-462321
 * 3. Secret names should match the pattern: ENV_VAR_NAME (e.g., GOOGLE_CLIENT_ID)
 *    But stored as lowercase with dashes: google-client-id
 * 
 * @returns Promise<boolean> - true if successfully connected to Secret Manager
 * @throws Error if Secret Manager connection fails (no fallback)
 */
export async function loadEnvironment(): Promise<boolean> {
  const isCloudRunEnv = isCloudRun();
  
  if (isCloudRunEnv) {
    console.log('☁️  Detected Cloud Run environment - loading secrets from GCP Secret Manager');
  } else {
    console.log('💻 Detected local environment - loading secrets from GCP Secret Manager');
    console.log('   Ensure you are authenticated: gcloud auth application-default login');
  }
  
  // Always load from Secret Manager - it's the single source of truth
  const result = await loadSecretsFromGCP();
  
  if (result.success) {
    console.log(`✅ Successfully loaded ${result.loadedCount} secrets from GCP Secret Manager`);
    console.log('📝 Note: GCP Secret Manager is the single source of truth for all secrets');
    return true;
  }
  
  // No fallback - Secret Manager is required
  const errorMessage = isCloudRunEnv
    ? '❌ CRITICAL: Failed to load secrets from GCP Secret Manager in Cloud Run. Check service account permissions.'
    : '❌ CRITICAL: Failed to load secrets from GCP Secret Manager. Ensure you are authenticated with: gcloud auth application-default login';
  
  console.error(errorMessage);
  throw new Error('Failed to load secrets from GCP Secret Manager. Secret Manager is the single source of truth and is required.');
}

module.exports = { loadEnvironment, ENV_SEARCH_PATHS };

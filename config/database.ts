import { Pool } from 'pg';
import { createLogger } from '../utils/logger';

const logger = createLogger('Database');

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

class DatabaseConnection {
  private pool: Pool | null = null;

  connect(config: DatabaseConfig): Pool {
    if (this.pool) {
      return this.pool;
    }

    logger.info('Connecting to database', {
      host: config.host,
      database: config.database,
      ssl: config.ssl === true,
      maxConnections: config.maxConnections || 20,
    });

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.maxConnections || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      logger.error('Database pool error', err);
    });

    return this.pool;
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool;
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

export const db = new DatabaseConnection();

function parseBoolean(value?: string | boolean | null): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getDatabaseConfigFromEnv(): DatabaseConfig {
  const defaultPort = parseInteger(process.env.DB_PORT, 5432);
  const defaultMaxConnections = parseInteger(process.env.DB_MAX_CONNECTIONS, 20);
  const envSsl = parseBoolean(process.env.DB_SSL);
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      const sslMode = url.searchParams.get('sslmode');
      const sslFromUrl = sslMode
        ? ['require', 'verify-full', 'verify-ca', 'prefer', 'allow'].includes(sslMode.toLowerCase())
        : undefined;

      return {
        host: url.hostname,
        port: url.port ? parseInteger(url.port, defaultPort) : defaultPort,
        database: url.pathname.replace(/^\//, '') || process.env.DB_NAME || 'ai_assistant_pwa',
        user: url.username ? decodeURIComponent(url.username) : process.env.DB_USER || 'postgres',
        password: url.password ? decodeURIComponent(url.password) : process.env.DB_PASSWORD || '',
        ssl: sslFromUrl ?? envSsl ?? false,
        maxConnections: defaultMaxConnections,
      };
    } catch (error) {
      logger.warn('Failed to parse DATABASE_URL; falling back to discrete DB_* values', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: defaultPort,
    database: process.env.DB_NAME || 'ai_assistant_pwa',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: envSsl ?? false,
    maxConnections: defaultMaxConnections,
  };
}

function resolveDatabaseConfig(configOverride?: Partial<DatabaseConfig>): DatabaseConfig {
  const baseConfig = getDatabaseConfigFromEnv();

  const resolved: DatabaseConfig = {
    ...baseConfig,
    ...configOverride,
    host: configOverride?.host ?? baseConfig.host,
    port: configOverride?.port ?? baseConfig.port,
    database: configOverride?.database ?? baseConfig.database,
    user: configOverride?.user ?? baseConfig.user,
    password: configOverride?.password ?? baseConfig.password,
    ssl: configOverride?.ssl ?? baseConfig.ssl,
    maxConnections: configOverride?.maxConnections ?? baseConfig.maxConnections,
  };

  if (!resolved.port || resolved.port <= 0) {
    resolved.port = baseConfig.port;
  }

  if (!resolved.maxConnections || resolved.maxConnections <= 0) {
    resolved.maxConnections = baseConfig.maxConnections ?? 20;
  }

  return resolved;
}

export function ensureDatabaseConnection(configOverride?: Partial<DatabaseConfig>): void {
  if (db.isConnected()) {
    return;
  }

  const resolvedConfig = resolveDatabaseConfig(configOverride);

  try {
    db.connect(resolvedConfig);
  } catch (error) {
    logger.error('Failed to initialize database connection', error instanceof Error ? error : null, {
      host: resolvedConfig.host,
      database: resolvedConfig.database,
    });
    throw error;
  }
}

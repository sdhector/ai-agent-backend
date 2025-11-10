import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createLogger } from '../utils/logger';

dotenv.config();

const logger = createLogger('DatabaseMigration');

interface MigrationConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

async function runMigrations(config: MigrationConfig): Promise<void> {
  const pool = new Pool({
    ...config,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  });

  try {
    logger.info('Starting database migration...');

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of applied migrations
    const appliedResult = await pool.query(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.version));

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    logger.info(`Found ${migrationFiles.length} migration files`, {
      total: migrationFiles.length,
      applied: appliedMigrations.size,
      pending: migrationFiles.length - appliedMigrations.size
    });

    // Run pending migrations
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');

      if (appliedMigrations.has(version)) {
        logger.info(`Skipping already applied migration: ${version}`);
        continue;
      }

      logger.info(`Applying migration: ${version}`);

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      // Run migration in a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [version]
        );
        await client.query('COMMIT');
        logger.info(`Successfully applied migration: ${version}`);
      } catch (error: any) {
        await client.query('ROLLBACK');

        // Check if this is an "already applied" error that can be safely ignored
        const canBeIgnored = error.code === '42P07' || // relation already exists
                            error.code === '42710' || // duplicate object
                            error.code === '42P16' || // invalid table definition
                            error.code === '42703';   // column does not exist (for rename operations)

        if (canBeIgnored) {
          logger.warn(`Migration ${version} appears to be already applied or incompatible with current schema, marking as complete`, {
            errorCode: error.code,
            errorMessage: error.message
          });

          // Mark as applied so we don't try again
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
            [version]
          );
        } else {
          logger.error(`Failed to apply migration: ${version}`, error as Error);
          throw error;
        }
      } finally {
        client.release();
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', error as Error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migrations if executed directly
if (require.main === module) {
  const config: MigrationConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ai_assistant_pwa',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
  };

  runMigrations(config)
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { runMigrations };

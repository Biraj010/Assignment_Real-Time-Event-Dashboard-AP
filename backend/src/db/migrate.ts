import type { Pool } from 'pg';
import { logger as defaultLogger, type Logger } from '../lib/logger.js';

const MIGRATION_LOCK_ID = 7_314_202_601;

const MIGRATION_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type)',
  'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_events_event_type_timestamp ON events (event_type, timestamp DESC)',
];

export async function runMigrations(pool: Pool, logger: Logger = defaultLogger): Promise<void> {
  const client = await pool.connect();
  let releaseError: Error | undefined;

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);

    for (const statement of MIGRATION_STATEMENTS) {
      await client.query(statement);
    }

    await client.query('COMMIT');
    logger.info({ statements: MIGRATION_STATEMENTS.length }, 'Database migrations applied');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      releaseError = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
      logger.error({ err: rollbackErr }, 'Failed to roll back migration transaction');
    }
    logger.error({ err }, 'Database migration failed');
    throw err;
  } finally {
    client.release(releaseError);
  }
}

import { setTimeout as sleep } from 'node:timers/promises';
import { Pool } from 'pg';
import { DatabaseError } from '../errors/index.js';
import { logger as defaultLogger, type Logger } from '../lib/logger.js';

const MAX_BACKOFF_MS = 10_000;

export interface Queryable {
  query(text: string): Promise<unknown>;
}

export interface ConnectWithRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  logger?: Logger;
}

export function createPool(databaseUrl: string, logger: Logger = defaultLogger): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
  });

  return pool;
}

export function backoffDelay(attempt: number, baseDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

export async function connectWithRetry(
  pool: Queryable,
  { retries = 10, baseDelayMs = 500, logger = defaultLogger }: ConnectWithRetryOptions = {},
): Promise<void> {
  if (!Number.isInteger(retries) || retries < 1) {
    throw new RangeError(`retries must be a positive integer, received ${retries}`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw new RangeError(`baseDelayMs must be a non-negative number, received ${baseDelayMs}`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      logger.info({ attempt }, 'Connected to PostgreSQL');
      return;
    } catch (err) {
      lastError = err;

      if (attempt === retries) {
        logger.error({ err, attempt, retries }, 'PostgreSQL connection attempt failed; giving up');
        break;
      }

      const delayMs = backoffDelay(attempt, baseDelayMs);
      logger.warn(
        { err, attempt, retries, delayMs },
        'PostgreSQL connection attempt failed; retrying',
      );
      await sleep(delayMs);
    }
  }

  throw new DatabaseError(
    `Could not connect to PostgreSQL after ${retries} attempts`,
    undefined,
    { cause: lastError },
  );
}

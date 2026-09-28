import { describe, expect, it } from 'vitest';
import { backoffDelay, connectWithRetry, type Queryable } from '../../src/db/pool.js';
import { DatabaseError } from '../../src/errors/index.js';
import { createLogger } from '../../src/lib/logger.js';

const silent = createLogger('silent', 'test');

function fakeQueryable(handler: (call: number) => unknown): Queryable & { calls: number; queries: string[] } {
  const state = { calls: 0, queries: [] as string[] };
  return {
    get calls() {
      return state.calls;
    },
    get queries() {
      return state.queries;
    },
    async query(text: string) {
      state.calls += 1;
      state.queries.push(text);
      const result = handler(state.calls);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('backoffDelay', () => {
  it('doubles from the base delay and caps at 10s', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((attempt) => backoffDelay(attempt, 500))).toEqual([
      500, 1000, 2000, 4000, 8000, 10_000, 10_000,
    ]);
  });

  it('caps immediately when the base delay is already at the limit', () => {
    expect(backoffDelay(1, 10_000)).toBe(10_000);
    expect(backoffDelay(2, 10_000)).toBe(10_000);
  });

  it('stays at 0 when the base delay is 0', () => {
    expect(backoffDelay(1, 0)).toBe(0);
    expect(backoffDelay(8, 0)).toBe(0);
  });
});

describe('connectWithRetry', () => {
  it('succeeds on the first SELECT 1', async () => {
    const pool = fakeQueryable(() => ({ rows: [{ '?column?': 1 }] }));
    await expect(connectWithRetry(pool, { logger: silent })).resolves.toBeUndefined();
    expect(pool.calls).toBe(1);
    expect(pool.queries).toEqual(['SELECT 1']);
  });

  it('succeeds after N failures', async () => {
    const pool = fakeQueryable((call) =>
      call < 3 ? Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) : {},
    );
    await expect(
      connectWithRetry(pool, { retries: 5, baseDelayMs: 0, logger: silent }),
    ).resolves.toBeUndefined();
    expect(pool.calls).toBe(3);
  });

  it('throws DatabaseError after the retries run out', async () => {
    const last = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    const pool = fakeQueryable(() => last);

    await expect(connectWithRetry(pool, { retries: 3, baseDelayMs: 0, logger: silent })).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(DatabaseError);
        const databaseError = err as DatabaseError;
        expect(databaseError.statusCode).toBe(503);
        expect(databaseError.code).toBe('DATABASE_UNAVAILABLE');
        expect(databaseError.message).toBe('Could not connect to PostgreSQL after 3 attempts');
        expect(databaseError.cause).toBe(last);
        return true;
      },
    );
    expect(pool.calls).toBe(3);
  });

  it('rejects invalid retries and baseDelayMs without querying', async () => {
    const pool = fakeQueryable(() => {
      throw new Error('should not be called');
    });
    await expect(connectWithRetry(pool, { retries: 0, logger: silent })).rejects.toBeInstanceOf(RangeError);
    await expect(connectWithRetry(pool, { baseDelayMs: -1, logger: silent })).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(pool.calls).toBe(0);
  });
});

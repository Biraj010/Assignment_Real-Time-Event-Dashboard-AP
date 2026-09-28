import { loadConfig } from '../src/config/env.js';
import { connectWithRetry, createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { ConflictError } from '../src/errors/index.js';
import { createLogger } from '../src/lib/logger.js';
import { PostgresEventRepository } from '../src/repositories/postgresEventRepository.js';
import type { Event, EventFilters } from '../src/types/event.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`  \u2714 ${message}`);
  } else {
    failed += 1;
    console.log(`  \u2718 ${message}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function isSortedBy<T>(items: readonly T[], compare: (a: T, b: T) => number): boolean {
  return items.every((item, index) => {
    const previous = items[index - 1];
    return previous === undefined || compare(previous, item) <= 0;
  });
}

const byTimestampDesc = (a: Event, b: Event): number =>
  Date.parse(b.timestamp) - Date.parse(a.timestamp);

function buildEvents(runId: string, now: number): Event[] {
  const at = (msAgo: number): string => new Date(now - msAgo).toISOString();
  const users = [`${runId}user-alice`, `${runId}user-bob`, `${runId}user-carol`] as const;

  return [
    {
      id: `${runId}evt-1`,
      user_id: users[0],
      event_type: 'login',
      payload: { method: 'password', ip: '203.0.113.10', userAgent: 'Mozilla/5.0' },
      timestamp: at(4 * HOUR_MS + 30 * MINUTE_MS),
    },
    {
      id: `${runId}evt-2`,
      user_id: users[0],
      event_type: 'click',
      payload: { element: 'button#add-to-cart', page: '/products/42' },
      timestamp: at(3 * HOUR_MS + 30 * MINUTE_MS),
    },
    {
      id: `${runId}evt-3`,
      user_id: users[1],
      event_type: 'click',
      payload: { element: 'a.nav-pricing', page: '/' },
      timestamp: at(2 * HOUR_MS + 30 * MINUTE_MS),
    },
    {
      id: `${runId}evt-4`,
      user_id: users[1],
      event_type: 'purchase',
      payload: { item: 'checkout-pro', amount: 49.99, currency: 'USD', quantity: 1 },
      timestamp: at(90 * MINUTE_MS),
    },
    {
      id: `${runId}evt-5`,
      user_id: users[2],
      event_type: 'error',
      payload: { message: 'Payment gateway timeout', code: 'GATEWAY_TIMEOUT', status: 504 },
      timestamp: at(50 * MINUTE_MS),
    },
    {
      id: `${runId}evt-6`,
      user_id: users[2],
      event_type: 'page_view',
      payload: { path: '/dashboard', referrer: 'https://example.com', durationMs: 1830 },
      timestamp: at(10 * MINUTE_MS),
    },
  ];
}

async function findAcrossPages(
  repo: PostgresEventRepository,
  filters: Omit<EventFilters, 'page'>,
  predicate: (event: Event) => boolean,
): Promise<{ found: Event | undefined; scanned: Event[] }> {
  const scanned: Event[] = [];
  for (let page = 1; ; page += 1) {
    const result = await repo.list({ ...filters, page });
    scanned.push(...result.data);
    const found = result.data.find(predicate);
    if (found || page >= result.pagination.totalPages) {
      return { found, scanned };
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel === 'info' ? 'warn' : config.logLevel, config.env);
  const pool = createPool(config.databaseUrl, logger);
  const repo = new PostgresEventRepository(pool);
  const runId = `smoke-${Date.now()}-`;
  const now = Date.now();

  console.log(`Smoke test run id: ${runId}`);

  try {
    section('Connection & migrations');
    await connectWithRetry(pool, { logger, retries: 3 });
    assert(true, 'connected to PostgreSQL');
    await runMigrations(pool, logger);
    assert(true, 'migrations applied');

    section('create()');
    const events = buildEvents(runId, now);
    for (const event of events) {
      const created = await repo.create(event);
      assert(
        created.id === event.id &&
          created.event_type === event.event_type &&
          created.timestamp === new Date(event.timestamp).toISOString(),
        `inserted ${event.event_type.padEnd(9)} ${created.id}`,
      );
    }

    const first = events[0];
    if (!first) {
      throw new Error('No events were generated');
    }
    try {
      await repo.create({ ...first, user_id: `${runId}user-dupe` });
      assert(false, 'duplicate id throws ConflictError (nothing was thrown)');
    } catch (err) {
      assert(
        err instanceof ConflictError && err.statusCode === 409,
        `duplicate id throws ConflictError (got ${err instanceof Error ? err.name : String(err)})`,
      );
    }

    section('list({ page: 1, limit: 3 })');
    const firstPage = await repo.list({ page: 1, limit: 3 });
    assert(firstPage.data.length === 3, `returns 3 rows (got ${firstPage.data.length})`);
    assert(isSortedBy(firstPage.data, byTimestampDesc), 'rows are sorted by timestamp desc');
    assert(
      firstPage.pagination.total >= events.length,
      `pagination.total >= ${events.length} (got ${firstPage.pagination.total})`,
    );

    section("list({ eventTypes: ['click'] })");
    const clicks = await repo.list({ page: 1, limit: 50, eventTypes: ['click'] });
    assert(clicks.data.length > 0, `returns click events (got ${clicks.data.length})`);
    assert(
      clicks.data.every((event) => event.event_type === 'click'),
      'every row has event_type "click"',
    );

    section("list({ q: 'checkout' })");
    const purchase = events.find((event) => event.event_type === 'purchase');
    const search = await findAcrossPages(repo, { limit: 50, q: 'checkout' }, (event) => event.id === purchase?.id);
    assert(search.found !== undefined, `finds this run's purchase event (${purchase?.id})`);
    assert(
      search.scanned.every((event) => JSON.stringify(event.payload).includes('checkout')),
      'every match contains "checkout" in its payload',
    );

    section('list({ from, to }) covering the last 2 hours');
    const from = new Date(now - 2 * HOUR_MS);
    const to = new Date(now);
    const windowed = await repo.list({ page: 1, limit: 50, from, to });
    const expectedInWindow = events.filter((event) => {
      const time = Date.parse(event.timestamp);
      return time >= from.getTime() && time <= to.getTime();
    });
    assert(
      windowed.data.every((event) => {
        const time = Date.parse(event.timestamp);
        return time >= from.getTime() && time <= to.getTime();
      }),
      `every timestamp is within ${from.toISOString()} .. ${to.toISOString()}`,
    );
    assert(
      expectedInWindow.every((expected) => windowed.data.some((event) => event.id === expected.id)),
      `includes this run's ${expectedInWindow.length} events from the last 2 hours`,
    );

    section('analytics(24)');
    const analytics = await repo.analytics(24);
    assert(analytics.windowHours === 24, 'windowHours is 24');
    assert(analytics.total >= events.length, `total >= ${events.length} (got ${analytics.total})`);
    assert(
      isSortedBy(analytics.byType, (a, b) => b.count - a.count),
      'byType is sorted by count desc',
    );
    assert(analytics.hourly.length > 0, `hourly is non-empty (${analytics.hourly.length} buckets)`);
    console.log(`\n  total: ${analytics.total}`);
    console.table(analytics.byType);
    console.table(analytics.hourly);
  } catch (err) {
    failed += 1;
    console.error('\n  \u2718 Unexpected error:', err);
  } finally {
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('SMOKE TEST FAILED');
    process.exitCode = 1;
  } else {
    console.log('SMOKE TEST PASSED');
  }
}

await main();

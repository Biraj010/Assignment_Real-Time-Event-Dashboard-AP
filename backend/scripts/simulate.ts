import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const EVENT_TYPES = ['login', 'logout', 'page_view', 'click', 'purchase', 'error', 'signup'] as const;
type SimulatedEventType = (typeof EVENT_TYPES)[number];

const USER_IDS = Array.from({ length: 8 }, (_, index) => `u${index + 1}`);
const BROWSERS = ['Chrome 129', 'Firefox 131', 'Safari 18', 'Edge 129'];
const PATHS = ['/', '/pricing', '/products', '/products/42', '/cart', '/checkout', '/dashboard', '/settings'];
const BUTTONS = ['add-to-cart', 'buy-now', 'sign-up', 'subscribe', 'filter-apply', 'nav-menu'];
const ITEMS = [
  { item: 'checkout-pro', amount: 49.99 },
  { item: 'starter-plan', amount: 9.99 },
  { item: 'team-plan', amount: 199 },
  { item: 'usb-c-cable', amount: 12.5 },
];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'NPR'];
const ERRORS = [
  { message: 'Payment gateway timeout', code: 'GATEWAY_TIMEOUT' },
  { message: 'Failed to load resource', code: 'NETWORK_ERROR' },
  { message: "Cannot read properties of undefined (reading 'id')", code: 'TYPE_ERROR' },
  { message: 'Session expired', code: 'UNAUTHORIZED' },
];
const REQUEST_TIMEOUT_MS = 10_000;

interface SimulatorConfig {
  apiUrl: string;
  intervalMs: number;
  count: number | undefined;
}

interface Summary {
  attempted: number;
  created: number;
  rateLimited: number;
  failures: Map<string, number>;
  startedAt: number;
}

function pick<T>(items: readonly T[]): T {
  const item = items[randomInt(items.length)];
  if (item === undefined) {
    throw new Error('Cannot pick from an empty list');
  }
  return item;
}

function readPositiveInt(name: string, fallback: number | undefined): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
}

function readConfig(): SimulatorConfig {
  const apiUrl = (process.env.API_URL?.trim() || 'http://localhost:4000').replace(/\/+$/, '');
  if (!URL.canParse(apiUrl)) {
    throw new Error(`API_URL must be a valid URL, received "${apiUrl}"`);
  }
  return {
    apiUrl,
    intervalMs: readPositiveInt('INTERVAL_MS', 2500) ?? 2500,
    count: readPositiveInt('COUNT', undefined),
  };
}

function buildPayload(type: SimulatedEventType): Record<string, unknown> {
  const browser = pick(BROWSERS);
  switch (type) {
    case 'login':
      return { method: pick(['password', 'google', 'github']), browser };
    case 'logout':
      return { sessionDurationSec: randomInt(30, 7200), browser };
    case 'page_view':
      return { path: pick(PATHS), referrer: pick(['direct', 'google', 'newsletter', 'twitter']), browser };
    case 'click':
      return { button: pick(BUTTONS), path: pick(PATHS), browser };
    case 'purchase':
      return { ...pick(ITEMS), currency: pick(CURRENCIES), browser };
    case 'error':
      return { ...pick(ERRORS), path: pick(PATHS), browser };
    case 'signup':
      return { plan: pick(['free', 'starter', 'team']), source: pick(['landing', 'pricing', 'referral']), browser };
  }
}

function buildEvent(): { id: string; user_id: string; event_type: SimulatedEventType; payload: Record<string, unknown>; timestamp: string } {
  const eventType = pick(EVENT_TYPES);
  return {
    id: randomUUID(),
    user_id: pick(USER_IDS),
    event_type: eventType,
    payload: buildPayload(eventType),
    timestamp: new Date().toISOString(),
  };
}

function readErrorBody(body: unknown): { code: string | undefined; retryAfterSeconds: number | undefined } {
  if (typeof body !== 'object' || body === null || !('error' in body)) {
    return { code: undefined, retryAfterSeconds: undefined };
  }
  const error = (body as { error: { code?: unknown; details?: { retryAfterSeconds?: unknown } } }).error;
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    retryAfterSeconds:
      typeof error.details?.retryAfterSeconds === 'number' ? error.details.retryAfterSeconds : undefined,
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause as { code?: unknown } | undefined;
    if (typeof cause?.code === 'string') return cause.code;
    if (err.name === 'TimeoutError') return 'TIMEOUT';
    return err.message;
  }
  return String(err);
}

function recordFailure(summary: Summary, reason: string): void {
  summary.failures.set(reason, (summary.failures.get(reason) ?? 0) + 1);
}

function printSummary(summary: Summary, reason: string): void {
  const seconds = ((Date.now() - summary.startedAt) / 1000).toFixed(1);
  console.log(`\n${reason}. Summary after ${seconds}s:`);
  console.log(`  attempted:    ${summary.attempted}`);
  console.log(`  created:      ${summary.created}`);
  console.log(`  rate limited: ${summary.rateLimited}`);
  if (summary.failures.size > 0) {
    console.log('  failures:');
    for (const [code, count] of summary.failures) {
      console.log(`    ${code}: ${count}`);
    }
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const endpoint = `${config.apiUrl}/api/events`;
  const stop = new AbortController();
  const summary: Summary = { attempted: 0, created: 0, rateLimited: 0, failures: new Map(), startedAt: Date.now() };

  process.once('SIGINT', () => stop.abort());
  process.once('SIGTERM', () => stop.abort());

  console.log(
    `Simulating events -> ${endpoint} every ${config.intervalMs}ms` +
      `${config.count ? `, stopping after ${config.count}` : ''} (Ctrl+C to stop)`,
  );

  let pending: ReturnType<typeof buildEvent> | undefined;

  try {
    while (!stop.signal.aborted && (config.count === undefined || summary.attempted < config.count)) {
      const event = pending ?? buildEvent();
      pending = undefined;
      let waitMs = config.intervalMs;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          signal: AbortSignal.any([stop.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });
        const body: unknown = await response.json().catch(() => undefined);

        if (response.status === 201) {
          summary.attempted += 1;
          summary.created += 1;
          console.log(`\u2713 201 ${event.event_type} ${event.user_id}`);
        } else if (response.status === 429) {
          summary.rateLimited += 1;
          const retryAfter = readErrorBody(body).retryAfterSeconds ?? Math.ceil(config.intervalMs / 1000);
          waitMs = retryAfter * 1000;
          pending = event;
          console.log(`\u2717 429 RATE_LIMITED, waiting ${retryAfter}s before retrying`);
        } else {
          summary.attempted += 1;
          const code = readErrorBody(body).code ?? `HTTP_${response.status}`;
          recordFailure(summary, code);
          console.log(`\u2717 ${response.status} ${code} ${event.event_type} ${event.user_id}`);
        }
      } catch (err) {
        if (stop.signal.aborted) break;
        summary.attempted += 1;
        const code = describeNetworkError(err);
        recordFailure(summary, code);
        console.log(`\u2717 ${code} ${event.event_type} ${event.user_id}`);
      }

      const done = config.count !== undefined && summary.attempted >= config.count;
      if (!done) {
        await sleep(waitMs, undefined, { signal: stop.signal });
      }
    }
  } catch (err) {
    if (!isAbortError(err)) throw err;
  }

  printSummary(summary, stop.signal.aborted ? 'Stopped' : 'Done');
  process.exitCode = summary.failures.size > 0 && summary.created === 0 ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

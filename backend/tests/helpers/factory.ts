import { vi, type Mock } from 'vitest';
import { createApp, type AppDeps } from '../../src/app.js';
import type { AppConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';
import { InMemoryEventRepository } from '../../src/repositories/inMemoryEventRepository.js';
import type { Event } from '../../src/types/event.js';

export const TEST_DATABASE_URL = 'postgres://test:test@localhost:5432/test';

let eventSeq = 0;

export function makeEvent(overrides: Partial<Event> = {}): Event {
  eventSeq += 1;
  return {
    id: `evt_${eventSeq}`,
    user_id: 'user_1',
    event_type: 'click',
    payload: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    port: 4000,
    logLevel: 'silent',
    databaseUrl: TEST_DATABASE_URL,
    corsOrigins: '*',
    rateLimit: { max: 10_000, windowMs: 60_000 },
    trustProxy: 0,
    ...overrides,
  };
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  repo: InMemoryEventRepository;
  broadcast: Mock<(message: unknown) => void>;
  config: AppConfig;
}

export interface BuildTestAppOptions {
  repo?: InMemoryEventRepository;
  config?: Partial<AppConfig>;
  events?: Event[];
}

export async function buildTestApp(opts: BuildTestAppOptions = {}): Promise<TestApp> {
  const repo = opts.repo ?? new InMemoryEventRepository();
  const config = makeTestConfig(opts.config);
  const broadcast = vi.fn<(message: unknown) => void>();
  const deps: AppDeps = {
    repo,
    config,
    logger: createLogger('silent', 'test'),
    broadcaster: { broadcast },
  };

  for (const event of opts.events ?? []) {
    await repo.create(event);
  }

  return { app: createApp(deps), repo, broadcast, config };
}

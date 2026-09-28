import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const DATABASE_URL = 'postgres://events:events@localhost:5432/events';

function issues(source: NodeJS.ProcessEnv): string {
  try {
    loadConfig(source);
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    return (err as Error).message;
  }
  throw new Error('Expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    expect(loadConfig({ DATABASE_URL })).toEqual({
      env: 'development',
      port: 4000,
      logLevel: 'info',
      databaseUrl: DATABASE_URL,
      corsOrigins: '*',
      rateLimit: { max: 30, windowMs: 60_000 },
      trustProxy: 0,
    });
  });

  it('treats empty strings as unset so defaults still apply', () => {
    expect(
      loadConfig({
        DATABASE_URL,
        PORT: '',
        LOG_LEVEL: '   ',
        CORS_ORIGIN: '',
        RATE_LIMIT_MAX: '',
        TRUST_PROXY: '',
      }),
    ).toMatchObject({ port: 4000, logLevel: 'info', corsOrigins: '*', trustProxy: 0 });
  });

  it('accepts postgresql:// and explicit overrides', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        DATABASE_URL: 'postgresql://u:p@db:5432/events',
        CORS_ORIGIN: '*',
        RATE_LIMIT_MAX: '15',
        RATE_LIMIT_WINDOW_MS: '120000',
        TRUST_PROXY: '1',
      }),
    ).toEqual({
      env: 'production',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: 'postgresql://u:p@db:5432/events',
      corsOrigins: '*',
      rateLimit: { max: 15, windowMs: 120_000 },
      trustProxy: 1,
    });
  });

  it("returns '*' when CORS_ORIGIN is *", () => {
    expect(loadConfig({ DATABASE_URL, CORS_ORIGIN: '*' }).corsOrigins).toBe('*');
  });

  it('splits a comma-separated CORS origin list and trims entries', () => {
    expect(
      loadConfig({
        DATABASE_URL,
        CORS_ORIGIN: ' http://localhost:5173, https://app.example.com ',
      }).corsOrigins,
    ).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('rejects an invalid CORS origin', () => {
    const message = issues({ DATABASE_URL, CORS_ORIGIN: 'not-a-url' });
    expect(message).toContain('CORS_ORIGIN');
    expect(message).toContain('invalid origin "not-a-url"');
  });

  it('rejects an origin that includes a path', () => {
    expect(issues({ DATABASE_URL, CORS_ORIGIN: 'http://localhost:5173/dashboard' })).toContain(
      'CORS_ORIGIN',
    );
  });

  it('throws when DATABASE_URL is missing', () => {
    const message = issues({});
    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain('DATABASE_URL: is required');
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(issues({ DATABASE_URL: 'mysql://localhost/db' })).toContain(
      'must be a postgres:// connection URL',
    );
  });

  it('rejects a non-numeric PORT', () => {
    const message = issues({ DATABASE_URL, PORT: 'abc' });
    expect(message).toContain('PORT:');
  });

  it('lists every invalid field in a single error', () => {
    const message = issues({
      NODE_ENV: 'staging',
      PORT: 'abc',
      LOG_LEVEL: 'loud',
      DATABASE_URL: 'mysql://x',
      CORS_ORIGIN: 'not-a-url',
    });
    expect(message).toContain('NODE_ENV:');
    expect(message).toContain('PORT:');
    expect(message).toContain('LOG_LEVEL:');
    expect(message).toContain('DATABASE_URL:');
    expect(message).toContain('CORS_ORIGIN:');
  });
});

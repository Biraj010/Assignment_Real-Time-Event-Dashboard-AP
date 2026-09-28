import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, makeEvent } from '../helpers/factory.js';

const down = Object.assign(new Error('down'), { code: 'ECONNREFUSED' });

describe('resilience', () => {
  it('limits /api after max requests and leaves /health unlimited', async () => {
    const { app } = await buildTestApp({
      config: { rateLimit: { max: 3, windowMs: 60_000 } },
    });

    const first = await request(app).get('/api/events');
    const second = await request(app).get('/api/events');
    const third = await request(app).get('/api/events');
    const fourth = await request(app).get('/api/events');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(first.headers.ratelimit).toMatch(/r=2/);
    expect(third.headers.ratelimit).toMatch(/r=0/);

    expect(fourth.status).toBe(429);
    expect(fourth.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.',
        details: { retryAfterSeconds: expect.any(Number) },
      },
    });
    expect(fourth.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.headers.ratelimit).toBeDefined();
    expect(fourth.headers['retry-after']).toBeDefined();
    expect(fourth.headers['x-ratelimit-limit']).toBeUndefined();

    const healthChecks = await Promise.all(
      Array.from({ length: 8 }, () => request(app).get('/health')),
    );
    expect(healthChecks.every((res) => res.status === 200)).toBe(true);
    expect(healthChecks.every((res) => res.headers.ratelimit === undefined)).toBe(true);
  });

  it('maps a connection error to 503 on API routes and degrades /health', async () => {
    const { app, repo, broadcast } = await buildTestApp();
    repo.failWith(down);

    const get = await request(app).get('/api/events');
    const post = await request(app).post('/api/events').send(makeEvent({ id: 'evt_down' }));
    const analytics = await request(app).get('/api/events/analytics');
    const health = await request(app).get('/health');

    for (const res of [get, post, analytics]) {
      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' },
      });
    }
    expect(broadcast).not.toHaveBeenCalled();

    expect(health.status).toBe(503);
    expect(health.body.status).toBe('degraded');
    expect(health.body.db).toBe('down');
  });

  it('rejects a JSON body larger than 100kb with 413', async () => {
    const { app, broadcast } = await buildTestApp();
    const res = await request(app)
      .post('/api/events')
      .send(makeEvent({ id: 'evt_huge', payload: { blob: 'x'.repeat(110_000) } }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
    });
    expect(broadcast).not.toHaveBeenCalled();
  });
});

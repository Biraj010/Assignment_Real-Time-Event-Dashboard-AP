import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Event } from '../../src/types/event.js';
import { buildTestApp, makeEvent, type TestApp } from '../helpers/factory.js';

const HOUR_MS = 3_600_000;

function iso(msAgo: number, now = Date.now()): string {
  return new Date(now - msAgo).toISOString();
}

describe('events API', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  describe('POST /api/events', () => {
    it('creates an event, returns 201, and broadcasts event.created', async () => {
      const body = makeEvent({
        id: 'evt_post_1',
        user_id: 'u_post',
        event_type: 'page.view',
        payload: { path: '/home' },
        timestamp: '2026-09-28T13:45:00+05:45',
      });

      const res = await request(ctx.app).post('/api/events').send(body);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 'evt_post_1',
        user_id: 'u_post',
        event_type: 'page.view',
        payload: { path: '/home' },
        timestamp: '2026-09-28T08:00:00.000Z',
      });
      expect(ctx.broadcast).toHaveBeenCalledOnce();
      expect(ctx.broadcast).toHaveBeenCalledWith({ type: 'event.created', event: res.body });
      expect(ctx.repo.size).toBe(1);
    });

    it('defaults payload to {}', async () => {
      const { payload: _payload, ...withoutPayload } = makeEvent({ id: 'evt_empty_payload' });
      const res = await request(ctx.app).post('/api/events').send(withoutPayload);
      expect(res.status).toBe(201);
      expect(res.body.payload).toEqual({});
    });

    it('returns 400 VALIDATION_ERROR with details for a bad body', async () => {
      const res = await request(ctx.app)
        .post('/api/events')
        .send({ id: '', event_type: 'Bad Type', timestamp: 'yesterday', extra: true });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          { path: 'id', message: 'must not be empty' },
          { path: 'user_id', message: expect.any(String) },
          { path: 'event_type', message: expect.any(String) },
          { path: 'timestamp', message: expect.any(String) },
          { path: 'extra', message: 'is not an allowed field' },
        ]),
      );
      expect(ctx.broadcast).not.toHaveBeenCalled();
    });

    it('returns 400 INVALID_JSON for a malformed body', async () => {
      const res = await request(ctx.app)
        .post('/api/events')
        .set('content-type', 'application/json')
        .send('{"id":');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: 'INVALID_JSON', message: 'Malformed JSON body' },
      });
      expect(ctx.broadcast).not.toHaveBeenCalled();
    });

    it('returns 409 CONFLICT on a duplicate id and does not broadcast', async () => {
      const body = makeEvent({ id: 'dup' });
      await request(ctx.app).post('/api/events').send(body);
      ctx.broadcast.mockClear();

      const res = await request(ctx.app).post('/api/events').send(body);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: { code: 'CONFLICT', message: 'Event with id "dup" already exists' },
      });
      expect(ctx.broadcast).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/events', () => {
    const now = Date.parse('2026-09-28T12:00:00.000Z');

    const seed: Event[] = [
      makeEvent({ id: 'e1', event_type: 'login', payload: { method: 'google' }, timestamp: iso(10_000, now) }),
      makeEvent({ id: 'e2', event_type: 'click', payload: { label: 'Checkout NOW' }, timestamp: iso(20_000, now) }),
      makeEvent({ id: 'e3', event_type: 'click', payload: { label: '50% off' }, timestamp: iso(30_000, now) }),
      makeEvent({
        id: 'e4',
        event_type: 'purchase',
        payload: { item: 'checkout-pro' },
        timestamp: iso(2 * HOUR_MS, now),
      }),
      makeEvent({ id: 'e5', event_type: 'error', payload: { code: 'X' }, timestamp: iso(5 * HOUR_MS, now) }),
    ];

    beforeEach(async () => {
      ctx = await buildTestApp({ events: seed });
    });

    it('returns the default page and limit, newest first', async () => {
      const res = await request(ctx.app).get('/api/events');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    });

    it('applies page and limit', async () => {
      const res = await request(ctx.app).get('/api/events').query({ page: 2, limit: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e3', 'e4']);
      expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    });

    it('filters by a single event_type', async () => {
      const res = await request(ctx.app).get('/api/events').query({ event_type: 'click' });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((event: Event) => event.event_type === 'click')).toBe(true);
    });

    it('filters by a comma-separated event_type list', async () => {
      const res = await request(ctx.app).get('/api/events').query({ event_type: 'click,purchase' });

      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e2', 'e3', 'e4']);
    });

    it('filters by repeated event_type parameters', async () => {
      const res = await request(ctx.app)
        .get('/api/events')
        .query({ event_type: ['click', 'purchase'] });

      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e2', 'e3', 'e4']);
    });

    it('filters by an inclusive from/to range', async () => {
      const res = await request(ctx.app)
        .get('/api/events')
        .query({ from: iso(2 * HOUR_MS, now), to: iso(20_000, now) });

      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e2', 'e3', 'e4']);
    });

    it('filters q as a case-insensitive substring of the payload', async () => {
      const res = await request(ctx.app).get('/api/events').query({ q: 'CHECKOUT' });

      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e2', 'e4']);
    });

    it('treats % in q as a literal character', async () => {
      const res = await request(ctx.app).get('/api/events').query({ q: '50%' });
      expect(res.body.data.map((event: Event) => event.id)).toEqual(['e3']);
    });

    it('returns 400 on an invalid query', async () => {
      const res = await request(ctx.app).get('/api/events').query({ page: 0, limit: 500, from: 'nope' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((issue: { path: string }) => issue.path).sort()).toEqual([
        'from',
        'limit',
        'page',
      ]);
    });
  });

  describe('GET /api/events/analytics', () => {
    const now = Date.now();

    beforeEach(async () => {
      ctx = await buildTestApp({
        events: [
          makeEvent({ id: 'a1', event_type: 'click', timestamp: iso(5 * 60_000, now) }),
          makeEvent({ id: 'a2', event_type: 'click', timestamp: iso(10 * 60_000, now) }),
          makeEvent({ id: 'a3', event_type: 'click', timestamp: iso(15 * 60_000, now) }),
          makeEvent({ id: 'a4', event_type: 'error', timestamp: iso(20 * 60_000, now) }),
          makeEvent({ id: 'a5', event_type: 'error', timestamp: iso(25 * 60_000, now) }),
          makeEvent({ id: 'a6', event_type: 'login', timestamp: iso(3 * HOUR_MS, now) }),
          makeEvent({ id: 'a7', event_type: 'purchase', timestamp: iso(30 * HOUR_MS, now) }),
        ],
      });
    });

    it('defaults to 24 hours, sorts byType by count desc, then event_type asc', async () => {
      const res = await request(ctx.app).get('/api/events/analytics');

      expect(res.status).toBe(200);
      expect(res.body.windowHours).toBe(24);
      expect(res.body.total).toBe(6);
      expect(res.body.byType).toEqual([
        { event_type: 'click', count: 3 },
        { event_type: 'error', count: 2 },
        { event_type: 'login', count: 1 },
      ]);
      expect(res.body.hourly.length).toBeGreaterThan(0);
      const hours = res.body.hourly.map((row: { hour: string }) => row.hour);
      expect(hours).toEqual([...hours].sort());
    });

    it('honours the hours window', async () => {
      const res = await request(ctx.app).get('/api/events/analytics').query({ hours: 1 });

      expect(res.status).toBe(200);
      expect(res.body.windowHours).toBe(1);
      expect(res.body.total).toBe(5);
      expect(res.body.byType.map((row: { event_type: string }) => row.event_type)).toEqual([
        'click',
        'error',
      ]);
    });

    it('returns 400 when hours is out of range', async () => {
      const res = await request(ctx.app).get('/api/events/analytics').query({ hours: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('other routes', () => {
    it('returns 404 for an unknown route', async () => {
      const res = await request(ctx.app).get('/api/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist not found' },
      });
    });

    it('GET /health returns 200 when the repository is up', async () => {
      const res = await request(ctx.app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('up');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toEqual(expect.any(String));
    });
  });
});

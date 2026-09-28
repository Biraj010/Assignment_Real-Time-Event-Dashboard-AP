import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  DatabaseError,
  isPgConnectionError,
  isPgUniqueViolation,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../../src/errors/index.js';

describe('error subclasses', () => {
  it.each([
    [ValidationError, 400, 'VALIDATION_ERROR', 'Request validation failed'],
    [NotFoundError, 404, 'NOT_FOUND', 'Resource not found'],
    [ConflictError, 409, 'CONFLICT', 'Resource already exists'],
    [DatabaseError, 503, 'DATABASE_UNAVAILABLE', 'Database is unavailable'],
    [RateLimitError, 429, 'RATE_LIMITED', 'Too many requests, please try again later'],
  ] as const)('%s uses status %i and code %s', (Ctor, status, code, defaultMessage) => {
    const err = new Ctor();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err.name).toBe(Ctor.name);
    expect(err.message).toBe(defaultMessage);
  });

  it('stores details and a custom message on AppError', () => {
    const err = new AppError(418, 'TEAPOT', 'short and stout', { pot: true });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.details).toEqual({ pot: true });
  });

  it('keeps the original cause on ConflictError and DatabaseError', () => {
    const cause = Object.assign(new Error('duplicate'), { code: '23505' });
    const err = new ConflictError('Event with id "x" already exists', undefined, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('isPgConnectionError', () => {
  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '08006', '08P01'])(
    'returns true for %s',
    (code) => {
      expect(isPgConnectionError({ code })).toBe(true);
    },
  );

  it('returns true when an AggregateError contains a connection error', () => {
    const err = new AggregateError(
      [
        Object.assign(new Error('v6'), { code: 'ECONNREFUSED' }),
        Object.assign(new Error('v4'), { code: 'ECONNREFUSED' }),
      ],
      'connect ECONNREFUSED',
    );
    Object.assign(err, { code: 'ECONNREFUSED' });
    expect(isPgConnectionError(err)).toBe(true);
  });

  it.each([
    ['unique violation', { code: '23505' }],
    ['undefined table', { code: '42P01' }],
    ['null', null],
    ['a string', 'ECONNREFUSED'],
    ['an object with no code', {}],
    ['a numeric code', { code: 123 }],
  ])('returns false for %s', (_label, value) => {
    expect(isPgConnectionError(value)).toBe(false);
  });
});

describe('isPgUniqueViolation', () => {
  it('returns true only for 23505', () => {
    expect(isPgUniqueViolation({ code: '23505' })).toBe(true);
    expect(isPgUniqueViolation({ code: '23503' })).toBe(false);
    expect(isPgUniqueViolation({ code: 'ECONNREFUSED' })).toBe(false);
    expect(isPgUniqueViolation(null)).toBe(false);
  });
});

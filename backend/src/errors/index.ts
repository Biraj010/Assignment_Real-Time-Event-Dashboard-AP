export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'DATABASE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | (string & {});

export interface AppErrorOptions {
  cause?: unknown;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
    options?: AppErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details?: unknown, options?: AppErrorOptions) {
    super(409, 'CONFLICT', message, details, options);
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database is unavailable', details?: unknown, options?: AppErrorOptions) {
    super(503, 'DATABASE_UNAVAILABLE', message, details, options);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', details?: unknown) {
    super(429, 'RATE_LIMITED', message, details);
  }
}

const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01']);
const PG_CONNECTION_EXCEPTION_CLASS = '08';
const PG_UNIQUE_VIOLATION = '23505';

function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) {
    return undefined;
  }
  return typeof err.code === 'string' ? err.code : undefined;
}

function isConnectionCode(code: string | undefined): boolean {
  return (
    code !== undefined &&
    (CONNECTION_ERROR_CODES.has(code) || code.startsWith(PG_CONNECTION_EXCEPTION_CLASS))
  );
}

export function isPgConnectionError(err: unknown): boolean {
  if (isConnectionCode(errorCode(err))) {
    return true;
  }
  if (err instanceof AggregateError) {
    return err.errors.some((inner) => isConnectionCode(errorCode(inner)));
  }
  return false;
}

export function isPgUniqueViolation(err: unknown): boolean {
  return errorCode(err) === PG_UNIQUE_VIOLATION;
}

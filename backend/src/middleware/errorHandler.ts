import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { NodeEnv } from '../config/env.js';
import { AppError, type ErrorCode, isPgConnectionError } from '../errors/index.js';
import type { Logger } from '../lib/logger.js';

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ErrorHandlerOptions {
  logger: Logger;
  env: NodeEnv;
}

interface HttpErrorLike {
  type?: unknown;
  status?: unknown;
  expose?: unknown;
  message?: unknown;
}

function asHttpError(err: unknown): HttpErrorLike {
  return typeof err === 'object' && err !== null ? (err as HttpErrorLike) : {};
}

function body(code: ErrorCode, message: string, details?: unknown): ErrorResponseBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export function createErrorHandler({ logger, env }: ErrorHandlerOptions): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const context = { method: req.method, originalUrl: req.originalUrl };
    const httpError = asHttpError(err);

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error({ ...context, err }, err.message);
      }
      res.status(err.statusCode).json(body(err.code, err.message, err.details));
      return;
    }

    if (httpError.type === 'entity.parse.failed') {
      res.status(400).json(body('INVALID_JSON', 'Malformed JSON body'));
      return;
    }

    if (httpError.type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body is too large'));
      return;
    }

    if (isPgConnectionError(err)) {
      logger.error({ ...context, err }, 'Database is unavailable');
      res.status(503).json(body('DATABASE_UNAVAILABLE', 'Database is unavailable'));
      return;
    }

    if (
      typeof httpError.status === 'number' &&
      httpError.status >= 400 &&
      httpError.status < 500 &&
      httpError.expose === true &&
      typeof httpError.message === 'string'
    ) {
      res.status(httpError.status).json(body('BAD_REQUEST', httpError.message));
      return;
    }

    logger.error({ ...context, err }, 'Unhandled error');
    const message =
      env === 'production' || !(err instanceof Error) || err.message === ''
        ? 'Internal server error'
        : err.message;
    res.status(500).json(body('INTERNAL_ERROR', message));
  };
}

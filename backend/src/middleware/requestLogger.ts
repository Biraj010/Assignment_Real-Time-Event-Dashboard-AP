import type { RequestHandler } from 'express';
import type { Logger } from '../lib/logger.js';

const QUIET_PATHS = new Set(['/health']);

export function createRequestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    if (QUIET_PATHS.has(req.path)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        method: req.method,
        originalUrl: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: req.ip,
      };
      const message = `${req.method} ${req.originalUrl} ${res.statusCode}`;

      if (res.statusCode >= 400) {
        logger.warn(entry, message);
      } else {
        logger.info(entry, message);
      }
    });

    next();
  };
}

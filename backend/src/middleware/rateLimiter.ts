import type { Request, RequestHandler } from 'express';
import { rateLimit, type RateLimitInfo } from 'express-rate-limit';

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
}

function readRateLimitInfo(req: Request, propertyName: string): RateLimitInfo | undefined {
  const value: unknown = Reflect.get(req, propertyName);
  return typeof value === 'object' && value !== null ? (value as RateLimitInfo) : undefined;
}

export function retryAfterSeconds(resetTime: Date | undefined, windowMs: number, now = Date.now()): number {
  const remainingMs = resetTime ? resetTime.getTime() - now : windowMs;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export function createRateLimiter({ max, windowMs }: RateLimiterOptions): RequestHandler {
  return rateLimit({
    limit: max,
    windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      const info = readRateLimitInfo(req, options.requestPropertyName);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please try again later.',
          details: { retryAfterSeconds: retryAfterSeconds(info?.resetTime, options.windowMs) },
        },
      });
    },
  });
}

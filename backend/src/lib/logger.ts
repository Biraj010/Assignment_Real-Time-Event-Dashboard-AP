import { pino, type Logger, type LoggerOptions } from 'pino';
import { LOG_LEVELS, NODE_ENVS, type LogLevel, type NodeEnv } from '../config/env.js';

export type { Logger };

export function createLogger(level: LogLevel, env: NodeEnv): Logger {
  const options: LoggerOptions = {
    level,
    base: { env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTED]',
    },
  };

  if (env === 'development') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,env' },
      },
    });
  }

  return pino(options);
}

function pick<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

export const logger: Logger = createLogger(
  pick(LOG_LEVELS, process.env.LOG_LEVEL, 'info'),
  pick(NODE_ENVS, process.env.NODE_ENV, 'development'),
);

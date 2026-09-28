import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  env: NodeEnv;
  port: number;
  logLevel: LogLevel;
  databaseUrl: string;
  corsOrigins: string[] | '*';
  rateLimit: {
    max: number;
    windowMs: number;
  };
  trustProxy: number;
}

const corsOriginSchema = z
  .string()
  .trim()
  .transform((value, ctx): string[] | '*' => {
    if (value === '*') {
      return '*';
    }

    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    if (origins.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'must be "*" or a comma-separated list of origins' });
      return z.NEVER;
    }

    for (const origin of origins) {
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        ctx.addIssue({ code: 'custom', message: `invalid origin "${origin}"` });
      }
    }

    return origins;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: (issue) =>
      issue.input === undefined ? 'is required' : 'must be a postgres:// connection URL',
  }),
  CORS_ORIGIN: corsOriginSchema.default('*'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
});

function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') {
      result[key] = value;
    }
  }
  return result;
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${field}: ${issue.message}`;
    })
    .join('\n');
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(withoutEmptyValues(source));

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(result.error.issues)}`);
  }

  const env = result.data;

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    corsOrigins: env.CORS_ORIGIN,
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
    trustProxy: env.TRUST_PROXY,
  };
}

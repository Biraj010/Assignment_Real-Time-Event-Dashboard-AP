import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import type { EventFilters } from '../types/event.js';

export const EVENT_TYPE_PATTERN = /^[a-z0-9._-]+$/;
export const MAX_PAGE_LIMIT = 100;
export const MAX_ANALYTICS_HOURS = 720;

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const identifierSchema = z.string().trim().min(1, 'must not be empty').max(128);

const eventTypeSchema = z
  .string()
  .max(64)
  .regex(EVENT_TYPE_PATTERN, 'must contain only lowercase letters, digits, ".", "_" or "-"');

const isoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: (issue) =>
    issue.input === undefined
      ? 'is required'
      : 'must be an ISO 8601 datetime with a timezone offset',
});

const queryDateSchema = z
  .union([isoDateTimeSchema, z.iso.date()], {
    error: 'must be an ISO 8601 date or datetime with a timezone offset',
  })
  .transform((value) => new Date(value));

export const createEventSchema = z.strictObject({
  id: identifierSchema,
  user_id: identifierSchema,
  event_type: eventTypeSchema,
  payload: z
    .record(z.string(), z.unknown(), { error: 'must be a JSON object' })
    .default({}),
  timestamp: isoDateTimeSchema,
});

export type CreateEventInput = z.output<typeof createEventSchema>;

const eventTypeListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(z.array(eventTypeSchema).max(50))
  .transform((types) => [...new Set(types)]);

export const listEventsQuerySchema = z
  .object({
    page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
    limit: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
    ),
    event_type: optionalQuery(eventTypeListSchema),
    from: optionalQuery(queryDateSchema),
    to: optionalQuery(queryDateSchema),
    q: optionalQuery(z.string().trim().max(200)),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['from'],
    message: 'must be earlier than or equal to "to"',
  })
  .transform((query): EventFilters => {
    const filters: EventFilters = { page: query.page, limit: query.limit };
    if (query.event_type && query.event_type.length > 0) filters.eventTypes = query.event_type;
    if (query.from) filters.from = query.from;
    if (query.to) filters.to = query.to;
    if (query.q) filters.q = query.q;
    return filters;
  });

export const analyticsQuerySchema = z.object({
  hours: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(MAX_ANALYTICS_HOURS).default(24),
  ),
});

export type AnalyticsQuery = z.output<typeof analyticsQuerySchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

const formatPath = (path: readonly PropertyKey[]): string => path.map(String).join('.');

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.flatMap((issue): ValidationIssue[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: formatPath([...issue.path, key]),
        message: 'is not an allowed field',
      }));
    }
    return [{ path: formatPath(issue.path), message: issue.message }];
  });
}

export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError('Request validation failed', toValidationIssues(result.error));
  }
  return result.data;
}

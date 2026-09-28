import type { EventQuery } from '../types/event.ts'

export const TIME_RANGES = ['1h', '24h', '7d', 'all'] as const
export type TimeRange = (typeof TIME_RANGES)[number]

export interface Filters {
  types: string[]
  q: string
  range: TimeRange
  page: number
}

export const PAGE_SIZE = 20

export const DEFAULT_FILTERS: Filters = {
  types: [],
  q: '',
  range: '24h',
  page: 1,
}

const RANGE_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

function isTimeRange(value: string): value is TimeRange {
  return (TIME_RANGES as readonly string[]).includes(value)
}

function parseTypes(raw: string | null): string[] {
  if (!raw) return []
  return [...new Set(raw.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
}

export function parseFilters(params: URLSearchParams): Filters {
  const rangeRaw = params.get('range') ?? DEFAULT_FILTERS.range
  const pageRaw = Number(params.get('page'))

  return {
    types: parseTypes(params.get('types')),
    q: params.get('q')?.trim() ?? '',
    range: isTimeRange(rangeRaw) ? rangeRaw : DEFAULT_FILTERS.range,
    page: Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : DEFAULT_FILTERS.page,
  }
}

export function serializeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.types.length > 0) {
    params.set('types', filters.types.join(','))
  }
  if (filters.q.trim() !== '') {
    params.set('q', filters.q.trim())
  }
  if (filters.range !== DEFAULT_FILTERS.range) {
    params.set('range', filters.range)
  }
  if (filters.page !== DEFAULT_FILTERS.page) {
    params.set('page', String(filters.page))
  }

  return params
}

export function toEventQuery(filters: Filters, now = new Date()): EventQuery {
  const query: EventQuery = {
    page: filters.page,
    limit: PAGE_SIZE,
  }

  if (filters.types.length > 0) {
    query.event_type = filters.types
  }
  if (filters.q.trim() !== '') {
    query.q = filters.q.trim()
  }
  if (filters.range !== 'all') {
    query.from = new Date(now.getTime() - RANGE_MS[filters.range]).toISOString()
    query.to = now.toISOString()
  }

  return query
}

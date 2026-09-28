import type { Analytics, EventQuery, PaginatedEvents } from '../types/event.ts'
import { request } from './client.ts'

function appendParam(params: URLSearchParams, key: string, value: string | number | string[] | undefined): void {
  if (value === undefined) return

  if (Array.isArray(value)) {
    const joined = value.map((entry) => entry.trim()).filter((entry) => entry !== '')
    if (joined.length === 0) return
    params.set(key, joined.join(','))
    return
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return
    params.set(key, trimmed)
    return
  }

  params.set(key, String(value))
}

function buildEventSearchParams(query: EventQuery = {}): URLSearchParams {
  const params = new URLSearchParams()
  appendParam(params, 'page', query.page)
  appendParam(params, 'limit', query.limit)
  appendParam(params, 'event_type', query.event_type)
  appendParam(params, 'from', query.from)
  appendParam(params, 'to', query.to)
  appendParam(params, 'q', query.q)
  return params
}

export async function fetchEvents(query: EventQuery = {}): Promise<PaginatedEvents> {
  const params = buildEventSearchParams(query)
  const search = params.toString()
  return request<PaginatedEvents>(`/api/events${search ? `?${search}` : ''}`)
}

export async function fetchAnalytics(hours = 24): Promise<Analytics> {
  const params = new URLSearchParams()
  appendParam(params, 'hours', hours)
  return request<Analytics>(`/api/events/analytics?${params.toString()}`)
}

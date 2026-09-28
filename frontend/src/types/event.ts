export interface Event {
  id: string
  user_id: string
  event_type: string
  payload: Record<string, unknown>
  timestamp: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedEvents {
  data: Event[]
  pagination: Pagination
}

export interface EventTypeCount {
  event_type: string
  count: number
}

export interface HourlyCount {
  hour: string
  count: number
}

export interface Analytics {
  windowHours: number
  total: number
  byType: EventTypeCount[]
  hourly: HourlyCount[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface EventQuery {
  page?: number
  limit?: number
  event_type?: string | string[]
  from?: string
  to?: string
  q?: string
}

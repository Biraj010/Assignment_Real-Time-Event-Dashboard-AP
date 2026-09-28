export interface Event {
  id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface EventFilters {
  page: number;
  limit: number;
  eventTypes?: string[];
  from?: Date;
  to?: Date;
  q?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: Pagination;
}

export interface EventTypeCount {
  event_type: string;
  count: number;
}

export interface HourlyCount {
  hour: string;
  count: number;
}

export interface Analytics {
  windowHours: number;
  total: number;
  byType: EventTypeCount[];
  hourly: HourlyCount[];
}

export interface Broadcaster {
  broadcast(message: unknown): void;
}

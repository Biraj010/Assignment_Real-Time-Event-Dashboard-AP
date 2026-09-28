import type { ApiErrorBody } from '../types/event.ts'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false
  }
  const error = (value as ApiErrorBody).error
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  )
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  let response: Response

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch (err) {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err instanceof Error && err.message !== '' ? err.message : 'Network request failed',
    )
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    if (isApiErrorBody(body)) {
      throw new ApiError(response.status, body.error.code, body.error.message, body.error.details)
    }
    throw new ApiError(response.status, 'HTTP_ERROR', response.statusText || 'Request failed')
  }

  return (await response.json()) as T
}

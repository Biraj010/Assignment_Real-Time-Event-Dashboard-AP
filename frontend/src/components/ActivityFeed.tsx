import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { PAGE_SIZE } from '../lib/filters.ts'
import { formatNumber } from '../lib/format.ts'
import type { Event, Pagination } from '../types/event.ts'
import { EventCard } from './EventCard.tsx'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

const NEW_EVENT_MS = 5_000
const SKELETON_ROWS = 5

interface ActivityFeedProps {
  events: Event[]
  pagination: Pagination | undefined
  page: number
  isPending: boolean
  isError: boolean
  errorMessage: string
  onRetry: () => void
  onPageChange: (page: number) => void
  onEventRef: MutableRefObject<(event: Event) => void>
}

function EventCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-16 rounded-full bg-slate-800" />
        <div className="h-4 w-24 rounded bg-slate-800" />
        <div className="ml-auto h-4 w-16 rounded bg-slate-800" />
      </div>
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-800" />
    </div>
  )
}

export function ActivityFeed({
  events,
  pagination,
  page,
  isPending,
  isError,
  errorMessage,
  onRetry,
  onPageChange,
  onEventRef,
}: ActivityFeedProps) {
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())
  const timersRef = useRef<Map<string, number>>(new Map())

  const onEvent = useCallback((event: Event): void => {
    setNewIds((prev) => {
      if (prev.has(event.id)) return prev
      const next = new Set(prev)
      next.add(event.id)
      return next
    })

    const existing = timersRef.current.get(event.id)
    if (existing !== undefined) window.clearTimeout(existing)

    timersRef.current.set(
      event.id,
      window.setTimeout(() => {
        setNewIds((prev) => {
          if (!prev.has(event.id)) return prev
          const next = new Set(prev)
          next.delete(event.id)
          return next
        })
        timersRef.current.delete(event.id)
      }, NEW_EVENT_MS),
    )
  }, [])

  useEffect(() => {
    onEventRef.current = onEvent
    return () => {
      onEventRef.current = () => {}
    }
  }, [onEvent, onEventRef])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const showSkeleton = isPending && events.length === 0
  const showError = isError && events.length === 0
  const showEmpty = !showSkeleton && !showError && events.length === 0

  const total = pagination?.total ?? 0
  const limit = pagination?.limit ?? PAGE_SIZE
  const totalPages = pagination?.totalPages ?? 0
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <section aria-label="Activity">
      {showSkeleton ? (
        <div role="status" aria-label="Loading events" aria-busy="true" className="space-y-3">
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      ) : showError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center"
        >
          <p className="text-sm text-rose-200">{errorMessage || 'Failed to load events'}</p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700 ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      ) : showEmpty ? (
        <div
          role="status"
          className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-10 text-center"
        >
          <p className="text-sm text-slate-300">No events yet</p>
          <p className="mt-1 text-sm text-slate-500">run npm run simulate</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} isNew={newIds.has(event.id)} />
            </li>
          ))}
        </ul>
      )}

      {!showSkeleton && !showError ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-inset ring-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
            >
              Prev
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= totalPages || totalPages === 0}
              onClick={() => onPageChange(page + 1)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-inset ring-slate-700 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS_RING}`}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

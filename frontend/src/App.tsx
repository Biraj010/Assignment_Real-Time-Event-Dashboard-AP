import { useEventStream } from './hooks/useEventStream.ts'
import { useAnalytics } from './hooks/useAnalytics.ts'
import { useEvents } from './hooks/useEvents.ts'
import { useFilters } from './hooks/useFilters.ts'
import { formatNumber, relativeTime } from './lib/format.ts'

const STATUS_STYLES = {
  connecting: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  live: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  offline: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
} as const

function App() {
  const { filters } = useFilters()
  const { status } = useEventStream()
  const live = status === 'live'
  const eventsQuery = useEvents(filters, { live })
  const analyticsQuery = useAnalytics({ live })

  const events = eventsQuery.data?.data ?? []
  const total = analyticsQuery.data?.total ?? eventsQuery.data?.pagination.total

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Event Dashboard</h1>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
        >
          <span className={`size-1.5 rounded-full ${live ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-rose-400'}`} />
          {status}
        </span>
      </header>

      <p className="mt-4 text-sm text-slate-400">
        {total === undefined ? 'Loading events…' : `${formatNumber(total)} events in the last 24 hours`}
      </p>

      <ul className="mt-8 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        {events.length === 0 ? (
          <li className="px-4 py-6 text-sm text-slate-500">No events yet</li>
        ) : (
          events.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="font-medium text-slate-200">{event.event_type}</span>
              <span className="text-slate-500">{event.user_id}</span>
              <span className="text-slate-500">{relativeTime(event.timestamp)}</span>
            </li>
          ))
        )}
      </ul>
    </main>
  )
}

export default App

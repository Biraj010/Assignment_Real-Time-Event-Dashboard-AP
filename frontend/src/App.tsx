import { Header } from './components/Header.tsx'
import { useAnalytics } from './hooks/useAnalytics.ts'
import { useEvents } from './hooks/useEvents.ts'
import { useEventStream } from './hooks/useEventStream.ts'
import { useFilters } from './hooks/useFilters.ts'
import { formatNumber, relativeTime } from './lib/format.ts'

function App() {
  const { filters } = useFilters()
  const { status } = useEventStream()
  const live = status === 'live'
  const eventsQuery = useEvents(filters, { live })
  const analyticsQuery = useAnalytics({ live })

  const events = eventsQuery.data?.data ?? []
  const total = analyticsQuery.data?.total ?? eventsQuery.data?.pagination.total

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Header status={status} />

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-8">
            <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
              {events.length === 0 ? (
                <li className="px-4 py-6 text-sm text-slate-500">No events yet</li>
              ) : (
                events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span className="font-medium text-slate-200">{event.event_type}</span>
                    <span className="truncate text-slate-500">{event.user_id}</span>
                    <span className="shrink-0 text-slate-500">{relativeTime(event.timestamp)}</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <aside className="flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-medium text-slate-200">Filters</h2>
              <p className="mt-2 text-sm text-slate-500">Search, types, and time range will go here.</p>
            </section>
            <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h2 className="text-sm font-medium text-slate-200">Analytics</h2>
              <p className="mt-2 text-2xl font-semibold text-slate-50">
                {total === undefined ? '—' : formatNumber(total)}
              </p>
              <p className="mt-1 text-sm text-slate-500">Events in the last 24 hours</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default App

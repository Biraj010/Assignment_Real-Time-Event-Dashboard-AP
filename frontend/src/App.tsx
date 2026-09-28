import { useRef } from 'react'
import { ActivityFeed } from './components/ActivityFeed.tsx'
import { FiltersPanel } from './components/FiltersPanel.tsx'
import { Header } from './components/Header.tsx'
import { useAnalytics } from './hooks/useAnalytics.ts'
import { useEvents } from './hooks/useEvents.ts'
import { useEventStream } from './hooks/useEventStream.ts'
import { useFilters } from './hooks/useFilters.ts'
import { formatNumber } from './lib/format.ts'
import type { Event } from './types/event.ts'

function App() {
  const { filters, setFilters } = useFilters()
  const onEventRef = useRef<(event: Event) => void>(() => {})
  const { status } = useEventStream({
    onEvent: (event) => {
      onEventRef.current(event)
    },
  })
  const live = status === 'live'
  const eventsQuery = useEvents(filters, { live })
  const analyticsQuery = useAnalytics({ live })

  const events = eventsQuery.data?.data ?? []
  const total = analyticsQuery.data?.total ?? eventsQuery.data?.pagination.total
  const availableTypes = [
    ...new Set([
      ...(analyticsQuery.data?.byType.map((row) => row.event_type) ?? []),
      ...filters.types,
    ]),
  ]

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Header status={status} />

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ActivityFeed
              events={events}
              pagination={eventsQuery.data?.pagination}
              page={filters.page}
              isPending={eventsQuery.isPending}
              isError={eventsQuery.isError}
              errorMessage={eventsQuery.error instanceof Error ? eventsQuery.error.message : ''}
              onRetry={() => {
                void eventsQuery.refetch()
              }}
              onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
              onEventRef={onEventRef}
            />
          </div>

          <aside className="flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
            <FiltersPanel filters={filters} onChange={setFilters} availableTypes={availableTypes} />
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

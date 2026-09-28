import { useRef } from 'react'
import { ActivityFeed } from './components/ActivityFeed.tsx'
import { AnalyticsCard } from './components/AnalyticsCard.tsx'
import { FiltersPanel } from './components/FiltersPanel.tsx'
import { Header } from './components/Header.tsx'
import { useAnalytics } from './hooks/useAnalytics.ts'
import { useEvents } from './hooks/useEvents.ts'
import { useEventStream } from './hooks/useEventStream.ts'
import { useFilters } from './hooks/useFilters.ts'
import { eventMatchesFilters, rangeToHours } from './lib/filters.ts'
import type { Event } from './types/event.ts'

function App() {
  const { filters, setFilters } = useFilters()
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const onEventRef = useRef<(event: Event) => void>(() => {})
  const { status } = useEventStream({
    onEvent: (event) => {
      if (eventMatchesFilters(event, filtersRef.current)) {
        onEventRef.current(event)
      }
    },
  })
  const live = status === 'live'
  const hours = rangeToHours(filters.range)
  const eventsQuery = useEvents(filters, { live })
  const catalogQuery = useAnalytics({ live, hours })
  const filteredAnalyticsQuery = useAnalytics({
    live,
    hours,
    eventTypes: filters.types,
    enabled: filters.types.length > 0,
  })
  const analyticsQuery = filters.types.length > 0 ? filteredAnalyticsQuery : catalogQuery

  const events = (eventsQuery.data?.data ?? []).filter((event) =>
    eventMatchesFilters(event, filters),
  )
  const availableTypes = [
    ...new Set([
      ...(catalogQuery.data?.byType.map((row) => row.event_type) ?? []),
      ...events.map((event) => event.event_type),
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
            <AnalyticsCard
              data={analyticsQuery.data}
              isLoading={analyticsQuery.isPending}
              activeTypes={filters.types}
              rangeLabel={filters.range}
              onToggleType={(type) => {
                setFilters((prev) => {
                  const selected = prev.types.includes(type)
                  return {
                    ...prev,
                    types: selected
                      ? prev.types.filter((entry) => entry !== type)
                      : [...prev.types, type],
                    page: 1,
                  }
                })
              }}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

export default App

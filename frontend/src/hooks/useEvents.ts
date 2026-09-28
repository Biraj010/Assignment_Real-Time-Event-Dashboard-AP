import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchEvents } from '../api/events.ts'
import { toEventQuery, type Filters } from '../lib/filters.ts'

export function useEvents(filters: Filters, { live }: { live: boolean }) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => fetchEvents(toEventQuery(filters)),
    placeholderData: keepPreviousData,
    refetchInterval: live ? false : 5000,
  })
}

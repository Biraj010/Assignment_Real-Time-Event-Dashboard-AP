import { useQuery } from '@tanstack/react-query'
import { fetchEvents } from '../api/events.ts'
import { toEventQuery, type Filters } from '../lib/filters.ts'

export function useEvents(filters: Filters, { live }: { live: boolean }) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: ({ queryKey }) => fetchEvents(toEventQuery(queryKey[1] as Filters)),
    refetchInterval: live ? false : 5000,
  })
}

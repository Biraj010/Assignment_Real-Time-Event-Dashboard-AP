import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAnalytics } from '../api/events.ts'

export function useAnalytics({
  live,
  hours,
  eventTypes = [],
  enabled = true,
}: {
  live: boolean
  hours: number
  eventTypes?: string[]
  enabled?: boolean
}) {
  const types = [...eventTypes].sort()
  return useQuery({
    queryKey: ['analytics', hours, types],
    queryFn: () =>
      fetchAnalytics({
        hours,
        event_type: types.length > 0 ? types : undefined,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? false : 5000,
    enabled,
  })
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAnalytics } from '../api/events.ts'

export function useAnalytics({ live }: { live: boolean }) {
  return useQuery({
    queryKey: ['analytics', 24],
    queryFn: () => fetchAnalytics(24),
    placeholderData: keepPreviousData,
    refetchInterval: live ? false : 5000,
  })
}

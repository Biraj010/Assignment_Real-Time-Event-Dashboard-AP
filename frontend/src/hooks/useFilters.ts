import { useCallback, useEffect, useState } from 'react'
import { parseFilters, serializeFilters, type Filters } from '../lib/filters.ts'

function readFilters(): Filters {
  return parseFilters(new URLSearchParams(window.location.search))
}

function writeFilters(filters: Filters): void {
  const search = serializeFilters(filters).toString()
  const next = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    window.history.replaceState(window.history.state, '', next)
  }
}

export function useFilters(): {
  filters: Filters
  setFilters: (next: Filters | ((prev: Filters) => Filters)) => void
} {
  const [filters, setFiltersState] = useState(readFilters)

  useEffect(() => {
    const onPopState = (): void => {
      setFiltersState(readFilters())
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setFilters = useCallback((next: Filters | ((prev: Filters) => Filters)) => {
    setFiltersState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      writeFilters(resolved)
      return resolved
    })
  }, [])

  return { filters, setFilters }
}

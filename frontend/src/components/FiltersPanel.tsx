import { useEffect, useId, useState } from 'react'
import { useDebounce } from '../hooks/useDebounce.ts'
import {
  DEFAULT_FILTERS,
  TIME_RANGES,
  type Filters,
  type TimeRange,
} from '../lib/filters.ts'
import { eventTypeColor } from '../lib/format.ts'

const RANGE_LABELS: Record<TimeRange, string> = {
  '1h': '1h',
  '24h': '24h',
  '7d': '7d',
  all: 'All',
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

interface FiltersPanelProps {
  filters: Filters
  onChange: (next: Filters | ((prev: Filters) => Filters)) => void
  availableTypes: string[]
}

function isDefaultFilters(filters: Filters): boolean {
  return (
    filters.page === DEFAULT_FILTERS.page &&
    filters.q === DEFAULT_FILTERS.q &&
    filters.range === DEFAULT_FILTERS.range &&
    filters.types.length === 0
  )
}

export function FiltersPanel({ filters, onChange, availableTypes }: FiltersPanelProps) {
  const searchId = useId()
  const [draftQuery, setDraftQuery] = useState(filters.q)
  const debouncedQuery = useDebounce(draftQuery, 300)

  useEffect(() => {
    setDraftQuery(filters.q)
  }, [filters.q])

  useEffect(() => {
    onChange((prev) => (prev.q === debouncedQuery ? prev : { ...prev, q: debouncedQuery, page: 1 }))
  }, [debouncedQuery, onChange])

  const types = [...new Set([...availableTypes, ...filters.types])].sort((a, b) => a.localeCompare(b))

  const patch = (partial: Partial<Filters>): void => {
    onChange((prev) => ({ ...prev, ...partial, page: 1 }))
  }

  const toggleType = (type: string): void => {
    onChange((prev) => {
      const selected = prev.types.includes(type)
      return {
        ...prev,
        types: selected ? prev.types.filter((entry) => entry !== type) : [...prev.types, type],
        page: 1,
      }
    })
  }

  const clearSearch = (): void => {
    setDraftQuery('')
    patch({ q: '' })
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-200">Filters</h2>
        {!isDefaultFilters(filters) ? (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS, types: [] })}
            className={`rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 ${FOCUS_RING}`}
          >
            Reset
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        <label htmlFor={searchId} className="text-xs font-medium text-slate-400">
          Search payload
        </label>
        <div className="relative mt-1">
          <input
            id={searchId}
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="e.g. checkout-pro"
            autoComplete="off"
            className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-16 text-sm text-slate-100 placeholder:text-slate-600 [&::-webkit-search-cancel-button]:hidden ${FOCUS_RING}`}
          />
          {draftQuery !== '' ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={clearSearch}
              className={`absolute inset-y-1 right-1 rounded-md px-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100 ${FOCUS_RING}`}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-slate-400">Event type</legend>
        {types.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No types yet</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {types.map((type) => {
              const pressed = filters.types.includes(type)
              const color = eventTypeColor(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => toggleType(type)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${color.badge} ${pressed ? 'ring-2' : 'opacity-70 hover:opacity-100'} ${FOCUS_RING}`}
                >
                  {type}
                </button>
              )
            })}
          </div>
        )}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-slate-400">Time range</legend>
        <div
          role="radiogroup"
          aria-label="Time range"
          className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-950 p-1 ring-1 ring-slate-800"
        >
          {TIME_RANGES.map((range) => {
            const checked = filters.range === range
            return (
              <button
                key={range}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => patch({ range })}
                onKeyDown={(event) => {
                  const index = TIME_RANGES.indexOf(range)
                  const offset =
                    event.key === 'ArrowRight' || event.key === 'ArrowDown'
                      ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                        ? -1
                        : 0
                  if (offset === 0) return
                  event.preventDefault()
                  const nextIndex = (index + offset + TIME_RANGES.length) % TIME_RANGES.length
                  patch({ range: TIME_RANGES[nextIndex]! })
                  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                  radios?.[nextIndex]?.focus({ preventScroll: true, focusVisible: true })
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${checked ? 'bg-slate-800 text-slate-50 shadow-sm' : 'text-slate-400 hover:text-slate-200'} ${FOCUS_RING}`}
              >
                {RANGE_LABELS[range]}
              </button>
            )
          })}
        </div>
      </fieldset>
    </section>
  )
}

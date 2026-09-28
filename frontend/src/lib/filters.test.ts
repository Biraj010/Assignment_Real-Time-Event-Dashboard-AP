import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  eventMatchesFilters,
  parseFilters,
  serializeFilters,
  toEventQuery,
  type Filters,
} from './filters.ts'

describe('parseFilters / serializeFilters', () => {
  it('round-trips non-default filters', () => {
    const filters: Filters = {
      types: ['login', 'click'],
      q: 'checkout-pro',
      range: '7d',
      page: 3,
    }

    expect(parseFilters(serializeFilters(filters))).toEqual(filters)
  })

  it('omits defaults from the query string and restores them on parse', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('')
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS)
  })
})

describe('toEventQuery range mapping', () => {
  const now = new Date('2026-09-28T18:00:00.000Z')
  const base: Filters = { ...DEFAULT_FILTERS }

  it('maps 1h, 24h, and 7d onto from/to relative to a fixed now', () => {
    expect(toEventQuery({ ...base, range: '1h' }, now)).toEqual({
      page: 1,
      limit: PAGE_SIZE,
      from: '2026-09-28T17:00:00.000Z',
      to: '2026-09-28T18:00:00.000Z',
    })

    expect(toEventQuery({ ...base, range: '24h' }, now)).toEqual({
      page: 1,
      limit: PAGE_SIZE,
      from: '2026-09-27T18:00:00.000Z',
      to: '2026-09-28T18:00:00.000Z',
    })

    expect(toEventQuery({ ...base, range: '7d' }, now)).toEqual({
      page: 1,
      limit: PAGE_SIZE,
      from: '2026-09-21T18:00:00.000Z',
      to: '2026-09-28T18:00:00.000Z',
    })
  })

  it('omits from/to when the range is all', () => {
    expect(toEventQuery({ ...base, range: 'all' }, now)).toEqual({
      page: 1,
      limit: PAGE_SIZE,
    })
  })

  it('includes event_type when types are selected', () => {
    expect(toEventQuery({ ...base, types: ['login', 'click'] }, now).event_type).toEqual([
      'login',
      'click',
    ])
  })
})

describe('eventMatchesFilters', () => {
  const now = new Date('2026-09-28T18:00:00.000Z')
  const click = {
    id: '1',
    user_id: 'u1',
    event_type: 'click',
    payload: { button: 'buy-now' },
    timestamp: '2026-09-28T17:30:00.000Z',
  }
  const login = {
    ...click,
    id: '2',
    event_type: 'login',
    payload: { browser: 'chrome' },
  }
  const old = {
    ...click,
    id: '3',
    timestamp: '2026-09-20T18:00:00.000Z',
  }

  it('drops other event types and out-of-range rows', () => {
    const filters: Filters = { types: ['click'], q: '', range: '24h', page: 1 }
    expect(eventMatchesFilters(click, filters, now)).toBe(true)
    expect(eventMatchesFilters(login, filters, now)).toBe(false)
    expect(eventMatchesFilters(old, filters, now)).toBe(false)
  })

  it('matches payload search case-insensitively', () => {
    const filters: Filters = { types: [], q: 'BUY', range: 'all', page: 1 }
    expect(eventMatchesFilters(click, filters, now)).toBe(true)
    expect(eventMatchesFilters(login, filters, now)).toBe(false)
  })
})

export interface EventTypeColor {
  badge: string
  bar: string
  hex: string
}

const TYPE_PALETTE: readonly EventTypeColor[] = [
  { badge: 'bg-sky-500/15 text-sky-300 ring-sky-500/30', bar: 'bg-sky-400', hex: '#38bdf8' },
  { badge: 'bg-violet-500/15 text-violet-300 ring-violet-500/30', bar: 'bg-violet-400', hex: '#a78bfa' },
  { badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30', bar: 'bg-emerald-400', hex: '#34d399' },
  { badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30', bar: 'bg-amber-400', hex: '#fbbf24' },
  { badge: 'bg-rose-500/15 text-rose-300 ring-rose-500/30', bar: 'bg-rose-400', hex: '#fb7185' },
  { badge: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30', bar: 'bg-cyan-400', hex: '#22d3ee' },
  { badge: 'bg-orange-500/15 text-orange-300 ring-orange-500/30', bar: 'bg-orange-400', hex: '#fb923c' },
  { badge: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30', bar: 'bg-fuchsia-400', hex: '#e879f9' },
]

const TYPE_ALIASES: Record<string, EventTypeColor> = {
  login: TYPE_PALETTE[2],
  logout: TYPE_PALETTE[5],
  page_view: TYPE_PALETTE[0],
  click: TYPE_PALETTE[1],
  purchase: TYPE_PALETTE[3],
  error: TYPE_PALETTE[4],
  signup: TYPE_PALETTE[7],
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function eventTypeColor(type: string): EventTypeColor {
  return TYPE_ALIASES[type] ?? TYPE_PALETTE[hashString(type) % TYPE_PALETTE.length]!
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso

  const deltaSeconds = Math.round((now.getTime() - then) / 1000)
  const abs = Math.abs(deltaSeconds)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (abs < 10) return 'just now'
  if (abs < 60) return rtf.format(-Math.sign(deltaSeconds) * abs, 'second')
  if (abs < 3600) return rtf.format(-Math.trunc(deltaSeconds / 60), 'minute')
  if (abs < 86_400) return rtf.format(-Math.trunc(deltaSeconds / 3600), 'hour')
  if (abs < 7 * 86_400) return rtf.format(-Math.trunc(deltaSeconds / 86_400), 'day')

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(then))
}

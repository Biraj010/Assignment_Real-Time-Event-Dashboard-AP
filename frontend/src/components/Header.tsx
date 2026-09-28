import type { StreamStatus } from '../hooks/useEventStream.ts'

interface HeaderProps {
  status: StreamStatus
}

const STATUS_PILL: Record<
  StreamStatus,
  { label: string; className: string; dotClassName: string }
> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    dotClassName: 'bg-emerald-400 animate-pulse',
  },
  offline: {
    label: 'Polling every 5s',
    className: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    dotClassName: 'bg-amber-400',
  },
  connecting: {
    label: 'Connecting',
    className: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
    dotClassName: 'bg-slate-400',
  },
}

export function Header({ status }: HeaderProps) {
  const pill = STATUS_PILL[status]

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">Event Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">Real-time event stream and analytics</p>
      </div>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${pill.className}`}
      >
        <span className={`size-1.5 rounded-full ${pill.dotClassName}`} />
        {pill.label}
      </span>
    </header>
  )
}

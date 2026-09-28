import { useId, useState } from 'react'
import { eventTypeColor, relativeTime } from '../lib/format.ts'
import type { Event } from '../types/event.ts'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'

interface EventCardProps {
  event: Event
  isNew?: boolean
}

function payloadPreview(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload) ?? ''
  } catch {
    return '[unserializable payload]'
  }
}

export function EventCard({ event, isNew = false }: EventCardProps) {
  const detailsId = useId()
  const [expanded, setExpanded] = useState(false)
  const color = eventTypeColor(event.event_type)
  const preview = payloadPreview(event.payload)

  return (
    <article
      className={`rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-shadow duration-300 ${
        isNew ? 'ring-2 ring-sky-400/80 ring-offset-2 ring-offset-slate-950' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${color.badge}`}
        >
          {event.event_type}
        </span>
        <span className="min-w-0 truncate text-sm text-slate-300">{event.user_id}</span>
        <time
          className="ml-auto shrink-0 text-xs text-slate-500"
          dateTime={event.timestamp}
          title={event.timestamp}
        >
          {relativeTime(event.timestamp)}
        </time>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">{preview}</p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((open) => !open)}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 ${FOCUS_RING}`}
        >
          Details
        </button>
      </div>

      {expanded ? (
        <pre
          id={detailsId}
          className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300"
        >
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      ) : null}
    </article>
  )
}

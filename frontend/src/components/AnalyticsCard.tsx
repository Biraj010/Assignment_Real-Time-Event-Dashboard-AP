import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarRectangleItem,
} from 'recharts'
import { eventTypeColor, formatNumber } from '../lib/format.ts'
import type { Analytics } from '../types/event.ts'

const TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
} as const

const TICK_STYLE = { fill: '#94a3b8', fontSize: 11 }

interface AnalyticsCardProps {
  data: Analytics | undefined
  isLoading: boolean
  activeTypes: string[]
  rangeLabel?: string
  onToggleType: (type: string) => void
}

function formatHourTick(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { hour: 'numeric' }).format(date)
}

function formatHourLabel(value: unknown): string {
  if (typeof value !== 'string') return String(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
  }).format(date)
}

function formatCountTooltip(
  value: number | string | ReadonlyArray<number | string> | undefined,
): [string, string] {
  const numeric = Array.isArray(value) ? Number(value[0]) : Number(value)
  return [Number.isFinite(numeric) ? formatNumber(numeric) : '—', 'Events']
}

function typeFromBar(item: BarRectangleItem): string | undefined {
  const payload = item.payload
  if (typeof payload !== 'object' || payload === null || !('event_type' in payload)) {
    return undefined
  }
  const type = payload.event_type
  return typeof type === 'string' && type !== '' ? type : undefined
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-slate-50">{value}</p>
    </div>
  )
}

function AnalyticsSkeleton() {
  return (
    <div role="status" aria-label="Loading analytics" aria-busy="true" className="animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-12 rounded-lg bg-slate-800" />
        <div className="h-12 rounded-lg bg-slate-800" />
        <div className="h-12 rounded-lg bg-slate-800" />
      </div>
      <div className="mt-4 h-44 rounded-lg bg-slate-800" />
      <div className="mt-4 h-28 rounded-lg bg-slate-800" />
    </div>
  )
}

export function AnalyticsCard({
  data,
  isLoading,
  activeTypes,
  rangeLabel = '24h',
  onToggleType,
}: AnalyticsCardProps) {
  const showSkeleton = isLoading && data === undefined
  const showEmpty = !showSkeleton && (data === undefined || data.total === 0)
  const topTypes = data?.byType.slice(0, 6) ?? []
  const topType = data?.byType[0]?.event_type
  const hourly = data?.hourly ?? []

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-sm font-medium text-slate-200">Analytics</h2>

      {showSkeleton ? (
        <div className="mt-4">
          <AnalyticsSkeleton />
        </div>
      ) : showEmpty ? (
        <p className="mt-4 text-sm text-slate-500">No events in the selected range</p>
      ) : data ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label={`Events (${rangeLabel === 'all' ? 'all' : rangeLabel})`} value={formatNumber(data.total)} />
            <Stat label="Types" value={formatNumber(data.byType.length)} />
            <Stat label="Top type" value={topType ?? '—'} />
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              Top types
            </p>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={topTypes}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="event_type"
                    width={78}
                    tick={TICK_STYLE}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={formatCountTooltip}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    isAnimationActive={false}
                    onClick={(item) => {
                      const type = typeFromBar(item)
                      if (type) onToggleType(type)
                    }}
                  >
                    {topTypes.map((row) => {
                      const active = activeTypes.length === 0 || activeTypes.includes(row.event_type)
                      return (
                        <Cell
                          key={row.event_type}
                          fill={eventTypeColor(row.event_type).hex}
                          fillOpacity={active ? 1 : 0.35}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              Hourly
            </p>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={TICK_STYLE}
                    tickFormatter={formatHourTick}
                    minTickGap={28}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={formatHourLabel}
                    formatter={formatCountTooltip}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#38bdf8"
                    fill="#38bdf8"
                    fillOpacity={0.18}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

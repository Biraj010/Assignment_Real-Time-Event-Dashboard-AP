import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import type { Analytics } from '../types/event.ts'
import { AnalyticsCard } from './AnalyticsCard.tsx'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div data-testid="chart" style={{ width: 800, height: 400 }}>
        {isValidElement(children)
          ? cloneElement(children as ReactElement<{ width?: number; height?: number }>, {
              width: 800,
              height: 400,
            })
          : children}
      </div>
    ),
  }
})

const sample: Analytics = {
  windowHours: 24,
  total: 42,
  byType: [
    { event_type: 'login', count: 20 },
    { event_type: 'click', count: 15 },
    { event_type: 'error', count: 7 },
  ],
  hourly: [{ hour: '2026-09-28T10:00:00.000Z', count: 5 }],
}

describe('AnalyticsCard', () => {
  it('renders totals and the top type', () => {
    render(
      <AnalyticsCard data={sample} isLoading={false} activeTypes={[]} onToggleType={vi.fn()} />,
    )

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Top type').closest('div')).toHaveTextContent('login')
    expect(screen.getByText('Events (24h)')).toBeInTheDocument()
  })

  it('renders the empty state when there are no events', () => {
    render(
      <AnalyticsCard
        data={{ windowHours: 24, total: 0, byType: [], hourly: [] }}
        isLoading={false}
        activeTypes={[]}
        onToggleType={vi.fn()}
      />,
    )

    expect(screen.getByText('No events in the selected range')).toBeInTheDocument()
  })

  it('calls onToggleType when a bar is clicked', async () => {
    const user = userEvent.setup()
    const onToggleType = vi.fn()
    const { container } = render(
      <AnalyticsCard data={sample} isLoading={false} activeTypes={[]} onToggleType={onToggleType} />,
    )

    const bar = container.querySelector('.recharts-bar-rectangle, .recharts-rectangle')
    expect(bar).not.toBeNull()
    await user.click(bar as Element)

    expect(onToggleType).toHaveBeenCalledWith('login')
  })
})

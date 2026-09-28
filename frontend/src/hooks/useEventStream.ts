import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Event } from '../types/event.ts'

export type StreamStatus = 'connecting' | 'live' | 'offline'

const MIN_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000

function resolveWsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) return configured

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function isCreatedMessage(value: unknown): value is { type: 'event.created'; event: Event } {
  if (typeof value !== 'object' || value === null) return false
  const message = value as { type?: unknown; event?: unknown }
  if (message.type !== 'event.created' || typeof message.event !== 'object' || message.event === null) {
    return false
  }
  const event = message.event as Event
  return typeof event.id === 'string' && typeof event.event_type === 'string'
}

export function useEventStream({ onEvent }: { onEvent?: (event: Event) => void } = {}): {
  status: StreamStatus
} {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | undefined
    let reconnectTimer: number | undefined
    let backoffMs = MIN_BACKOFF_MS

    const clearReconnect = (): void => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
    }

    const connect = (): void => {
      if (cancelled) return
      clearReconnect()
      setStatus('connecting')

      const ws = new WebSocket(resolveWsUrl())
      socket = ws

      ws.addEventListener('open', () => {
        if (cancelled) {
          ws.close()
          return
        }
        backoffMs = MIN_BACKOFF_MS
        setStatus('live')
      })

      ws.addEventListener('message', (message) => {
        let payload: unknown
        try {
          payload = JSON.parse(String(message.data)) as unknown
        } catch {
          return
        }
        if (!isCreatedMessage(payload)) return

        void queryClient.invalidateQueries({ queryKey: ['events'] })
        void queryClient.invalidateQueries({ queryKey: ['analytics'] })
        onEventRef.current?.(payload.event)
      })

      ws.addEventListener('close', () => {
        if (cancelled) return
        setStatus('offline')
        reconnectTimer = window.setTimeout(() => {
          connect()
        }, backoffMs)
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      })
    }

    connect()

    return () => {
      cancelled = true
      clearReconnect()
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close()
      }
    }
  }, [queryClient])

  return { status }
}

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

interface StreamNotification {
  id: string
  data: { title?: string; body?: string; action_url?: string }
  read_at: string | null
  created_at: string
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof EventSource !== 'undefined'
}

function hrtimeToUnix(): number {
  return Math.floor(Date.now() / 1000)
}

export type RealtimeState = 'connecting' | 'open' | 'closed' | 'error'

/**
 * Subscreve o utilizador ao feed de notificações em tempo real via SSE.
 * Se a ligação falhar, mantém o comportamento por polling (as queries têm refetchInterval).
 */
export function useRealtimeNotifications(): RealtimeState {
  const queryClient = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const stateRef = useRef<RealtimeState>('connecting')
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    if (!isBrowser()) return

    const token = localStorage.getItem('hrms_token')
    if (!token) return

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }

    let source: EventSource | null = null
    let failed = false

    const open = () => {
      const url = new URL(API_BASE.replace(/\/$/, '') + '/notifications/stream')
      url.searchParams.set('token', token)
      url.searchParams.set('last_event_id', String(hrtimeToUnix() - 120))

      source = new EventSource(url.toString())

      source.onopen = () => {
        failed = false
        stateRef.current = 'open'
        invalidate()
      }

      source.addEventListener('notification', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as StreamNotification
          queryClient.setQueryData<{ unread: number }>(['notifications', 'unread'], (prev) => ({
            unread: (prev?.unread ?? 0) + 1,
          }))
          void payload
        } catch {
          /* payload inválido — ignora */
        }
        invalidate()
      })

      source.addEventListener('count', (ev) => {
        const count = Number((ev as MessageEvent).data)
        if (!Number.isNaN(count)) {
          queryClient.setQueryData<{ unread: number }>(['notifications', 'unread'], { unread: count })
        }
      })

      source.onerror = () => {
        stateRef.current = 'error'
        source?.close()
        source = null
        // Reconecta com backoff (fallback para polling entre tentativas)
        const timer = window.setTimeout(() => {
          if (!document.hidden) open()
        }, 15_000)
        timersRef.current.push(timer)
      }
    }

    open()

    const visibility = () => {
      if (document.visibilityState === 'visible') {
        if (!source) {
          stateRef.current = 'closed'
          open()
        } else {
          invalidate()
        }
      }
    }
    document.addEventListener('visibilitychange', visibility)

    return () => {
      document.removeEventListener('visibilitychange', visibility)
      timersRef.current.forEach((t) => window.clearTimeout(t))
      timersRef.current = []
      source?.close()
    }
  }, [queryClient])

  return stateRef.current
}
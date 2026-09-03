import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCheck, Loader2, CalendarDays, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { AppNotification, Paginated } from '@/types'

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => api.get<Paginated<AppNotification>>('notifications', { per_page: 30 }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

  const readAll = useMutation({
    mutationFn: () => api.post('notifications/read-all'),
    onSuccess: () => {
      toast.success('Todas as notificações marcadas como lidas')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`notifications/${id}/read`),
    onSuccess: () => invalidate(),
  })

  const unread = data?.data.filter((n) => !n.read_at).length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Alertas e novidades do sistema."
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
              {readAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              Marcar todas como lidas
            </Button>
          ) : undefined
        }
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Não foi possível carregar as notificações." onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState title="Sem notificações" description="Será notificado quando ocorrerem novidades." />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {data.data.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read_at) markRead.mutate(n.id)
                    if (n.data.action_url) navigate(n.data.action_url)
                  }}
                  className={`flex w-full items-start gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/30 ${
                    n.read_at ? 'opacity-60' : ''
                  }`}
                >
                  <NotificationIcon icon={n.data.icon} read={!!n.read_at} />
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${n.read_at ? '' : ''}`}>{n.data.title ?? 'Notificação'}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.data.message ?? ''}</p>
                    {n.created_at && (
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</p>
                    )}
                  </div>
                  {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function NotificationIcon({ icon, read }: { icon?: string; read: boolean }) {
  const cls = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
    read ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
  }`
  return (
    <span className={cls}>
      {icon === 'check-circle' ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : icon === 'x-circle' ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <CalendarDays className="h-4 w-4" />
      )}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}
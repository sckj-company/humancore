import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Bell, CheckCheck, Loader2, CalendarDays, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import type { AppNotification, Paginated } from '@/types'

export function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notifs, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Paginated<AppNotification>>('notifications', { per_page: 8 }),
    refetchInterval: 60_000,
  })

  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('notifications/unread-count'),
    refetchInterval: 60_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const readAll = useMutation({
    mutationFn: () => api.post('notifications/read-all'),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao marcar como lidas')),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`notifications/${id}/read`),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
  })

  const unread = countData?.unread ?? 0

  const openItem = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id)
    if (n.data.action_url) navigate(n.data.action_url)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificações</span>
          {unread > 0 && (
            <button
              className="inline-flex items-center gap-1 text-xs text-primary"
              disabled={readAll.isPending}
              onClick={() => readAll.mutate()}
            >
              {readAll.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCheck className="h-3 w-3" />
              )}
              Marcar todas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : notifs && notifs.data.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sem notificações</div>
          ) : (
            notifs?.data.map((n) => (
              <DropdownMenuItem key={n.id} className="cursor-pointer" onClick={() => openItem(n)}>
                <div className={`flex w-full items-start gap-3 py-1 ${n.read_at ? 'opacity-60' : ''}`}>
                  <NotificationIcon icon={n.data.icon} read={!!n.read_at} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${n.read_at ? 'font-normal' : 'font-medium'}`}>
                      {n.data.title ?? 'Notificação'}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.data.message ?? ''}</p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer justify-center text-center text-sm"
          onClick={() => navigate('/notifications')}
        >
          Ver todas
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationIcon({ icon, read }: { icon?: string; read: boolean }) {
  const cls = `flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
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
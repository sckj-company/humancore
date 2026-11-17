import { type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Users, CalendarOff, Bell, ArrowUpRight } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { KpiCard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface ManagerDashboard {
  team_size: number
  team: { id: number; full_name: string; position?: string; status: string; photo_path?: string }[]
  on_leave_today: { id: number; full_name: string }[]
  pending_leaves: { id: number; employee: string; type: string; start_date: string; days: number }[]
  pending_count: number
}

export function ManagerDashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery<ManagerDashboard>({
    queryKey: ['dashboard', 'manager'],
    queryFn: () => api.get<ManagerDashboard>('dashboard/manager'),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('managerDashboard.loadError')} onRetry={refetch} />

  const locale = i18n.language

  const navigateFromCard = (e: MouseEvent<HTMLElement>, path: string) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('a, button')) return
    navigate(path)
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('managerDashboard.title')} description={t('managerDashboard.description')} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label={t('managerDashboard.teamMembers')} value={data.team_size} icon={Users} accent="primary" to="/employees" />
        <KpiCard label={t('managerDashboard.onLeaveToday')} value={data.on_leave_today.length} icon={CalendarOff} accent="info" to="/leave" />
        <KpiCard label={t('managerDashboard.pendingRequests')} value={data.pending_count} icon={Bell} accent="warning" to="/leave" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          onClick={(e) => navigateFromCard(e, '/employees')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t('managerDashboard.myTeam')}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.team.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
            ) : (
              <div className="space-y-3">
                {data.team.map((m) => (
                  <Link
                    key={m.id}
                    to={`/employees/${m.id}`}
                    className="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.photo_path ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {m.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">{m.position}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          onClick={(e) => navigateFromCard(e, '/leave')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t('managerDashboard.pendingRequests')}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.pending_leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('managerDashboard.noPendingRequests')}</p>
            ) : (
              <div className="space-y-3">
                {data.pending_leaves.map((l) => (
                  <Link
                    key={l.id}
                    to="/leave"
                    className="flex items-center justify-between rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div>
                      <p className="text-sm font-medium">{l.employee}</p>
                      <p className="text-xs text-muted-foreground">{l.type} · {t('managerDashboard.days', { count: l.days })}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(l.start_date, locale)}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

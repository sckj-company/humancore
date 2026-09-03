import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, CalendarOff, Bell } from 'lucide-react'
import { api } from '@/lib/api'
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
  const { data, isLoading, isError, refetch } = useQuery<ManagerDashboard>({
    queryKey: ['dashboard', 'manager'],
    queryFn: () => api.get<ManagerDashboard>('dashboard/manager'),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message="Não foi possível carregar o dashboard." onRetry={refetch} />

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard do Gestor" description="Visão consolidada da sua equipa" />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Membros da equipa" value={data.team_size} icon={Users} accent="primary" />
        <KpiCard label="Em férias hoje" value={data.on_leave_today.length} icon={CalendarOff} accent="info" />
        <KpiCard label="Solicitações pendentes" value={data.pending_count} icon={Bell} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A minha equipa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.team.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border-b border-border pb-2 last:border-0">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={m.photo_path ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {m.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Link to={`/employees/${m.id}`} className="text-sm font-medium hover:underline">
                      {m.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{m.position}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solicitações pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.pending_leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem solicitações pendentes</p>
            ) : (
              <div className="space-y-3">
                {data.pending_leaves.map((l) => (
                  <div key={l.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{l.employee}</p>
                      <p className="text-xs text-muted-foreground">{l.type} · {l.days} dias</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{l.start_date}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Filter,
  Eye,
  Activity,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, ErrorState } from '@/components/shared/page-header'
import { DataTable } from '@/components/data/data-table'
import { api } from '@/lib/api'
import type { Paginated } from '@/types'

interface AuditLog {
  id: number
  user: { id: number; name: string; email: string } | null
  event: string
  auditable_type: string
  auditable_id: number
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const eventVariant: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
  created: 'success',
  updated: 'warning',
  deleted: 'destructive',
  restored: 'info',
  login: 'info',
  logout: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  processed: 'info',
  closed: 'secondary',
}

const eventIcons: Record<string, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  login: LogIn,
  logout: LogOut,
  approved: Activity,
  rejected: Activity,
}

export function AuditPage() {
  const [search, setSearch] = useState('')
  const [event, setEvent] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selected, setSelected] = useState<AuditLog | null>(null)

  const params: Record<string, string | number> = { per_page: 30 }
  if (event !== 'all') params.event = event
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  if (search) params.auditable_type = search

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audits', params],
    queryFn: () => api.get<Paginated<AuditLog>>('audits', params),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SISTEMA"
        title="Logs de Auditoria"
        description="Histórico de ações realizadas no sistema"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Recurso</Label>
              <Input
                placeholder="ex: Employee, Leave"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="created">Criado</option>
                <option value="updated">Atualizado</option>
                <option value="deleted">Eliminado</option>
                <option value="login">Login</option>
                <option value="logout">Logout</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
                <option value="processed">Processado</option>
                <option value="closed">Fechado</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>De</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Até</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isError && <ErrorState message="Erro ao carregar auditoria" onRetry={refetch} />}

      <DataTable
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        columns={[
          {
            id: 'user',
            header: 'Utilizador',
            cell: (r) => (
              <div>
                <p className="font-medium">{r.user?.name ?? 'Sistema'}</p>
                {r.user && <p className="text-xs text-muted-foreground">{r.user.email}</p>}
              </div>
            ),
          },
          {
            id: 'event',
            header: 'Evento',
            cell: (r) => {
              const Icon = eventIcons[r.event] ?? Settings
              return (
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant={eventVariant[r.event] ?? 'secondary'}>{r.event}</Badge>
                </div>
              )
            },
          },
          {
            id: 'resource',
            header: 'Recurso',
            cell: (r) => (
              <span className="font-mono text-xs">
                {r.auditable_type}#{r.auditable_id}
              </span>
            ),
          },
          {
            id: 'ip',
            header: 'IP',
            cell: (r) => <span className="font-mono text-xs">{r.ip_address ?? '—'}</span>,
          },
          {
            id: 'date',
            header: 'Data',
            cell: (r) => (
              <span className="text-sm text-muted-foreground">
                {new Date(r.created_at).toLocaleString('pt')}
              </span>
            ),
          },
          {
            id: 'actions',
            header: 'Ações',
            align: 'right',
            cell: (r) => (
              <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Detalhes
              </Button>
            ),
          },
        ]}
        emptyTitle="Sem registos"
        emptyDescription="Nenhuma ação corresponde aos filtros"
      />

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Auditoria</DialogTitle>
            <DialogDescription>
              {selected?.user?.name ?? 'Sistema'} • {selected?.event} • {selected?.auditable_type}#{selected?.auditable_id}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Data/Hora</Label>
                  <p className="text-sm">{new Date(selected.created_at).toLocaleString('pt')}</p>
                </div>
                <div>
                  <Label className="text-xs">IP</Label>
                  <p className="font-mono text-sm">{selected.ip_address ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">User Agent</Label>
                  <p className="text-xs text-muted-foreground break-all">{selected.user_agent ?? '—'}</p>
                </div>
              </div>

              {selected.old_values && (
                <div>
                  <Label className="text-xs text-destructive">Valores Anteriores</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-destructive/5 p-3 text-xs">
                    {JSON.stringify(selected.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selected.new_values && (
                <div>
                  <Label className="text-xs text-success">Valores Novos</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-success/5 p-3 text-xs">
                    {JSON.stringify(selected.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

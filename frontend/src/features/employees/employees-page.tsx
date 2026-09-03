import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Filter } from 'lucide-react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Paginated, EmployeeSummary } from '@/types'

const statusColor: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  suspended: 'bg-warning/10 text-warning',
  terminated: 'bg-destructive/10 text-destructive',
}

export function EmployeesPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)

  const params: Record<string, string | number> = { page, per_page: 12 }
  if (search) params.search = search
  if (status && status !== 'all') params.status = status

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employees', params],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', params),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('employees.title')}
        description={`${data?.meta?.total ?? 0} ${t('common.active').toLowerCase()}`}
        actions={
          <Button asChild>
            <Link to="/employees/new">
              <Plus className="mr-2 h-4 w-4" /> {t('employees.add')}
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder={t('common.search')}
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-48">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder={t('common.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="active">{t('common.active')}</SelectItem>
                  <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                  <SelectItem value="terminated">Desligado</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}

      {isError && <ErrorState message="Não foi possível carregar os funcionários." onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title="Nenhum funcionário encontrado"
          description="Tente ajustar os filtros ou crie um novo funcionário."
          action={
            <Button asChild>
              <Link to="/employees/new">
                <Plus className="mr-2 h-4 w-4" /> {t('employees.add')}
              </Link>
            </Button>
          }
        />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Funcionário</th>
                    <th className="px-6 py-3 font-medium">Cargo</th>
                    <th className="px-6 py-3 font-medium">Departamento</th>
                    <th className="px-6 py-3 font-medium">{t('common.status')}</th>
                    <th className="px-6 py-3 font-medium">Admissão</th>
                    <th className="px-6 py-3 font-medium text-right">Salário</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.data.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={e.photo_path ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {e.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{e.full_name}</p>
                            <p className="text-xs text-muted-foreground">{e.employee_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{e.position ?? '—'}</td>
                      <td className="px-6 py-3 text-muted-foreground">{e.department ?? '—'}</td>
                      <td className="px-6 py-3">
                        <Badge className={statusColor[e.status] ?? 'bg-muted text-foreground'} variant="secondary">
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {e.hired_at ? new Intl.DateTimeFormat(i18n.language).format(new Date(e.hired_at)) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm">
                        {e.active_contract
                          ? new Intl.NumberFormat(i18n.language).format(e.active_contract.base_salary)
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link to={`/employees/${e.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.meta && data.meta.last_page > 1 && (
              <div className="flex items-center justify-between border-t border-border px-6 py-3 text-sm">
                <div className="text-muted-foreground">
                  Página {data.meta.current_page} de {data.meta.last_page} · {data.meta.total} total
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

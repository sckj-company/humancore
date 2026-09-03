import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clock, LogIn, LogOut, Filter, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { AttendanceRecord, Paginated } from '@/types'

const statusStyle: Record<string, string> = {
  present: 'bg-success/10 text-success',
  late: 'bg-warning/10 text-warning',
  absent: 'bg-destructive/10 text-destructive',
  half_day: 'bg-info/10 text-info',
  holiday: 'bg-muted text-muted-foreground',
  justified: 'bg-info/10 text-info',
  sick: 'bg-warning/10 text-warning',
  vacation: 'bg-muted text-muted-foreground',
}

interface AttendanceDTO {
  id: number
  employee_id: number
  date: string
  clock_in: string | null
  clock_out: string | null
  total_worked: number | null
  status: string
  late_minutes: number
  notes: string | null
  employee?: { id: number; full_name: string; employee_code: string }
}

export function AttendancePage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
  const queryClient = useQueryClient()

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('attendance.title')}
        description={isAdmin ? t('attendance.allDescription') : t('attendance.myDescription')}
      />
      {isAdmin ? <AdminAttendanceView /> : <EmployeeAttendanceView />}
    </div>
  )
}

function EmployeeAttendanceView() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()

  const { data: today, isLoading, refetch } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get<AttendanceDTO | null>('attendance/today'),
  })

  const { data: history } = useQuery({
    queryKey: ['attendance-my-history'],
    queryFn: () => api.get<Paginated<AttendanceDTO>>('attendance/my-history', { per_page: 15 }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] })
    refetch()
  }

  const toggleMutation = useMutation({
    mutationFn: () => api.post<AttendanceDTO>('attendance/toggle'),
    onSuccess: () => {
      toast.success('Registo atualizado com sucesso')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar presença')),
  })

  const isClockedIn = !!today?.clock_in && !today?.clock_out

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{formatDate(today?.date ?? '', i18n.language)}</p>
                {isClockedIn ? (
                  <p className="mt-1 text-2xl font-semibold">{today?.clock_in}</p>
                ) : (
                  <p className="mt-1 text-2xl font-semibold">—:—</p>
                )}
              </div>
              {today && isClockedIn && today.status && (
                <Badge className={statusStyle[today.status] ?? ''} variant="secondary">
                  {today.status}
                </Badge>
              )}
              <Button
                size="lg"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate()}
                variant={isClockedIn ? 'outline' : 'default'}
              >
                {toggleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isClockedIn ? (
                  <LogOut className="mr-2 h-4 w-4" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                {isClockedIn ? t('attendance.clockOut') : t('attendance.clockIn')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-6 py-4 text-sm font-medium">{t('attendance.myHistory')}</div>
          {history && history.data.length === 0 ? (
            <EmptyState title="Sem registos de presença" description="Registe a sua entrada para começar." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('common.date')}</th>
                    <th className="px-6 py-3 font-medium">Entrada</th>
                    <th className="px-6 py-3 font-medium">Saída</th>
                    <th className="px-6 py-3 font-medium text-right">Horas</th>
                    <th className="px-6 py-3 font-medium text-right">Atraso (min)</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {history?.data.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3 text-muted-foreground">{formatDate(r.date, i18n.language)}</td>
                      <td className="px-6 py-3">{r.clock_in ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_out ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.total_worked != null ? (r.total_worked / 60).toFixed(1) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{r.late_minutes || 0}</td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[r.status] ?? ''} variant="secondary">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AdminAttendanceView() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState('all')
  const queryClient = useQueryClient()

  const params: Record<string, string | number> = { per_page: 30 }
  if (status !== 'all') params.status = status

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', params],
    queryFn: () => api.get<Paginated<AttendanceDTO>>('attendance', params),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`attendance/${id}`, { status }),
    onSuccess: () => {
      toast.success('Presença atualizada')
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atualizar')),
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:w-48">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder={t('common.status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="present">Presente</SelectItem>
                  <SelectItem value="late">Atrasado</SelectItem>
                  <SelectItem value="absent">Falta</SelectItem>
                  <SelectItem value="half_day">Meio-dia</SelectItem>
                  <SelectItem value="justified">Justificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Não foi possível carregar as presenças." onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState title="Sem registos de presença" description="Os funcionários ainda não registaram presenças neste intervalo." />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Funcionário</th>
                    <th className="px-6 py-3 font-medium">{t('common.date')}</th>
                    <th className="px-6 py-3 font-medium">Entrada</th>
                    <th className="px-6 py-3 font-medium">Saída</th>
                    <th className="px-6 py-3 font-medium text-right">Horas</th>
                    <th className="px-6 py-3 font-medium text-right">Atraso</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                    <th className="px-6 py-3 font-medium text-right">Ajustar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.data.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div>
                          <p className="font-medium">{r.employee?.full_name ?? `#${r.employee_id}`}</p>
                          <p className="text-xs text-muted-foreground">{r.employee?.employee_code}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">{formatDate(r.date, i18n.language)}</td>
                      <td className="px-6 py-3">{r.clock_in ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_out ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.total_worked != null ? (r.total_worked / 60).toFixed(1) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{r.late_minutes || 0}</td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[r.status] ?? ''} variant="secondary">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Select
                          value={r.status}
                          onValueChange={(s) => editMutation.mutate({ id: r.id, status: s })}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Presente</SelectItem>
                            <SelectItem value="late">Atrasado</SelectItem>
                            <SelectItem value="absent">Falta</SelectItem>
                            <SelectItem value="half_day">Meio-dia</SelectItem>
                            <SelectItem value="justified">Justificado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

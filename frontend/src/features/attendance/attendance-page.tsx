import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Clock, LogIn, LogOut, Filter, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { Paginated } from '@/types'

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
  overtime_amount?: number | null
  notes: string | null
  deduct_from_salary?: boolean
  shift_id?: number | null
  shift?: { id: number; name: string; start_time: string; end_time: string } | null
  employee?: { id: number; full_name: string; employee_code: string }
}

interface MySchedule {
  id: number
  shift: { id: number; name: string; start_time: string; end_time: string } | null
}

interface EmployeeSchedule {
  id: number
  shift_id: number
  effective_from: string
  effective_to: string | null
  is_active: boolean
  shift: { id: number; name: string; start_time: string; end_time: string } | null
}

export function AttendancePage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
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
  const [selectedShiftId, setSelectedShiftId] = useState('')

  const { data: schedules = [] } = useQuery({
    queryKey: ['my-schedules'],
    queryFn: () => api.get<MySchedule[]>('my-schedule'),
  })

  const assignedShifts = schedules.flatMap((schedule) => schedule.shift ? [schedule.shift] : [])

  useEffect(() => {
    if (!selectedShiftId && assignedShifts.length === 1) {
      setSelectedShiftId(String(assignedShifts[0].id))
    }
  }, [schedules, selectedShiftId])

  const { data: today, isLoading, refetch } = useQuery({
    queryKey: ['attendance-today', selectedShiftId],
    queryFn: () => api.get<AttendanceDTO | null>('attendance/today', selectedShiftId ? { shift_id: Number(selectedShiftId) } : undefined),
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
    mutationFn: () => api.post<AttendanceDTO>('attendance/toggle', selectedShiftId ? { shift_id: Number(selectedShiftId) } : {}),
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
              {assignedShifts.length > 0 && (
                <div className="w-full max-w-sm text-left">
                  <Label htmlFor="attendance-shift">{t('attendance.shift')}</Label>
                  <Select value={selectedShiftId} onValueChange={setSelectedShiftId}>
                    <SelectTrigger id="attendance-shift" className="mt-1">
                      <SelectValue placeholder={t('attendance.selectShift')} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignedShifts.map((shift) => (
                        <SelectItem key={shift.id} value={String(shift.id)}>
                          {shift.name} ({shift.start_time}–{shift.end_time})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                disabled={toggleMutation.isPending || (assignedShifts.length > 1 && !selectedShiftId)}
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
                    <th className="px-6 py-3 font-medium">{t('attendance.shift')}</th>
                    <th className="px-6 py-3 font-medium">Entrada</th>
                    <th className="px-6 py-3 font-medium">Saída</th>
                    <th className="px-6 py-3 font-medium text-right">Horas</th>
                    <th className="px-6 py-3 font-medium text-right">{t('attendance.overtimeAmount')}</th>
                    <th className="px-6 py-3 font-medium text-right">Atraso (min)</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {history?.data.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3 text-muted-foreground">{formatDate(r.date, i18n.language)}</td>
                      <td className="px-6 py-3">{r.shift?.name ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_in ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_out ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.total_worked != null ? (r.total_worked / 60).toFixed(1) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.overtime_amount != null ? r.overtime_amount.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
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
  const [editing, setEditing] = useState<AttendanceDTO | null>(null)
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '', status: 'present', notes: '', shift_id: '', deduct_from_salary: false })
  const queryClient = useQueryClient()

  const params: Record<string, string | number> = { per_page: 30 }
  if (status !== 'all') params.status = status

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', params],
    queryFn: () => api.get<Paginated<AttendanceDTO>>('attendance', params),
  })
  const { data: scheduleData } = useQuery({
    queryKey: ['attendance-editor-schedules', editing?.employee_id],
    queryFn: () => api.get<Paginated<EmployeeSchedule>>('employee-schedules', { employee_id: editing?.employee_id, per_page: 100 }),
    enabled: !!editing,
  })
  const editShifts = (scheduleData?.data ?? []).filter((schedule) =>
    (schedule.is_active || schedule.shift_id === editing?.shift_id)
    && schedule.effective_from <= (editing?.date ?? '')
    && (!schedule.effective_to || schedule.effective_to >= (editing?.date ?? ''))
    && schedule.shift,
  )

  const editMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error(t('attendance.editError'))

      return api.put(`attendance/${editing.id}`, {
        clock_in: editForm.clock_in || null,
        clock_out: editForm.clock_out || null,
        status: editForm.status,
        notes: editForm.notes || null,
        shift_id: editForm.shift_id ? Number(editForm.shift_id) : editing.shift_id ?? null,
        deduct_from_salary: editForm.deduct_from_salary,
      })
    },
    onSuccess: () => {
      toast.success(t('attendance.updated'))
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      setEditing(null)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('attendance.editError'))),
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
                    <th className="px-6 py-3 font-medium">{t('attendance.shift')}</th>
                    <th className="px-6 py-3 font-medium">Entrada</th>
                    <th className="px-6 py-3 font-medium">Saída</th>
                    <th className="px-6 py-3 font-medium text-right">Horas</th>
                    <th className="px-6 py-3 font-medium text-right">{t('attendance.overtimeAmount')}</th>
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
                      <td className="px-6 py-3">{r.shift?.name ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_in ?? '—'}</td>
                      <td className="px-6 py-3">{r.clock_out ?? '—'}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.total_worked != null ? (r.total_worked / 60).toFixed(1) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        {r.overtime_amount != null ? r.overtime_amount.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{r.late_minutes || 0}</td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[r.status] ?? ''} variant="secondary">
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button size="icon-sm" variant="ghost" aria-label={t('common.edit')} onClick={() => {
                          setEditing(r)
                          setEditForm({ clock_in: r.clock_in ?? '', clock_out: r.clock_out ?? '', status: r.status, notes: r.notes ?? '', shift_id: r.shift_id ? String(r.shift_id) : '', deduct_from_salary: r.deduct_from_salary ?? false })
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('attendance.editTitle')}</DialogTitle>
            <DialogDescription>
              {editing?.employee?.full_name} · {editing ? formatDate(editing.date, i18n.language) : ''} · {editing?.shift?.name ?? '—'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('attendance.clockIn')}</Label>
                <Input type="time" value={editForm.clock_in} onChange={(event) => setEditForm((form) => ({ ...form, clock_in: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('attendance.clockOut')}</Label>
                <Input type="time" value={editForm.clock_out} onChange={(event) => setEditForm((form) => ({ ...form, clock_out: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.status')}</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm((form) => ({ ...form, status: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['present', 'late', 'absent', 'half_day', 'holiday', 'vacation', 'sick', 'justified'].map((value) => (
                    <SelectItem key={value} value={value}>{t(`employeeDetail.attendanceStatus.${value}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editShifts.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t('attendance.shift')}</Label>
                <Select value={editForm.shift_id} onValueChange={(value) => setEditForm((form) => ({ ...form, shift_id: value }))}>
                  <SelectTrigger><SelectValue placeholder={t('attendance.selectShift')} /></SelectTrigger>
                  <SelectContent>
                    {editShifts.map((schedule) => (
                      <SelectItem key={schedule.id} value={String(schedule.shift_id)}>
                        {schedule.shift?.name} ({schedule.shift?.start_time}–{schedule.shift?.end_time})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t('common.notes')}</Label>
              <Input value={editForm.notes} onChange={(event) => setEditForm((form) => ({ ...form, notes: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.deduct_from_salary}
                onChange={(event) => setEditForm((form) => ({ ...form, deduct_from_salary: event.target.checked }))}
                className="h-4 w-4"
              />
              {t('employeeDetail.text.deductSalary')}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending || (editShifts.length > 1 && !editForm.shift_id)}>
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

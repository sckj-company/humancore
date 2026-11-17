import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, FileDown, Loader2, Search, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ErrorState, LoadingState } from '@/components/shared/page-header'
import type { Department, EmployeeSummary, Paginated } from '@/types'

interface AttendanceReportPayload {
  period: {
    type: 'daily' | 'weekly' | 'monthly' | 'custom'
    label: string
    start_date: string
    end_date: string
    days_count: number
  }
  totals: {
    employees_count: number
    records_count: number
    present_count: number
    late_count: number
    absent_count: number
    on_leave_count: number
    half_day_count: number
    total_worked_hours: number
    total_late_minutes: number
    total_overtime_hours: number
    attendance_rate: number
  }
  employees: Array<{
    employee_id: number
    employee_code: string
    full_name: string
    department: string
    position: string
    records_count: number
    present_days: number
    late_days: number
    absent_days: number
    half_days: number
    leave_days: number
    worked_hours: number
    late_minutes: number
    overtime_hours: number
    attendance_rate: number
  }>
  entries: Array<{
    id: number
    date_formatted: string
    employee_code: string
    employee_name: string
    shift_name: string
    clock_in: string
    clock_out: string
    worked_hours: number
    late_minutes: number
    overtime_hours: number
    status: string
    status_label: string
  }>
}

const MONTH_OPTIONS = [
  { value: '01', pt: 'Janeiro', en: 'January', zh: '1月' },
  { value: '02', pt: 'Fevereiro', en: 'February', zh: '2月' },
  { value: '03', pt: 'Março', en: 'March', zh: '3月' },
  { value: '04', pt: 'Abril', en: 'April', zh: '4月' },
  { value: '05', pt: 'Maio', en: 'May', zh: '5月' },
  { value: '06', pt: 'Junho', en: 'June', zh: '6月' },
  { value: '07', pt: 'Julho', en: 'July', zh: '7月' },
  { value: '08', pt: 'Agosto', en: 'August', zh: '8月' },
  { value: '09', pt: 'Setembro', en: 'September', zh: '9月' },
  { value: '10', pt: 'Outubro', en: 'October', zh: '10月' },
  { value: '11', pt: 'Novembro', en: 'November', zh: '11月' },
  { value: '12', pt: 'Dezembro', en: 'December', zh: '12月' },
]

export function AttendanceReportDialog({
  open,
  onOpenChange,
  initialEmployeeId,
  initialSearch = '',
  initialEmployeeStatus = 'all',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEmployeeId?: number | null
  initialSearch?: string
  initialEmployeeStatus?: string
}) {
  const { t, i18n } = useTranslation()
  const now = new Date()
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [monthNum, setMonthNum] = useState(() => String(now.getMonth() + 1).padStart(2, '0'))
  const [yearText, setYearText] = useState(() => String(now.getFullYear()))
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>(initialEmployeeId ? [initialEmployeeId] : [])
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [departmentId, setDepartmentId] = useState<string>('all')
  const [attendanceStatus, setAttendanceStatus] = useState<string>('all')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedEmployeeIds(initialEmployeeId ? [initialEmployeeId] : [])
      setEmployeeSearch('')
    }
  }, [open, initialEmployeeId])

  const { data: employeesList } = useQuery({
    queryKey: ['employees', 'report-select'],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', { per_page: 250 }),
    enabled: open,
  })

  const { data: departments } = useQuery({
    queryKey: ['departments', 'report-select'],
    queryFn: () => api.get<Department[]>('departments'),
    enabled: open,
  })

  const allEmployees = employeesList?.data ?? []

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase()
    return allEmployees.filter((emp) => {
      if (departmentId !== 'all' && emp.department) {
        const matchedDept = (departments ?? []).find((d) => String(d.id) === departmentId)
        if (matchedDept && emp.department !== matchedDept.name) {
          return false
        }
      }
      if (!q) return true
      return (
        emp.full_name.toLowerCase().includes(q)
        || emp.employee_code.toLowerCase().includes(q)
        || (emp.department ?? '').toLowerCase().includes(q)
      )
    })
  }, [allEmployees, employeeSearch, departmentId, departments])

  const selectedEmployeesMap = useMemo(() => {
    const map = new Map<number, EmployeeSummary>()
    for (const emp of allEmployees) {
      if (selectedEmployeeIds.includes(emp.id)) {
        map.set(emp.id, emp)
      }
    }
    return map
  }, [allEmployees, selectedEmployeeIds])

  const validYear = /^\d{4}$/.test(yearText.trim()) && Number(yearText) >= 1990 && Number(yearText) <= 2100
    ? yearText.trim()
    : String(now.getFullYear())

  const queryParams: Record<string, string | number> = { period_type: periodType }
  if (periodType === 'daily' || periodType === 'weekly') queryParams.date = date
  if (periodType === 'monthly') queryParams.month = `${validYear}-${monthNum}`
  if (periodType === 'custom') {
    queryParams.start_date = startDate
    queryParams.end_date = endDate
  }
  if (selectedEmployeeIds.length > 0) {
    queryParams.employee_ids = selectedEmployeeIds.join(',')
  } else {
    if (initialSearch.trim()) queryParams.search = initialSearch.trim()
    if (initialEmployeeStatus && initialEmployeeStatus !== 'all') queryParams.employee_status = initialEmployeeStatus
  }
  if (departmentId !== 'all') queryParams.department_id = Number(departmentId)
  if (attendanceStatus !== 'all') queryParams.attendance_status = attendanceStatus

  const report = useQuery({
    queryKey: ['attendance-report', queryParams],
    queryFn: () => api.get<AttendanceReportPayload>('attendance/report', queryParams),
    enabled: open,
  })

  const toggleEmployee = (empId: number) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId],
    )
  }

  const selectAllVisible = () => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev)
      for (const emp of filteredEmployees) next.add(emp.id)
      return Array.from(next)
    })
  }

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const targetTag = selectedEmployeeIds.length === 1
        ? `funcionario-${selectedEmployeeIds[0]}`
        : selectedEmployeeIds.length > 1
          ? `${selectedEmployeeIds.length}-funcionarios`
          : 'todos'
      const filename = `relatorio-presencas-${periodType}-${targetTag}.pdf`
      await api.downloadFile('attendance/report.pdf', filename, queryParams)
    } catch (e) {
      toast.error(getApiErrorMessage(e, t('attendanceReport.downloadError', { defaultValue: 'Erro ao gerar PDF de presenças.' })))
    } finally {
      setDownloading(false)
    }
  }

  const getMonthLabel = (m: (typeof MONTH_OPTIONS)[number]) => {
    if (i18n.language.startsWith('en')) return m.en
    if (i18n.language.startsWith('zh')) return m.zh
    return m.pt
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[86vh] min-h-[580px] max-h-[820px] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            {t('attendanceReport.title', { defaultValue: 'Relatório de Presenças' })}
          </DialogTitle>
          <DialogDescription>
            {t('attendanceReport.description', { defaultValue: 'Consulte e exporte em PDF as presenças diárias, semanais ou mensais por funcionário ou equipa filtrada.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[330px_1fr]">
          {/* Left Filter & Employee Multi-select Sidebar */}
          <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-b border-border bg-muted/15 p-4 lg:border-b-0 lg:border-r">
            {/* Periodicity segmented switcher */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('attendanceReport.periodType', { defaultValue: 'Periodicidade' })}
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'daily', label: t('attendanceReport.daily', { defaultValue: 'Diário' }) },
                  { key: 'weekly', label: t('attendanceReport.weekly', { defaultValue: 'Semanal' }) },
                  { key: 'monthly', label: t('attendanceReport.monthly', { defaultValue: 'Mensal' }) },
                  { key: 'custom', label: t('attendanceReport.custom', { defaultValue: 'Personalizado' }) },
                ] as const).map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    size="sm"
                    variant={periodType === item.key ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setPeriodType(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Period date controls */}
            {periodType === 'monthly' && (
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
                  <Select value={monthNum} onValueChange={setMonthNum}>
                    <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {getMonthLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                  <Input
                    type="number"
                    min={1990}
                    max={2100}
                    className="h-9 bg-background font-mono"
                    value={yearText}
                    onChange={(e) => setYearText(e.target.value)}
                    placeholder="2026"
                  />
                </div>
              </div>
            )}

            {(periodType === 'daily' || periodType === 'weekly') && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {periodType === 'daily'
                    ? t('common.date', { defaultValue: 'Data' })
                    : t('attendanceReport.weekReferenceDate', { defaultValue: 'Data de referência da semana' })}
                </Label>
                <Input type="date" className="h-9 bg-background" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}

            {periodType === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('attendanceReport.startDate', { defaultValue: 'Data início' })}</Label>
                  <Input type="date" className="h-9 bg-background" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('attendanceReport.endDate', { defaultValue: 'Data fim' })}</Label>
                  <Input type="date" className="h-9 bg-background" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Department & Attendance Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('employeesPage.department')}</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {(departments ?? []).map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('attendanceReport.attendanceStatus', { defaultValue: 'Presença' })}</Label>
                <Select value={attendanceStatus} onValueChange={setAttendanceStatus}>
                  <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="present">{t('attendanceReport.statuses.present', { defaultValue: 'Presente' })}</SelectItem>
                    <SelectItem value="late">{t('attendanceReport.statuses.late', { defaultValue: 'Atraso' })}</SelectItem>
                    <SelectItem value="absent">{t('attendanceReport.statuses.absent', { defaultValue: 'Falta' })}</SelectItem>
                    <SelectItem value="on_leave">{t('attendanceReport.statuses.on_leave', { defaultValue: 'Férias / Ausência' })}</SelectItem>
                    <SelectItem value="half_day">{t('attendanceReport.statuses.half_day', { defaultValue: 'Meio Dia' })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Searchable Multi-Select Employees */}
            <div className="flex min-h-[200px] flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {t('common.employees', { defaultValue: 'Funcionários' })}
                </Label>
                <Badge variant={selectedEmployeeIds.length > 0 ? 'secondary' : 'outline'} className="text-[11px]">
                  {selectedEmployeeIds.length > 0
                    ? t('attendanceReport.selectedCount', { count: selectedEmployeeIds.length, defaultValue: `${selectedEmployeeIds.length} selecionado(s)` })
                    : t('attendanceReport.allScope', { defaultValue: 'Todos' })}
                </Badge>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder={t('attendanceReport.searchEmployeePlaceholder', { defaultValue: 'Pesquisar por nome ou código...' })}
                  className="h-8 bg-background pl-8 text-xs"
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px]">
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={selectAllVisible}
                  disabled={filteredEmployees.length === 0}
                >
                  {t('attendanceReport.selectVisible', { defaultValue: 'Selecionar filtrados' })}
                </button>
                {selectedEmployeeIds.length > 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive hover:underline"
                    onClick={() => setSelectedEmployeeIds([])}
                  >
                    {t('attendanceReport.clearSelection', { defaultValue: 'Limpar seleção (Todos)' })}
                  </button>
                )}
              </div>

              {selectedEmployeeIds.length > 0 && (
                <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto rounded-md border border-border bg-background p-1.5">
                  {selectedEmployeeIds.map((empId) => {
                    const emp = selectedEmployeesMap.get(empId)
                    if (!emp) return null
                    return (
                      <Badge key={empId} variant="secondary" className="gap-1 pr-1 text-[11px]">
                        <span className="max-w-[130px] truncate">{emp.full_name}</span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-muted"
                          onClick={() => toggleEmployee(empId)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    )
                  })}
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background divide-y divide-border">
                {filteredEmployees.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    {t('attendanceReport.noEmployeesMatch', { defaultValue: 'Nenhum funcionário encontrado.' })}
                  </p>
                ) : (
                  filteredEmployees.map((emp) => {
                    const checked = selectedEmployeeIds.includes(emp.id)
                    return (
                      <label
                        key={emp.id}
                        className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-2 text-xs transition-colors hover:bg-muted/40 ${checked ? 'bg-primary/5' : ''}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">{emp.full_name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {emp.employee_code}{emp.department ? ` · ${emp.department}` : ''}
                          </p>
                        </div>
                        {checked && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          </aside>

          {/* Right Preview Area (Stable Height, Scrollable) */}
          <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            {report.isLoading ? (
              <div className="flex min-h-[380px] flex-1 items-center justify-center">
                <LoadingState />
              </div>
            ) : report.isError ? (
              <div className="flex min-h-[380px] flex-1 items-center justify-center">
                <ErrorState
                  message={t('attendanceReport.loadError', { defaultValue: 'Não foi possível carregar o relatório de presenças.' })}
                  onRetry={() => report.refetch()}
                />
              </div>
            ) : report.data ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{report.data.period.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.data.period.start_date} – {report.data.period.end_date} ({report.data.period.days_count} d) ·{' '}
                      {report.data.totals.employees_count} {t('payroll.periodsPage.employees').toLowerCase()}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    {report.data.totals.records_count} {t('attendanceReport.recordsShort', { defaultValue: 'registo(s)' })}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.present', { defaultValue: 'Presenças' })}</p>
                    <p className="text-lg font-semibold text-emerald-600">{report.data.totals.present_count}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.late', { defaultValue: 'Atrasos' })}</p>
                    <p className="text-lg font-semibold text-amber-600">
                      {report.data.totals.late_count}{' '}
                      <span className="text-xs font-normal text-muted-foreground">({report.data.totals.total_late_minutes}m)</span>
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.absent', { defaultValue: 'Faltas' })}</p>
                    <p className="text-lg font-semibold text-destructive">{report.data.totals.absent_count}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.onLeave', { defaultValue: 'Férias / Aus.' })}</p>
                    <p className="text-lg font-semibold text-blue-600">{report.data.totals.on_leave_count}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.workedHours', { defaultValue: 'Horas Trab.' })}</p>
                    <p className="text-lg font-semibold font-mono">{report.data.totals.total_worked_hours.toFixed(1)}h</p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <p className="text-[11px] text-muted-foreground">{t('attendanceReport.attendanceRate', { defaultValue: 'Assiduidade' })}</p>
                    <p className="text-lg font-semibold">{report.data.totals.attendance_rate.toFixed(1)}%</p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-muted/40 text-left uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t('employeesPage.employee')}</th>
                        <th className="px-3 py-2">{t('employeesPage.department')}</th>
                        <th className="px-3 py-2 text-center">{t('attendanceReport.present', { defaultValue: 'Pres.' })}</th>
                        <th className="px-3 py-2 text-center">{t('attendanceReport.late', { defaultValue: 'Atraso' })}</th>
                        <th className="px-3 py-2 text-center">{t('attendanceReport.absent', { defaultValue: 'Falta' })}</th>
                        <th className="px-3 py-2 text-center">{t('attendanceReport.onLeave', { defaultValue: 'Ausência' })}</th>
                        <th className="px-3 py-2 text-right">{t('attendanceReport.workedHours', { defaultValue: 'Horas' })}</th>
                        <th className="px-3 py-2 text-right">{t('attendanceReport.overtimeHours', { defaultValue: 'H. Extras' })}</th>
                        <th className="px-3 py-2 text-right">{t('attendanceReport.attendanceRate', { defaultValue: 'Assiduidade' })}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {report.data.employees.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                            {t('attendanceReport.empty', { defaultValue: 'Nenhum dado encontrado para os filtros aplicados.' })}
                          </td>
                        </tr>
                      ) : (
                        report.data.employees.map((row) => (
                          <tr key={row.employee_id} className="hover:bg-muted/20">
                            <td className="px-3 py-2">
                              <p className="font-medium">{row.full_name}</p>
                              <p className="text-[11px] text-muted-foreground">{row.employee_code} · {row.position}</p>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{row.department}</td>
                            <td className="px-3 py-2 text-center font-medium text-emerald-700">{row.present_days}</td>
                            <td className="px-3 py-2 text-center font-medium text-amber-700">{row.late_days}</td>
                            <td className="px-3 py-2 text-center font-medium text-destructive">{row.absent_days}</td>
                            <td className="px-3 py-2 text-center text-blue-700">{row.leave_days}</td>
                            <td className="px-3 py-2 text-right font-mono">{row.worked_hours.toFixed(2)}h</td>
                            <td className="px-3 py-2 text-right font-mono">{row.overtime_hours.toFixed(2)}h</td>
                            <td className="px-3 py-2 text-right">
                              <Badge variant="outline" className="font-mono text-[11px]">{row.attendance_rate.toFixed(1)}%</Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {report.data.entries.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('attendanceReport.dailyLog', { defaultValue: 'Registos Diários' })} ({report.data.entries.length})
                    </p>
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 border-b border-border bg-muted/70 text-left uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">{t('common.date', { defaultValue: 'Data' })}</th>
                            <th className="px-3 py-2">{t('employeesPage.employee')}</th>
                            <th className="px-3 py-2">{t('schedules.shift')}</th>
                            <th className="px-3 py-2 text-center">{t('attendanceReport.clockIn', { defaultValue: 'Entrada' })}</th>
                            <th className="px-3 py-2 text-center">{t('attendanceReport.clockOut', { defaultValue: 'Saída' })}</th>
                            <th className="px-3 py-2 text-right">{t('attendanceReport.workedHours', { defaultValue: 'Horas' })}</th>
                            <th className="px-3 py-2 text-center">{t('common.status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {report.data.entries.map((entry) => (
                            <tr key={entry.id}>
                              <td className="px-3 py-1.5 font-mono">{entry.date_formatted}</td>
                              <td className="px-3 py-1.5">{entry.employee_name}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{entry.shift_name}</td>
                              <td className="px-3 py-1.5 text-center font-mono">{entry.clock_in}</td>
                              <td className="px-3 py-1.5 text-center font-mono">{entry.clock_out}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{entry.worked_hours.toFixed(2)}h</td>
                              <td className="px-3 py-1.5 text-center">
                                <Badge variant="outline" className="text-[11px]">{entry.status_label}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>

        <DialogFooter className="shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/10 px-6 py-3 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selectedEmployeeIds.length > 0
              ? t('attendanceReport.selectedFooterHint', { count: selectedEmployeeIds.length, defaultValue: `${selectedEmployeeIds.length} funcionário(s) selecionado(s) para exportação.` })
              : t('attendanceReport.allFooterHint', { defaultValue: 'A exportar todos os funcionários dos filtros atuais.' })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.close', { defaultValue: 'Fechar' })}
            </Button>
            <Button onClick={handleDownloadPdf} disabled={downloading || report.isLoading}>
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              {t('attendanceReport.downloadPdf', { defaultValue: 'Baixar PDF' })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

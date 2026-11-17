import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Plus,
  Play,
  CheckCircle2,
  Lock,
  Eye,
  Loader2,
  Send,
  Banknote,
  RotateCcw,
  Search,
  X,
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import { CalendarDateField } from '@/components/ui/calendar-date-field'
import { formatDayMonthLong } from '@/lib/format'
import { ProcessPeriodDialog } from '@/features/payroll/process-period-dialog'
import type { PayrollPeriod, Paginated } from '@/types'

const statusStyle: Record<string, string> = {
  open:               'bg-blue-500/10 text-blue-600 border-blue-500/20',
  processing:         'bg-amber-500/10 text-amber-600 border-amber-500/20',
  completed:          'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  failed:             'bg-red-500/10 text-red-600 border-red-500/20',
  pending_validation: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  pending_approval:   'bg-orange-500/10 text-orange-600 border-orange-500/20',
  approved:           'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  paid:               'bg-green-500/10 text-green-600 border-green-500/20',
  closed:             'bg-muted text-muted-foreground border-border',
  cancelled:          'bg-red-500/10 text-red-600 border-red-500/20',
}

const statusLabel: Record<string, string> = {
  open:               'Aberto',
  processing:         'A Processar',
  completed:          'Calculado',
  failed:             'Com Erros',
  pending_validation: 'Pend. Validação',
  pending_approval:   'Pend. Aprovação',
  approved:           'Aprovado',
  paid:               'Pago',
  closed:             'Fechado',
  cancelled:          'Cancelado',
}

type PeriodTypeOption = PayrollPeriod['period_type']

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
] as const

const QUARTER_OPTIONS = [
  { value: '1', startMonth: 1, endMonth: 3, pt: '1º Trimestre (Janeiro – Março)', en: 'Q1 (January – March)', zh: '第1季度 (1月–3月)' },
  { value: '2', startMonth: 4, endMonth: 6, pt: '2º Trimestre (Abril – Junho)', en: 'Q2 (April – June)', zh: '第2季度 (4月–6月)' },
  { value: '3', startMonth: 7, endMonth: 9, pt: '3º Trimestre (Julho – Setembro)', en: 'Q3 (July – September)', zh: '第3季度 (7月–9月)' },
  { value: '4', startMonth: 10, endMonth: 12, pt: '4º Trimestre (Outubro – Dezembro)', en: 'Q4 (October – December)', zh: '第4季度 (10月–12月)' },
] as const

function getLocalizedMonthLabel(m: (typeof MONTH_OPTIONS)[number], language: string): string {
  if (language.startsWith('en')) return m.en
  if (language.startsWith('zh')) return m.zh
  return m.pt
}

function getLocalizedQuarterLabel(q: (typeof QUARTER_OPTIONS)[number], language: string): string {
  if (language.startsWith('en')) return q.en
  if (language.startsWith('zh')) return q.zh
  return q.pt
}

export function PayrollPeriodsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const currencyFormatter = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 })
  const [createOpen, setCreateOpen] = useState(false)
  const [reopenId, setReopenId] = useState<number | null>(null)
  const [processId, setProcessId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [periodTypeFilter, setPeriodTypeFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('')
  const [currentYear] = useState(() => String(new Date().getFullYear()))

  const queryParams: Record<string, string | number> = { per_page: 30 }
  if (search.trim()) queryParams.search = search.trim()
  if (statusFilter !== 'all') queryParams.status = statusFilter
  if (periodTypeFilter !== 'all') queryParams.period_type = periodTypeFilter
  if (monthFilter !== 'all') {
    const resolvedFilterYear = /^\d{4}$/.test(yearFilter.trim()) ? yearFilter.trim() : currentYear
    queryParams.month = `${resolvedFilterYear}-${monthFilter}`
  }
  if (yearFilter.trim()) queryParams.year = Number(yearFilter)

  const hasFilters = Boolean(
    search.trim() || statusFilter !== 'all' || periodTypeFilter !== 'all' || monthFilter !== 'all' || yearFilter.trim(),
  )

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPeriodTypeFilter('all')
    setMonthFilter('all')
    setYearFilter('')
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-periods', queryParams],
    queryFn: () => api.get<Paginated<PayrollPeriod>>('payroll/periods', queryParams),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/approve`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.approved'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao aprovar')),
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/close`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.closed'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao fechar')),
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/submit`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.submitted'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao submeter')),
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/pay`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.paymentRegistered'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar pagamento')),
  })

  const reopenMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`payroll/periods/${id}/reopen`, { reason }),
    onSuccess: () => {
      toast.success(t('payroll.feedback.reopened'))
      setReopenId(null)
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao reabrir')),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('payroll.title')}
        description={`${data?.meta?.total ?? 0} ${t('common.periods').toLowerCase()}`}
        actions={
          <CreatePeriodDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onDone={() => invalidate()}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('payroll.periodsPage.searchPlaceholder', { defaultValue: 'Pesquisar por nome do período...' })}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label className="text-xs">{t('common.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="open">{t('payroll.periodStatuses.open', { defaultValue: 'Aberto' })}</SelectItem>
                <SelectItem value="processing">{t('payroll.periodStatuses.processing', { defaultValue: 'A Processar' })}</SelectItem>
                <SelectItem value="completed">{t('payroll.periodStatuses.completed', { defaultValue: 'Calculado' })}</SelectItem>
                <SelectItem value="pending_validation">{t('payroll.periodStatuses.pending_validation', { defaultValue: 'Pend. Validação' })}</SelectItem>
                <SelectItem value="pending_approval">{t('payroll.periodStatuses.pending_approval', { defaultValue: 'Pend. Aprovação' })}</SelectItem>
                <SelectItem value="approved">{t('payroll.periodStatuses.approved', { defaultValue: 'Aprovado' })}</SelectItem>
                <SelectItem value="closed">{t('payroll.periodStatuses.closed', { defaultValue: 'Fechado' })}</SelectItem>
                <SelectItem value="paid">{t('payroll.periodStatuses.paid', { defaultValue: 'Pago' })}</SelectItem>
                <SelectItem value="failed">{t('payroll.periodStatuses.failed', { defaultValue: 'Com Erros' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label className="text-xs">{t('payroll.periodsPage.type')}</Label>
            <Select value={periodTypeFilter} onValueChange={setPeriodTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="monthly">{t('payroll.periodTypes.monthly', { defaultValue: 'Mensal' })}</SelectItem>
                <SelectItem value="quarterly">{t('payroll.periodTypes.quarterly', { defaultValue: 'Trimestral' })}</SelectItem>
                <SelectItem value="custom">{t('payroll.periodTypes.custom', { defaultValue: 'Data' })}</SelectItem>
                <SelectItem value="biweekly">{t('payroll.periodTypes.biweekly', { defaultValue: 'Quinzenal' })}</SelectItem>
                <SelectItem value="weekly">{t('payroll.periodTypes.weekly', { defaultValue: 'Semanal' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger>
                <SelectValue>
                  {monthFilter === 'all'
                    ? t('common.all')
                    : getLocalizedMonthLabel(
                        MONTH_OPTIONS.find((m) => m.value === monthFilter) ?? MONTH_OPTIONS[0],
                        i18n.language,
                      )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {getLocalizedMonthLabel(m, i18n.language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-28">
            <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
            <Input
              type="number"
              min={2020}
              max={2100}
              placeholder="2026"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
          </div>
          {hasFilters && (
            <Button type="button" variant="outline" onClick={resetFilters}>
              <X className="mr-1.5 h-4 w-4" />
              {t('employeesPage.clearFilters', { defaultValue: 'Limpar filtros' })}
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Não foi possível carregar os períodos." onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title={t('payroll.periodsPage.emptyTitle')}
          description={hasFilters ? t('payroll.periodsPage.noFilterMatches', { defaultValue: 'Nenhum período encontrado para os filtros aplicados.' }) : t('payroll.periodsPage.emptyDescription')}
          action={hasFilters ? <Button variant="outline" onClick={resetFilters}>{t('employeesPage.clearFilters', { defaultValue: 'Limpar filtros' })}</Button> : undefined}
        />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.period')}</th>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.type')}</th>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.range')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.employees')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.grossTotal')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.netTotal')}</th>
                    <th className="px-6 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.data.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium">{p.name}</td>
                      <td className="px-6 py-3 text-muted-foreground">{t(`payroll.periodTypes.${p.period_type}`)}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatDate(p.period_start, i18n.language)} – {formatDate(p.period_end, i18n.language)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[p.status]} variant="outline">
                          {t(`payroll.periodStatuses.${p.status}`, { defaultValue: statusLabel[p.status] ?? p.status })}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{p.employee_count ?? 0}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {p.total_gross != null ? currencyFormatter.format(p.total_gross) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        {p.total_net != null ? currencyFormatter.format(p.total_net) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(p.status === 'open' ||
                            p.status === 'failed' ||
                            p.status === 'processing' ||
                            p.status === 'completed' ||
                            p.status === 'pending_validation') &&
                            hasPermission(user, 'process_payroll') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('payroll.periodsPage.process')}
                              onClick={() => setProcessId(p.id)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(p.status === 'completed' || p.status === 'pending_validation') &&
                            hasPermission(user, 'process_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.submit')}
                                onClick={() => submitMutation.mutate(p.id)}
                                disabled={submitMutation.isPending}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'completed' || p.status === 'pending_approval') &&
                            hasPermission(user, 'approve_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.approve')}
                                onClick={() => approveMutation.mutate(p.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'completed' || p.status === 'approved') &&
                            hasPermission(user, 'close_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.close')}
                                onClick={() => closeMutation.mutate(p.id)}
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'approved' || p.status === 'closed') &&
                            hasPermission(user, 'close_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.registerPayment')}
                                onClick={() => payMutation.mutate(p.id)}
                                disabled={payMutation.isPending}
                              >
                                <Banknote className="h-4 w-4" />
                              </Button>
                            )}
                          {p.status === 'closed' && hasPermission(user, 'close_payroll') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('payroll.periodsPage.reopen')}
                              onClick={() => setReopenId(p.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" asChild title={t('payroll.periodsPage.viewDetails')}>
                            <Link to={`/payroll/${p.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ProcessPeriodDialog
        periodId={processId ?? 0}
        open={processId != null}
        onOpenChange={(open) => { if (!open) setProcessId(null) }}
        onFinished={() => invalidate()}
      />

      <ReopenPeriodDialog
        periodId={reopenId}
        onOpenChange={(open) => { if (!open) setReopenId(null) }}
        onConfirm={(reason) => {
          if (reopenId != null) reopenMutation.mutate({ id: reopenId, reason })
        }}
        isPending={reopenMutation.isPending}
      />
    </div>
  )
}

function ReopenPeriodDialog({
  periodId,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  periodId: number | null
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const open = periodId != null
  const valid = reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payroll.periodsPage.reopenTitle')}</DialogTitle>
          <DialogDescription>
            Esta acção cria uma nova versão do período. O resultado anterior é preservado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            {t('payroll.detail.dialogs.reopenWarning')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">{t('payroll.periodsPage.reasonRequired')}</Label>
            <Textarea
              id="reopen-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('payroll.periodsPage.reasonPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('payroll.periodsPage.cancel')}</Button>
          <Button
            disabled={!valid || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('payroll.periodsPage.confirmReopen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

function formatYmd(year: number, month1to12: number, day: number): string {
  return `${year}-${pad2(month1to12)}-${pad2(day)}`
}

function replaceYearInYmd(ymd: string, newYear: number): string {
  const parts = ymd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return formatYmd(newYear, 1, 1)
  }
  const [, month, day] = parts
  const maxDay = daysInMonth(newYear, month)
  return formatYmd(newYear, month, Math.min(day, maxDay))
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const parts = ymd.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd
  const [y, m, d] = parts
  const dt = new Date(y, m - 1, d + deltaDays)
  return formatYmd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function diffDaysInclusive(startYmd: string, endYmd: string): number | null {
  if (!startYmd || !endYmd) return null
  const sp = startYmd.split('-').map(Number)
  const ep = endYmd.split('-').map(Number)
  if (sp.length !== 3 || ep.length !== 3 || sp.some(Number.isNaN) || ep.some(Number.isNaN)) {
    return null
  }
  const startUtc = Date.UTC(sp[0], sp[1] - 1, sp[2])
  const endUtc = Date.UTC(ep[0], ep[1] - 1, ep[2])
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1
}

function getInitialPeriodDefaults() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const q = Math.floor((m - 1) / 3) + 1
  const lastD = daysInMonth(y, m)
  const todayYmd = formatYmd(y, m, now.getDate())
  return {
    yearStr: String(y),
    monthStr: pad2(m),
    quarterStr: String(q) as '1' | '2' | '3' | '4',
    monthStart: formatYmd(y, m, 1),
    monthEnd: formatYmd(y, m, lastD),
    todayYmd,
  }
}

function CreatePeriodDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()

  const [periodType, setPeriodType] = useState<PeriodTypeOption>('monthly')
  const [month, setMonth] = useState(() => getInitialPeriodDefaults().monthStr)
  const [quarter, setQuarter] = useState<'1' | '2' | '3' | '4'>(() => getInitialPeriodDefaults().quarterStr)
  const [yearText, setYearText] = useState(() => getInitialPeriodDefaults().yearStr)
  const [customStart, setCustomStart] = useState(() => getInitialPeriodDefaults().monthStart)
  const [customEnd, setCustomEnd] = useState(() => getInitialPeriodDefaults().monthEnd)
  const [rangeStart, setRangeStart] = useState(() => getInitialPeriodDefaults().todayYmd)
  const [rangeEnd, setRangeEnd] = useState(() => addDaysYmd(getInitialPeriodDefaults().todayYmd, 14))
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      const fresh = getInitialPeriodDefaults()
      setPeriodType('monthly')
      setMonth(fresh.monthStr)
      setQuarter(fresh.quarterStr)
      setYearText(fresh.yearStr)
      setCustomStart(fresh.monthStart)
      setCustomEnd(fresh.monthEnd)
      setRangeStart(fresh.todayYmd)
      setRangeEnd(addDaysYmd(fresh.todayYmd, 14))
      setValidationError(null)
    }
    onOpenChange(nextOpen)
  }

  const parsedYear = /^\d{4}$/.test(yearText.trim()) ? Number(yearText.trim()) : NaN
  const isYearValid = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100

  const selectedQuarterMeta = QUARTER_OPTIONS.find((q) => q.value === quarter) ?? QUARTER_OPTIONS[0]
  const quarterlyStart = isYearValid ? formatYmd(parsedYear, selectedQuarterMeta.startMonth, 1) : ''
  const quarterlyEnd = isYearValid
    ? formatYmd(parsedYear, selectedQuarterMeta.endMonth, daysInMonth(parsedYear, selectedQuarterMeta.endMonth))
    : ''
  const quarterlyDays = quarterlyStart && quarterlyEnd ? diffDaysInclusive(quarterlyStart, quarterlyEnd) : null

  const customDays = diffDaysInclusive(customStart, customEnd)
  const rangeDays = diffDaysInclusive(rangeStart, rangeEnd)

  const getMonthLabel = (m: (typeof MONTH_OPTIONS)[number]) => getLocalizedMonthLabel(m, i18n.language)

  const getQuarterLabel = (q: (typeof QUARTER_OPTIONS)[number]) => getLocalizedQuarterLabel(q, i18n.language)

  const selectedMonthOption = MONTH_OPTIONS.find((m) => m.value === month) ?? MONTH_OPTIONS[0]

  const handleSelectPeriodType = (nextType: PeriodTypeOption) => {
    setPeriodType(nextType)
    setValidationError(null)
    const fallbackYear = Number(getInitialPeriodDefaults().yearStr)
    const targetYear = isYearValid ? parsedYear : fallbackYear
    if (nextType === 'biweekly') {
      const base = rangeStart ? replaceYearInYmd(rangeStart, targetYear) : getInitialPeriodDefaults().todayYmd
      setRangeStart(base)
      setRangeEnd(addDaysYmd(base, 14))
    } else if (nextType === 'weekly') {
      const base = rangeStart ? replaceYearInYmd(rangeStart, targetYear) : getInitialPeriodDefaults().todayYmd
      setRangeStart(base)
      setRangeEnd(addDaysYmd(base, 6))
    }
  }

  const handleYearChange = (value: string) => {
    setYearText(value)
    setValidationError(null)
    if (/^\d{4}$/.test(value.trim())) {
      const yr = Number(value.trim())
      if (yr >= 2000 && yr <= 2100) {
        if (periodType === 'custom') {
          setCustomStart((prev) => replaceYearInYmd(prev, yr))
          setCustomEnd((prev) => replaceYearInYmd(prev, yr))
        } else if (periodType === 'biweekly' || periodType === 'weekly') {
          const offset = periodType === 'weekly' ? 6 : 14
          const nextStart = replaceYearInYmd(rangeStart, yr)
          setRangeStart(nextStart)
          setRangeEnd(addDaysYmd(nextStart, offset))
        }
      }
    }
  }

  const handleCustomStartChange = (nextStart: string) => {
    setCustomStart(nextStart)
    setValidationError(null)
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextStart)) {
      const startYear = nextStart.slice(0, 4)
      setYearText(startYear)
      if (!customEnd || customEnd < nextStart) {
        setCustomEnd(nextStart)
      }
    }
  }

  const handleRangeStartChange = (nextStart: string) => {
    setRangeStart(nextStart)
    setValidationError(null)
    if (/^\d{4}-\d{2}-\d{2}$/.test(nextStart)) {
      const offset = periodType === 'weekly' ? 6 : 14
      setRangeEnd(addDaysYmd(nextStart, offset))
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: {
      period_type: PeriodTypeOption
      period_start: string
      period_end: string
      year?: number
    }) => api.post('payroll/periods', payload),
    onSuccess: () => {
      toast.success(t('payroll.periodsPage.createdSuccess', { defaultValue: 'Período criado com sucesso' }))
      onOpenChange(false)
      onDone()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao criar período')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    if (periodType === 'monthly') {
      if (!isYearValid) {
        setValidationError(t('payroll.periodsPage.invalidYear', { defaultValue: 'Informe um ano válido entre 2000 e 2100.' }))
        return
      }
      const mNum = Number(month)
      const period_start = formatYmd(parsedYear, mNum, 1)
      const period_end = formatYmd(parsedYear, mNum, daysInMonth(parsedYear, mNum))
      mutation.mutate({ period_type: 'monthly', period_start, period_end })
      return
    }

    if (periodType === 'quarterly') {
      if (!isYearValid) {
        setValidationError(t('payroll.periodsPage.invalidYear', { defaultValue: 'Informe um ano válido entre 2000 e 2100.' }))
        return
      }
      mutation.mutate({
        period_type: 'quarterly',
        period_start: quarterlyStart,
        period_end: quarterlyEnd,
        year: parsedYear,
      })
      return
    }

    if (periodType === 'custom') {
      if (!isYearValid) {
        setValidationError(t('payroll.periodsPage.invalidYear', { defaultValue: 'Informe um ano válido entre 2000 e 2100.' }))
        return
      }
      if (!customStart || !customEnd || customDays === null || customDays < 1) {
        setValidationError(
          t('payroll.periodsPage.invalidDateRange', {
            defaultValue: 'A data de fim deve ser igual ou posterior à data de início.',
          }),
        )
        return
      }
      if (customDays > 366) {
        setValidationError(
          t('payroll.periodsPage.maxDaysExceeded', {
            days: customDays,
            max: 366,
            defaultValue: `O intervalo selecionado (${customDays} dias) excede o limite de 366 dias.`,
          }),
        )
        return
      }
      mutation.mutate({
        period_type: 'custom',
        period_start: customStart,
        period_end: customEnd,
        year: parsedYear,
      })
      return
    }

    if (!isYearValid) {
      setValidationError(t('payroll.periodsPage.invalidYear', { defaultValue: 'Informe um ano válido entre 2000 e 2100.' }))
      return
    }

    const maxDays = periodType === 'weekly' ? 7 : 16
    if (!rangeStart || !rangeEnd || rangeDays === null || rangeDays < 1) {
      setValidationError(
        t('payroll.periodsPage.invalidDateRange', {
          defaultValue: 'A data de fim deve ser igual ou posterior à data de início.',
        }),
      )
      return
    }
    if (rangeDays > maxDays) {
      setValidationError(
        t('payroll.periodsPage.maxDaysExceeded', {
          days: rangeDays,
          max: maxDays,
          defaultValue: `O intervalo selecionado (${rangeDays} dias) excede o limite de ${maxDays} dias.`,
        }),
      )
      return
    }
    mutation.mutate({
      period_type: periodType,
      period_start: rangeStart,
      period_end: rangeEnd,
      year: parsedYear,
    })
  }

  const typeTabs: Array<{
    key: PeriodTypeOption
    label: string
    icon: typeof Calendar
  }> = [
    { key: 'monthly', label: t('payroll.periodTypes.monthly', { defaultValue: 'Mensal' }), icon: Calendar },
    { key: 'quarterly', label: t('payroll.periodTypes.quarterly', { defaultValue: 'Trimestral' }), icon: CalendarRange },
    { key: 'custom', label: t('payroll.periodTypes.custom', { defaultValue: 'Data' }), icon: CalendarDays },
    { key: 'biweekly', label: t('payroll.periodTypes.biweekly', { defaultValue: 'Quinzenal' }), icon: Clock },
    { key: 'weekly', label: t('payroll.periodTypes.weekly', { defaultValue: 'Semanal' }), icon: Clock },
  ]

  const activeCalendarYear = isYearValid ? parsedYear : Number(getInitialPeriodDefaults().yearStr)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> {t('payroll.newPeriod')}
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[580px]">
        <div className="border-b border-border/70 bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 py-5">
          <DialogHeader className="gap-1.5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20 shadow-xs">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {t('payroll.newPeriod')}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {t('payroll.periodsPage.newPeriodDescription')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 px-6 py-5">
            {/* Period Type Switcher */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('payroll.periodsPage.periodType')}
              </Label>
              <div
                role="radiogroup"
                aria-label={t('payroll.periodsPage.periodType')}
                className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/60 bg-muted/50 p-1.5 sm:grid-cols-5"
              >
                {typeTabs.map((item) => {
                  const Icon = item.icon
                  const active = periodType === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleSelectPeriodType(item.key)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-background text-primary shadow-sm ring-1 ring-border/80 font-semibold'
                          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Monthly: only Month select + Year input side-by-side */}
            {periodType === 'monthly' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_132px]">
                <div className="space-y-1.5">
                  <Label htmlFor="period-month">{t('payroll.periodsPage.month', { defaultValue: 'Mês' })}</Label>
                  <Select value={month} onValueChange={(v) => { setMonth(v); setValidationError(null) }}>
                    <SelectTrigger id="period-month" className="h-10 bg-background">
                      <SelectValue>{getMonthLabel(selectedMonthOption)}</SelectValue>
                    </SelectTrigger>
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
                  <Label htmlFor="period-year">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                  <Input
                    id="period-year"
                    type="number"
                    min={2000}
                    max={2100}
                    className="h-10 bg-background font-mono"
                    value={yearText}
                    onChange={(e) => handleYearChange(e.target.value)}
                    placeholder="2026"
                  />
                </div>
              </div>
            )}

            {/* Quarterly: Quarter select + Year input side-by-side + computed range preview */}
            {periodType === 'quarterly' && (
              <div className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_132px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="period-quarter">{t('payroll.periodsPage.quarter', { defaultValue: 'Trimestre' })}</Label>
                    <Select
                      value={quarter}
                      onValueChange={(v) => {
                        setQuarter(v as '1' | '2' | '3' | '4')
                        setValidationError(null)
                      }}
                    >
                      <SelectTrigger id="period-quarter" className="h-10 bg-background">
                        <SelectValue>{getQuarterLabel(selectedQuarterMeta)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {QUARTER_OPTIONS.map((q) => (
                          <SelectItem key={q.value} value={q.value}>
                            {getQuarterLabel(q)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-quarterly-year">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                    <Input
                      id="period-quarterly-year"
                      type="number"
                      min={2000}
                      max={2100}
                      className="h-10 bg-background font-mono"
                      value={yearText}
                      onChange={(e) => handleYearChange(e.target.value)}
                      placeholder="2026"
                    />
                  </div>
                </div>

                {isYearValid && quarterlyStart && quarterlyEnd && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs">
                    <div className="flex items-center gap-2 text-foreground">
                      <CalendarRange className="h-4 w-4 text-primary" />
                      <span className="font-medium">
                        {formatDayMonthLong(quarterlyStart, i18n.language, activeCalendarYear)} –{' '}
                        {formatDayMonthLong(quarterlyEnd, i18n.language, activeCalendarYear)}
                      </span>
                    </div>
                    {quarterlyDays != null && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {t('payroll.periodsPage.daysCount', { count: quarterlyDays, defaultValue: `${quarterlyDays} dias` })}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Custom Date ("Data"): Year + Start date + End date */}
            {periodType === 'custom' && (
              <div className="space-y-3.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[104px_1fr_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="period-custom-year">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                    <Input
                      id="period-custom-year"
                      type="number"
                      min={2000}
                      max={2100}
                      className="h-10 bg-background font-mono"
                      value={yearText}
                      onChange={(e) => handleYearChange(e.target.value)}
                      placeholder="2026"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-custom-start">{t('payroll.periodsPage.start')}</Label>
                    <CalendarDateField
                      id="period-custom-start"
                      value={customStart}
                      onChange={handleCustomStartChange}
                      year={activeCalendarYear}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-custom-end">{t('payroll.periodsPage.end')}</Label>
                    <CalendarDateField
                      id="period-custom-end"
                      value={customEnd}
                      onChange={(val) => {
                        setCustomEnd(val)
                        setValidationError(null)
                      }}
                      year={activeCalendarYear}
                      minDate={customStart || undefined}
                    />
                  </div>
                </div>

                {customDays != null && customDays > 0 && (
                  <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                    <span>
                      {formatDayMonthLong(customStart, i18n.language, activeCalendarYear)} –{' '}
                      {formatDayMonthLong(customEnd, i18n.language, activeCalendarYear)}
                    </span>
                    <Badge variant="outline" className="bg-background font-mono text-[11px]">
                      {t('payroll.periodsPage.daysCount', { count: customDays, defaultValue: `${customDays} dias` })}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Biweekly / Weekly: follows the same pattern (Year + Start + End without redundant year in date fields) */}
            {(periodType === 'biweekly' || periodType === 'weekly') && (
              <div className="space-y-3.5 rounded-xl border border-border/70 bg-muted/20 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[104px_1fr_1fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor="period-range-year">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                    <Input
                      id="period-range-year"
                      type="number"
                      min={2000}
                      max={2100}
                      className="h-10 bg-background font-mono"
                      value={yearText}
                      onChange={(e) => handleYearChange(e.target.value)}
                      placeholder="2026"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-range-start">{t('payroll.periodsPage.start')}</Label>
                    <CalendarDateField
                      id="period-range-start"
                      value={rangeStart}
                      onChange={handleRangeStartChange}
                      year={activeCalendarYear}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-range-end">{t('payroll.periodsPage.end')}</Label>
                    <CalendarDateField
                      id="period-range-end"
                      value={rangeEnd}
                      onChange={(val) => {
                        setRangeEnd(val)
                        setValidationError(null)
                      }}
                      year={activeCalendarYear}
                      minDate={rangeStart || undefined}
                      allowNextYearOverflow
                    />
                  </div>
                </div>
                {rangeDays != null && rangeDays > 0 && (
                  <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                    <span>
                      {formatDayMonthLong(rangeStart, i18n.language, activeCalendarYear)} –{' '}
                      {formatDayMonthLong(rangeEnd, i18n.language, activeCalendarYear)}
                    </span>
                    <Badge variant="outline" className="bg-background font-mono text-[11px]">
                      {t('payroll.periodsPage.daysCount', { count: rangeDays, defaultValue: `${rangeDays} dias` })}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {validationError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {validationError}
              </p>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
            {periodType !== 'monthly' && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('payroll.periodsPage.cancel')}
              </Button>
            )}
            <Button type="submit" disabled={mutation.isPending} className="min-w-28">
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {t('payroll.periodsPage.save', { defaultValue: 'Salvar' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' }
  const parts = date.slice(0, 10).split('-').map(Number)
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return new Intl.DateTimeFormat(locale, options).format(new Date(parts[0], parts[1] - 1, parts[2]))
  }
  return new Intl.DateTimeFormat(locale, options).format(new Date(date))
}

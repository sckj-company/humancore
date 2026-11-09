import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, Play, CheckCircle2, Lock, FileDown, Users,
  TrendingUp, Wallet, Building2, AlertTriangle, AlertCircle, Info,
  Loader2, Clock, Calendar, FileText, BarChart3, XCircle, Send,
  Banknote, RotateCcw, History, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import { ProcessPeriodDialog } from '@/features/payroll/process-period-dialog'
import type {
  PayrollPeriod,
  PayrollPeriodEvent,
  PayrollRecord,
  PayrollValidationReport,
} from '@/types'

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCurrency = (n?: number | null) => (n != null ? fmt.format(n) : '—')

function formatDate(date?: string | null, locale = 'pt-AO'): string {
  if (!date) return '—'
  const raw = String(date).trim().split('T')[0]
  const [y, m, d] = raw.split('-').map(Number)
  if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      new Date(y, m - 1, d),
    )
  }
  return date
}

function getPayrollComponent(record: PayrollRecord, code: string): { amount: number; rate: number | null } | null {
  const item = record.items?.find((entry) => entry.code === code)
  if (item) {
    return { amount: Math.abs(Number(item.amount)), rate: item.rate == null ? null : Number(item.rate) }
  }

  const legacyItem = record.details?.breakdown?.find((entry) => entry.code === code)
  if (legacyItem) return { amount: Math.abs(Number(legacyItem.amount)), rate: null }

  return null
}

function formatRate(rate: number | null): string | null {
  return rate == null || !Number.isFinite(rate)
    ? null
    : `${new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(rate)}%`
}

function formatSignedAmount(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const abs = Math.abs(amount)
  return `${amount < 0 ? '-' : ''}${fmtCurrency(abs)}`
}

// ─── Status config ──────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string }> = {
  open:               { label: 'Aberto',              color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  processing:         { label: 'A Processar',         color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  completed:          { label: 'Calculado',           color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
  failed:             { label: 'Com Erros',           color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  pending_validation: { label: 'Pendente Validação',  color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' },
  pending_approval:   { label: 'Pendente Aprovação',  color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  approved:           { label: 'Aprovado',            color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  paid:               { label: 'Pago',                color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  closed:             { label: 'Fechado',             color: 'bg-muted text-muted-foreground border-border' },
  cancelled:          { label: 'Cancelado',           color: 'bg-red-500/10 text-red-600 border-red-500/20' },
}

const eventLabel: Record<string, string> = {
  simulated:   'Simulado',
  processed:   'Processado',
  validated:   'Validado',
  submitted:   'Submetido',
  approved:    'Aprovado',
  rejected:    'Rejeitado',
  closed:      'Fechado',
  reopened:    'Reaberto',
  paid:        'Pago',
}

const eventColor: Record<string, string> = {
  simulated: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  processed: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  validated: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  submitted: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  approved:  'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected:  'bg-red-500/10 text-red-600 border-red-500/20',
  closed:    'bg-muted text-muted-foreground border-border',
  reopened:  'bg-amber-500/10 text-amber-600 border-amber-500/20',
  paid:      'bg-green-500/10 text-green-600 border-green-500/20',
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  earning:              { label: 'Vencimento',        color: 'text-emerald-600' },
  deduction:            { label: 'Desconto',          color: 'text-red-600' },
  tax:                  { label: 'Imposto',           color: 'text-orange-600' },
  employer_contribution:{ label: 'Encargo Patronal',  color: 'text-blue-600' },
  employer_cost:        { label: 'Custo Total',       color: 'text-indigo-600' },
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'summary'
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language || 'pt-AO'

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [warningsAck, setWarningsAck] = useState(false)
  const [processOpen, setProcessOpen] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-period', id],
    queryFn: () => api.get<PayrollPeriod>(`payroll/periods/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 800 : false),
  })

  const statusNow = data?.status
  const needsValidation =
    statusNow === 'open' ||
    statusNow === 'failed' ||
    statusNow === 'processing' ||
    statusNow === 'completed' ||
    statusNow === 'pending_validation'

  const { data: validationReport } = useQuery({
    queryKey: ['payroll-period-validations', id],
    queryFn: () => api.get<PayrollValidationReport>(`payroll/periods/${id}/validations`),
    enabled: !!id && needsValidation,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll-period', id] })
    qc.invalidateQueries({ queryKey: ['payroll-periods'] })
    qc.invalidateQueries({ queryKey: ['payroll-period-validations', id] })
  }

  const openProcess = () => setProcessOpen(true)

  const submitMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/submit`),
    onSuccess: () => {
      toast.success('Período submetido para aprovação')
      setWarningsAck(false)
      invalidate()
      setSearchParams({ tab: 'validations' }, { replace: true })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao submeter')),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/approve`),
    onSuccess: () => {
      toast.success('Folha aprovada com sucesso')
      setApproveOpen(false)
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao aprovar')),
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.post(`payroll/periods/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Folha rejeitada; devolvida para correções')
      setRejectOpen(false)
      setRejectReason('')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao rejeitar')),
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/close`),
    onSuccess: () => { toast.success('Período fechado'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao fechar')),
  })

  const reopenMutation = useMutation({
    mutationFn: (reason: string) => api.post(`payroll/periods/${id}/reopen`, { reason }),
    onSuccess: () => {
      toast.success('Período reaberto para recálculo')
      setReopenOpen(false)
      setReopenReason('')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao reabrir')),
  })

  const payMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/pay`),
    onSuccess: () => { toast.success('Pagamento registado'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar pagamento')),
  })

  const downloadPayslip = async (recordId: number, filename: string) => {
    const tid = toast.loading(t('payroll.detail.payslipGenerating'))
    try {
      await api.downloadFile(`payroll/records/${recordId}/payslip.pdf`, filename)
      toast.success(t('payslips.downloaded'), { id: tid })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('payslips.downloadError')), { id: tid })
    }
  }

  const downloadPeriodPayroll = async (filename: string) => {
    const tid = toast.loading(t('payroll.detail.periodPdfGenerating'))
    try {
      await api.downloadFile(`payroll/periods/${id}/payslip.pdf`, filename)
      toast.success(t('payroll.detail.periodPdfDownloaded'), { id: tid })
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('payroll.detail.periodPdfError')), { id: tid })
    }
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message="Não foi possível carregar o período." onRetry={refetch} />
  if (!data) return null

  const records = data.records ?? []
  const status = statusConfig[data.status] ?? { label: data.status, color: 'bg-muted text-muted-foreground' }

  const blockingCount = validationReport?.blocking_count ?? 0
  const warningCount = validationReport?.warning_count ?? 0
  const canSubmit =
    (data.status === 'completed' || data.status === 'pending_validation') &&
    hasPermission(user, 'process_payroll') &&
    blockingCount === 0 &&
    (warningCount === 0 || warningsAck)
  const submitDisabledReason =
    blockingCount > 0
      ? `Existem ${blockingCount} erro(s) impeditivo(s). Corrija antes de submeter.`
      : warningCount > 0 && !warningsAck
        ? 'Confirme que reviu os avisos antes de submeter.'
        : undefined

  // KPI calculations
  const totalGross = data.total_gross ?? records.reduce((s, r) => s + (r.gross_salary ?? 0), 0)
  const totalNet = data.total_net ?? records.reduce((s, r) => s + (r.net_salary ?? 0), 0)
  const totalEmployerCost = data.totals_snapshot?.total_employer_cost
    ?? records.reduce((s, r) => s + (r.employer_cost ?? r.gross_salary ?? 0), 0)
  const employeeCount = data.employee_count ?? records.length

  // Validations
  const recordsWithErrors = records.filter(
    (r) => r.validation_errors && r.validation_errors.length > 0,
  )
  const blockingErrors = recordsWithErrors.filter((r) =>
    r.validation_errors?.some((e) => e.severity === 'error' || e.severity === 'blocking'),
  )
  const warnings = recordsWithErrors.filter((r) =>
    r.validation_errors?.every((e) => e.severity !== 'error' && e.severity !== 'blocking'),
  )

  const selectedRecord = selectedEmployeeId
    ? records.find((r) => r.employee_id === selectedEmployeeId)
    : records[0] ?? null

  const events = data.events ?? []

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/payroll"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Link to="/payroll" className="hover:text-foreground transition-colors">{t('payroll.detail.breadcrumb')}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-semibold">{data.name}</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/payroll"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />{t('payroll.detail.back')}</Link>
        </Button>
      </div>

      {/* Hero Card */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className="rounded-xl bg-primary/10 p-3.5 text-primary shrink-0">
                <FileText className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{data.name}</h1>
                  <Badge variant="outline" className={`font-medium ${status.color}`}>
                    {t(`payroll.periodStatuses.${data.status}`, { defaultValue: status.label })}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(data.period_start, locale)} – {formatDate(data.period_end, locale)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {t(`payroll.periodTypes.${data.period_type}`)}
                  </span>
                  {data.payment_date && (
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      {t('payroll.detail.paymentDate')} {formatDate(data.payment_date, locale)}
                    </span>
                  )}
                </p>
                {data.approved_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('payroll.detail.approvedAt')} {formatDate(data.approved_at, locale)}
                  </p>
                )}
              </div>
            </div>
            {/* Contextual Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {(data.status === 'open' ||
                data.status === 'failed' ||
                data.status === 'processing' ||
                data.status === 'completed' ||
                data.status === 'pending_validation') &&
                hasPermission(user, 'process_payroll') && (
                <Button size="sm" onClick={openProcess}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {t('payroll.detail.process')}
                </Button>
              )}
              {data.status === 'processing' && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs text-amber-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {data.progress_message ?? t('payroll.detail.processing')}
                  {data.progress_total != null && (
                    <span className="font-mono">
                      ({data.progress_done ?? 0}/{data.progress_total})
                    </span>
                  )}
                </div>
              )}
              {(data.status === 'completed' || data.status === 'pending_validation') && hasPermission(user, 'process_payroll') && (
                <Button
                  size="sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={!canSubmit || submitMutation.isPending}
                  title={submitDisabledReason}
                >
                  {submitMutation.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  {t('payroll.detail.submit')}
                </Button>
              )}
              {(data.status === 'completed' || data.status === 'pending_approval') && hasPermission(user, 'approve_payroll') && (
                <>
                  <Button
                    size="sm"
                    onClick={() => setApproveOpen(true)}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending
                      ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    {t('payroll.detail.approve')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectOpen(true)}
                    disabled={rejectMutation.isPending}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    {t('payroll.detail.reject')}
                  </Button>
                </>
              )}
              {(data.status === 'completed' || data.status === 'approved') && hasPermission(user, 'close_payroll') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                >
                  {closeMutation.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Lock className="mr-1.5 h-3.5 w-3.5" />}
                  {t('payroll.detail.close')}
                </Button>
              )}
              {(data.status === 'approved' || data.status === 'closed') && hasPermission(user, 'close_payroll') && (
                <Button
                  size="sm"
                  onClick={() => payMutation.mutate()}
                  disabled={payMutation.isPending}
                >
                  {payMutation.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Banknote className="mr-1.5 h-3.5 w-3.5" />}
                  {t('payroll.detail.registerPayment')}
                </Button>
              )}
              {data.status === 'closed' && hasPermission(user, 'close_payroll') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReopenOpen(true)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t('payroll.detail.reopen')}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5" />}
          iconBg="bg-blue-500/10 text-blue-600"
          label={t('payroll.detail.employees')}
          value={String(employeeCount)}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="bg-emerald-500/10 text-emerald-600"
          label={t('payroll.detail.grossTotal')}
          value={fmtCurrency(totalGross)}
          sub="AOA"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          iconBg="bg-primary/10 text-primary"
          label={t('payroll.detail.netTotal')}
          value={fmtCurrency(totalNet)}
          sub="AOA"
        />
        <KpiCard
          icon={<Building2 className="h-5 w-5" />}
          iconBg="bg-amber-500/10 text-amber-600"
          label={t('payroll.detail.employerCost')}
          value={fmtCurrency(totalEmployerCost)}
          sub="AOA"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(tab) => setSearchParams({ tab }, { replace: true })} className="w-full">
        <TabsList className="w-full flex-wrap justify-start h-auto gap-1 p-1.5 bg-muted/60 border border-border/60 rounded-lg">
          <TabsTrigger value="summary" className="gap-1.5 px-3 py-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />{t('payroll.detail.summaryTab')}
          </TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5 px-3 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />{t('payroll.detail.employeeDetailTab')}
          </TabsTrigger>
          <TabsTrigger value="validations" className="gap-1.5 px-3 py-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('payroll.detail.validationsTab')}
            {(recordsWithErrors.length > 0 || blockingCount > 0) && (
              <Badge variant="destructive" className="ml-0.5 text-[10px] h-4 px-1 font-semibold">
                {Math.max(recordsWithErrors.length, blockingCount)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 px-3 py-1.5 text-xs">
            <History className="h-3.5 w-3.5" />{t('payroll.detail.historyTab')}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Resumo ── */}
        <TabsContent value="summary" className="mt-4">
          <SummaryTab
            records={records}
            periodStatus={data.status}
            periodId={data.id}
            onDownloadPeriod={downloadPeriodPayroll}
            onDownloadPayslip={downloadPayslip}
          />
        </TabsContent>

        {/* ── Tab: Detalhe por Funcionário ── */}
        <TabsContent value="detail" className="mt-4">
          <EmployeeDetailTab
            records={records}
            selectedEmployeeId={selectedEmployeeId ?? selectedRecord?.employee_id ?? null}
            onSelectEmployee={setSelectedEmployeeId}
          />
        </TabsContent>

        {/* ── Tab: Validações ── */}
        <TabsContent value="validations" className="mt-4">
          <ValidationsTab
            report={validationReport}
            blockingErrors={blockingErrors}
            warnings={warnings}
            allClean={recordsWithErrors.length === 0 && (!validationReport || (validationReport.blocking_count === 0 && validationReport.warning_count === 0))}
            warningsAck={warningsAck}
            onWarningsAckChange={setWarningsAck}
            canSubmit={canSubmit}
            submitDisabledReason={submitDisabledReason}
            isSubmitting={submitMutation.isPending}
            onSubmit={() => submitMutation.mutate()}
            showSubmit={
              (data.status === 'completed' || data.status === 'pending_validation') &&
              hasPermission(user, 'process_payroll')
            }
          />
        </TabsContent>

        {/* ── Tab: Histórico ── */}
        <TabsContent value="history" className="mt-4">
          <HistoryTab events={events} locale={locale} />
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Processamento ── */}
      <ProcessPeriodDialog
        periodId={Number(id)}
        open={processOpen}
        onOpenChange={setProcessOpen}
        onFinished={() => invalidate()}
      />

      {/* ── Dialog: Aprovação ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payroll.detail.dialogs.approveTitle')}</DialogTitle>
            <DialogDescription>
              {t('payroll.detail.dialogs.approveDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.grossTotal')}</p>
                <p className="text-sm font-semibold font-mono">{fmtCurrency(totalGross)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.netTotal')}</p>
                <p className="text-sm font-semibold font-mono">{fmtCurrency(totalNet)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.employerCost')}</p>
                <p className="text-sm font-semibold font-mono">{fmtCurrency(totalEmployerCost)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.employees')}</p>
                <p className="text-sm font-semibold font-mono">{employeeCount}</p>
              </div>
            </div>
            {data.rejection_reason && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                <strong>{t('payroll.detail.dialogs.previousRejection')}</strong> {data.rejection_reason}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>{t('payroll.detail.dialogs.cancel')}</Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('payroll.detail.dialogs.approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Rejeição ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payroll.detail.dialogs.rejectTitle')}</DialogTitle>
            <DialogDescription>
              {t('payroll.detail.dialogs.rejectDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">{t('payroll.detail.dialogs.reasonRequired')}</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('payroll.detail.dialogs.rejectPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>{t('payroll.detail.dialogs.cancel')}</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length === 0 || rejectMutation.isPending}
              onClick={() => rejectMutation.mutate(rejectReason.trim())}
            >
              {rejectMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('payroll.detail.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Reabertura ── */}
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payroll.detail.dialogs.reopenTitle')}</DialogTitle>
            <DialogDescription>
              {t('payroll.detail.dialogs.reopenDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
              {t('payroll.detail.dialogs.reopenWarning')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="detail-reopen-reason">{t('payroll.detail.dialogs.reasonRequired')}</Label>
              <Textarea
                id="detail-reopen-reason"
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t('payroll.periodsPage.reasonPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>{t('payroll.detail.dialogs.cancel')}</Button>
            <Button
              disabled={reopenReason.trim().length === 0 || reopenMutation.isPending}
              onClick={() => reopenMutation.mutate(reopenReason.trim())}
            >
              {reopenMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t('payroll.detail.reopen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`rounded-lg p-2.5 ${iconBg} shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-semibold truncate text-foreground font-mono">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  )
}

// ─── Tab: Resumo ─────────────────────────────────────────────────────────────

function SummaryTab({
  records,
  periodStatus,
  periodId,
  onDownloadPeriod,
  onDownloadPayslip,
}: {
  records: PayrollRecord[]
  periodStatus: string
  periodId: number
  onDownloadPeriod: (filename: string) => void
  onDownloadPayslip: (id: number, filename: string) => void
}) {
  const { t } = useTranslation()
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">{t('payroll.detail.noRecords')}</p>
          <p className="text-sm text-muted-foreground/70 mt-1">{t('payroll.detail.processToGenerate')}</p>
        </CardContent>
      </Card>
    )
  }

  const totalsGross = records.reduce((s, r) => s + (r.gross_salary ?? 0), 0)
  const totalsNet = records.reduce((s, r) => s + (r.net_salary ?? 0), 0)
  const totalsInss = records.reduce((sum, record) => sum + (getPayrollComponent(record, 'inss')?.amount ?? 0), 0)
  const totalsEmployerInss = records.reduce(
    (sum, record) => sum + (getPayrollComponent(record, 'employer_inss')?.amount ?? Number(record.employer_inss ?? 0)),
    0,
  )
  const totalsIrt = records.reduce((sum, record) => sum + (getPayrollComponent(record, 'irt')?.amount ?? Math.abs(record.total_taxes ?? 0)), 0)
  const totalsOtherDeductions = records.reduce((sum, record) => {
    const inssAmount = getPayrollComponent(record, 'inss')?.amount ?? 0
    return sum + Math.max(0, (record.total_deductions ?? 0) - inssAmount)
  }, 0)
  const totalsCost = records.reduce((s, r) => s + (r.employer_cost ?? r.gross_salary ?? 0), 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <p className="text-sm font-semibold text-foreground">{t('payroll.detail.summaryTab')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDownloadPeriod(`folha-salarial-${periodId}.pdf`)}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              {t('payroll.detail.downloadPeriodPdf')}
            </Button>
          </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">{t('payroll.detail.employee')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.base')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.gross')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.inss')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.irt')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.otherDeductions')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.net')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.employerCost')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.status')}</th>
                <th className="px-5 py-3 font-medium text-right">{t('payroll.detail.payslip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {records.map((r) => {
                const inssAmount = getPayrollComponent(r, 'inss')?.amount ?? null
                const irtAmount = getPayrollComponent(r, 'irt')?.amount ?? Math.abs(r.total_taxes ?? 0)
                const otherDeductions = Math.max(0, (r.total_deductions ?? 0) - (inssAmount ?? 0))
                const hasErrors = r.validation_errors && r.validation_errors.length > 0
                return (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium">{r.employee?.full_name ?? `#${r.employee_id}`}</p>
                        <p className="text-xs text-muted-foreground font-mono">{r.employee?.employee_code}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-muted-foreground">{fmtCurrency(r.base_salary)}</td>
                    <td className="px-5 py-3 text-right font-mono font-medium">{fmtCurrency(r.gross_salary)}</td>
                    <td className="px-5 py-3 text-right font-mono text-orange-600">
                      {inssAmount != null ? formatSignedAmount(-inssAmount) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-orange-600">
                      {formatSignedAmount(-irtAmount)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-destructive">
                      {otherDeductions > 0 ? formatSignedAmount(-otherDeductions) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700">{fmtCurrency(r.net_salary)}</td>
                    <td className="px-5 py-3 text-right font-mono text-blue-700">
                      {r.employer_cost != null ? fmtCurrency(r.employer_cost) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                        <Badge variant="outline" className="capitalize text-xs">
                          {t(`payroll.recordStatuses.${r.status}`, { defaultValue: r.status })}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {(periodStatus === 'approved' || periodStatus === 'paid' || periodStatus === 'closed') && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t('payroll.detail.downloadPayslip')}
                          onClick={() => onDownloadPayslip(r.id, `recibo-${r.employee?.employee_code ?? r.id}.pdf`)}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Footer totals */}
            <tfoot className="border-t-2 border-border bg-muted/40 text-sm font-semibold">
              <tr>
                <td className="px-5 py-3 text-muted-foreground uppercase text-xs">{t('payroll.detail.totals')}</td>
                <td className="px-5 py-3 text-right font-mono">—</td>
                <td className="px-5 py-3 text-right font-mono">{fmtCurrency(totalsGross)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-600">{fmtCurrency(totalsInss)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-600">{fmtCurrency(totalsIrt)}</td>
                <td className="px-5 py-3 text-right font-mono text-destructive">{fmtCurrency(totalsOtherDeductions)}</td>
                <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmtCurrency(totalsNet)}</td>
                <td className="px-5 py-3 text-right font-mono text-blue-700">{fmtCurrency(totalsCost)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <InssTotalCard label={t('payroll.detail.inssEmployeeTotal')} value={totalsInss} />
        <InssTotalCard label={t('payroll.detail.inssEmployerTotal')} value={totalsEmployerInss} />
        <InssTotalCard label={t('payroll.detail.inssCombinedTotal')} value={totalsInss + totalsEmployerInss} />
      </div>
    </div>
  )
}

function InssTotalCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-lg font-semibold text-foreground">{fmtCurrency(value)} AOA</p>
      </CardContent>
    </Card>
  )
}

// ─── Tab: Detalhe por Funcionário ────────────────────────────────────────────

function EmployeeDetailTab({
  records,
  selectedEmployeeId,
  onSelectEmployee,
}: {
  records: PayrollRecord[]
  selectedEmployeeId: number | null
  onSelectEmployee: (id: number) => void
}) {
  const { t } = useTranslation()
  const record = records.find((r) => r.employee_id === selectedEmployeeId) ?? records[0] ?? null

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">{t('payroll.detail.noEmployeeRecord')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Employee selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground shrink-0">{t('payroll.detail.employeeSelector')}</span>
            <div className="flex flex-wrap gap-2">
              {records.map((r) => (
                <button
                  key={r.employee_id}
                  onClick={() => onSelectEmployee(r.employee_id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    r.employee_id === (record?.employee_id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.employee?.full_name ?? `Funcionário #${r.employee_id}`}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {record && <EmployeeRecordDetail record={record} />}
    </div>
  )
}

function EmployeeRecordDetail({ record }: { record: PayrollRecord }) {
  const { t, i18n } = useTranslation()
  const inssComponent = getPayrollComponent(record, 'inss')
  const employerInssComponent = getPayrollComponent(record, 'employer_inss')
  const inssEmployee = inssComponent?.amount ?? null
  const employerInss = employerInssComponent?.amount ?? record.employer_inss ?? 0
  const irtAmount = getPayrollComponent(record, 'irt')?.amount ?? Math.abs(record.total_taxes ?? 0)
  const snapshotEmployeeRate = record.snapshot?.inss_employee_rate
  const snapshotEmployerRate = record.snapshot?.inss_employer_rate
  const inssRate = inssComponent?.rate ?? (typeof snapshotEmployeeRate === 'number' ? snapshotEmployeeRate : null)
  const employerInssRate = employerInssComponent?.rate ?? (typeof snapshotEmployerRate === 'number' ? snapshotEmployerRate : null)
  const inssLabel = formatRate(inssRate) ? `${t('payroll.detail.inss')} (${formatRate(inssRate)})` : t('payroll.detail.inss')
  const employerInssLabel = formatRate(employerInssRate)
    ? `${t('payroll.detail.employerContribution')} (${formatRate(employerInssRate)})`
    : t('payroll.detail.employerContribution')

  return (
    <div className="space-y-4">
      {/* KPI mini-cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniKpi label={t('payroll.detail.salaryBase')} value={fmtCurrency(record.base_salary)} />
        <MiniKpi label={t('payroll.detail.salaryGross')} value={fmtCurrency(record.gross_salary)} highlight />
        <MiniKpi label={inssLabel} value={inssEmployee == null ? '—' : formatSignedAmount(-inssEmployee)} danger />
        <MiniKpi label={t('payroll.detail.irt')} value={formatSignedAmount(-irtAmount)} danger />
        <MiniKpi label={t('payroll.detail.net')} value={fmtCurrency(record.net_salary)} success />
        <MiniKpi label={t('payroll.detail.employerCost')} value={fmtCurrency(record.employer_cost)} />
      </div>

      {/* Items breakdown table */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">{t('payroll.detail.componentDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(!record.items || record.items.length === 0) ? (
            <div className="px-5 pb-5">
              {/* Fallback: use legacy breakdown */}
              {record.details?.breakdown && record.details.breakdown.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">{t('payroll.detail.description')}</th>
                        <th className="px-4 py-2 text-left font-medium">{t('payroll.detail.type')}</th>
                        <th className="px-4 py-2 text-right font-medium">{t('payroll.detail.value')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {record.details.breakdown.map((item, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{item.name}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="text-xs capitalize">{t(`payroll.detail.categories.${item.type}`, { defaultValue: item.type })}</Badge>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-medium ${item.type === 'deduction' || item.type === 'tax' ? 'text-destructive' : 'text-emerald-700'}`}>
                            {item.type === 'deduction' || item.type === 'tax' ? '-' : ''}{fmtCurrency(Math.abs(item.amount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {t('payroll.detail.noComponents')}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">{t('payroll.detail.description')}</th>
                    <th className="px-5 py-3 text-left font-medium">{t('payroll.detail.category')}</th>
                    <th className="px-5 py-3 text-right font-medium">{t('payroll.detail.base')}</th>
                    <th className="px-5 py-3 text-right font-medium">{t('payroll.detail.quantity')}</th>
                    <th className="px-5 py-3 text-right font-medium">{t('payroll.detail.rate')}</th>
                    <th className="px-5 py-3 text-right font-medium">{t('payroll.detail.value')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {record.items!.map((item) => {
                    const catCfg = categoryConfig[item.category] ?? { label: item.category, color: '' }
                    const isNeg = item.category === 'deduction' || item.category === 'tax'
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium ${catCfg.color}`}>{t(`payroll.detail.categories.${item.category}`, { defaultValue: catCfg.label })}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.base_amount != null ? fmtCurrency(item.base_amount) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.quantity != null ? item.quantity : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.rate != null ? `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(Number(item.rate))}%` : '—'}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono font-semibold ${isNeg ? 'text-destructive' : catCfg.color}`}>
                          {isNeg ? '-' : ''}{fmtCurrency(Math.abs(item.amount))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employer cost breakdown */}
      {(record.employer_inss != null || record.employer_cost != null) && (
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">{t('payroll.detail.employerCharges')}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.salaryGross')}</p>
                <p className="text-sm font-semibold font-mono">{fmtCurrency(record.gross_salary)}</p>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                <p className="text-xs text-muted-foreground">{employerInssLabel}</p>
                <p className="text-sm font-semibold font-mono text-blue-700">{fmtCurrency(employerInss)}</p>
              </div>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-xs text-muted-foreground">{t('payroll.detail.totalCost')}</p>
                <p className="text-sm font-semibold font-mono text-amber-700">{fmtCurrency(record.employer_cost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshot info */}
      {record.engine_version && (
        <p className="text-xs text-muted-foreground text-right">
          Motor salarial v{record.engine_version}
          {record.snapshot && typeof record.snapshot === 'object' && (record.snapshot as any).calculated_at
            ? ` · Calculado em ${(record.snapshot as any).calculated_at}`
            : ''}
        </p>
      )}
    </div>
  )
}

function MiniKpi({
  label,
  value,
  highlight,
  danger,
  success,
}: {
  label: string
  value: string
  highlight?: boolean
  danger?: boolean
  success?: boolean
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-primary/30 bg-primary/5' : danger ? 'border-destructive/20 bg-destructive/5' : success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/40'}`}>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-sm font-semibold font-mono mt-0.5 ${highlight ? 'text-primary' : danger ? 'text-destructive' : success ? 'text-emerald-700' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}

// ─── Tab: Validações ─────────────────────────────────────────────────────────

function ValidationsTab({
  report,
  blockingErrors,
  warnings,
  allClean,
  warningsAck,
  onWarningsAckChange,
  canSubmit,
  submitDisabledReason,
  isSubmitting,
  onSubmit,
  showSubmit,
}: {
  report?: PayrollValidationReport
  blockingErrors: PayrollRecord[]
  warnings: PayrollRecord[]
  allClean: boolean
  warningsAck: boolean
  onWarningsAckChange: (v: boolean) => void
  canSubmit: boolean
  submitDisabledReason?: string
  isSubmitting: boolean
  onSubmit: () => void
  showSubmit: boolean
}) {
  const { t } = useTranslation()
  const periodErrors = report?.errors ?? []
  const periodWarnings = report?.warnings ?? []
  const hasBlocking = (report?.blocking_count ?? 0) > 0 || blockingErrors.length > 0
  const hasWarnings = (report?.warning_count ?? 0) > 0 || warnings.length > 0
  const trulyClean = allClean && !hasBlocking && !hasWarnings

  return (
    <div className="space-y-4">
      {showSubmit && (
        <Card className="border-border/80">
          <CardContent className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {hasBlocking ? (
                <span className="text-destructive font-medium">
                  {t('payroll.detail.validation.blocking')}
                </span>
              ) : hasWarnings ? (
                <span>
                  {t('payroll.detail.validation.warnings')}{' '}
                  {warningsAck ? t('payroll.detail.validation.confirmed') : t('payroll.detail.validation.confirmWarnings')}
                </span>
              ) : (
                <span>{t('payroll.detail.validation.ready')}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasWarnings && !hasBlocking && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <Checkbox
                    checked={warningsAck}
                    onCheckedChange={(v) => onWarningsAckChange(v === true)}
                  />
                  {t('payroll.detail.validation.acknowledge')}
                </label>
              )}
              <Button
                size="sm"
                onClick={onSubmit}
                disabled={!canSubmit || isSubmitting}
                title={submitDisabledReason}
              >
                {isSubmitting
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t('payroll.detail.submit')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {trulyClean && (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
            <p className="font-semibold text-foreground">{t('payroll.detail.validation.cleanTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('payroll.detail.validation.cleanDescription')}</p>
          </CardContent>
        </Card>
      )}

      {(hasBlocking || periodErrors.length > 0) && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              {t('payroll.detail.validation.blockingTitle')} ({Math.max(report?.blocking_count ?? 0, blockingErrors.length)})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {periodErrors.map((e, i) => (
              <div key={`period-err-${i}`} className="flex items-start gap-3 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {e.employee_name ?? t('payroll.detail.validation.period')}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">[{e.code}] {e.message}</p>
                </div>
              </div>
            ))}
            {blockingErrors.map((r) =>
              r.validation_errors
                ?.filter((e) => e.severity === 'error' || e.severity === 'blocking')
                .map((e, i) => (
                  <div key={`${r.id}-${i}`} className="flex items-start gap-3 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-destructive">
                        {r.employee?.full_name ?? `${t('payroll.detail.employee')} #${r.employee_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">[{e.code}] {e.message}</p>
                    </div>
                  </div>
                )),
            )}
          </CardContent>
        </Card>
      )}

      {(hasWarnings || periodWarnings.length > 0) && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              {t('payroll.detail.validation.warningsTitle')} ({Math.max(report?.warning_count ?? 0, warnings.length)})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {periodWarnings.map((e, i) => (
              <div key={`period-warn-${i}`} className="flex items-start gap-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700">
                    {e.employee_name ?? t('payroll.detail.validation.period')}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">[{e.code}] {e.message}</p>
                </div>
              </div>
            ))}
            {warnings.map((r) =>
              r.validation_errors
                ?.filter((e) => e.severity !== 'error' && e.severity !== 'blocking')
                .map((e, i) => (
                  <div key={`${r.id}-${i}`} className="flex items-start gap-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                    <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-700">
                        {r.employee?.full_name ?? `${t('payroll.detail.employee')} #${r.employee_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">[{e.code}] {e.message}</p>
                    </div>
                  </div>
                )),
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Tab: Histórico ──────────────────────────────────────────────────────────

function HistoryTab({ events, locale }: { events: PayrollPeriodEvent[]; locale: string }) {
  const { t } = useTranslation()
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <History className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-foreground">{t('payroll.detail.history.emptyTitle')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('payroll.detail.history.emptyDescription')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {events.map((ev) => (
            <li key={ev.id} className="px-5 py-4 flex items-start gap-4">
              <Badge variant="outline" className={`shrink-0 text-xs ${eventColor[ev.event_type] ?? 'bg-muted text-muted-foreground border-border'}`}>
                {t(`payroll.events.${ev.event_type}`, { defaultValue: eventLabel[ev.event_type] ?? ev.event_type })}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{eventLabel[ev.event_type] ? t(`payroll.events.${ev.event_type}`, { defaultValue: eventLabel[ev.event_type] }) : ev.notes ?? ev.event_type}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ev.actor?.name ? `${t('payroll.detail.history.by')} ${ev.actor.name} · ` : ''}
                  {formatDate(ev.created_at, locale)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

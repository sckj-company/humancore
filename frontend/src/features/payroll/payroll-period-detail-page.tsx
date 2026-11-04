import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, Play, CheckCircle2, Lock, FileDown, Users,
  TrendingUp, Wallet, Building2, AlertTriangle, AlertCircle, Info,
  Loader2, Clock, Calendar, FileText, BarChart3, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import type { PayrollPeriod, PayrollRecord, PayrollRecordItem } from '@/types'

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

// ─── Status config ──────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; color: string }> = {
  open:             { label: 'Aberto',              color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  processing:       { label: 'A Processar',         color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  completed:        { label: 'Calculado',           color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
  failed:           { label: 'Com Erros',           color: 'bg-red-500/10 text-red-600 border-red-500/20' },
  pending_approval: { label: 'Pendente Aprovação',  color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  approved:         { label: 'Aprovado',            color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  paid:             { label: 'Pago',                color: 'bg-green-500/10 text-green-600 border-green-500/20' },
  closed:           { label: 'Fechado',             color: 'bg-muted text-muted-foreground border-border' },
  cancelled:        { label: 'Cancelado',           color: 'bg-red-500/10 text-red-600 border-red-500/20' },
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
  const { i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'summary'
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language || 'pt-AO'

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-period', id],
    queryFn: () => api.get<PayrollPeriod>(`payroll/periods/${id}`),
    enabled: !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll-period', id] })
    qc.invalidateQueries({ queryKey: ['payroll-periods'] })
  }

  const processMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/process`),
    onSuccess: () => { toast.success('Processamento iniciado'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao processar')),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/approve`),
    onSuccess: () => { toast.success('Folha aprovada com sucesso'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao aprovar')),
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`payroll/periods/${id}/close`),
    onSuccess: () => { toast.success('Período fechado'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao fechar')),
  })

  const downloadPayslip = async (recordId: number, filename: string) => {
    const tid = toast.loading(`A gerar recibo…`)
    try {
      const token = localStorage.getItem('hrms_token')
      const url = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/payroll/records/${recordId}/payslip.pdf`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Recibo descarregado', { id: tid })
    } catch {
      toast.error('Não foi possível descarregar o recibo', { id: tid })
    }
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message="Não foi possível carregar o período." onRetry={refetch} />
  if (!data) return null

  const records = data.records ?? []
  const status = statusConfig[data.status] ?? { label: data.status, color: 'bg-muted text-muted-foreground' }

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
    r.validation_errors?.some((e) => e.severity === 'error'),
  )
  const warnings = recordsWithErrors.filter((r) =>
    r.validation_errors?.every((e) => e.severity === 'warning'),
  )

  const selectedRecord = selectedEmployeeId
    ? records.find((r) => r.employee_id === selectedEmployeeId)
    : records[0] ?? null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/payroll"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <Link to="/payroll" className="hover:text-foreground transition-colors">Folha Salarial</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-semibold">{data.name}</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/payroll"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Voltar</Link>
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
                    {status.label}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(data.period_start, locale)} – {formatDate(data.period_end, locale)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 capitalize">
                    <Clock className="h-3.5 w-3.5" />
                    {data.period_type === 'monthly' ? 'Mensal' : data.period_type === 'biweekly' ? 'Quinzenal' : 'Semanal'}
                  </span>
                  {data.payment_date && (
                    <span className="inline-flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      Pagamento: {formatDate(data.payment_date, locale)}
                    </span>
                  )}
                </p>
                {data.approved_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aprovado em {formatDate(data.approved_at, locale)}
                  </p>
                )}
              </div>
            </div>
            {/* Contextual Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              {data.status === 'open' && hasPermission(user, 'process_payroll') && (
                <Button
                  size="sm"
                  onClick={() => processMutation.mutate()}
                  disabled={processMutation.isPending}
                >
                  {processMutation.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  Processar
                </Button>
              )}
              {(data.status === 'completed' || data.status === 'pending_approval') && hasPermission(user, 'approve_payroll') && (
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Aprovar Folha
                </Button>
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
                  Fechar Período
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
          label="Funcionários"
          value={String(employeeCount)}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="bg-emerald-500/10 text-emerald-600"
          label="Total Bruto"
          value={fmtCurrency(totalGross)}
          sub="AOA"
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          iconBg="bg-primary/10 text-primary"
          label="Total Líquido"
          value={fmtCurrency(totalNet)}
          sub="AOA"
        />
        <KpiCard
          icon={<Building2 className="h-5 w-5" />}
          iconBg="bg-amber-500/10 text-amber-600"
          label="Custo Patronal"
          value={fmtCurrency(totalEmployerCost)}
          sub="AOA"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(tab) => setSearchParams({ tab }, { replace: true })} className="w-full">
        <TabsList className="w-full flex-wrap justify-start h-auto gap-1 p-1.5 bg-muted/60 border border-border/60 rounded-lg">
          <TabsTrigger value="summary" className="gap-1.5 px-3 py-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />Resumo
          </TabsTrigger>
          <TabsTrigger value="detail" className="gap-1.5 px-3 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />Detalhe por Funcionário
          </TabsTrigger>
          <TabsTrigger value="validations" className="gap-1.5 px-3 py-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            Validações
            {recordsWithErrors.length > 0 && (
              <Badge variant="destructive" className="ml-0.5 text-[10px] h-4 px-1 font-semibold">
                {recordsWithErrors.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Resumo ── */}
        <TabsContent value="summary" className="mt-4">
          <SummaryTab
            records={records}
            periodStatus={data.status}
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
            blockingErrors={blockingErrors}
            warnings={warnings}
            allClean={recordsWithErrors.length === 0}
          />
        </TabsContent>
      </Tabs>
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
  onDownloadPayslip,
}: {
  records: PayrollRecord[]
  periodStatus: string
  onDownloadPayslip: (id: number, filename: string) => void
}) {
  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">Nenhum registo ainda</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Processe este período para gerar os registos salariais.</p>
        </CardContent>
      </Card>
    )
  }

  const totalsGross = records.reduce((s, r) => s + (r.gross_salary ?? 0), 0)
  const totalsNet = records.reduce((s, r) => s + (r.net_salary ?? 0), 0)
  const totalsInss = records.reduce((s, r) => s + (r.total_taxes ?? 0), 0)
  const totalsDeductions = records.reduce((s, r) => s + (r.total_deductions ?? 0), 0)
  const totalsCost = records.reduce((s, r) => s + (r.employer_cost ?? r.gross_salary ?? 0), 0)

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Funcionário</th>
                <th className="px-5 py-3 font-medium text-right">Base</th>
                <th className="px-5 py-3 font-medium text-right">Bruto</th>
                <th className="px-5 py-3 font-medium text-right">INSS</th>
                <th className="px-5 py-3 font-medium text-right">IRT</th>
                <th className="px-5 py-3 font-medium text-right">Outros Desc.</th>
                <th className="px-5 py-3 font-medium text-right">Líquido</th>
                <th className="px-5 py-3 font-medium text-right">Custo Patronal</th>
                <th className="px-5 py-3 font-medium text-right">Estado</th>
                <th className="px-5 py-3 font-medium text-right">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {records.map((r) => {
                const inss = r.inss_base != null ? (r.total_taxes ?? 0) : (r.total_taxes ?? 0)
                const irt = r.irt_taxable_base != null
                  ? Math.max(0, (r.total_taxes ?? 0) - (r.inss_base ?? 0) * 0.11)
                  : 0
                const otherDeductions = Math.max(0, (r.total_deductions ?? 0))
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
                      {r.inss_base != null ? `-${fmtCurrency(r.inss_base)}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-orange-600">
                      {r.irt_taxable_base != null
                        ? `-${fmtCurrency(Math.max(0, (r.total_taxes ?? 0)))}`
                        : `−${fmtCurrency(r.total_taxes)}`}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-destructive">
                      {otherDeductions > 0 ? `-${fmtCurrency(otherDeductions)}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700">{fmtCurrency(r.net_salary)}</td>
                    <td className="px-5 py-3 text-right font-mono text-blue-700">
                      {r.employer_cost != null ? fmtCurrency(r.employer_cost) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {hasErrors && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                        <Badge variant="outline" className="capitalize text-xs">
                          {r.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {(periodStatus === 'approved' || periodStatus === 'paid' || periodStatus === 'closed') && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Descarregar recibo (PDF)"
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
                <td className="px-5 py-3 text-muted-foreground uppercase text-xs">Totais</td>
                <td className="px-5 py-3 text-right font-mono">—</td>
                <td className="px-5 py-3 text-right font-mono">{fmtCurrency(totalsGross)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-600">{fmtCurrency(totalsInss)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-600">—</td>
                <td className="px-5 py-3 text-right font-mono text-destructive">{fmtCurrency(totalsDeductions)}</td>
                <td className="px-5 py-3 text-right font-mono text-emerald-700">{fmtCurrency(totalsNet)}</td>
                <td className="px-5 py-3 text-right font-mono text-blue-700">{fmtCurrency(totalsCost)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
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
  const record = records.find((r) => r.employee_id === selectedEmployeeId) ?? records[0] ?? null

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum registo para visualizar.</p>
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
            <span className="text-sm font-medium text-muted-foreground shrink-0">Funcionário:</span>
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
  const inssEmployee = record.inss_base ?? 0
  const employerInss = record.employer_inss ?? 0
  const irtAmount = Math.max(0, (record.total_taxes ?? 0) - inssEmployee)

  return (
    <div className="space-y-4">
      {/* KPI mini-cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniKpi label="Salário Base" value={fmtCurrency(record.base_salary)} />
        <MiniKpi label="Salário Bruto" value={fmtCurrency(record.gross_salary)} highlight />
        <MiniKpi label="INSS (11%)" value={`-${fmtCurrency(inssEmployee)}`} danger />
        <MiniKpi label="IRT" value={`-${fmtCurrency(irtAmount)}`} danger />
        <MiniKpi label="Salário Líquido" value={fmtCurrency(record.net_salary)} success />
        <MiniKpi label="Custo Patronal" value={fmtCurrency(record.employer_cost)} />
      </div>

      {/* Items breakdown table */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">Detalhe dos Componentes</CardTitle>
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
                        <th className="px-4 py-2 text-left font-medium">Descrição</th>
                        <th className="px-4 py-2 text-left font-medium">Código</th>
                        <th className="px-4 py-2 text-left font-medium">Tipo</th>
                        <th className="px-4 py-2 text-right font-medium">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {record.details.breakdown.map((item, i) => (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 font-medium">{item.name}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{item.code}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-medium ${item.type === 'deduction' || item.type === 'tax' ? 'text-destructive' : 'text-emerald-700'}`}>
                            {item.type === 'deduction' || item.type === 'tax' ? '-' : ''}{fmtCurrency(item.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Sem detalhe de componentes disponível (motor v1).
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Descrição</th>
                    <th className="px-5 py-3 text-left font-medium">Código</th>
                    <th className="px-5 py-3 text-left font-medium">Categoria</th>
                    <th className="px-5 py-3 text-right font-medium">Base</th>
                    <th className="px-5 py-3 text-right font-medium">Qtd</th>
                    <th className="px-5 py-3 text-right font-medium">Taxa %</th>
                    <th className="px-5 py-3 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {record.items!.map((item) => {
                    const catCfg = categoryConfig[item.category] ?? { label: item.category, color: '' }
                    const isNeg = item.category === 'deduction' || item.category === 'tax'
                    return (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3 font-medium">{item.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{item.code}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium ${catCfg.color}`}>{catCfg.label}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.base_amount != null ? fmtCurrency(item.base_amount) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.quantity != null ? item.quantity : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-muted-foreground">
                          {item.rate != null ? `${item.rate}%` : '—'}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono font-semibold ${isNeg ? 'text-destructive' : catCfg.color}`}>
                          {isNeg ? '-' : ''}{fmtCurrency(item.amount)}
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
            <CardTitle className="text-sm font-semibold">Encargos Patronais</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Salário Bruto</p>
                <p className="text-sm font-semibold font-mono">{fmtCurrency(record.gross_salary)}</p>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                <p className="text-xs text-muted-foreground">INSS Patronal (8%)</p>
                <p className="text-sm font-semibold font-mono text-blue-700">{fmtCurrency(employerInss)}</p>
              </div>
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                <p className="text-xs text-muted-foreground">Custo Total</p>
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
  blockingErrors,
  warnings,
  allClean,
}: {
  blockingErrors: PayrollRecord[]
  warnings: PayrollRecord[]
  allClean: boolean
}) {
  if (allClean) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500 mb-3" />
          <p className="font-semibold text-foreground">Sem problemas de validação</p>
          <p className="text-sm text-muted-foreground mt-1">Todos os registos estão válidos e prontos para aprovação.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {blockingErrors.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              Erros Bloqueantes ({blockingErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {blockingErrors.map((r) =>
              r.validation_errors?.filter((e) => e.severity === 'error').map((e, i) => (
                <div key={`${r.id}-${i}`} className="flex items-start gap-3 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      {r.employee?.full_name ?? `Funcionário #${r.employee_id}`}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">[{e.code}] {e.message}</p>
                  </div>
                </div>
              )),
            )}
          </CardContent>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-4 w-4" />
              Avisos ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {warnings.map((r) =>
              r.validation_errors?.filter((e) => e.severity === 'warning').map((e, i) => (
                <div key={`${r.id}-${i}`} className="flex items-start gap-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">
                      {r.employee?.full_name ?? `Funcionário #${r.employee_id}`}
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

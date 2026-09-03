import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Calendar, Users, UserMinus, TrendingUp, Wallet, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { EChartsOption } from 'echarts'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { Chart } from '@/components/charts/chart'
import type { ReportType, HeadcountReport, TurnoverReport, PayrollReport, AttendanceReport } from '@/types'

type TabValue = 'headcount' | 'turnover' | 'payroll' | 'attendance'

const currencyFormatter = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 })

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthsAgoIso(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

export function ReportsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canExport = hasPermission(user, 'export_report')

  const [tab, setTab] = useState<TabValue>('headcount')
  const [startDate, setStartDate] = useState<string>(monthsAgoIso(6))
  const [endDate, setEndDate] = useState<string>(todayIso())

  const commonParams = { start_date: startDate, end_date: endDate }

  const headcount = useQuery({
    queryKey: ['reports', 'headcount', startDate, endDate],
    queryFn: () => api.get<HeadcountReport>('reports/headcount', commonParams),
    enabled: tab === 'headcount',
  })
  const turnover = useQuery({
    queryKey: ['reports', 'turnover', startDate, endDate],
    queryFn: () => api.get<TurnoverReport>('reports/turnover', commonParams),
    enabled: tab === 'turnover',
  })
  const payroll = useQuery({
    queryKey: ['reports', 'payroll-summary', startDate, endDate],
    queryFn: () => api.get<PayrollReport>('reports/payroll-summary', commonParams),
    enabled: tab === 'payroll',
  })
  const attendance = useQuery({
    queryKey: ['reports', 'attendance-summary', startDate, endDate],
    queryFn: () => api.get<AttendanceReport>('reports/attendance-summary', commonParams),
    enabled: tab === 'attendance',
  })

  const activeQuery = useMemo(() => {
    if (tab === 'headcount') return headcount
    if (tab === 'turnover') return turnover
    if (tab === 'payroll') return payroll
    return attendance
  }, [tab, headcount, turnover, payroll, attendance])

  const handleExport = async (type: ReportType) => {
    try {
      await api.downloadFile(
        `reports/${type}/export?start_date=${startDate}&end_date=${endDate}`,
        `relatorio-${type}-${startDate}-${endDate}.csv`,
      )
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('reports.error')))
    }
  }

  const handleReset = () => {
    setStartDate(monthsAgoIso(6))
    setEndDate(todayIso())
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        actions={
          canExport ? (
            <Button onClick={() => handleExport(tab)} disabled={activeQuery.isFetching}>
              <Download className="mr-2 h-4 w-4" />
              {t('reports.export')}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="start" className="text-xs">
              {t('reports.filters.startDate')}
            </Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end" className="text-xs">
              {t('reports.filters.endDate')}
            </Label>
            <Input
              id="end"
              type="date"
              value={endDate}
              min={startDate}
              max={todayIso()}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setStartDate(monthsAgoIso(6)); setEndDate(todayIso()) }}>
              {t('reports.filters.last6')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setStartDate(monthsAgoIso(12)); setEndDate(todayIso()) }}>
              {t('reports.filters.last12')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t('reports.filters.reset')}
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {startDate} → {endDate}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="headcount">{t('reports.tabs.headcount')}</TabsTrigger>
          <TabsTrigger value="turnover">{t('reports.tabs.turnover')}</TabsTrigger>
          <TabsTrigger value="payroll">{t('reports.tabs.payroll')}</TabsTrigger>
          <TabsTrigger value="attendance">{t('reports.tabs.attendance')}</TabsTrigger>
        </TabsList>

        <TabsContent value="headcount" className="space-y-4">
          <HeadcountTab data={headcount.data} loading={headcount.isFetching} error={headcount.isError} onRetry={headcount.refetch} locale={i18n.language} />
        </TabsContent>
        <TabsContent value="turnover" className="space-y-4">
          <TurnoverTab data={turnover.data} loading={turnover.isFetching} error={turnover.isError} onRetry={turnover.refetch} locale={i18n.language} />
        </TabsContent>
        <TabsContent value="payroll" className="space-y-4">
          <PayrollTab data={payroll.data} loading={payroll.isFetching} error={payroll.isError} onRetry={payroll.refetch} locale={i18n.language} />
        </TabsContent>
        <TabsContent value="attendance" className="space-y-4">
          <AttendanceTab data={attendance.data} loading={attendance.isFetching} error={attendance.isError} onRetry={attendance.refetch} locale={i18n.language} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function HeadcountTab({
  data,
  loading,
  error,
  onRetry,
  locale,
}: {
  data: HeadcountReport | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  locale: string
}) {
  const { t } = useTranslation()
  if (loading && !data) return <LoadingState />
  if (error || !data) return <ErrorState message={t('reports.error')} onRetry={onRetry} />

  const trendOption: EChartsOption = {
    grid: { left: 40, right: 16, top: 16, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.trend.map((d) => d.label),
      axisLine: { lineStyle: { color: 'rgba(100,116,139,0.3)' } },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        type: 'line',
        smooth: true,
        data: data.trend.map((d) => d.count),
        itemStyle: { color: 'var(--primary)' },
        lineStyle: { width: 2, color: 'var(--primary)' },
        areaStyle: { color: 'rgba(37,99,235,0.1)' },
      },
    ],
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Users} label={t('reports.headcount.total')} value={data.summary.total_employees} />
        <SummaryCard icon={Users} label={t('reports.headcount.active')} value={data.summary.active_employees} accent="success" />
        <SummaryCard icon={UserMinus} label={t('reports.headcount.hired')} value={data.summary.hired_in_range} accent="info" />
        <SummaryCard icon={UserMinus} label={t('reports.headcount.terminated')} value={data.summary.terminated_in_range} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('reports.headcount.byDepartment')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.by_department.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'department', label: t('reports.headcount.byDepartment') },
                  { key: 'total', label: t('reports.headcount.total'), align: 'right' },
                ]}
                rows={data.by_department.map((d) => ({ ...d }))}
                locale={locale}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('reports.headcount.trend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={trendOption} height={240} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function TurnoverTab({
  data,
  loading,
  error,
  onRetry,
  locale,
}: {
  data: TurnoverReport | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  locale: string
}) {
  const { t } = useTranslation()
  if (loading && !data) return <LoadingState />
  if (error || !data) return <ErrorState message={t('reports.error')} onRetry={onRetry} />

  const monthlyOption: EChartsOption = {
    grid: { left: 40, right: 16, top: 32, bottom: 30 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { fontSize: 12 } },
    xAxis: {
      type: 'category',
      data: data.monthly.map((d) => d.label),
      axisLine: { lineStyle: { color: 'rgba(100,116,139,0.3)' } },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: t('reports.turnover.hired'),
        type: 'bar',
        data: data.monthly.map((d) => d.hired),
        itemStyle: { color: 'var(--primary)' },
      },
      {
        name: t('reports.turnover.terminated'),
        type: 'bar',
        data: data.monthly.map((d) => d.terminated),
        itemStyle: { color: 'var(--destructive)' },
      },
    ],
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={UserMinus} label={t('reports.turnover.hired')} value={data.summary.hired} accent="info" />
        <SummaryCard icon={UserMinus} label={t('reports.turnover.terminated')} value={data.summary.terminated} accent="destructive" />
        <SummaryCard icon={Users} label={t('reports.turnover.averageHeadcount')} value={data.summary.average_headcount} />
        <SummaryCard icon={TrendingUp} label={t('reports.turnover.rate')} value={`${data.summary.turnover_rate}%`} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('reports.turnover.monthly')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={monthlyOption} height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('reports.turnover.byReason')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.by_reason.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>
            ) : (
              <SimpleTable
                columns={[
                  { key: 'reason', label: t('reports.turnover.byReason') },
                  { key: 'total', label: t('reports.payroll.employees'), align: 'right' },
                ]}
                rows={data.by_reason.map((r) => ({ ...r }))}
                locale={locale}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function PayrollTab({
  data,
  loading,
  error,
  onRetry,
  locale,
}: {
  data: PayrollReport | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  locale: string
}) {
  const { t } = useTranslation()
  if (loading && !data) return <LoadingState />
  if (error || !data) return <ErrorState message={t('reports.error')} onRetry={onRetry} />

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard icon={Wallet} label={t('reports.payroll.gross')} value={currencyFormatter.format(data.totals.total_gross)} accent="primary" />
        <SummaryCard icon={Wallet} label={t('reports.payroll.net')} value={currencyFormatter.format(data.totals.total_net)} accent="success" />
        <SummaryCard icon={AlertTriangle} label={t('reports.payroll.taxes')} value={currencyFormatter.format(data.totals.total_taxes)} />
        <SummaryCard icon={AlertTriangle} label={t('reports.payroll.deductions')} value={currencyFormatter.format(data.totals.total_deductions)} />
        <SummaryCard icon={Clock} label={t('reports.payroll.overtime')} value={currencyFormatter.format(data.totals.total_overtime)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reports.payroll.period')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>
          ) : (
            <SimpleTable
              columns={[
                { key: 'name', label: t('reports.payroll.period') },
                { key: 'period_end', label: t('reports.filters.endDate') },
                { key: 'employees', label: t('reports.payroll.employees'), align: 'right' },
                { key: 'total_gross', label: t('reports.payroll.gross'), align: 'right', render: (r) => currencyFormatter.format(Number(r.total_gross)) },
                { key: 'total_net', label: t('reports.payroll.net'), align: 'right', render: (r) => currencyFormatter.format(Number(r.total_net)) },
                { key: 'total_absent_days', label: t('reports.payroll.absentDays'), align: 'right' },
              ]}
              rows={data.rows.map((r) => ({ ...r }))}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reports.payroll.byDepartment')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.by_department.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>
          ) : (
            <SimpleTable
              columns={[
                { key: 'department', label: t('reports.payroll.byDepartment') },
                { key: 'employees', label: t('reports.payroll.employees'), align: 'right' },
                { key: 'total_gross', label: t('reports.payroll.gross'), align: 'right', render: (r) => currencyFormatter.format(Number(r.total_gross)) },
                { key: 'total_net', label: t('reports.payroll.net'), align: 'right', render: (r) => currencyFormatter.format(Number(r.total_net)) },
              ]}
              rows={data.by_department.map((r) => ({ ...r }))}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}

function AttendanceTab({
  data,
  loading,
  error,
  onRetry,
  locale,
}: {
  data: AttendanceReport | undefined
  loading: boolean
  error: boolean
  onRetry: () => void
  locale: string
}) {
  const { t } = useTranslation()
  if (loading && !data) return <LoadingState />
  if (error || !data) return <ErrorState message={t('reports.error')} onRetry={onRetry} />

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon={Clock} label={t('reports.attendance.records')} value={data.summary.records} />
        <SummaryCard icon={Clock} label={t('reports.attendance.totalHours')} value={data.summary.total_hours} accent="primary" />
        <SummaryCard icon={AlertTriangle} label={t('reports.attendance.lateMinutes')} value={data.summary.late_minutes} accent="warning" />
        <SummaryCard icon={Clock} label={t('reports.attendance.overtimeMinutes')} value={data.summary.overtime_minutes} accent="info" />
        <SummaryCard icon={Calendar} label={t('reports.attendance.leavesApproved')} value={data.summary.leaves_approved} accent="success" />
        <SummaryCard icon={Calendar} label={t('reports.attendance.leavesPending')} value={data.summary.leaves_pending} accent="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('reports.attendance.byDepartment')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.by_department.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>
          ) : (
            <SimpleTable
              columns={[
                { key: 'department', label: t('reports.attendance.byDepartment') },
                { key: 'records', label: t('reports.attendance.records'), align: 'right' },
                { key: 'total_hours', label: t('reports.attendance.totalHours'), align: 'right' },
                { key: 'late_minutes', label: t('reports.attendance.lateMinutes'), align: 'right' },
                { key: 'overtime_minutes', label: t('reports.attendance.overtimeMinutes'), align: 'right' },
              ]}
              rows={data.by_department.map((r) => ({ ...r }))}
              locale={locale}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  accent?: 'default' | 'primary' | 'success' | 'warning' | 'info' | 'destructive'
}) {
  const accentClass: Record<typeof accent, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
    destructive: 'bg-destructive/10 text-destructive',
  }
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentClass[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

type Column = {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (row: Record<string, unknown>) => React.ReactNode
}

function SimpleTable({
  columns,
  rows,
  locale: _locale,
}: {
  columns: Column[]
  rows: Record<string, unknown>[]
  locale: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} className={`py-2 font-medium ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={`py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                  {c.render ? c.render(row) : (row[c.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

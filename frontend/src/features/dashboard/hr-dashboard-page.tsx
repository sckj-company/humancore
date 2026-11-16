import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Users,
  UserPlus,
  UserMinus,
  Activity,
  Wallet,
  Cake,
  FileSignature,
  CalendarOff,
  Building2,
  ArrowUpRight,
} from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { KpiCard } from '@/components/shared/kpi-card'
import { Chart } from '@/components/charts/chart'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'

interface HrDashboardData {
  tenant?: { id: number; name: string; currency: string } | null
  kpis: {
    total_employees: number
    total_active: number
    hired_this_month: number
    terminated_this_month: number
    turnover_rate: number
    monthly_payroll_cost: number
  }
  headcount_trend: { month: string; label: string; count: number }[]
  by_department: { name: string; count: number }[]
  by_status: { [key: string]: number }
  expiring_contracts: { id: number; employee: string; employee_code: string; end_date: string; days_remaining: number }[]
  pending_leaves: { id: number; employee: string; type: string; start_date: string; days: number }[]
  birthdays: { id: number; full_name: string; birth_date: string; day: number }[]
  recent_hires: { id: number; full_name: string; employee_code: string; department?: string; position?: string; hired_at?: string; photo_path?: string }[]
  next_payroll: { id: number; name: string; status: string; period_start: string; period_end: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#94a3b8',
  suspended: '#f59e0b',
  terminated: '#ef4444',
}

export function HrDashboardPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const tenant = user?.tenant
  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') ?? String(tenant?.id ?? '')

  const { data, isLoading, isError, refetch } = useQuery<HrDashboardData>({
    queryKey: ['dashboard', 'hr', selectedTenantId],
    queryFn: () => api.get<HrDashboardData>('dashboard/hr'),
  })

  const locale = i18n.language

  const sortedDepartments = useMemo(() => {
    return [...(data?.by_department ?? [])].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    )
  }, [data?.by_department])

  const totalDepartmentEmployees = useMemo(
    () => sortedDepartments.reduce((sum, d) => sum + d.count, 0),
    [sortedDepartments],
  )

  const trendOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      padding: [8, 12],
    },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: (data?.headcount_trend ?? []).map((d) => d.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'var(--muted-foreground)', fontSize: 11, margin: 10 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'var(--border)', type: 'dashed' } },
      axisLabel: { color: 'var(--muted-foreground)', fontSize: 11 },
    },
    series: [
      {
        name: t('dashboard.hr.employees_label'),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: (data?.headcount_trend ?? []).map((d) => d.count),
        itemStyle: { color: 'var(--primary)' },
        lineStyle: { width: 2.5, color: 'var(--primary)' },
        areaStyle: { color: 'rgba(37, 99, 235, 0.12)' },
      },
    ],
  }), [data?.headcount_trend, t])

  const byDeptOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      padding: [8, 12],
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const item = list[0] as { name?: string; value?: number } | undefined
        if (!item) return ''
        const val = Number(item.value ?? 0)
        const pct = totalDepartmentEmployees > 0 ? ((val / totalDepartmentEmployees) * 100).toFixed(1) : '0.0'
        return `<div style="font-weight:600;margin-bottom:2px">${item.name ?? ''}</div><div>${val} (${pct}%)</div>`
      },
    },
    grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'var(--border)', type: 'dashed' } },
      axisLabel: { color: 'var(--muted-foreground)', fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sortedDepartments.map((d) => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'var(--muted-foreground)',
        fontSize: 12,
        width: 115,
        overflow: 'truncate',
      },
    },
    series: [
      {
        name: t('employeesPage.department'),
        type: 'bar',
        barMaxWidth: 18,
        data: sortedDepartments.map((d) => d.count),
        itemStyle: { color: 'var(--primary)', borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: 'var(--foreground)',
          fontSize: 11,
          fontWeight: 600,
        },
      },
    ],
  }), [sortedDepartments, totalDepartmentEmployees, t])

  const statusEntries = useMemo(
    () =>
      Object.entries(data?.by_status ?? {}).map(([k, v]) => ({
        key: k,
        name: t(`employeesPage.status.${k}`, { defaultValue: k.charAt(0).toUpperCase() + k.slice(1) }),
        value: v,
        color: STATUS_COLORS[k] ?? '#64748b',
      })),
    [data?.by_status, t],
  )

  const statusOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: { fontSize: 11, color: 'var(--muted-foreground)' },
      itemWidth: 8,
      itemHeight: 8,
    },
    color: statusEntries.map((entry) => entry.color),
    series: [
      {
        name: t('common.status'),
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '43%'],
        itemStyle: { borderRadius: 4, borderColor: 'var(--card)', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: false } },
        data: statusEntries.map(({ name, value }) => ({ name, value })),
      },
    ],
  }), [statusEntries, t])

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('dashboard.hr.load_error')} onRetry={refetch} />

  const currency = data.tenant?.currency ?? tenant?.currency ?? 'AOA'
  const companyName = data.tenant?.name ?? tenant?.name
  const formattedToday = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())
  const deptChartHeight = Math.max(240, sortedDepartments.length * 32)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.hr.title')}
        description={companyName ? `${companyName} · ${formattedToday}` : formattedToday}
        actions={
          data.next_payroll ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/payroll/${data.next_payroll.id}`}>
                <Wallet className="mr-1.5 h-4 w-4 text-primary" />
                {t('dashboard.hr.next_payroll')}: {data.next_payroll.name}
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={t('dashboard.hr.total_employees')}
          value={data.kpis.total_employees}
          icon={Users}
          accent="primary"
        />
        <KpiCard
          label={t('dashboard.hr.active_employees')}
          value={data.kpis.total_active}
          icon={Activity}
          accent="success"
        />
        <KpiCard
          label={t('dashboard.hr.monthly_payroll_cost')}
          value={data.kpis.monthly_payroll_cost}
          currency={currency}
          icon={Wallet}
          accent="primary"
        />
        <KpiCard
          label={t('dashboard.hr.hired_this_month')}
          value={data.kpis.hired_this_month}
          icon={UserPlus}
          accent="info"
        />
        <KpiCard
          label={t('dashboard.hr.terminated_this_month')}
          value={data.kpis.terminated_this_month}
          icon={UserMinus}
          accent="warning"
        />
        <KpiCard
          label={t('dashboard.hr.turnover_rate')}
          value={`${data.kpis.turnover_rate}%`}
          icon={Activity}
          accent="destructive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.hr.headcount_trend')}</CardTitle>
            <CardDescription>{t('dashboard.hr.headcount_trend_description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-2">
            <Chart option={trendOption} height={260} />
          </CardContent>
        </Card>

        <Card className="flex flex-col lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              {t('dashboard.hr.by_department')}
            </CardTitle>
            <CardDescription>{t('dashboard.hr.by_department_description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-2">
            {sortedDepartments.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {t('dashboard.hr.no_departments')}
              </div>
            ) : (
              <div className="max-h-[268px] overflow-y-auto pr-1">
                <Chart option={byDeptOption} height={deptChartHeight} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('dashboard.hr.by_status')}</CardTitle>
            <CardDescription>{t('dashboard.hr.by_status_description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-2">
            <Chart option={statusOption} height={260} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              {t('dashboard.hr.recent_hires')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recent_hires.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.recent_hires.map((hire) => (
                <Link
                  key={hire.id}
                  to={`/employees/${hire.id}`}
                  className="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={hire.photo_path ?? undefined} />
                    <AvatarFallback>{hire.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{hire.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[hire.position, hire.department].filter(Boolean).join(' · ') || hire.employee_code}
                    </p>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {hire.hired_at ? formatDate(hire.hired_at, locale) : '—'}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarOff className="h-4 w-4 text-primary" />
              {t('dashboard.hr.pending_leaves')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.pending_leaves.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.pending_leaves.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{leave.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {leave.type} · {t('dashboard.hr.days_count', { count: leave.days })}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {formatDate(leave.start_date, locale)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4 text-primary" />
              {t('dashboard.hr.expiring_contracts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.expiring_contracts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.expiring_contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.employee}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.employee_code}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={c.days_remaining <= 15 ? 'destructive' : c.days_remaining <= 30 ? 'warning' : 'secondary'}>
                      {t('dashboard.hr.days_remaining', { count: c.days_remaining })}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.end_date, locale)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cake className="h-4 w-4 text-primary" />
              {t('dashboard.hr.upcoming_birthdays')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.birthdays.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.birthdays.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
                  <p className="truncate text-sm font-medium">{b.full_name}</p>
                  <Badge variant="outline" className="shrink-0 font-mono">{b.birth_date}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

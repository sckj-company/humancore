import { useCallback, useMemo, useRef, type MouseEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
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
  GraduationCap,
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
import { hasFieldPermission, useAuthStore } from '@/stores/auth-store'

interface ProbationInternshipEmployee {
  id: number
  full_name: string
  employee_code: string
  department?: string
  position?: string
  hired_at?: string
  probation_end?: string
  contract_type?: string
  stage?: 'internship' | 'probation'
  end_date?: string | null
  photo_path?: string
}

interface HrDashboardData {
  tenant?: { id: number; name: string; currency: string } | null
  kpis: {
    total_employees: number
    total_active: number
    hired_this_month: number
    terminated_this_month: number
    turnover_rate: number
    monthly_payroll_cost: number | null
  }
  headcount_trend: { month: string; label: string; count: number }[]
  by_department: { id?: number; name: string; count: number }[]
  by_status: { [key: string]: number }
  expiring_contracts: {
    id: number
    employee_id?: number
    employee: string
    employee_code: string
    end_date: string
    days_remaining: number
  }[]
  pending_leaves: { id: number; employee: string; type: string; start_date: string; days: number }[]
  birthdays: {
    id: number
    full_name: string
    birth_date: string
    upcoming_date?: string
    day: number
    month?: number
    days_until?: number
    is_current_month?: boolean
  }[]
  probation_internship?: ProbationInternshipEmployee[]
  recent_hires: ProbationInternshipEmployee[]
  next_payroll: { id: number; name: string; status: string; period_start: string; period_end: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  inactive: '#94a3b8',
  suspended: '#f59e0b',
  terminated: '#ef4444',
}

function formatMonthLabel(monthKey: string, fallback: string, locale: string): string {
  const date = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return fallback
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(date)
  } catch {
    return fallback
  }
}

function formatBirthdayDate(upcomingDate: string | undefined, fallback: string, locale: string): string {
  if (!upcomingDate) return fallback
  const date = new Date(`${upcomingDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return fallback
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(date)
  } catch {
    return fallback
  }
}

export function HrDashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const tenant = user?.tenant
  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') ?? String(tenant?.id ?? '')
  const sliceClickedRef = useRef(false)

  const { data, isLoading, isError, refetch } = useQuery<HrDashboardData>({
    queryKey: ['dashboard', 'hr', selectedTenantId],
    queryFn: () => api.get<HrDashboardData>('dashboard/hr'),
  })

  const locale = i18n.language

  const navigateFromCard = useCallback(
    (e: MouseEvent<HTMLElement>, path: string) => {
      if (sliceClickedRef.current) {
        sliceClickedRef.current = false
        return
      }
      const target = e.target as HTMLElement | null
      if (target?.closest('a, button')) return
      navigate(path)
    },
    [navigate],
  )

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
      data: (data?.headcount_trend ?? []).map((d) => formatMonthLabel(d.month, d.label, locale)),
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
  }), [data?.headcount_trend, locale, t])

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

  const totalStatusCount = useMemo(
    () => statusEntries.reduce((sum, entry) => sum + entry.value, 0),
    [statusEntries],
  )

  const statusOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: { show: false },
    color: statusEntries.map((entry) => entry.color),
    series: [
      {
        name: t('common.status'),
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '50%'],
        itemStyle: { borderRadius: 4, borderColor: 'var(--card)', borderWidth: 2 },
        label: {
          show: true,
          position: 'outside',
          formatter: '{c}',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--foreground)',
        },
        labelLine: {
          show: true,
          length: 8,
          length2: 6,
        },
        emphasis: {
          label: { show: true, fontWeight: 700 },
        },
        data: statusEntries.map(({ key, name, value }) => ({
          name,
          value,
          statusKey: key,
          label: { show: value > 0 },
          labelLine: { show: value > 0 },
        })),
      },
    ],
  }), [statusEntries, t])

  const statusChartEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const payload = params as { data?: { statusKey?: string } } | null
        const statusKey = payload?.data?.statusKey
        if (statusKey) {
          sliceClickedRef.current = true
          navigate(`/employees?status=${statusKey}`)
        }
      },
    }),
    [navigate],
  )

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('dashboard.hr.load_error')} onRetry={refetch} />

  const currency = data.tenant?.currency ?? tenant?.currency ?? 'AOA'
  const companyName = data.tenant?.name ?? tenant?.name
  const formattedToday = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())
  const deptChartHeight = Math.max(240, sortedDepartments.length * 32)
  const probationAndInternship = data.probation_internship ?? data.recent_hires ?? []
  const canViewSalaryCost =
    data.kpis.monthly_payroll_cost !== null
    && (
      hasFieldPermission(user, 'payroll', 'base_salary', 'view')
      || hasFieldPermission(user, 'employee', 'salary', 'view')
      || hasFieldPermission(user, 'report', 'salary_costs', 'view')
    )

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
          to="/employees?status=all"
        />
        <KpiCard
          label={t('dashboard.hr.active_employees')}
          value={data.kpis.total_active}
          icon={Activity}
          accent="success"
          to="/employees?status=active"
        />
        {canViewSalaryCost && (
          <KpiCard
            label={t('dashboard.hr.monthly_payroll_cost')}
            value={data.kpis.monthly_payroll_cost ?? 0}
            currency={currency}
            icon={Wallet}
            accent="primary"
            to="/payroll"
          />
        )}
        <KpiCard
          label={t('dashboard.hr.hired_this_month')}
          value={data.kpis.hired_this_month}
          icon={UserPlus}
          accent="info"
          to="/employees?status=all"
        />
        <KpiCard
          label={t('dashboard.hr.terminated_this_month')}
          value={data.kpis.terminated_this_month}
          icon={UserMinus}
          accent="warning"
          to="/employees?status=terminated"
        />
        <KpiCard
          label={t('dashboard.hr.turnover_rate')}
          value={`${data.kpis.turnover_rate}%`}
          icon={Activity}
          accent="destructive"
          to="/reports?tab=turnover"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card
          onClick={(e) => navigateFromCard(e, '/reports?tab=headcount')}
          className="flex cursor-pointer flex-col transition-colors hover:border-primary/40 lg:col-span-5"
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t('dashboard.hr.headcount_trend')}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>{t('dashboard.hr.headcount_trend_description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-2">
            <Chart option={trendOption} height={260} />
          </CardContent>
        </Card>

        <Card
          onClick={(e) => navigateFromCard(e, '/organization')}
          className="flex cursor-pointer flex-col transition-colors hover:border-primary/40 lg:col-span-4"
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                {t('dashboard.hr.by_department')}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
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

        <Card
          onClick={(e) => navigateFromCard(e, '/employees?status=all')}
          className="flex cursor-pointer flex-col transition-colors hover:border-primary/40 lg:col-span-3"
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              <span>{t('dashboard.hr.by_status')}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>{t('dashboard.hr.by_status_description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-2 pt-1">
            <Chart option={statusOption} height={180} onEvents={statusChartEvents} />
            <div className="grid grid-cols-2 gap-1.5">
              {statusEntries.map((entry) => {
                const pct = totalStatusCount > 0 ? Math.round((entry.value / totalStatusCount) * 100) : 0
                return (
                  <Link
                    key={entry.key}
                    to={`/employees?status=${entry.key}`}
                    className="flex items-center justify-between gap-1.5 rounded-md border border-border/60 px-2 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-muted/50"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate text-muted-foreground">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {entry.value}
                      <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">({pct}%)</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          onClick={(e) => navigateFromCard(e, '/employees')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                {t('dashboard.hr.probation_internship')}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>{t('dashboard.hr.probation_internship_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">
              {probationAndInternship.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {probationAndInternship.map((item) => {
                const isInternship = item.stage === 'internship' || item.contract_type === 'internship'
                return (
                  <Link
                    key={item.id}
                    to={`/employees/${item.id}`}
                    className="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={item.photo_path ?? undefined} />
                      <AvatarFallback>{item.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.position, item.department].filter(Boolean).join(' · ') || item.employee_code}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={isInternship ? 'secondary' : 'outline'} className="font-normal">
                        {isInternship ? t('dashboard.hr.internship_badge') : t('dashboard.hr.probation_badge')}
                      </Badge>
                      {item.end_date ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('dashboard.hr.until_date', { date: formatDate(item.end_date, locale) })}
                        </p>
                      ) : item.hired_at ? (
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.hired_at, locale)}</p>
                      ) : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={(e) => navigateFromCard(e, '/leave')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-primary" />
                {t('dashboard.hr.pending_leaves')}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.pending_leaves.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.pending_leaves.map((leave) => (
                <Link
                  key={leave.id}
                  to="/leave"
                  className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{leave.employee}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {leave.type} · {t('dashboard.hr.days_count', { count: leave.days })}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {formatDate(leave.start_date, locale)}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          onClick={(e) => navigateFromCard(e, '/employees')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-primary" />
                {t('dashboard.hr.expiring_contracts')}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.expiring_contracts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.expiring_contracts.map((c) => (
                <Link
                  key={c.id}
                  to={c.employee_id ? `/employees/${c.employee_id}` : '/employees'}
                  className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.employee}</p>
                    <p className="font-mono text-xs text-muted-foreground">{c.employee_code}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={c.days_remaining <= 15 ? 'destructive' : c.days_remaining <= 30 ? 'warning' : 'secondary'}>
                      {t('dashboard.hr.days_remaining', { count: Math.round(c.days_remaining) })}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.end_date, locale)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={(e) => navigateFromCard(e, '/employees')}
          className="cursor-pointer transition-colors hover:border-primary/40"
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-primary" />
                {t('dashboard.hr.upcoming_birthdays')}
              </span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
            <CardDescription>{t('dashboard.hr.upcoming_birthdays_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[260px] space-y-2.5 overflow-y-auto pr-1">
              {data.birthdays.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.birthdays.map((b) => {
                const daysUntil = b.days_until
                const proximityLabel =
                  daysUntil === 0
                    ? t('dashboard.hr.birthday_today')
                    : daysUntil === 1
                      ? t('dashboard.hr.birthday_tomorrow')
                      : typeof daysUntil === 'number'
                        ? t('dashboard.hr.birthday_in_days', { count: daysUntil })
                        : null

                return (
                  <Link
                    key={b.id}
                    to={`/employees/${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.full_name}</p>
                      {proximityLabel && (
                        <p className="text-xs text-muted-foreground">{proximityLabel}</p>
                      )}
                    </div>
                    <Badge
                      variant={daysUntil === 0 ? 'default' : 'outline'}
                      className="shrink-0 font-mono"
                    >
                      {formatBirthdayDate(b.upcoming_date, b.birth_date, locale)}
                    </Badge>
                  </Link>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

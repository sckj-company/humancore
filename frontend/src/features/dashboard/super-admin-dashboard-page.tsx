import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Activity,
  Users,
  UserCog,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Globe,
  ArrowRight,
} from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { KpiCard } from '@/components/shared/kpi-card'
import { Chart } from '@/components/charts/chart'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'

interface SuperAdminDashboardData {
  kpis: {
    total_tenants: number
    active_tenants: number
    suspended_tenants: number
    total_employees: number
    active_employees: number
    total_users: number
    super_admins: number
  }
  tenant_trend: { month: string; label: string; count: number }[]
  by_status: { [key: string]: number }
  segments: { small: number; medium: number; large: number }
  by_tenant: {
    id: number
    name: string
    slug: string
    status: string
    employees: number
    created_at: string
  }[]
}

const ACENTS = { true: 'success', false: 'destructive' } as const

export function SuperAdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language

  const { data, isLoading, isError, refetch } = useQuery<SuperAdminDashboardData>({
    queryKey: ['dashboard', 'super-admin'],
    queryFn: () => api.get<SuperAdminDashboardData>('superadmin/dashboard'),
  })

  const firstName = useMemo(() => {
    const name = user?.name ?? ''
    return name.split(' ')[0]
  }, [user])

  const trendOption: EChartsOption = useMemo(() => {
    const labels = (data?.tenant_trend ?? []).map((d) => d.label)
    const values = (data?.tenant_trend ?? []).map((d) => d.count)
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
        padding: [8, 12],
      },
      grid: { left: 0, right: 0, top: 12, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: 'var(--muted-foreground)', fontSize: 11, margin: 12 },
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
          name: t('superAdminDashboard.tenants'),
          type: 'bar',
          barWidth: '45%',
          data: values,
          itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [data, t])

  const statusOption: EChartsOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)' },
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: 'var(--muted-foreground)' },
        itemWidth: 8,
        itemHeight: 8,
      },
      color: ['#10b981', '#94a3b8', '#ef4444'],
      series: [
        {
          name: 'Estado Tenants',
          type: 'pie',
          radius: ['55%', '78%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: 'var(--card)', borderWidth: 2 },
          label: { show: false },
          data: Object.entries(data?.by_status ?? {}).map(([k, v]) => ({
            name: t(`superAdminDashboard.status.${k}`, { defaultValue: k }),
            value: v,
          })),
        },
      ],
    }
  }, [data, t])

  const segmentsOption: EChartsOption = useMemo(() => {
    const segments = data?.segments ?? { small: 0, medium: 0, large: 0 }
    const labels = [
      t('superAdminDashboard.segmentLabels.small'),
      t('superAdminDashboard.segmentLabels.medium'),
      t('superAdminDashboard.segmentLabels.large'),
    ]
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      },
      grid: { left: 0, right: 0, top: 12, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: 'var(--muted-foreground)', fontSize: 11 },
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
          name: t('superAdminDashboard.tenants'),
          type: 'bar',
          barWidth: '40%',
          data: [segments.small, segments.medium, segments.large],
          itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [data, t])

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('employeeDashboard.loadError')} onRetry={refetch} />

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.12),transparent_60%)] md:block" />
        <CardContent className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{t('superAdminDashboard.platform')}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
              {t('superAdminDashboard.title')}
              {firstName ? ` · ${firstName}` : ''}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t('superAdminDashboard.subtitle')}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/80">
              {new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/organization">
                <Globe className="h-3.5 w-3.5" />
                {t('superAdminDashboard.manageTenants')}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <KpiCard label={t('superAdminDashboard.tenants')} value={data.kpis.total_tenants} icon={Building2} accent="primary" />
        <KpiCard label={t('superAdminDashboard.active')} value={data.kpis.active_tenants} icon={Activity} accent="success" />
        <KpiCard label={t('superAdminDashboard.suspended')} value={data.kpis.suspended_tenants} icon={AlertTriangle} accent="destructive" />
        <KpiCard label={t('superAdminDashboard.employees')} value={data.kpis.total_employees} icon={Users} accent="info" />
        <KpiCard label={t('superAdminDashboard.activeEmployees')} value={data.kpis.active_employees} icon={Users} accent="success" />
        <KpiCard label={t('superAdminDashboard.users')} value={data.kpis.total_users} icon={UserCog} accent="warning" />
        <KpiCard label={t('superAdminDashboard.superAdmins')} value={data.kpis.super_admins} icon={ShieldCheck} accent="neutral" />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">
                {t('superAdminDashboard.tenantTrend')}
              </CardTitle>
              <CardDescription>{t('superAdminDashboard.tenantTrendDescription')}</CardDescription>
            </div>
            <Badge variant="soft" className="gap-1">
              <TrendingUp className="h-3 w-3 text-success" />
              {t('superAdminDashboard.totalCount', { count: data.tenant_trend.reduce((a, b) => a + b.count, 0) })}
            </Badge>
          </CardHeader>
          <CardContent className="pl-0">
            <Chart option={trendOption} height={300} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('superAdminDashboard.byStatus')}
            </CardTitle>
            <CardDescription>{t('superAdminDashboard.statusDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={statusOption} height={180} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('superAdminDashboard.segments')}
            </CardTitle>
            <CardDescription>{t('superAdminDashboard.segmentDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <Chart option={segmentsOption} height={240} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('superAdminDashboard.tenantsTable')}</CardTitle>
            <CardDescription>{t('superAdminDashboard.tenantsTableDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t('superAdminDashboard.company')}</th>
                    <th className="px-4 py-3 font-medium">{t('superAdminDashboard.slug')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('superAdminDashboard.employees')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('superAdminDashboard.created')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_tenant.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        {t('superAdminDashboard.noTenants')}
                      </td>
                    </tr>
                  ) : (
                    data.by_tenant.map((tenant) => (
                      <tr key={tenant.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{tenant.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{tenant.employees}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(
                            new Date(tenant.created_at),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant={ACENTS[tenant.status === 'active' ? 'true' : 'false']}>
                            {t(`superAdminDashboard.status.${tenant.status}`, { defaultValue: tenant.status })}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
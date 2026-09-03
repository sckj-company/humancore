import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Users, UserPlus, UserMinus, Activity, Wallet, Cake, FileSignature, CalendarOff } from 'lucide-react'
import type { EChartsOption } from 'echarts'
import { api } from '@/lib/api'
import { KpiCard } from '@/components/shared/kpi-card'
import { Chart } from '@/components/charts/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'

interface HrDashboardData {
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

export function HrDashboardPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const tenant = user?.tenant

  const { data, isLoading, isError, refetch } = useQuery<HrDashboardData>({
    queryKey: ['dashboard', 'hr'],
    queryFn: () => api.get<HrDashboardData>('dashboard/hr'),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message="Não foi possível carregar o dashboard." onRetry={refetch} />

  const currency = tenant?.currency ?? 'AOA'
  const locale = i18n.language

  const trendOption: EChartsOption = {
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.headcount_trend.map((d) => d.label),
      axisLine: { lineStyle: { color: 'rgba(100,116,139,0.3)' } },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Funcionários',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.headcount_trend.map((d) => d.count),
        itemStyle: { color: 'var(--primary)' },
        lineStyle: { width: 2, color: 'var(--primary)' },
        areaStyle: { color: 'rgba(37,99,235,0.1)' },
      },
    ],
  }

  const byDeptOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [
      {
        name: 'Departamento',
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: 'var(--card)', borderWidth: 2 },
        label: { formatter: '{b}\n{d}%' },
        data: data.by_department.map((d) => ({ name: d.name, value: d.count })),
      },
    ],
  }

  const statusOption: EChartsOption = {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [
      {
        name: 'Estado',
        type: 'pie',
        radius: '70%',
        label: { show: false },
        data: Object.entries(data.by_status).map(([k, v]) => ({
          name: k.charAt(0).toUpperCase() + k.slice(1),
          value: v,
        })),
      },
    ],
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.hr.title')}
        description={`${new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
        <KpiCard
          label={t('dashboard.hr.monthly_payroll_cost')}
          value={data.kpis.monthly_payroll_cost}
          currency={currency}
          icon={Wallet}
          accent="primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.hr.headcount_trend')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={trendOption} height={280} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.hr.by_department')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={byDeptOption} height={280} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.hr.recent_hires')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.recent_hires.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.recent_hires.map((hire) => (
                <div key={hire.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={hire.photo_path ?? undefined} />
                    <AvatarFallback>{hire.full_name.split(' ').slice(0, 2).map((n) => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{hire.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {hire.position} {hire.department && `· ${hire.department}`}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hire.hired_at && new Intl.DateTimeFormat(locale).format(new Date(hire.hired_at))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarOff className="h-4 w-4" /> {t('dashboard.hr.pending_leaves')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.pending_leaves.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.pending_leaves.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{leave.employee}</p>
                    <p className="text-xs text-muted-foreground">{leave.type} · {leave.days} dias</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale).format(new Date(leave.start_date))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4" /> {t('dashboard.hr.expiring_contracts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.expiring_contracts.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.expiring_contracts.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{c.employee}</p>
                    <p className="text-xs text-muted-foreground">{c.employee_code}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium text-warning">{c.days_remaining} dias</p>
                    <p className="text-muted-foreground">{c.end_date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-4 w-4" /> {t('dashboard.hr.upcoming_birthdays')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.birthdays.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
              )}
              {data.birthdays.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <p className="text-sm font-medium">{b.full_name}</p>
                  <p className="text-xs text-muted-foreground">{b.birth_date}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <Chart option={statusOption} height={240} />
        </CardContent>
      </Card>
    </div>
  )
}

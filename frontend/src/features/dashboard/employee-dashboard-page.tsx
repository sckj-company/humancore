import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Wallet, Calendar, FileText, Cake } from 'lucide-react'
import { api } from '@/lib/api'
import { KpiCard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'

interface EmployeeDashboard {
  profile: {
    id: number
    full_name: string
    employee_code: string
    photo_path?: string
    department?: string
    position?: string
    hired_at?: string
    email?: string
    phone?: string
  }
  contract: { base_salary: number; contract_type: string; salary_frequency: string; start_date: string } | null
  leave: { annual_quota: number; used_days: number; remaining_days: number }
  recent_payslips: unknown[]
}

export function EmployeeDashboardPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const { data, isLoading, isError, refetch } = useQuery<EmployeeDashboard>({
    queryKey: ['dashboard', 'employee'],
    queryFn: () => api.get<EmployeeDashboard>('dashboard/employee'),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('employeeDashboard.loadError')} onRetry={refetch} />

  const locale = i18n.language

  return (
    <div className="space-y-6">
      <PageHeader title={t('dashboard.title')} description={t('employeeDashboard.welcome', { name: data.profile.full_name.split(' ')[0] })} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('employeeDashboard.baseSalary')}
          value={data.contract?.base_salary ?? 0}
          currency={currency}
          icon={Wallet}
          accent="primary"
        />
        <KpiCard
          label={t('employeeDashboard.remainingLeave')}
          value={`${data.leave.remaining_days}/${data.leave.annual_quota}`}
          icon={Calendar}
          accent="info"
        />
        <KpiCard
          label={t('employeeDashboard.daysUsed')}
          value={data.leave.used_days}
          icon={FileText}
          accent="success"
        />
        <KpiCard
          label={t('employeeDashboard.anniversary')}
          value={data.profile.hired_at ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long' }).format(new Date(data.profile.hired_at)) : '—'}
          icon={Cake}
          accent="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('employeeDashboard.profile')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('employees.code')} value={data.profile.employee_code} />
              <Field label={t('employees.position')} value={data.profile.position} />
              <Field label={t('employees.department')} value={data.profile.department} />
              <Field label={t('common.email')} value={data.profile.email} />
              <Field label={t('common.phone')} value={data.profile.phone} />
              <Field label={t('employees.hired_at')} value={data.profile.hired_at ? new Intl.DateTimeFormat(locale).format(new Date(data.profile.hired_at)) : '—'} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('employeeDashboard.contract')}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.contract ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('employeeDashboard.contractType')} value={data.contract.contract_type} />
                <Field label={t('employeeDashboard.frequency')} value={data.contract.salary_frequency} />
                <Field label={t('employeeDashboard.start')} value={new Intl.DateTimeFormat(locale).format(new Date(data.contract.start_date))} />
                <Field
                  label={t('employeeDashboard.baseSalary')}
                  value={new Intl.NumberFormat(locale, { style: 'currency', currency }).format(data.contract.base_salary)}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('employeeDashboard.noActiveContract')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value || '—'}</p>
    </div>
  )
}

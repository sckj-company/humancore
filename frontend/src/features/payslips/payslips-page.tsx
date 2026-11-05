import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { FileText, Download, Calendar, TrendingUp, DollarSign, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable } from '@/components/data/data-table'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/format'
import type { Paginated } from '@/types'

interface PayslipSummary {
  id: number
  employee_id: number
  period_name: string
  payment_date: string
  gross_salary: number
  net_salary: number
  status: string
  created_at: string
}

interface PayslipDetail {
  id: number
  period_name: string
  payment_date: string
  employee: {
    full_name: string
    employee_code: string
    department?: string
    position?: string
  }
  contract: {
    base_salary: number
    salary_frequency: string
  }
  earnings: {
    name: string
    amount: number
  }[]
  deductions: {
    name: string
    amount: number
  }[]
  taxes: {
    name: string
    amount: number
  }[]
  gross_salary: number
  total_earnings: number
  total_deductions: number
  total_taxes: number
  net_salary: number
  work_days: number
  absent_days: number
  overtime_hours: number
  details: Record<string, number>
}

const payslipStatusLabels: Record<string, string> = {
  paid: 'payslips.paid',
  pending: 'common.pending',
  approved: 'payroll.recordStatuses.approved',
  rejected: 'payroll.recordStatuses.rejected',
  draft: 'payroll.recordStatuses.draft',
}

export function PayslipsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const { data: payslips, isLoading } = useQuery({
    queryKey: ['my-payslips'],
    queryFn: () => api.get<Paginated<PayslipSummary>>('payroll/my-payslips', { per_page: 24 }),
  })

  const totalPaid = payslips?.data.reduce((sum, p) => sum + p.net_salary, 0) ?? 0
  const currency = user?.tenant?.currency ?? 'AOA'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('payslips.eyebrow')}
        title={t('payslips.title')}
        description={t('payslips.description')}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('payslips.totalReceipts')}</p>
              <p className="text-xl font-semibold">{payslips?.meta?.total ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('payslips.totalReceived')}</p>
              <p className="text-xl font-semibold">
                {formatCurrency(totalPaid, currency, i18n.language)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <TrendingUp className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('payslips.lastPayment')}</p>
              <p className="text-xl font-semibold">
                {payslips?.data[0]
                  ? formatCurrency(payslips.data[0].net_salary, currency, i18n.language)
                  : '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={payslips?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        columns={[
          {
            id: 'period',
            header: t('payslips.period'),
            cell: (r) => (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{r.period_name}</span>
              </div>
            ),
          },
          {
            id: 'payment_date',
            header: t('payslips.paymentDate'),
            cell: (r) => formatDate(r.payment_date, i18n.language),
          },
          {
            id: 'gross',
            header: t('payslips.gross'),
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm">
                {formatCurrency(r.gross_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'deductions',
            header: t('payslips.deductions'),
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm text-destructive">
                -{formatCurrency(r.gross_salary - r.net_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'net',
            header: t('payslips.net'),
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm font-semibold text-success">
                {formatCurrency(r.net_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'status',
            header: t('payslips.status'),
            align: 'right',
            cell: (r) => {
              const statusKey = payslipStatusLabels[r.status] ?? `payroll.recordStatuses.${r.status}`
              return (
                <Badge variant={r.status === 'paid' ? 'success' : 'secondary'}>
                  {t(statusKey, { defaultValue: r.status })}
                </Badge>
              )
            },
          },
          {
            id: 'actions',
            header: t('payslips.actions'),
            align: 'right',
            cell: (r) => <PayslipDownloadButton recordId={r.id} fileName={`recibo-${r.employee_id}-${r.id}.pdf`} />,
          },
        ]}
        emptyTitle={t('payslips.emptyTitle')}
        emptyDescription={t('payslips.emptyDescription')}
      />
    </div>
  )
}

function PayslipDownloadButton({ recordId, fileName }: { recordId: number; fileName: string }) {
  const { t } = useTranslation()
  const mutation = useMutation({
    mutationFn: () => api.downloadFile(`payroll/records/${recordId}/payslip.pdf`, fileName),
    onError: (error) => toast.error(getApiErrorMessage(error, t('payslips.downloadError'))),
  })

  return (
    <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
      {t('payslips.download')}
    </Button>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileText, Download, Calendar, TrendingUp, DollarSign, Loader2, Eye } from 'lucide-react'
import { api } from '@/lib/api'
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
        eyebrow="FOLHA SALARIAL"
        title="Os Meus Recibos"
        description="Consulte e descarregue os seus recibos de vencimento"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total de Recibos</p>
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
              <p className="text-xs text-muted-foreground">Total Recebido</p>
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
              <p className="text-xs text-muted-foreground">Último Vencimento</p>
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
            header: 'Período',
            cell: (r) => (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{r.period_name}</span>
              </div>
            ),
          },
          {
            id: 'payment_date',
            header: 'Data Pagamento',
            cell: (r) => formatDate(r.payment_date, i18n.language),
          },
          {
            id: 'gross',
            header: 'Salário Bruto',
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm">
                {formatCurrency(r.gross_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'deductions',
            header: 'Descontos',
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm text-destructive">
                -{formatCurrency(r.gross_salary - r.net_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'net',
            header: 'Líquido',
            align: 'right',
            cell: (r) => (
              <span className="font-mono text-sm font-semibold text-success">
                {formatCurrency(r.net_salary, currency, i18n.language)}
              </span>
            ),
          },
          {
            id: 'status',
            header: 'Estado',
            align: 'right',
            cell: (r) => (
              <Badge variant={r.status === 'paid' ? 'success' : 'secondary'}>
                {r.status === 'paid' ? 'Pago' : r.status}
              </Badge>
            ),
          },
          {
            id: 'actions',
            header: 'Ações',
            align: 'right',
            cell: (r) => (
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/v1/payroll/records/${r.id}/payslip.pdf`} target="_blank" rel="noopener noreferrer">
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Ver
                  </a>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/api/v1/payroll/records/${r.id}/payslip.pdf?download=1`} download>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    PDF
                  </a>
                </Button>
              </div>
            ),
          },
        ]}
        emptyTitle="Sem recibos de vencimento"
        emptyDescription="Os seus recibos aparecerão aqui após o processamento salarial."
      />
    </div>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

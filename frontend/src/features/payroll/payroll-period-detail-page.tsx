import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { PayrollPeriod } from '@/types'

const currencyFormatter = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 })

export function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-period', id],
    queryFn: () => api.get<PayrollPeriod>(`payroll/periods/${id}`),
    enabled: !!id,
  })

  const downloadPayslip = (recordId: number, filename: string) => {
    const token = localStorage.getItem('hrms_token')
    const url = `${import.meta.env.VITE_API_URL ?? '/api/v1'}/payroll/records/${recordId}/payslip.pdf`
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('failed')
        return res.blob()
      })
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        a.click()
        URL.revokeObjectURL(a.href)
      })
  }

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message="Não foi possível carregar o período." onRetry={refetch} />
  if (!data) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.name}
        description={`${formatDate(data.period_start, i18n.language)} – ${formatDate(data.period_end, i18n.language)}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/payroll">
              <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Estado" value={<Badge variant="secondary">{data.status}</Badge>} />
        <SummaryCard label="Funcionários" value={String(data.employee_count ?? 0)} />
        <SummaryCard label="Total Bruto" value={data.total_gross != null ? currencyFormatter.format(data.total_gross) : '—'} />
        <SummaryCard label="Total Líquido" value={data.total_net != null ? currencyFormatter.format(data.total_net) : '—'} />
      </div>

      <Card>
        <CardContent className="p-0">
          {!data.records || data.records.length === 0 ? (
            <EmptyState title="Sem registos" description="Processe este período para gerar os registos salariais." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">Funcionário</th>
                    <th className="px-6 py-3 font-medium text-right">Dias</th>
                    <th className="px-6 py-3 font-medium text-right">Base</th>
                    <th className="px-6 py-3 font-medium text-right">Bruto</th>
                    <th className="px-6 py-3 font-medium text-right">Descontos</th>
                    <th className="px-6 py-3 font-medium text-right">Impostos</th>
                    <th className="px-6 py-3 font-medium text-right">Líquido</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                    <th className="px-6 py-3 text-right font-medium">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.records!.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div>
                          <p className="font-medium">{r.employee?.full_name ?? `#${r.employee_id}`}</p>
                          <p className="text-xs text-muted-foreground">{r.employee?.employee_code}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{r.work_days}</td>
                      <td className="px-6 py-3 text-right font-mono">{currencyFormatter.format(r.base_salary)}</td>
                      <td className="px-6 py-3 text-right font-mono">{currencyFormatter.format(r.gross_salary)}</td>
                      <td className="px-6 py-3 text-right font-mono text-destructive">-{currencyFormatter.format(r.total_deductions + r.total_taxes)}</td>
                      <td className="px-6 py-3 text-right font-mono">{currencyFormatter.format(r.net_salary)}</td>
                      <td className="px-6 py-3 text-right font-mono font-medium">{currencyFormatter.format(r.net_salary)}</td>
                      <td className="px-6 py-3 text-right">
                        <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Descarregar recibo (PDF)"
                          onClick={() =>
                            downloadPayslip(r.id, `recibo-${r.employee?.employee_code ?? r.id}.pdf`)
                          }
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

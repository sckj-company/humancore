import { useTranslation } from 'react-i18next'
import { Plus, Scale, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DeductionInstallment } from '@/types'

export interface InstallmentDraftRow {
  reference_month: string
  percentage: string
}

export function addMonthsToPeriod(period: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) {
    const now = new Date()
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
  }
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const target = new Date(year, monthIndex + offset, 1)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
}

export function buildEvenInstallmentRows(count: number, startPeriod: string): InstallmentDraftRow[] {
  const safeCount = Math.max(1, Math.min(60, Math.floor(count)))
  const basePct = Math.floor((100 / safeCount) * 100) / 100
  let accumulated = 0
  return Array.from({ length: safeCount }, (_, index) => {
    const isLast = index === safeCount - 1
    const pct = isLast ? Number((100 - accumulated).toFixed(2)) : basePct
    accumulated = Number((accumulated + pct).toFixed(2))
    return {
      reference_month: addMonthsToPeriod(startPeriod, index),
      percentage: pct.toFixed(2),
    }
  })
}

export function rebalanceEvenPercentages(rows: InstallmentDraftRow[]): InstallmentDraftRow[] {
  if (rows.length === 0) return []
  const basePct = Math.floor((100 / rows.length) * 100) / 100
  let accumulated = 0
  return rows.map((row, index) => {
    const isLast = index === rows.length - 1
    const pct = isLast ? Number((100 - accumulated).toFixed(2)) : basePct
    accumulated = Number((accumulated + pct).toFixed(2))
    return { ...row, percentage: pct.toFixed(2) }
  })
}

export function getInstallmentsPercentageSum(rows: InstallmentDraftRow[]): number {
  return Number(rows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0).toFixed(2))
}

export function areInstallmentsValid(rows: InstallmentDraftRow[], totalAmount: number): boolean {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || rows.length === 0) return false
  const sum = getInstallmentsPercentageSum(rows)
  if (Math.abs(sum - 100) > 0.05) return false
  return rows.every((r) => /^\d{4}-(0[1-9]|1[0-2])$/.test(r.reference_month) && Number(r.percentage) > 0)
}

export function DeductionInstallmentsPlanner({
  rows,
  totalAmount,
  onChange,
  disabled = false,
}: {
  rows: InstallmentDraftRow[]
  totalAmount: number
  onChange: (next: InstallmentDraftRow[]) => void
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const totalPct = getInstallmentsPercentageSum(rows)
  const isSumOk = Math.abs(totalPct - 100) <= 0.05
  const validTotal = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : 0

  const handleAddRow = () => {
    const lastMonth = rows[rows.length - 1]?.reference_month ?? new Date().toISOString().slice(0, 7)
    const remainingPct = Math.max(0, Number((100 - totalPct).toFixed(2)))
    onChange([
      ...rows,
      {
        reference_month: rows.length > 0 ? addMonthsToPeriod(lastMonth, 1) : lastMonth,
        percentage: remainingPct > 0 ? remainingPct.toFixed(2) : '0.00',
      },
    ])
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {t('deductionsPage.installmentsScheduleTitle', { defaultValue: 'Plano de Parcelas por Mês e Percentagem' })}
          </Label>
          <Badge variant={isSumOk ? 'secondary' : 'destructive'} className="text-xs">
            {t('deductionsPage.percentageSum', { defaultValue: 'Soma' })}: {totalPct.toFixed(2)}% / 100%
          </Badge>
        </div>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange(rebalanceEvenPercentages(rows))}
              disabled={rows.length === 0}
            >
              <Scale className="mr-1 h-3.5 w-3.5" />
              {t('deductionsPage.splitEvenly', { defaultValue: 'Distribuir igualmente' })}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleAddRow}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('deductionsPage.addInstallment', { defaultValue: 'Adicionar parcela' })}
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-muted/40 text-left uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-2.5 py-2 text-center">#</th>
              <th className="px-2.5 py-2">{t('deductionsPage.deductionMonth', { defaultValue: 'Mês de Desconto' })}</th>
              <th className="w-32 px-2.5 py-2">{t('deductionsPage.percentageCol', { defaultValue: 'Percentagem (%)' })}</th>
              <th className="px-2.5 py-2 text-right">{t('deductionsPage.installmentAmountCol', { defaultValue: 'Valor (Kz)' })}</th>
              {!disabled && <th className="w-10 px-2 py-2 text-right" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, idx) => {
              const pct = Number(row.percentage) || 0
              const computed = validTotal > 0 ? validTotal * (pct / 100) : 0
              return (
                <tr key={idx}>
                  <td className="px-2.5 py-1.5 text-center font-mono text-muted-foreground">{idx + 1}</td>
                  <td className="px-2.5 py-1.5">
                    <Input
                      type="month"
                      className="h-8 text-xs"
                      disabled={disabled}
                      value={row.reference_month}
                      onChange={(e) => {
                        const next = [...rows]
                        next[idx] = { ...row, reference_month: e.target.value }
                        onChange(next)
                      }}
                    />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <Input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      className="h-8 text-xs text-right font-mono"
                      disabled={disabled}
                      value={row.percentage}
                      onChange={(e) => {
                        const next = [...rows]
                        next[idx] = { ...row, percentage: e.target.value }
                        onChange(next)
                      }}
                    />
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono font-medium">
                    {computed.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz
                  </td>
                  {!disabled && (
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={rows.length <= 1}
                        onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!isSumOk && (
        <p className="text-xs text-destructive">
          {t('deductionsPage.percentageSumError', { defaultValue: 'A soma das percentagens das parcelas deve ser exatamente 100% para cobrir o valor total.' })}
        </p>
      )}
    </div>
  )
}

export function DeductionInstallmentsList({ installments }: { installments?: DeductionInstallment[] }) {
  const { t, i18n } = useTranslation()

  if (!installments || installments.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground">
        {t('deductionsPage.noDetailedInstallments', { defaultValue: 'Sem parcelas detalhadas configuradas para este registo.' })}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-background">
      <table className="w-full text-xs">
        <thead className="border-b border-border bg-muted/40 text-left uppercase text-muted-foreground">
          <tr>
            <th className="w-12 px-3 py-2 text-center">#</th>
            <th className="px-3 py-2">{t('deductionsPage.deductionMonth', { defaultValue: 'Mês de Desconto' })}</th>
            <th className="px-3 py-2 text-right">{t('deductionsPage.percentageCol', { defaultValue: 'Percentagem' })}</th>
            <th className="px-3 py-2 text-right">{t('deductionsPage.installmentAmountCol', { defaultValue: 'Valor' })}</th>
            <th className="px-3 py-2 text-center">{t('common.status')}</th>
            <th className="px-3 py-2">{t('deductionsPage.settlementPeriod', { defaultValue: 'Folha / Pagamento' })}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {installments.map((item) => {
            const isPaid = item.status === 'paid'
            const isCancelled = item.status === 'cancelled'
            return (
              <tr key={item.id} className="hover:bg-muted/20">
                <td className="px-3 py-2 text-center font-mono">{item.installment_number}</td>
                <td className="px-3 py-2 font-medium">{item.reference_month}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {item.percentage != null ? `${Number(item.percentage).toFixed(2)}%` : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium">
                  {item.amount != null
                    ? `${Number(item.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`
                    : '—'}
                </td>
                <td className="px-3 py-2 text-center">
                  <Badge
                    variant={isPaid ? 'success' : isCancelled ? 'destructive' : 'outline'}
                    className="text-[11px]"
                  >
                    {isPaid
                      ? t('deductionsPage.installmentPaid', { defaultValue: 'Pago / Descontado' })
                      : isCancelled
                        ? t('deductionsPage.installmentCancelled', { defaultValue: 'Cancelada' })
                        : t('deductionsPage.installmentPending', { defaultValue: 'Pendente' })}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {item.payroll_period_name
                    ? `${item.payroll_period_name}${item.paid_at ? ` · ${new Intl.DateTimeFormat(i18n.language).format(new Date(item.paid_at))}` : ''}`
                    : item.paid_at
                      ? new Intl.DateTimeFormat(i18n.language).format(new Date(item.paid_at))
                      : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

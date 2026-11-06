import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorState, LoadingState } from '@/components/shared/page-header'
import type { Deduction, Paginated } from '@/types'

interface AllowanceValue {
  amount: number
  period: 'daily' | 'weekly' | 'fixed'
  configured: boolean
}

interface EmployeePayrollSettings {
  has_active_contract: boolean
  allowances: {
    meal: AllowanceValue
    transport: AllowanceValue
  }
}

interface AllowanceForm {
  mealAmount: string
  mealPeriod: 'daily' | 'weekly' | 'fixed'
  transportAmount: string
  transportPeriod: 'daily' | 'weekly' | 'fixed'
}

const emptyAllowanceForm: AllowanceForm = {
  mealAmount: '0',
  mealPeriod: 'daily',
  transportAmount: '0',
  transportPeriod: 'daily',
}

export function EmployeePayrollTab({
  employeeId,
  canManageAllowances,
  canManageDeductions,
  canViewDeductions,
}: {
  employeeId: number
  canManageAllowances: boolean
  canManageDeductions: boolean
  canViewDeductions: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [allowances, setAllowances] = useState(emptyAllowanceForm)
  const [deductionName, setDeductionName] = useState('')
  const [deductionType, setDeductionType] = useState<'advance' | 'other'>('advance')
  const [deductionTotal, setDeductionTotal] = useState('')
  const [installmentCount, setInstallmentCount] = useState('1')

  const settings = useQuery({
    queryKey: ['employees', employeeId, 'payroll-settings'],
    queryFn: () => api.get<EmployeePayrollSettings>(`employees/${employeeId}/payroll-settings`),
  })
  const deductions = useQuery({
    queryKey: ['deductions', 'employee', employeeId],
    queryFn: () => api.get<Paginated<Deduction>>('deductions', { employee_id: employeeId, per_page: 100 }),
    enabled: canViewDeductions,
  })

  useEffect(() => {
    const values = settings.data?.allowances
    if (!values) return

    setAllowances({
      mealAmount: String(values.meal.amount),
      mealPeriod: values.meal.period,
      transportAmount: String(values.transport.amount),
      transportPeriod: values.transport.period,
    })
  }, [settings.data])

  const saveAllowances = useMutation({
    mutationFn: () => api.put<EmployeePayrollSettings>(`employees/${employeeId}/payroll-settings`, {
      allowances: {
        meal: { amount: Number(allowances.mealAmount), period: allowances.mealPeriod },
        transport: { amount: Number(allowances.transportAmount), period: allowances.transportPeriod },
      },
    }),
    onSuccess: (value) => {
      toast.success(t('employeeDetail.text.payrollSaved'))
      queryClient.setQueryData(['employees', employeeId, 'payroll-settings'], value)
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'payroll-settings'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeDetail.text.payrollSaveError'))),
  })

  const createDeduction = useMutation({
    mutationFn: () => {
      const total = Number(deductionTotal)
      const installments = Number(installmentCount)
      if (!deductionName.trim() || !Number.isFinite(total) || total <= 0 || !Number.isInteger(installments) || installments < 1) {
        throw new Error(t('employeeDetail.text.invalidDeduction'))
      }

      return api.post<Deduction>('deductions', {
        employee_id: employeeId,
        name: deductionName.trim(),
        deduction_type: deductionType,
        amount_type: 'fixed',
        amount: total,
        total_amount: total,
        installment_count: installments,
        is_recurring: false,
        is_mandatory: false,
        status: 'active',
      })
    },
    onSuccess: () => {
      toast.success(t('employeeDetail.text.deductionCreated'))
      setDeductionName('')
      setDeductionTotal('')
      setInstallmentCount('1')
      queryClient.invalidateQueries({ queryKey: ['deductions', 'employee', employeeId] })
      queryClient.invalidateQueries({ queryKey: ['deductions'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeDetail.text.deductionCreateError'))),
  })

  if (settings.isLoading) return <LoadingState />
  if (settings.isError || !settings.data) {
    return <ErrorState message={t('employeeDetail.text.payrollLoadError')} onRetry={() => settings.refetch()} />
  }

  const renderAllowance = (
    title: string,
    amount: string,
    period: 'daily' | 'weekly' | 'fixed',
    setAmount: (value: string) => void,
    setPeriod: (value: 'daily' | 'weekly' | 'fixed') => void,
  ) => (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('employeeDetail.text.allowanceAmount')}</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!canManageAllowances || !settings.data?.has_active_contract} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('employeeDetail.text.allowancePeriod')}</Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as 'daily' | 'weekly' | 'fixed')} disabled={!canManageAllowances || !settings.data?.has_active_contract}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t('employeeDetail.text.daily')}</SelectItem>
              <SelectItem value="weekly">{t('employeeDetail.text.weekly')}</SelectItem>
              <SelectItem value="fixed">{t('employeeDetail.text.fixedPerPayroll')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('employeeDetail.text.allowancesTitle')}</CardTitle>
          <CardDescription>{t('employeeDetail.text.allowancesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings.data.has_active_contract && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">
              {t('employeeDetail.text.allowancesNeedContract')}
            </p>
          )}
          {renderAllowance(t('employeeDetail.text.mealAllowance'), allowances.mealAmount, allowances.mealPeriod,
            (value) => setAllowances((current) => ({ ...current, mealAmount: value })),
            (value) => setAllowances((current) => ({ ...current, mealPeriod: value })))}
          {renderAllowance(t('employeeDetail.text.transportAllowance'), allowances.transportAmount, allowances.transportPeriod,
            (value) => setAllowances((current) => ({ ...current, transportAmount: value })),
            (value) => setAllowances((current) => ({ ...current, transportPeriod: value })))}
          {canManageAllowances && (
            <div className="flex justify-end">
              <Button onClick={() => saveAllowances.mutate()} disabled={saveAllowances.isPending || !settings.data.has_active_contract}>
                <Save className="mr-2 h-4 w-4" />{t('employeeDetail.text.saveAllowances')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {(canManageDeductions || canViewDeductions) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('employeeDetail.text.spontaneousDeductions')}</CardTitle>
            <CardDescription>{t('employeeDetail.text.spontaneousDeductionsDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {canManageDeductions && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.deductionName')}</Label>
                    <Input value={deductionName} onChange={(event) => setDeductionName(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.deductionType')}</Label>
                    <Select value={deductionType} onValueChange={(value) => setDeductionType(value as 'advance' | 'other')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="advance">{t('employeeDetail.text.salaryAdvance')}</SelectItem>
                        <SelectItem value="other">{t('employeeDetail.text.otherDeduction')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.deductionTotal')}</Label>
                    <Input type="number" min="0.01" step="0.01" value={deductionTotal} onChange={(event) => setDeductionTotal(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.installmentCount')}</Label>
                    <Input type="number" min="1" step="1" value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => createDeduction.mutate()} disabled={createDeduction.isPending || !deductionName.trim() || !deductionTotal}>
                    <Plus className="mr-2 h-4 w-4" />{t('employeeDetail.text.addDeduction')}
                  </Button>
                </div>
              </>
            )}
            {canViewDeductions && deductions.isError && <ErrorState message={t('employeeDetail.text.deductionsLoadError')} onRetry={() => deductions.refetch()} />}
            {canViewDeductions && deductions.data?.data.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">{t('employeeDetail.text.deductionName')}</th>
                    <th className="px-4 py-3">{t('employeeDetail.text.status')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionTotal')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionBalance')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {deductions.data.data.map((deduction) => (
                      <tr key={deduction.id}>
                        <td className="px-4 py-3">{deduction.name}</td>
                        <td className="px-4 py-3">{t(`deductionsPage.statuses.${deduction.status}`, { defaultValue: deduction.status })}</td>
                        <td className="px-4 py-3 text-right">{deduction.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? deduction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right">{Math.max(0, (deduction.total_amount ?? deduction.amount) - deduction.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : canViewDeductions && deductions.isLoading ? <LoadingState /> : canViewDeductions ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('employeeDetail.text.noDeductions')}</p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

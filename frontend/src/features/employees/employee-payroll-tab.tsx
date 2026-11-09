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
import type { Deduction, Employee, Paginated } from '@/types'

interface AllowanceValue {
  amount: number
  period: 'daily' | 'weekly' | 'fixed'
  configured: boolean
}

interface EmployeePayrollSettings {
  has_active_contract: boolean
  advance_monthly_limit: number
  advance_monthly_used: number
  advance_monthly_reserved: number
  advance_monthly_remaining: number
  allowances: {
    meal: AllowanceValue
    transport: AllowanceValue
    vacation: AllowanceValue
    christmas: AllowanceValue
    family: AllowanceValue
    additional: AllowanceValue
  }
}

interface AllowanceForm {
  mealAmount: string
  mealPeriod: 'daily' | 'weekly' | 'fixed'
  transportAmount: string
  transportPeriod: 'daily' | 'weekly' | 'fixed'
  vacationAmount: string
  christmasAmount: string
  familyAmount: string
  additionalAmount: string
}

const emptyAllowanceForm: AllowanceForm = {
  mealAmount: '0',
  mealPeriod: 'daily',
  transportAmount: '0',
  transportPeriod: 'daily',
  vacationAmount: '0',
  christmasAmount: '0',
  familyAmount: '0',
  additionalAmount: '0',
}

export function EmployeePayrollTab({
  employee,
  employeeId,
  canManageAllowances,
  canManageDeductions,
  canViewDeductions,
}: {
  employee: Employee
  employeeId: number
  canManageAllowances: boolean
  canManageDeductions: boolean
  canViewDeductions: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [allowances, setAllowances] = useState(emptyAllowanceForm)
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(
    employee.overtime_hourly_rate == null ? '' : String(employee.overtime_hourly_rate),
  )
  const [deductionName, setDeductionName] = useState('')
  const [deductionType, setDeductionType] = useState<'advance' | 'other'>('advance')
  const [deductionTotal, setDeductionTotal] = useState('')
  const [installmentCount, setInstallmentCount] = useState('1')
  const [deductionStartPeriod, setDeductionStartPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const payrollSettingsQueryKey = ['employees', employeeId, 'payroll-settings', deductionStartPeriod]

  const settings = useQuery({
    queryKey: payrollSettingsQueryKey,
    queryFn: () => api.get<EmployeePayrollSettings>(`employees/${employeeId}/payroll-settings`, { period: deductionStartPeriod }),
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
      vacationAmount: String(values.vacation.amount),
      christmasAmount: String(values.christmas.amount),
      familyAmount: String(values.family.amount),
      additionalAmount: String(values.additional.amount),
    })
  }, [settings.data])

  const saveAllowances = useMutation({
    mutationFn: () => api.put<EmployeePayrollSettings>(`employees/${employeeId}/payroll-settings`, {
      allowances: {
        meal: { amount: Number(allowances.mealAmount), period: allowances.mealPeriod },
        transport: { amount: Number(allowances.transportAmount), period: allowances.transportPeriod },
        vacation: { amount: Number(allowances.vacationAmount), period: 'fixed' },
        christmas: { amount: Number(allowances.christmasAmount), period: 'fixed' },
        family: { amount: Number(allowances.familyAmount), period: 'fixed' },
        additional: { amount: Number(allowances.additionalAmount), period: 'fixed' },
      },
    }),
    onSuccess: (value) => {
      toast.success(t('employeeDetail.text.payrollSaved'))
      queryClient.setQueryData(payrollSettingsQueryKey, value)
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'payroll-settings'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeDetail.text.payrollSaveError'))),
  })

  useEffect(() => {
    setOvertimeHourlyRate(employee.overtime_hourly_rate == null ? '' : String(employee.overtime_hourly_rate))
  }, [employee.overtime_hourly_rate])

  const saveOvertimeRate = useMutation({
    mutationFn: () => {
      const rate = overtimeHourlyRate.trim() === '' ? null : Number(overtimeHourlyRate)
      if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
        throw new Error(t('employeeDetail.text.invalidOvertimeHourlyRate'))
      }

      return api.put<Employee>(`employees/${employeeId}`, { overtime_hourly_rate: rate })
    },
    onSuccess: (updatedEmployee) => {
      toast.success(t('employeeDetail.text.overtimeRateSaved'))
      queryClient.setQueryData(['employees', String(employeeId)], updatedEmployee)
      queryClient.invalidateQueries({ queryKey: ['employees', String(employeeId)] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeDetail.text.overtimeRateSaveError'))),
  })

  const createDeduction = useMutation({
    mutationFn: () => {
      const total = Number(deductionTotal)
      const installments = Number(installmentCount)
      if (!deductionName.trim()
        || !Number.isFinite(total)
        || total <= 0
        || !Number.isInteger(installments)
        || installments < 1
        || !/^\d{4}-(0[1-9]|1[0-2])$/.test(deductionStartPeriod)) {
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
        start_period: deductionStartPeriod,
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
      setDeductionStartPeriod(new Date().toISOString().slice(0, 7))
      queryClient.invalidateQueries({ queryKey: ['deductions', 'employee', employeeId] })
      queryClient.invalidateQueries({ queryKey: ['deductions'] })
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'payroll-settings'] })
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
    periodEditable = true,
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
          <Select value={period} onValueChange={(value) => setPeriod(value as 'daily' | 'weekly' | 'fixed')} disabled={!periodEditable || !canManageAllowances || !settings.data?.has_active_contract}>
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
  const plannedAdvanceInstallment = Number(deductionTotal) / Math.max(1, Number(installmentCount))

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('employeeDetail.text.overtimeRateTitle')}</CardTitle>
          <CardDescription>{t('employeeDetail.text.overtimeRateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="employee-overtime-hourly-rate">{t('employeeDetail.text.overtimeHourlyRate')}</Label>
              <Input
                id="employee-overtime-hourly-rate"
                type="number"
                min="0"
                step="0.01"
                value={overtimeHourlyRate}
                onChange={(event) => setOvertimeHourlyRate(event.target.value)}
                disabled={!canManageAllowances}
              />
            </div>
            <p className="self-end pb-2 text-xs text-muted-foreground">{t('employeeDetail.text.overtimeHourlyRateHint')}</p>
          </div>
          {canManageAllowances && (
            <div className="flex justify-end">
              <Button onClick={() => saveOvertimeRate.mutate()} disabled={saveOvertimeRate.isPending}>
                <Save className="mr-2 h-4 w-4" />{t('employeeDetail.text.saveOvertimeRate')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
          {renderAllowance(t('employeeDetail.text.vacationAllowance'), allowances.vacationAmount, 'fixed',
            (value) => setAllowances((current) => ({ ...current, vacationAmount: value })),
            () => undefined, false)}
          {renderAllowance(t('employeeDetail.text.christmasAllowance'), allowances.christmasAmount, 'fixed',
            (value) => setAllowances((current) => ({ ...current, christmasAmount: value })),
            () => undefined, false)}
          {renderAllowance(t('employeeDetail.text.familyAllowance'), allowances.familyAmount, 'fixed',
            (value) => setAllowances((current) => ({ ...current, familyAmount: value })),
            () => undefined, false)}
          {renderAllowance(t('employeeDetail.text.additionalAllowance'), allowances.additionalAmount, 'fixed',
            (value) => setAllowances((current) => ({ ...current, additionalAmount: value })),
            () => undefined, false)}
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
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.deductionStartPeriod')}</Label>
                    <Input type="month" value={deductionStartPeriod} onChange={(event) => setDeductionStartPeriod(event.target.value)} />
                    <p className="text-xs text-muted-foreground">{t('employeeDetail.text.deductionStartPeriodDescription')}</p>
                  </div>
                </div>
                {deductionType === 'advance' && settings.data && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">
                      {t('employeeDetail.text.advanceMonthlyLimit', {
                        amount: settings.data.advance_monthly_limit.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                      })}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {t('employeeDetail.text.advanceMonthlyRemaining', {
                        amount: settings.data.advance_monthly_remaining.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                      })}
                    </p>
                    {plannedAdvanceInstallment > settings.data.advance_monthly_remaining && (
                      <p className="mt-1 text-xs text-amber-700">
                        {t('employeeDetail.text.advanceInstallmentCapped', {
                          amount: settings.data.advance_monthly_remaining.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                        })}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={() => createDeduction.mutate()}
                    disabled={
                      createDeduction.isPending
                      || !deductionName.trim()
                      || !deductionTotal
                      || (deductionType === 'advance' && settings.data.advance_monthly_remaining <= 0)
                    }
                  >
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
                    <th className="px-4 py-3">{t('employeeDetail.text.deductionStartPeriod')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionTotal')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionBalance')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {deductions.data.data.map((deduction) => (
                      <tr key={deduction.id}>
                        <td className="px-4 py-3">{deduction.name}</td>
                        <td className="px-4 py-3">{t(`deductionsPage.statuses.${deduction.status}`, { defaultValue: deduction.status })}</td>
                        <td className="px-4 py-3">{deduction.start_period ?? '—'}</td>
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

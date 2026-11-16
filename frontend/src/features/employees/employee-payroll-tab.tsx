import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ErrorState, LoadingState } from '@/components/shared/page-header'
import type { Deduction, Employee, Paginated } from '@/types'

type AllowanceKey = 'meal' | 'transport' | 'vacation' | 'christmas' | 'family' | 'additional' | 'bonus'
type AllowancePeriod = 'daily' | 'weekly' | 'fixed'

interface AllowanceValue {
  amount: number
  period: AllowancePeriod
  configured: boolean
  global_amount: number
  global_period: AllowancePeriod
}

interface EmployeePayrollSettings {
  has_active_contract: boolean
  global_overtime_hourly_rate?: number
  advance_monthly_limit: number
  advance_monthly_used: number
  advance_monthly_reserved: number
  advance_monthly_remaining: number
  allowances: Record<AllowanceKey, AllowanceValue>
}

interface AllowanceFieldState {
  amount: string
  period: AllowancePeriod
}

type AllowanceForm = Record<AllowanceKey, AllowanceFieldState>

const emptyAllowanceForm: AllowanceForm = {
  meal: { amount: '', period: 'daily' },
  transport: { amount: '', period: 'daily' },
  vacation: { amount: '', period: 'fixed' },
  christmas: { amount: '', period: 'fixed' },
  family: { amount: '', period: 'fixed' },
  additional: { amount: '', period: 'fixed' },
  bonus: { amount: '', period: 'fixed' },
}

const ALLOWANCE_CONFIG: { key: AllowanceKey; titleKey: string; periodEditable: boolean }[] = [
  { key: 'meal', titleKey: 'employeeDetail.text.mealAllowance', periodEditable: true },
  { key: 'transport', titleKey: 'employeeDetail.text.transportAllowance', periodEditable: true },
  { key: 'vacation', titleKey: 'employeeDetail.text.vacationAllowance', periodEditable: false },
  { key: 'christmas', titleKey: 'employeeDetail.text.christmasAllowance', periodEditable: false },
  { key: 'family', titleKey: 'employeeDetail.text.familyAllowance', periodEditable: false },
  { key: 'additional', titleKey: 'employeeDetail.text.additionalAllowance', periodEditable: false },
  { key: 'bonus', titleKey: 'employeeDetail.text.bonusAllowance', periodEditable: false },
]

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
  const [allowances, setAllowances] = useState<AllowanceForm>(emptyAllowanceForm)
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(
    employee.overtime_hourly_rate == null ? '' : String(employee.overtime_hourly_rate),
  )
  const [deductionName, setDeductionName] = useState('')
  const [deductionType, setDeductionType] = useState<'advance' | 'other'>('advance')
  const [deductionTotal, setDeductionTotal] = useState('')
  const [installmentCount, setInstallmentCount] = useState('1')
  const [deductionStartPeriod, setDeductionStartPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const [actionDialog, setActionDialog] = useState<{ mode: 'cancel' | 'delete'; deduction: Deduction } | null>(null)
  const [actionReason, setActionReason] = useState('')
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

    const next = { ...emptyAllowanceForm }
    for (const { key } of ALLOWANCE_CONFIG) {
      const item = values[key]
      if (!item) continue
      next[key] = {
        amount: item.configured ? String(item.amount) : '',
        period: item.period,
      }
    }
    setAllowances(next)
  }, [settings.data])

  const saveAllowances = useMutation({
    mutationFn: () => {
      const payload: Record<string, { amount: number | null; period: AllowancePeriod; use_global: boolean }> = {}
      for (const { key, periodEditable } of ALLOWANCE_CONFIG) {
        const entry = allowances[key]
        const trimmed = entry.amount.trim()
        const useGlobal = trimmed === ''
        payload[key] = {
          amount: useGlobal ? null : Number(trimmed),
          period: periodEditable ? entry.period : 'fixed',
          use_global: useGlobal,
        }
      }

      return api.put<EmployeePayrollSettings>(`employees/${employeeId}/payroll-settings`, {
        allowances: payload,
      })
    },
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

  const handleDeductionAction = useMutation({
    mutationFn: ({ mode, id, reason }: { mode: 'cancel' | 'delete'; id: number; reason: string }) => {
      if (mode === 'cancel') {
        return api.post(`deductions/${id}/cancel`, { reason })
      }
      return api.delete(`deductions/${id}`, { reason })
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.mode === 'cancel'
          ? t('employeeDetail.text.deductionCancelled')
          : t('employeeDetail.text.deductionDeleted'),
      )
      setActionDialog(null)
      setActionReason('')
      queryClient.invalidateQueries({ queryKey: ['deductions', 'employee', employeeId] })
      queryClient.invalidateQueries({ queryKey: ['deductions'] })
      queryClient.invalidateQueries({ queryKey: ['employees', employeeId, 'payroll-settings'] })
    },
    onError: (error, variables) => toast.error(
      getApiErrorMessage(
        error,
        variables.mode === 'cancel'
          ? t('employeeDetail.text.deductionCancelError')
          : t('employeeDetail.text.deductionDeleteError'),
      ),
    ),
  })

  if (settings.isLoading) return <LoadingState />
  if (settings.isError || !settings.data) {
    return <ErrorState message={t('employeeDetail.text.payrollLoadError')} onRetry={() => settings.refetch()} />
  }

  const globalOvertimeRate = settings.data.global_overtime_hourly_rate ?? 0
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="employee-overtime-hourly-rate">{t('employeeDetail.text.overtimeHourlyRate')}</Label>
                <Badge variant="outline" className="text-[11px]">
                  {overtimeHourlyRate.trim() === ''
                    ? t('employeeDetail.text.globalValueBadge')
                    : t('employeeDetail.text.customValueBadge')}
                </Badge>
              </div>
              <Input
                id="employee-overtime-hourly-rate"
                type="number"
                min="0"
                step="0.01"
                placeholder={globalOvertimeRate > 0 ? String(globalOvertimeRate) : undefined}
                value={overtimeHourlyRate}
                onChange={(event) => setOvertimeHourlyRate(event.target.value)}
                disabled={!canManageAllowances}
              />
            </div>
            <p className="self-end pb-2 text-xs text-muted-foreground">
              {globalOvertimeRate > 0
                ? t('employeeDetail.text.globalOvertimeHourlyRateHint', {
                    amount: globalOvertimeRate.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                  })
                : t('employeeDetail.text.overtimeHourlyRateHint')}
            </p>
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
          {ALLOWANCE_CONFIG.map(({ key, titleKey, periodEditable }) => {
            const entry = allowances[key]
            const serverInfo = settings.data.allowances?.[key]
            const globalAmount = serverInfo?.global_amount ?? 0
            const globalPeriod = serverInfo?.global_period ?? (periodEditable ? 'daily' : 'fixed')
            const isCustom = entry.amount.trim() !== ''

            return (
              <div key={key} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{t(titleKey)}</h3>
                    <Badge variant={isCustom ? 'secondary' : 'outline'} className="text-[11px]">
                      {isCustom
                        ? t('employeeDetail.text.customValueBadge')
                        : t('employeeDetail.text.globalValueBadge')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isCustom && (
                      <span className="text-xs text-muted-foreground">
                        {t('employeeDetail.text.usingGlobalValue', {
                          amount: globalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                        })}
                      </span>
                    )}
                    {isCustom && canManageAllowances && settings.data.has_active_contract && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAllowances((current) => ({
                          ...current,
                          [key]: { amount: '', period: globalPeriod },
                        }))}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        {t('employeeDetail.text.useGlobal')}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.allowanceAmount')}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={String(globalAmount)}
                      value={entry.amount}
                      onChange={(event) => setAllowances((current) => ({
                        ...current,
                        [key]: { ...current[key], amount: event.target.value },
                      }))}
                      disabled={!canManageAllowances || !settings.data?.has_active_contract}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('employeeDetail.text.allowancePeriod')}</Label>
                    <Select
                      value={isCustom ? entry.period : globalPeriod}
                      onValueChange={(value) => setAllowances((current) => ({
                        ...current,
                        [key]: { ...current[key], period: value as AllowancePeriod },
                      }))}
                      disabled={!periodEditable || !canManageAllowances || !settings.data?.has_active_contract}
                    >
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
          })}
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
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3">{t('employeeDetail.text.deductionName')}</th>
                    <th className="px-4 py-3">{t('employeeDetail.text.status')}</th>
                    <th className="px-4 py-3">{t('employeeDetail.text.deductionStartPeriod')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionTotal')}</th>
                    <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionBalance')}</th>
                    {canManageDeductions && <th className="px-4 py-3 text-right">{t('employeeDetail.text.deductionActions')}</th>}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {deductions.data.data.map((deduction) => {
                      const canCancel = deduction.status === 'active' || deduction.status === 'paused'
                      return (
                        <tr key={deduction.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{deduction.name}</p>
                            {deduction.cancellation_reason && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {t('employeeDetail.text.cancellationReasonLabel', { reason: deduction.cancellation_reason })}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={deduction.status === 'cancelled' ? 'destructive' : 'outline'} className="text-xs">
                              {t(`deductionsPage.statuses.${deduction.status}`, { defaultValue: deduction.status })}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{deduction.start_period ?? '—'}</td>
                          <td className="px-4 py-3 text-right">{deduction.total_amount?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? deduction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-right">{Math.max(0, (deduction.total_amount ?? deduction.amount) - deduction.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          {canManageDeductions && (
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canCancel && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-amber-700 hover:text-amber-800"
                                    onClick={() => {
                                      setActionReason('')
                                      setActionDialog({ mode: 'cancel', deduction })
                                    }}
                                  >
                                    <Ban className="mr-1 h-3.5 w-3.5" />
                                    {t('employeeDetail.text.cancelDeduction')}
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                                  onClick={() => {
                                    setActionReason('')
                                    setActionDialog({ mode: 'delete', deduction })
                                  }}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  {t('employeeDetail.text.deleteDeduction')}
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : canViewDeductions && deductions.isLoading ? <LoadingState /> : canViewDeductions ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('employeeDetail.text.noDeductions')}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Dialog open={actionDialog !== null} onOpenChange={(open) => { if (!open) setActionDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.mode === 'cancel'
                ? t('employeeDetail.text.cancelDeductionTitle')
                : t('employeeDetail.text.deleteDeductionTitle')}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.mode === 'cancel'
                ? t('employeeDetail.text.cancelDeductionDescription')
                : t('employeeDetail.text.deleteDeductionDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {actionDialog && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{actionDialog.deduction.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(actionDialog.deduction.total_amount ?? actionDialog.deduction.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} Kz
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="deduction-action-reason">{t('employeeDetail.text.reasonLabel')}</Label>
              <Textarea
                id="deduction-action-reason"
                rows={3}
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder={t('employeeDetail.text.reasonPlaceholder')}
              />
              {actionReason.trim().length > 0 && actionReason.trim().length < 3 && (
                <p className="text-xs text-destructive">{t('employeeDetail.text.reasonRequired')}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setActionDialog(null)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionReason.trim().length < 3 || handleDeductionAction.isPending || !actionDialog}
              onClick={() => {
                if (!actionDialog) return
                handleDeductionAction.mutate({
                  mode: actionDialog.mode,
                  id: actionDialog.deduction.id,
                  reason: actionReason.trim(),
                })
              }}
            >
              {handleDeductionAction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {actionDialog?.mode === 'cancel'
                ? t('employeeDetail.text.confirmCancel')
                : t('employeeDetail.text.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

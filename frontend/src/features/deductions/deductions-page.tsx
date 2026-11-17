import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Loader2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, EmptyState, ErrorState } from '@/components/shared/page-header'
import { DataTable } from '@/components/data/data-table'
import { Progress } from '@/components/ui/progress'
import { DeductionDocumentActions } from '@/features/deductions/deduction-document-actions'
import {
  areInstallmentsValid,
  buildEvenInstallmentRows,
  DeductionInstallmentsList,
  DeductionInstallmentsPlanner,
  type InstallmentDraftRow,
} from '@/features/deductions/deduction-installments-planner'
import type { Deduction, DeductionType, DeductionStatus, AmountType, Paginated, EmployeeSummary } from '@/types'

const deductionTypeOptions: DeductionType[] = [
  'loan',
  'advance',
  'pension',
  'insurance',
  'garnishment',
  'union_fee',
  'other',
]
const customTypeValue = '__custom__'

const statusOptions: DeductionStatus[] = ['active', 'paused', 'completed', 'cancelled']

interface DeductionFormState {
  employee_id: string
  name: string
  deduction_type: DeductionType
  custom_type: string
  amount_type: AmountType
  amount: string
  percentage: string
  total_amount: string
  installment_count: string
  start_period: string
  is_recurring: boolean
  is_mandatory: boolean
  legal_basis: string
  status: DeductionStatus
  notes: string
}

const emptyForm: DeductionFormState = {
  employee_id: '',
  name: '',
  deduction_type: 'other',
  custom_type: '',
  amount_type: 'fixed',
  amount: '',
  percentage: '',
  total_amount: '',
  installment_count: '',
  start_period: new Date().toISOString().slice(0, 7),
  is_recurring: true,
  is_mandatory: false,
  legal_basis: '',
  status: 'active',
  notes: '',
}

function toForm(d: Deduction): DeductionFormState {
  return {
    employee_id: String(d.employee_id),
    name: d.name,
    deduction_type: deductionTypeOptions.includes(d.deduction_type) ? d.deduction_type : customTypeValue,
    custom_type: deductionTypeOptions.includes(d.deduction_type) ? '' : d.deduction_type,
    amount_type: d.amount_type,
    amount: d.amount_type === 'fixed' ? String(d.amount) : '',
    percentage: d.percentage != null ? String(d.percentage) : '',
    total_amount: d.total_amount != null ? String(d.total_amount) : '',
    installment_count: d.installment_count != null ? String(d.installment_count) : '',
    start_period: d.start_period ?? '',
    is_recurring: d.is_recurring,
    is_mandatory: d.is_mandatory,
    legal_basis: d.legal_basis ?? '',
    status: d.status,
    notes: d.notes ?? '',
  }
}

function toPayload(form: DeductionFormState, installmentRows?: InstallmentDraftRow[]) {
  const totalAmount = form.total_amount ? Number(form.total_amount) : null
  const installmentCount = form.installment_count ? Number(form.installment_count) : null
  const useCustomInstallments = Boolean(
    form.amount_type === 'fixed'
    && totalAmount
    && totalAmount > 0
    && installmentRows
    && installmentRows.length > 0,
  )
  const calculatedInstallment = totalAmount && installmentCount
    ? Math.round((totalAmount / installmentCount) * 100) / 100
    : null

  return {
    employee_id: Number(form.employee_id),
    name: form.name,
    deduction_type: form.deduction_type === customTypeValue ? form.custom_type.trim() : form.deduction_type,
    amount_type: form.amount_type,
    amount: form.amount_type === 'fixed' ? calculatedInstallment ?? Number(form.amount || 0) : 0,
    percentage: form.amount_type === 'percentage' ? Number(form.percentage || 0) : null,
    total_amount: totalAmount,
    installment_count: useCustomInstallments ? installmentRows!.length : installmentCount,
    start_period: (useCustomInstallments ? installmentRows![0]?.reference_month : form.start_period) || null,
    ...(useCustomInstallments
      ? {
          installments: installmentRows!.map((r) => ({
            reference_month: r.reference_month,
            percentage: Number(r.percentage),
          })),
        }
      : {}),
    is_recurring: useCustomInstallments ? false : form.is_recurring,
    is_mandatory: form.is_mandatory,
    legal_basis: form.legal_basis.trim() || null,
    status: form.status,
    notes: form.notes || null,
  }
}

export function DeductionsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_deduction')
  const canUpdate = hasPermission(user, 'update_deduction')
  const canDelete = hasPermission(user, 'delete_deduction')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editTarget, setEditTarget] = useState<Deduction | null>(null)
  const [detailTarget, setDetailTarget] = useState<Deduction | null>(null)
  const qc = useQueryClient()

  const deductions = useQuery({
    queryKey: ['deductions', search, statusFilter, typeFilter],
    queryFn: () =>
      api.get<Paginated<Deduction>>('deductions', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        deduction_type: typeFilter !== 'all' ? typeFilter : undefined,
        per_page: 30,
      }),
  })
  const customTypes = useMemo(
    () => [...new Set((deductions.data?.data ?? [])
      .map((deduction) => deduction.deduction_type)
      .filter((type) => !deductionTypeOptions.includes(type)))],
    [deductions.data?.data],
  )

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`deductions/${id}`),
    onSuccess: () => {
      toast.success(t('recruitment.deleted'))
      qc.invalidateQueries({ queryKey: ['deductions'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('deductionsPage.error'))),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('deductionsPage.eyebrow')}
        title={t('deductionsPage.title')}
        description={t('deductionsPage.description')}
        actions={canCreate ? <NewDeductionDialog customTypes={customTypes} onCreated={() => deductions.refetch()} /> : undefined}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('deductionsPage.searchPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('deductionsPage.type')}</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {deductionTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>{t(`deductionsPage.typeOptions.${type}`)}</SelectItem>
                ))}
                {customTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('deductionsPage.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{t(`deductionsPage.statuses.${status}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {deductions.isError && (
        <ErrorState message={t('deductionsPage.error')} onRetry={deductions.refetch} />
      )}

      <DataTable
        data={deductions.data?.data ?? []}
        isLoading={deductions.isLoading}
        rowKey={(r) => r.id}
        emptyTitle={t('deductionsPage.empty')}
        emptyDescription={t('deductionsPage.emptyDescription')}
        columns={[
          {
            id: 'employee',
            header: t('deductionsPage.employee'),
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.employee?.full_name ?? `#${r.employee_id}`}</p>
                {r.employee?.employee_code && (
                  <p className="text-xs text-muted-foreground">{r.employee.employee_code}</p>
                )}
              </div>
            ),
          },
          {
            id: 'name',
            header: t('deductionsPage.name'),
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.type_label}</p>
              </div>
            ),
          },
          {
            id: 'amount',
            header: t('deductionsPage.amount'),
            cell: (r) => <span className="font-medium">{r.amount_label}</span>,
          },
          {
            id: 'progress',
            header: t('deductionsPage.progress'),
            cell: (r) => {
              if (r.total_amount == null || r.total_amount <= 0) {
                return <span className="text-sm text-muted-foreground">{r.is_recurring ? t('deductionsPage.recurring') : '—'}</span>
              }
              const percent = Math.min(100, Math.round((r.paid_amount / r.total_amount) * 100))
              return (
                <div className="flex min-w-[120px] items-center gap-2">
                  <Progress value={percent} className="h-1.5 w-20" />
                  <span className="text-xs text-muted-foreground">{percent}%</span>
                </div>
              )
            },
          },
          {
            id: 'installments',
            header: t('deductionsPage.installments'),
            cell: (r) => (
              <span className="text-sm text-muted-foreground">
                {r.installment_count ? `${r.installment_count} × ${r.installment_amount ?? '—'}` : '—'}
              </span>
            ),
          },
          {
            id: 'requested_at',
            header: t('deductionsPage.requestedDate', { defaultValue: 'Data Pedido' }),
            cell: (r) => {
              const dt = r.requested_at ?? r.created_at
              return (
                <span className="text-xs text-muted-foreground">
                  {dt ? new Intl.DateTimeFormat(i18n.language).format(new Date(dt)) : '—'}
                </span>
              )
            },
          },
          {
            id: 'start_period',
            header: t('deductionsPage.startPeriod'),
            cell: (r) => (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{r.start_period ?? '—'}</span>
                {(r.installments?.length ?? 0) > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-primary"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDetailTarget(r)
                    }}
                  >
                    <ListChecks className="mr-1 h-3.5 w-3.5" />
                    {r.installments!.length}
                  </Button>
                )}
              </div>
            ),
          },
          {
            id: 'receipt',
            header: t('deductionsPage.receiptColumn', { defaultValue: 'Comprovativo' }),
            cell: (r) => <DeductionDocumentActions deduction={r} canUpload={canUpdate} compact />,
          },
          {
            id: 'status',
            header: t('deductionsPage.status'),
            cell: (r) => <Badge variant={r.status_variant}>{r.status_label}</Badge>,
          },
        ]}
        actions={[
          {
            label: t('deductionsPage.viewInstallments', { defaultValue: 'Ver Parcelas' }),
            icon: <ListChecks className="h-4 w-4" />,
            onClick: (r: Deduction) => setDetailTarget(r),
          },
          ...(canUpdate
            ? [{
                label: t('common.edit'),
                icon: <Pencil className="h-4 w-4" />,
                onClick: (r: Deduction) => setEditTarget(r),
              }]
            : []),
          ...(canDelete
            ? [{
                label: t('common.delete'),
                icon: <Trash2 className="h-4 w-4" />,
                destructive: true,
                onClick: (r: Deduction) => {
                  if (window.confirm(`${t('deductionsPage.deleteConfirm')}: ${r.name}?`)) {
                    remove.mutate(r.id)
                  }
                },
              }]
            : []),
        ]}
      />

      <Dialog open={detailTarget !== null} onOpenChange={(open) => { if (!open) setDetailTarget(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailTarget?.name ?? ''}</DialogTitle>
            <DialogDescription>
              {detailTarget?.employee?.full_name} · {detailTarget?.type_label}
              {(detailTarget?.requested_at ?? detailTarget?.created_at)
                ? ` · ${t('deductionsPage.requestedDate', { defaultValue: 'Data Pedido' })}: ${new Intl.DateTimeFormat(i18n.language).format(new Date((detailTarget!.requested_at ?? detailTarget!.created_at)!))}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('deductionsPage.totalAmount')}: </span>
                  <strong>
                    {(detailTarget.total_amount ?? detailTarget.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })} Kz
                  </strong>
                  <span className="mx-2 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{t('deductionsPage.paidAmount', { defaultValue: 'Pago' })}: </span>
                  <strong>{detailTarget.paid_amount.toLocaleString(i18n.language, { minimumFractionDigits: 2 })} Kz</strong>
                </div>
                <DeductionDocumentActions deduction={detailTarget} canUpload={canUpdate} compact />
              </div>
              <DeductionInstallmentsList installments={detailTarget.installments} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>{t('common.close', { defaultValue: 'Fechar' })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeductionFormDialog
        editing={editTarget}
        customTypes={customTypes}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}

function NewDeductionDialog({ onCreated, customTypes }: { onCreated: () => void; customTypes: string[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  return (
    <DeductionFormDialog
      open={open}
      onOpenChange={setOpen}
      customTypes={customTypes}
      onCreated={() => {
        qc.invalidateQueries({ queryKey: ['deductions'] })
        onCreated()
      }}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('deductionsPage.newDeduction')}
        </Button>
      }
    />
  )
}

function DeductionFormDialog({
  editing,
  trigger,
  open,
  onOpenChange,
  onCreated,
  customTypes,
}: {
  editing?: Deduction | null
  trigger?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
  customTypes: string[]
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<DeductionFormState>(emptyForm)
  const [installmentRows, setInstallmentRows] = useState<InstallmentDraftRow[]>([])

  useEffect(() => {
    const nextForm = editing ? toForm(editing) : emptyForm
    setForm(nextForm)
    if (editing?.installments && editing.installments.length > 0) {
      setInstallmentRows(
        editing.installments.map((item) => ({
          reference_month: item.reference_month,
          percentage: String(item.percentage ?? 0),
        })),
      )
    } else if (nextForm.total_amount && nextForm.installment_count && Number(nextForm.installment_count) > 0) {
      setInstallmentRows(
        buildEvenInstallmentRows(
          Number(nextForm.installment_count),
          nextForm.start_period || new Date().toISOString().slice(0, 7),
        ),
      )
    } else {
      setInstallmentRows([])
    }
  }, [editing, open])

  const hasPaidInstallments = Boolean(editing?.installments?.some((i) => i.status === 'paid'))

  const syncInstallmentGrid = (totalVal: string, countVal: string, startPeriodVal: string) => {
    if (hasPaidInstallments) return
    const total = Number(totalVal)
    const count = Number(countVal)
    if (Number.isFinite(total) && total > 0 && Number.isInteger(count) && count >= 1 && count <= 60) {
      setInstallmentRows(
        buildEvenInstallmentRows(count, /^\d{4}-\d{2}$/.test(startPeriodVal) ? startPeriodVal : new Date().toISOString().slice(0, 7)),
      )
    } else if (!totalVal && !countVal) {
      setInstallmentRows([])
    }
  }

  const { data: employeeOptions } = useQuery({
    queryKey: ['employees', 'select'],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', { per_page: 200 }),
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch<Deduction>(`deductions/${editing.id}`, toPayload(form, hasPaidInstallments ? undefined : installmentRows))
        : api.post<Deduction>('deductions', toPayload(form, installmentRows)),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      onOpenChange(false)
      setForm(emptyForm)
      setInstallmentRows([])
      qc.invalidateQueries({ queryKey: ['deductions'] })
      onCreated?.()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('deductionsPage.error'))),
  })
  const totalAmountValue = Number(form.total_amount)
  const installmentCountValue = Number(form.installment_count)
  const amountValue = Number(form.amount)
  const percentageValue = Number(form.percentage)
  const hasCalculatedInstallment = Number.isFinite(totalAmountValue)
    && totalAmountValue > 0
    && Number.isInteger(installmentCountValue)
    && installmentCountValue > 0
  const showInstallmentPlanner = form.amount_type === 'fixed' && hasCalculatedInstallment && installmentRows.length > 0
  const hasInvalidInstallmentsSchedule = showInstallmentPlanner
    && !hasPaidInstallments
    && !areInstallmentsValid(installmentRows, totalAmountValue)
  const hasInvalidInstallmentConfig =
    (form.total_amount !== '' && (!Number.isFinite(totalAmountValue) || totalAmountValue <= 0))
    || (form.installment_count !== '' && (!Number.isInteger(installmentCountValue) || installmentCountValue < 1))
    || hasInvalidInstallmentsSchedule

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            {editing ? t('deductionsPage.editDeduction') : t('deductionsPage.newDeduction')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('deductionsPage.employee')} *</Label>
            <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
              <SelectContent>
                {employeeOptions?.data?.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.full_name} ({e.employee_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('deductionsPage.name')} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.type')}</Label>
            <Select value={form.deduction_type} onValueChange={(v) => setForm({ ...form, deduction_type: v as DeductionType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {deductionTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>{t(`deductionsPage.typeOptions.${type}`)}</SelectItem>
                ))}
                {customTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                <SelectItem value={customTypeValue}>{t('deductionsPage.customType')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.deduction_type === customTypeValue && (
            <div className="space-y-1.5">
              <Label>{t('deductionsPage.customType')} *</Label>
              <Input
                list="deduction-type-suggestions"
                maxLength={50}
                value={form.custom_type}
                onChange={(e) => setForm({ ...form, custom_type: e.target.value })}
                placeholder={t('deductionsPage.customTypePlaceholder')}
              />
              <datalist id="deduction-type-suggestions">
                {customTypes.map((type) => <option key={type} value={type} />)}
              </datalist>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as DeductionStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{t(`deductionsPage.statuses.${status}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.amountType')}</Label>
            <Select value={form.amount_type} onValueChange={(v) => setForm({ ...form, amount_type: v as AmountType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t('deductionsPage.amountTypes.fixed')}</SelectItem>
                <SelectItem value="percentage">{t('deductionsPage.amountTypes.percentage')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.amount_type === 'fixed' ? (
            hasCalculatedInstallment ? (
              <div className="space-y-1.5">
                <Label>{t('deductionsPage.installmentAmount')}</Label>
                <Input
                  readOnly
                  value={`${(Number(form.total_amount) / Number(form.installment_count)).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t('deductionsPage.amountPerPeriod')}</Label>
                <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              <Label>{t('deductionsPage.percentage')}</Label>
              <Input type="number" min="0.01" max={100} step="0.01" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.totalAmount')}</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={form.total_amount}
              onChange={(e) => {
                const nextTotal = e.target.value
                setForm({ ...form, total_amount: nextTotal })
                syncInstallmentGrid(nextTotal, form.installment_count, form.start_period)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.installmentCount')}</Label>
            <Input
              type="number"
              min={1}
              max={60}
              disabled={hasPaidInstallments}
              value={form.installment_count}
              onChange={(e) => {
                const nextCount = e.target.value
                setForm({ ...form, installment_count: nextCount })
                syncInstallmentGrid(form.total_amount, nextCount, form.start_period)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.startPeriod')}</Label>
            <Input
              type="month"
              disabled={hasPaidInstallments}
              value={form.start_period}
              onChange={(e) => {
                const nextPeriod = e.target.value
                setForm({ ...form, start_period: nextPeriod })
                syncInstallmentGrid(form.total_amount, form.installment_count, nextPeriod)
              }}
            />
            <p className="text-xs text-muted-foreground">{t('deductionsPage.startPeriodDescription')}</p>
          </div>
          {showInstallmentPlanner && (
            <div className="md:col-span-2">
              <DeductionInstallmentsPlanner
                rows={installmentRows}
                totalAmount={totalAmountValue}
                disabled={hasPaidInstallments}
                onChange={(next) => {
                  setInstallmentRows(next)
                  setForm((prev) => ({
                    ...prev,
                    installment_count: String(next.length),
                    start_period: next[0]?.reference_month ?? prev.start_period,
                  }))
                }}
              />
            </div>
          )}
          <div className="space-y-3 md:col-span-2">
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_recurring}
                onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
              />
              {t('deductionsPage.recurring')}
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_mandatory}
                onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })}
              />
              {t('deductionsPage.mandatory')}
            </Label>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('deductionsPage.legalBasis')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              maxLength={1000}
              value={form.legal_basis}
              onChange={(e) => setForm({ ...form, legal_basis: e.target.value })}
              placeholder={t('deductionsPage.legalBasisPlaceholder')}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('common.notes')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !form.name.trim()
              || !form.employee_id
              || (form.deduction_type === customTypeValue && !form.custom_type.trim())
              || hasInvalidInstallmentConfig
              || (form.amount_type === 'fixed' && (!Number.isFinite(amountValue) || amountValue <= 0) && !hasCalculatedInstallment)
              || (form.amount_type === 'percentage' && (!Number.isFinite(percentageValue) || percentageValue <= 0))
              || (form.amount_type === 'percentage' && installmentCountValue > 0 && !hasCalculatedInstallment)
              || save.isPending
            }
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
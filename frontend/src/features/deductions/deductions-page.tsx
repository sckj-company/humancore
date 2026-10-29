import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
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

const statusOptions: DeductionStatus[] = ['active', 'paused', 'completed', 'cancelled']

interface DeductionFormState {
  employee_id: string
  name: string
  deduction_type: DeductionType
  amount_type: AmountType
  amount: string
  percentage: string
  total_amount: string
  installment_count: string
  installment_amount: string
  is_recurring: boolean
  status: DeductionStatus
  notes: string
}

const emptyForm: DeductionFormState = {
  employee_id: '',
  name: '',
  deduction_type: 'other',
  amount_type: 'fixed',
  amount: '',
  percentage: '',
  total_amount: '',
  installment_count: '',
  installment_amount: '',
  is_recurring: true,
  status: 'active',
  notes: '',
}

function toForm(d: Deduction): DeductionFormState {
  return {
    employee_id: String(d.employee_id),
    name: d.name,
    deduction_type: d.deduction_type,
    amount_type: d.amount_type,
    amount: d.amount_type === 'fixed' ? String(d.amount) : '',
    percentage: d.percentage != null ? String(d.percentage) : '',
    total_amount: d.total_amount != null ? String(d.total_amount) : '',
    installment_count: d.installment_count != null ? String(d.installment_count) : '',
    installment_amount: d.installment_amount != null ? String(d.installment_amount) : '',
    is_recurring: d.is_recurring,
    status: d.status,
    notes: d.notes ?? '',
  }
}

function toPayload(form: DeductionFormState) {
  return {
    employee_id: Number(form.employee_id),
    name: form.name,
    deduction_type: form.deduction_type,
    amount_type: form.amount_type,
    amount: form.amount_type === 'fixed' ? Number(form.amount || 0) : 0,
    percentage: form.amount_type === 'percentage' ? Number(form.percentage || 0) : null,
    total_amount: form.total_amount ? Number(form.total_amount) : null,
    installment_count: form.installment_count ? Number(form.installment_count) : null,
    installment_amount: form.installment_amount ? Number(form.installment_amount) : null,
    is_recurring: form.is_recurring,
    status: form.status,
    notes: form.notes || null,
  }
}

export function DeductionsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_deduction')
  const canUpdate = hasPermission(user, 'update_deduction')
  const canDelete = hasPermission(user, 'delete_deduction')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editTarget, setEditTarget] = useState<Deduction | null>(null)
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
        actions={canCreate ? <NewDeductionDialog onCreated={() => deductions.refetch()} /> : undefined}
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
            id: 'status',
            header: t('deductionsPage.status'),
            cell: (r) => <Badge variant={r.status_variant}>{r.status_label}</Badge>,
          },
        ]}
        actions={
          canUpdate || canDelete
            ? [
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
              ]
            : undefined
        }
      />

      <DeductionFormDialog
        editing={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}

function NewDeductionDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  return (
    <DeductionFormDialog
      open={open}
      onOpenChange={setOpen}
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
}: {
  editing?: Deduction | null
  trigger?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<DeductionFormState>(emptyForm)

  const { data: employeeOptions } = useQuery({
    queryKey: ['employees', 'select'],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', { per_page: 200 }),
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch<Deduction>(`deductions/${editing.id}`, toPayload(form))
        : api.post<Deduction>('deductions', toPayload(form)),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      onOpenChange(false)
      setForm(emptyForm)
      qc.invalidateQueries({ queryKey: ['deductions'] })
      onCreated?.()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('deductionsPage.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
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
              </SelectContent>
            </Select>
          </div>
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
            <div className="space-y-1.5">
              <Label>{t('deductionsPage.amount')}</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('deductionsPage.percentage')}</Label>
              <Input type="number" min={0} max={100} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.totalAmount')}</Label>
            <Input type="number" min={0} value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.installmentCount')}</Label>
            <Input type="number" min={1} value={form.installment_count} onChange={(e) => setForm({ ...form, installment_count: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('deductionsPage.installmentAmount')}</Label>
            <Input type="number" min={0} value={form.installment_amount} onChange={(e) => setForm({ ...form, installment_amount: e.target.value })} />
          </div>
          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
            />
            {t('deductionsPage.recurring')}
          </Label>
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
          <Button onClick={() => save.mutate()} disabled={!form.name || !form.employee_id || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
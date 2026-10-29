import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
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
import type { Benefit, BenefitType, AmountType, Paginated, EmployeeSummary } from '@/types'

const benefitTypeOptions: BenefitType[] = [
  'health_insurance',
  'transport',
  'meal',
  'housing',
  'vehicle',
  'phone',
  'education',
  'gym',
  'other',
]

interface BenefitFormState {
  employee_id: string
  name: string
  benefit_type: BenefitType
  amount_type: AmountType
  amount: string
  percentage: string
  is_taxable: boolean
  provider: string
  start_date: string
  end_date: string
  status: 'active' | 'inactive'
  notes: string
}

const emptyForm: BenefitFormState = {
  employee_id: '',
  name: '',
  benefit_type: 'other',
  amount_type: 'fixed',
  amount: '',
  percentage: '',
  is_taxable: false,
  provider: '',
  start_date: '',
  end_date: '',
  status: 'active',
  notes: '',
}

function toForm(b: Benefit): BenefitFormState {
  return {
    employee_id: String(b.employee_id),
    name: b.name,
    benefit_type: b.benefit_type,
    amount_type: b.amount_type,
    amount: b.amount_type === 'fixed' ? String(b.amount) : '',
    percentage: b.percentage != null ? String(b.percentage) : '',
    is_taxable: b.is_taxable,
    provider: b.provider ?? '',
    start_date: b.start_date ?? '',
    end_date: b.end_date ?? '',
    status: b.status,
    notes: b.notes ?? '',
  }
}

function toPayload(form: BenefitFormState) {
  return {
    employee_id: Number(form.employee_id),
    name: form.name,
    benefit_type: form.benefit_type,
    amount_type: form.amount_type,
    amount: form.amount_type === 'fixed' ? Number(form.amount || 0) : 0,
    percentage: form.amount_type === 'percentage' ? Number(form.percentage || 0) : null,
    is_taxable: form.is_taxable,
    provider: form.provider || null,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    status: form.status,
    notes: form.notes || null,
  }
}

export function BenefitsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_benefit')
  const canUpdate = hasPermission(user, 'update_benefit')
  const canDelete = hasPermission(user, 'delete_benefit')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editTarget, setEditTarget] = useState<Benefit | null>(null)
  const qc = useQueryClient()

  const benefits = useQuery({
    queryKey: ['benefits', search, statusFilter, typeFilter],
    queryFn: () =>
      api.get<Paginated<Benefit>>('benefits', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        benefit_type: typeFilter !== 'all' ? typeFilter : undefined,
        per_page: 30,
      }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`benefits/${id}`),
    onSuccess: () => {
      toast.success(t('recruitment.deleted'))
      qc.invalidateQueries({ queryKey: ['benefits'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('benefitsPage.error'))),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('benefitsPage.eyebrow')}
        title={t('benefitsPage.title')}
        description={t('benefitsPage.description')}
        actions={canCreate ? <NewBenefitDialog onCreated={() => benefits.refetch()} /> : undefined}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('benefitsPage.searchPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('benefitsPage.type')}</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {benefitTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>{t(`benefitsPage.typeOptions.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('benefitsPage.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="active">{t('benefitsPage.statuses.active')}</SelectItem>
                <SelectItem value="inactive">{t('benefitsPage.statuses.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {benefits.isError && (
        <ErrorState message={t('benefitsPage.error')} onRetry={benefits.refetch} />
      )}

      <DataTable
        data={benefits.data?.data ?? []}
        isLoading={benefits.isLoading}
        rowKey={(r) => r.id}
        emptyTitle={t('benefitsPage.empty')}
        emptyDescription={t('benefitsPage.emptyDescription')}
        columns={[
          {
            id: 'employee',
            header: t('benefitsPage.employee'),
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
            header: t('benefitsPage.name'),
            cell: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.type_label}</p>
              </div>
            ),
          },
          {
            id: 'amount',
            header: t('benefitsPage.amount'),
            cell: (r) => <span className="font-medium">{r.amount_label}</span>,
          },
          {
            id: 'provider',
            header: t('benefitsPage.provider'),
            cell: (r) => <span className="text-sm text-muted-foreground">{r.provider ?? '—'}</span>,
          },
          {
            id: 'period',
            header: t('benefitsPage.period'),
            cell: (r) => (
              <span className="text-sm text-muted-foreground">
                {r.start_date ?? '—'}{r.end_date ? ` → ${r.end_date}` : ''}
              </span>
            ),
          },
          {
            id: 'taxable',
            header: t('benefitsPage.taxable'),
            cell: (r) => (r.is_taxable ? <Badge variant="warning">{t('common.yes')}</Badge> : <Badge variant="secondary">{t('common.no')}</Badge>),
          },
          {
            id: 'status',
            header: t('benefitsPage.status'),
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
                      onClick: (r: Benefit) => setEditTarget(r),
                    }]
                  : []),
                ...(canDelete
                  ? [{
                      label: t('common.delete'),
                      icon: <Trash2 className="h-4 w-4" />,
                      destructive: true,
                      onClick: (r: Benefit) => {
                        if (window.confirm(`${t('benefitsPage.deleteConfirm')}: ${r.name}?`)) {
                          remove.mutate(r.id)
                        }
                      },
                    }]
                  : []),
              ]
            : undefined
        }
      />

      <BenefitFormDialog
        initial={editTarget ? toForm(editTarget) : null}
        editing={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}

function NewBenefitDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  return (
    <BenefitFormDialog
      initial={null}
      open={open}
      onOpenChange={setOpen}
      onCreated={() => {
        qc.invalidateQueries({ queryKey: ['benefits'] })
        onCreated()
      }}
      trigger={
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('benefitsPage.newBenefit')}
        </Button>
      }
    />
  )
}

function BenefitFormDialog({
  initial,
  editing,
  trigger,
  open,
  onOpenChange,
  onCreated,
}: {
  initial: BenefitFormState | null
  editing?: Benefit | null
  trigger?: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<BenefitFormState>(initial ?? emptyForm)

  const { data: employeeOptions } = useQuery({
    queryKey: ['employees', 'select'],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', { per_page: 200 }),
    enabled: open,
  })

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.patch<Benefit>(`benefits/${editing.id}`, toPayload(form))
        : api.post<Benefit>('benefits', toPayload(form)),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      onOpenChange(false)
      setForm(emptyForm)
      qc.invalidateQueries({ queryKey: ['benefits'] })
      onCreated?.()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('benefitsPage.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            {editing ? t('benefitsPage.editBenefit') : t('benefitsPage.newBenefit')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('benefitsPage.employee')} *</Label>
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
            <Label>{t('benefitsPage.name')} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('benefitsPage.type')}</Label>
            <Select value={form.benefit_type} onValueChange={(v) => setForm({ ...form, benefit_type: v as BenefitType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {benefitTypeOptions.map((type) => (
                  <SelectItem key={type} value={type}>{t(`benefitsPage.typeOptions.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('benefitsPage.amountType')}</Label>
            <Select value={form.amount_type} onValueChange={(v) => setForm({ ...form, amount_type: v as AmountType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t('benefitsPage.amountTypes.fixed')}</SelectItem>
                <SelectItem value="percentage">{t('benefitsPage.amountTypes.percentage')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.amount_type === 'fixed' ? (
            <div className="space-y-1.5">
              <Label>{t('benefitsPage.amount')}</Label>
              <Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t('benefitsPage.percentage')}</Label>
              <Input type="number" min={0} max={100} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('benefitsPage.provider')}</Label>
            <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as 'active' | 'inactive' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('benefitsPage.statuses.active')}</SelectItem>
                <SelectItem value="inactive">{t('benefitsPage.statuses.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('benefitsPage.startDate')}</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('benefitsPage.endDate')}</Label>
            <Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <Label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_taxable}
              onChange={(e) => setForm({ ...form, is_taxable: e.target.checked })}
            />
            {t('benefitsPage.taxable')}
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, Plus, Pencil, Trash2, Search, Building2, Shield, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared/page-header'
import {
  type Position,
  type PositionPayload,
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
  useDepartments,
} from './api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

export function PositionsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'

  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)

  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)

  // Form state
  const [formData, setFormData] = useState<PositionPayload>({
    title: '',
    code: '',
    department_id: null,
    description: '',
    requirements: '',
    salary_min: null,
    salary_max: null,
    is_management: false,
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Hooks
  const { data: positions, isLoading, isError, refetch } = usePositions()
  const { data: departments } = useDepartments()

  const createMutation = useCreatePosition()
  const updateMutation = useUpdatePosition()
  const deleteMutation = useDeletePosition()

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingPosition(null)
    setFormData({
      title: '',
      code: '',
      department_id: null,
      description: '',
      requirements: '',
      salary_min: null,
      salary_max: null,
      is_management: false,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Open Edit Dialog
  const handleOpenEdit = (pos: Position) => {
    setEditingPosition(pos)
    setFormData({
      title: pos.title,
      code: pos.code ?? '',
      department_id: pos.department_id ?? null,
      description: pos.description ?? '',
      requirements: pos.requirements ?? '',
      salary_min: pos.salary_min ?? null,
      salary_max: pos.salary_max ?? null,
      is_management: Boolean(pos.is_management),
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.title.trim()) {
      errors.title = t('organizationPage.positions.validation.titleRequired')
    }
    if (
      formData.salary_min != null &&
      formData.salary_max != null &&
      Number(formData.salary_min) > Number(formData.salary_max)
    ) {
      errors.salary_max = t('organizationPage.positions.validation.salaryRange')
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      if (editingPosition) {
        await updateMutation.mutateAsync({
          id: editingPosition.id,
          data: {
            ...formData,
            code: formData.code?.trim() || null,
            description: formData.description?.trim() || null,
            requirements: formData.requirements?.trim() || null,
            salary_min: formData.salary_min ? Number(formData.salary_min) : null,
            salary_max: formData.salary_max ? Number(formData.salary_max) : null,
          },
        })
        toast.success(t('organizationPage.toast.updated', { entity: t('organizationPage.positions.singular') }))
      } else {
        await createMutation.mutateAsync({
          ...formData,
          code: formData.code?.trim() || null,
          description: formData.description?.trim() || null,
          requirements: formData.requirements?.trim() || null,
          salary_min: formData.salary_min ? Number(formData.salary_min) : null,
          salary_max: formData.salary_max ? Number(formData.salary_max) : null,
        })
        toast.success(t('organizationPage.toast.created', { entity: t('organizationPage.positions.singular') }))
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('organizationPage.toast.saveError', { entity: t('organizationPage.positions.singular') })))
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success(t('organizationPage.toast.deleted', { entity: t('organizationPage.positions.singular') }))
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('organizationPage.toast.deleteError', { entity: t('organizationPage.positions.singular') })))
    }
  }

  // Filter positions
  const filtered = (positions ?? []).filter((p) => {
    const matchesSearch =
      !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.code && p.code.toLowerCase().includes(search.toLowerCase()))
    const matchesDept =
      departmentFilter === 'all' ||
      (p.department_id && String(p.department_id) === departmentFilter)
    return matchesSearch && matchesDept
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.positions')}
        description={t('organizationPage.positions.description')}
        actions={
          <Button onClick={handleOpenCreate} className="shadow-sm max-w-full whitespace-normal text-center">
            <Plus className="mr-2 h-4 w-4 shrink-0" /> {t('organizationPage.positions.new')}
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('organizationPage.positions.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('organizationPage.filters.allDepartments')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('organizationPage.filters.allDepartments')}</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={t('organizationPage.positions.loadError')} onRetry={refetch} />}

      {positions && filtered.length === 0 && (
        <EmptyState
          title={t('organizationPage.positions.emptyTitle')}
          description={search ? t('organizationPage.empty.filterHint') : t('organizationPage.positions.emptyDescription')}
        />
      )}

      {/* Positions Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const deptName =
            p.department?.name ?? departments?.find((d) => d.id === p.department_id)?.name

          return (
            <Card key={p.id} className="group relative flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold leading-tight text-foreground">{p.title}</h3>
                      {p.code && (
                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground mt-0.5">
                          {p.code}
                        </span>
                      )}
                    </div>
                  </div>

                  {p.is_management && (
                    <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                      <Shield className="h-3 w-3 text-warning" />
                      {t('organizationPage.positions.management')}
                    </Badge>
                  )}
                </div>

                {p.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {p.description}
                  </p>
                )}

                <div className="mt-4 space-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  {deptName ? (
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{deptName}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/60 italic">{t('organizationPage.positions.noDepartment')}</span>
                  )}

                  {(p.salary_min !== null || p.salary_max !== null) && (
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <DollarSign className="h-3.5 w-3.5 text-success shrink-0" />
                      <span className="font-mono">
                        {p.salary_min
                          ? new Intl.NumberFormat(i18n.language, {
                              style: 'currency',
                              currency,
                              maximumFractionDigits: 0,
                            }).format(p.salary_min)
                          : '—'}
                        {' - '}
                        {p.salary_max
                          ? new Intl.NumberFormat(i18n.language, {
                              style: 'currency',
                              currency,
                              maximumFractionDigits: 0,
                            }).format(p.salary_max)
                          : '—'}
                      </span>
                    </div>
                  )}

                  {p.requirements && (
                    <p className="text-[11px] text-muted-foreground/80 line-clamp-1 italic">
                      {t('organizationPage.positions.requirementsLabel', { requirements: p.requirements })}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleOpenEdit(p)}
                    title={t('organizationPage.actions.edit', { entity: t('organizationPage.positions.singular') })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(p)}
                    title={t('organizationPage.actions.delete', { entity: t('organizationPage.positions.singular') })}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPosition ? t('organizationPage.actions.edit', { entity: t('organizationPage.positions.singular') }) : t('organizationPage.positions.new')}
            </DialogTitle>
            <DialogDescription>
              {editingPosition
                ? t('organizationPage.positions.editDescription')
                : t('organizationPage.positions.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pos-title">{t('organizationPage.positions.titleLabel')} *</Label>
              <Input
                id="pos-title"
                value={formData.title}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                  if (formErrors.title) setFormErrors((prev) => ({ ...prev, title: '' }))
                }}
                placeholder={t('organizationPage.positions.titlePlaceholder')}
              />
              {formErrors.title && (
                <p className="text-xs text-destructive">{formErrors.title}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pos-code">{t('organizationPage.fields.code')}</Label>
                <Input
                  id="pos-code"
                  value={formData.code ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder={t('organizationPage.positions.codePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pos-dept">{t('organizationPage.fields.department')}</Label>
                <Select
                  value={formData.department_id ? String(formData.department_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      department_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="pos-dept">
                    <SelectValue placeholder={t('organizationPage.positions.selectDepartment')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.positions.noDepartment')}</SelectItem>
                    {departments?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pos-salary-min">{t('organizationPage.positions.salaryMinimum', { currency })}</Label>
                <Input
                  id="pos-salary-min"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.salary_min ?? ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      salary_min: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  placeholder={t('organizationPage.positions.amountPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pos-salary-max">{t('organizationPage.positions.salaryMaximum', { currency })}</Label>
                <Input
                  id="pos-salary-max"
                  type="number"
                  min="0"
                  step="any"
                  value={formData.salary_max ?? ''}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      salary_max: e.target.value ? Number(e.target.value) : null,
                    }))
                    if (formErrors.salary_max) setFormErrors((prev) => ({ ...prev, salary_max: '' }))
                  }}
                  placeholder={t('organizationPage.positions.amountPlaceholder')}
                />
                {formErrors.salary_max && (
                  <p className="text-xs text-destructive">{formErrors.salary_max}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="pos-management" className="text-sm font-medium">{t('organizationPage.positions.managementLabel')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('organizationPage.positions.managementDescription')}
                </p>
              </div>
              <Switch
                id="pos-management"
                checked={formData.is_management}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_management: checked }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pos-desc">{t('organizationPage.positions.descriptionLabel')}</Label>
              <Textarea
                id="pos-desc"
                value={formData.description ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
                placeholder={t('organizationPage.positions.descriptionPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pos-req">{t('organizationPage.positions.requirements')}</Label>
              <Textarea
                id="pos-req"
                value={formData.requirements ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, requirements: e.target.value }))
                }
                rows={2}
                placeholder={t('organizationPage.positions.requirementsPlaceholder')}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving}
              >
                {t('organizationPage.common.cancel')}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t('organizationPage.common.saving') : editingPosition ? t('organizationPage.common.saveChanges') : t('organizationPage.positions.new')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('organizationPage.actions.delete', { entity: t('organizationPage.positions.singular') })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.deleteConfirmation', { entity: t('organizationPage.positions.singular') })}{' '}
              <strong className="text-foreground">{deleteTarget?.title}</strong>{'? '}
              {t('organizationPage.deleteWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('organizationPage.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? t('organizationPage.common.deleting') : t('organizationPage.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

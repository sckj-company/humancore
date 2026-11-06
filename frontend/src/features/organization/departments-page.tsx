import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus, Pencil, Trash2, MapPin, User, Search, Layers, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  type Department,
  type DepartmentPayload,
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useBranches,
  useEmployeesSummary,
} from './api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'

export function DepartmentsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)

  // Delete Alert states
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = useState<Department | null>(null)

  // Form states
  const [formData, setFormData] = useState<DepartmentPayload>({
    name: '',
    code: '',
    branch_id: null,
    parent_id: null,
    manager_id: null,
    cost_center: '',
    description: '',
    status: 'active',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Queries & Mutations
  const { data: departments, isLoading, isError, refetch } = useDepartments()
  const { data: branches } = useBranches()
  const { data: employees } = useEmployeesSummary()

  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()
  const deleteMutation = useDeleteDepartment()

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingDepartment(null)
    setFormData({
      name: '',
      code: '',
      branch_id: null,
      parent_id: null,
      manager_id: null,
      cost_center: '',
      description: '',
      status: 'active',
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Open Edit Dialog
  const handleOpenEdit = (dept: Department) => {
    setEditingDepartment(dept)
    setFormData({
      name: dept.name,
      code: dept.code ?? '',
      branch_id: dept.branch_id ?? null,
      parent_id: dept.parent_id ?? null,
      manager_id: dept.manager_id ?? null,
      cost_center: dept.cost_center ?? '',
      description: dept.description ?? '',
      status: dept.status,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.name.trim()) {
      errors.name = t('organizationPage.departments.validation.nameRequired')
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      if (editingDepartment) {
        await updateMutation.mutateAsync({
          id: editingDepartment.id,
          data: {
            ...formData,
            code: formData.code?.trim() || null,
            cost_center: formData.cost_center?.trim() || null,
            description: formData.description?.trim() || null,
          },
        })
        toast.success(t('organizationPage.toast.updated', { entity: t('organizationPage.departments.singular') }))
      } else {
        await createMutation.mutateAsync({
          ...formData,
          code: formData.code?.trim() || null,
          cost_center: formData.cost_center?.trim() || null,
          description: formData.description?.trim() || null,
        })
        toast.success(t('organizationPage.toast.created', { entity: t('organizationPage.departments.singular') }))
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('organizationPage.toast.saveError', { entity: t('organizationPage.departments.singular') })))
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteDepartmentTarget) return
    try {
      await deleteMutation.mutateAsync(deleteDepartmentTarget.id)
      toast.success(t('organizationPage.toast.deleted', { entity: t('organizationPage.departments.singular') }))
      setDeleteDepartmentTarget(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('organizationPage.toast.deleteError', { entity: t('organizationPage.departments.singular') })))
    }
  }

  // Filter departments
  const filtered = (departments ?? []).filter((d) => {
    const matchesSearch =
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.code && d.code.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter
    const matchesBranch =
      branchFilter === 'all' || (d.branch_id && String(d.branch_id) === branchFilter)
    return matchesSearch && matchesStatus && matchesBranch
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.departments')}
        description={t('organizationPage.departments.description')}
        actions={
          <Button onClick={handleOpenCreate} className="shadow-sm max-w-full whitespace-normal text-center">
            <Plus className="mr-2 h-4 w-4 shrink-0" /> {t('organizationPage.departments.new')}
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('organizationPage.departments.searchPlaceholder')}
                className="pl-9"
              />
            </div>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('organizationPage.filters.allBranches')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('organizationPage.filters.allBranches')}</SelectItem>
                {branches?.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('organizationPage.filters.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('organizationPage.filters.allStatuses')}</SelectItem>
                <SelectItem value="active">{t('organizationPage.status.active')}</SelectItem>
                <SelectItem value="inactive">{t('organizationPage.status.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={t('organizationPage.departments.loadError')} onRetry={refetch} />}

      {departments && filtered.length === 0 && (
        <EmptyState
          title={t('organizationPage.departments.emptyTitle')}
          description={search ? t('organizationPage.empty.filterHint') : t('organizationPage.departments.emptyDescription')}
        />
      )}

      {/* Department Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => {
          const branchName = branches?.find((b) => b.id === d.branch_id)?.name
          const parentName = departments?.find((p) => p.id === d.parent_id)?.name
          const managerName =
            d.manager?.full_name ?? employees?.find((e) => e.id === d.manager_id)?.full_name

          return (
            <Card key={d.id} className="group relative flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold leading-tight text-foreground">{d.name}</h3>
                      {d.code && (
                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground mt-0.5">
                          {d.code}
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge variant={d.status === 'active' ? 'default' : 'secondary'} className="capitalize shrink-0">
                    {d.status === 'active' ? t('organizationPage.status.active') : t('organizationPage.status.inactive')}
                  </Badge>
                </div>

                {d.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {d.description}
                  </p>
                )}

                <div className="mt-4 space-y-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  {branchName && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{branchName}</span>
                    </div>
                  )}

                  {parentName && (
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{t('organizationPage.departments.parentLabel', { name: parentName })}</span>
                    </div>
                  )}

                  {managerName && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{t('organizationPage.departments.managerLabel', { name: managerName })}</span>
                    </div>
                  )}

                  {d.cost_center && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate font-mono">{t('organizationPage.departments.costCenterLabel', { code: d.cost_center })}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('organizationPage.departments.employeeCount', { count: d.employee_count ?? 0 })}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEdit(d)}
                      title={t('organizationPage.actions.edit', { entity: t('organizationPage.departments.singular') })}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteDepartmentTarget(d)}
                      title={t('organizationPage.actions.delete', { entity: t('organizationPage.departments.singular') })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
              {editingDepartment ? t('organizationPage.actions.edit', { entity: t('organizationPage.departments.singular') }) : t('organizationPage.departments.new')}
            </DialogTitle>
            <DialogDescription>
              {editingDepartment
                ? t('organizationPage.departments.editDescription')
                : t('organizationPage.departments.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dept-name">{t('organizationPage.departments.name')} *</Label>
              <Input
                id="dept-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }))
                }}
                placeholder={t('organizationPage.departments.namePlaceholder')}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept-code">{t('organizationPage.fields.code')}</Label>
                <Input
                  id="dept-code"
                  value={formData.code ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder={t('organizationPage.departments.codePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-status">{t('organizationPage.fields.status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: 'active' | 'inactive') =>
                    setFormData((prev) => ({ ...prev, status: val }))
                  }
                >
                  <SelectTrigger id="dept-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('organizationPage.status.active')}</SelectItem>
                    <SelectItem value="inactive">{t('organizationPage.status.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept-branch">{t('organizationPage.fields.branch')}</Label>
                <Select
                  value={formData.branch_id ? String(formData.branch_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      branch_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-branch">
                    <SelectValue placeholder={t('organizationPage.departments.selectBranch')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.common.none')}</SelectItem>
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-parent">{t('organizationPage.departments.parent')}</Label>
                <Select
                  value={formData.parent_id ? String(formData.parent_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      parent_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-parent">
                    <SelectValue placeholder={t('organizationPage.departments.noParent')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.departments.noParent')}</SelectItem>
                    {departments
                      ?.filter((d) => !editingDepartment || d.id !== editingDepartment.id)
                      .map((d) => (
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
                <Label htmlFor="dept-manager">{t('organizationPage.fields.manager')}</Label>
                <Select
                  value={formData.manager_id ? String(formData.manager_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      manager_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-manager">
                    <SelectValue placeholder={t('organizationPage.common.selectManager')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.common.none')}</SelectItem>
                    {employees?.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-cc">{t('organizationPage.departments.costCenter')}</Label>
                <Input
                  id="dept-cc"
                  value={formData.cost_center ?? ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cost_center: e.target.value }))
                  }
                  placeholder={t('organizationPage.departments.costCenterPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-desc">{t('organizationPage.fields.description')}</Label>
              <Textarea
                id="dept-desc"
                value={formData.description ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
                placeholder={t('organizationPage.departments.descriptionPlaceholder')}
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
                {isSaving ? t('organizationPage.common.saving') : editingDepartment ? t('organizationPage.common.saveChanges') : t('organizationPage.departments.new')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={!!deleteDepartmentTarget}
        onOpenChange={(open) => !open && setDeleteDepartmentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('organizationPage.actions.delete', { entity: t('organizationPage.departments.singular') })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.deleteConfirmation', { entity: t('organizationPage.departments.singular') })}{' '}
              <strong className="text-foreground">
                {deleteDepartmentTarget?.name}
              </strong>{'? '}
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

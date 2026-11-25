import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Building2,
  Columns2,
  Layers,
  MapPin,
  Network,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  User,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  collectDescendantIds,
  type Department,
  type DepartmentEmployeeItem,
  type DepartmentPayload,
  useAssignDepartmentEmployeesPermissions,
  useAddDepartmentEmployees,
  useBranches,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartmentEmployees,
  useDepartments,
  useEmployeesSummary,
  usePermissionsCatalog,
  useRemoveDepartmentEmployee,
  useUpdateDepartment,
  useUpdateDepartmentPermissions,
} from './api'
import { OrgChartView, type OrgChartMovePayload, type OrgChartNode } from './org-chart-view'
import { SimplePermissionsDialog, type SimplePermissionsSavePayload } from './simple-permissions-dialog'
import { AssignEmployeesDialog, type AssignEmployeesSubmitPayload } from './assign-employees-dialog'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function DepartmentsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'columns' | 'orgchart'>('columns')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null)
  const [cameFromOrgChart, setCameFromOrgChart] = useState(false)

  // Employee panel states
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([])
  const [isAddEmployeesOpen, setIsAddEmployeesOpen] = useState(false)
  const [removeEmployeeTarget, setRemoveEmployeeTarget] = useState<DepartmentEmployeeItem | null>(null)

  // Permissions modal states
  const [permModalMode, setPermModalMode] = useState<'department' | 'employees' | null>(null)
  const [permModalEmployees, setPermModalEmployees] = useState<DepartmentEmployeeItem[]>([])

  // Dialog states (Create / Edit Department)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [levelManuallySet, setLevelManuallySet] = useState(false)

  // Delete Alert states
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = useState<Department | null>(null)

  // Form states
  const [formData, setFormData] = useState<DepartmentPayload>({
    name: '',
    code: '',
    branch_id: null,
    parent_id: null,
    level: 1,
    manager_id: null,
    cost_center: '',
    description: '',
    status: 'active',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Queries & Mutations
  const { data: departments, isLoading, isError, refetch } = useDepartments()
  const { data: branches } = useBranches()
  const { data: employeesSummary } = useEmployeesSummary()
  const { data: catalogData } = usePermissionsCatalog()

  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()
  const deleteMutation = useDeleteDepartment()
  const updateDeptPermissionsMutation = useUpdateDepartmentPermissions()
  const assignEmployeesPermissionsMutation = useAssignDepartmentEmployeesPermissions()
  const addEmployeesMutation = useAddDepartmentEmployees()
  const removeEmployeeMutation = useRemoveDepartmentEmployee()

  // Filter & sort departments by level ASC, name ASC
  const filtered = useMemo(() => {
    return (departments ?? [])
      .filter((d) => {
        const matchesSearch =
          !search ||
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          (d.code && d.code.toLowerCase().includes(search.toLowerCase()))
        const matchesStatus = statusFilter === 'all' || d.status === statusFilter
        const matchesBranch =
          branchFilter === 'all' || (d.branch_id && String(d.branch_id) === branchFilter)
        return matchesSearch && matchesStatus && matchesBranch
      })
      .sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || a.name.localeCompare(b.name))
  }, [departments, search, statusFilter, branchFilter])

  const selectDepartment = (deptId: number | null, fromOrgChart = false) => {
    setSelectedDepartmentId(deptId)
    setCameFromOrgChart(fromOrgChart)
    setSelectedEmployeeIds([])
    setEmployeeSearch('')
  }

  const effectiveSelectedDepartmentId = useMemo(() => {
    if (filtered.length === 0) return null
    if (selectedDepartmentId !== null && filtered.some((d) => d.id === selectedDepartmentId)) {
      return selectedDepartmentId
    }
    return filtered[0].id
  }, [filtered, selectedDepartmentId])

  const selectedDepartment = useMemo(
    () =>
      filtered.find((d) => d.id === effectiveSelectedDepartmentId) ??
      departments?.find((d) => d.id === effectiveSelectedDepartmentId) ??
      null,
    [filtered, departments, effectiveSelectedDepartmentId],
  )

  const {
    data: deptEmployeesData,
    isLoading: isLoadingDeptEmployees,
    isError: isErrorDeptEmployees,
    refetch: refetchDeptEmployees,
  } = useDepartmentEmployees(effectiveSelectedDepartmentId, employeeSearch)

  const departmentEmployees = useMemo(
    () => deptEmployeesData?.employees ?? [],
    [deptEmployeesData?.employees],
  )
  const activeDeptDetail = deptEmployeesData?.department ?? selectedDepartment
  const canManagePermissions =
    deptEmployeesData?.can_manage_permissions ?? catalogData?.can_manage_permissions ?? false
  const canManageEmployees =
    deptEmployeesData?.can_manage_employees ?? canManagePermissions

  const visibleSelectedEmployeeIds = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return []
    const visibleIds = new Set(departmentEmployees.map((e) => e.id))
    return selectedEmployeeIds.filter((id) => visibleIds.has(id))
  }, [departmentEmployees, selectedEmployeeIds])

  const excludedParentIds = useMemo(() => {
    if (!editingDepartment || !departments) return new Set<number>()
    return collectDescendantIds(departments, editingDepartment.id)
  }, [editingDepartment, departments])

  const orgNodes = useMemo<OrgChartNode[]>(() => {
    return filtered.map((d) => {
      const managerName =
        d.manager?.full_name ?? employeesSummary?.find((e) => e.id === d.manager_id)?.full_name
      const branchName = d.branch?.name ?? branches?.find((b) => b.id === d.branch_id)?.name
      const subtitle = [managerName, branchName].filter(Boolean).join(' · ') || null
      return {
        id: d.id,
        parentId: d.parent_id ?? null,
        level: d.level ?? 1,
        title: d.name,
        code: d.code,
        subtitle,
        employeeCount: d.employee_count ?? 0,
        permissionsCount: d.effective_permissions_count ?? 0,
        isInactive: d.status === 'inactive',
      }
    })
  }, [filtered, employeesSummary, branches])

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingDepartment(null)
    setLevelManuallySet(false)
    setFormData({
      name: '',
      code: '',
      branch_id: null,
      parent_id: null,
      level: 1,
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
    setLevelManuallySet(true)
    setFormData({
      name: dept.name,
      code: dept.code ?? '',
      branch_id: dept.branch_id ?? null,
      parent_id: dept.parent_id ?? null,
      level: dept.level ?? 1,
      manager_id: dept.manager_id ?? null,
      cost_center: dept.cost_center ?? '',
      description: dept.description ?? '',
      status: dept.status,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleParentChange = (val: string) => {
    const parentId = val === 'none' ? null : Number(val)
    const parentDept = parentId ? departments?.find((d) => d.id === parentId) : null
    setFormData((prev) => ({
      ...prev,
      parent_id: parentId,
      level:
        !levelManuallySet && parentDept
          ? Math.min(20, (parentDept.level ?? 1) + 1)
          : !levelManuallySet && !parentId
            ? 1
            : prev.level,
    }))
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.name.trim()) {
      errors.name = t('organizationPage.departments.validation.nameRequired')
    }
    const levelVal = Number(formData.level ?? 1)
    if (!Number.isInteger(levelVal) || levelVal < 1 || levelVal > 20) {
      errors.level = t('organizationPage.validation.levelRange', {
        defaultValue: 'O nível deve estar entre 1 e 20.',
      })
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      const payload: DepartmentPayload = {
        ...formData,
        level: levelVal,
        code: formData.code?.trim() || null,
        cost_center: formData.cost_center?.trim() || null,
        description: formData.description?.trim() || null,
      }

      if (editingDepartment) {
        await updateMutation.mutateAsync({ id: editingDepartment.id, data: payload })
        toast.success(
          t('organizationPage.toast.updated', { entity: t('organizationPage.departments.singular') }),
        )
      } else {
        const created = await createMutation.mutateAsync(payload)
        if (created?.id) selectDepartment(created.id)
        toast.success(
          t('organizationPage.toast.created', { entity: t('organizationPage.departments.singular') }),
        )
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.toast.saveError', { entity: t('organizationPage.departments.singular') }),
        ),
      )
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteDepartmentTarget) return
    try {
      await deleteMutation.mutateAsync(deleteDepartmentTarget.id)
      toast.success(
        t('organizationPage.toast.deleted', { entity: t('organizationPage.departments.singular') }),
      )
      if (effectiveSelectedDepartmentId === deleteDepartmentTarget.id) {
        selectDepartment(null)
      }
      setDeleteDepartmentTarget(null)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.toast.deleteError', { entity: t('organizationPage.departments.singular') }),
        ),
      )
    }
  }

  const handleSelectFromOrgChart = (node: OrgChartNode) => {
    selectDepartment(node.id, true)
    setViewMode('columns')
  }

  const handleMoveDepartment = async ({
    nodeId,
    newParentId,
    newLevel,
  }: OrgChartMovePayload) => {
    try {
      await updateMutation.mutateAsync({
        id: nodeId,
        data: {
          parent_id: newParentId,
          level: newLevel,
          cascade_levels: true,
        },
      })
      toast.success(
        newParentId === null
          ? t('organizationPage.orgChart.movedToTopToast', {
              level: newLevel,
              defaultValue: `Movido para o Nível ${newLevel} (topo).`,
            })
          : t('organizationPage.orgChart.movedToParentToast', {
              level: newLevel,
              defaultValue: `Hierarquia atualizada para o Nível ${newLevel}.`,
            }),
      )
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.orgChart.moveError', {
            defaultValue: 'Não foi possível reorganizar a hierarquia.',
          }),
        ),
      )
    }
  }

  const allSelected =
    departmentEmployees.length > 0 && visibleSelectedEmployeeIds.length === departmentEmployees.length

  const toggleSelectAllEmployees = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds(departmentEmployees.map((e) => e.id))
    } else {
      setSelectedEmployeeIds([])
    }
  }

  const toggleEmployeeSelection = (employeeId: number, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? (prev.includes(employeeId) ? prev : [...prev, employeeId]) : prev.filter((id) => id !== employeeId),
    )
  }

  const openDepartmentPermissionsModal = () => {
    if (!activeDeptDetail) return
    setPermModalEmployees([])
    setPermModalMode('department')
  }

  const openEmployeesPermissionsModal = (targets: DepartmentEmployeeItem[]) => {
    if (targets.length === 0) return
    setPermModalEmployees(targets)
    setPermModalMode('employees')
  }

  const handleAddEmployeesToDepartment = async ({ employeeIds }: AssignEmployeesSubmitPayload) => {
    if (!activeDeptDetail || employeeIds.length === 0) return
    try {
      const res = await addEmployeesMutation.mutateAsync({
        departmentId: activeDeptDetail.id,
        employeeIds,
      })
      toast.success(
        t('organizationPage.assignEmployees.addedToDepartmentToast', {
          count: res.added_count ?? employeeIds.length,
          defaultValue: `${res.added_count ?? employeeIds.length} funcionário(s) adicionado(s) ao departamento.`,
        }),
      )
      setIsAddEmployeesOpen(false)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.assignEmployees.addError', {
            defaultValue: 'Não foi possível adicionar funcionários.',
          }),
        ),
      )
    }
  }

  const handleConfirmRemoveEmployee = async () => {
    if (!activeDeptDetail || !removeEmployeeTarget) return
    try {
      await removeEmployeeMutation.mutateAsync({
        departmentId: activeDeptDetail.id,
        employeeId: removeEmployeeTarget.id,
      })
      toast.success(
        t('organizationPage.assignEmployees.removedFromDepartmentToast', {
          defaultValue: 'Funcionário removido do departamento.',
        }),
      )
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== removeEmployeeTarget.id))
      setRemoveEmployeeTarget(null)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.assignEmployees.removeError', {
            defaultValue: 'Não foi possível remover o funcionário.',
          }),
        ),
      )
    }
  }

  const handleSavePermissions = async (payload: SimplePermissionsSavePayload) => {
    if (!activeDeptDetail) return

    if (permModalMode === 'department') {
      try {
        const res = await updateDeptPermissionsMutation.mutateAsync({
          departmentId: activeDeptDetail.id,
          data: {
            permissions: payload.permissions,
            permission_group_id: payload.permission_group_id,
            role_name: payload.role_name,
            apply_to_existing_overrides: payload.apply_to_existing_overrides,
          },
        })
        toast.success(
          t('organizationPage.permissions.departmentSavedToast', {
            count: res.affected_employees_count ?? 0,
            defaultValue: 'Permissões do departamento guardadas com sucesso.',
          }),
        )
        setPermModalMode(null)
      } catch (err) {
        toast.error(
          getApiErrorMessage(
            err,
            t('organizationPage.permissions.saveError', {
              defaultValue: 'Não foi possível guardar as permissões.',
            }),
          ),
        )
      }
      return
    }

    if (permModalMode === 'employees' && permModalEmployees.length > 0) {
      try {
        const res = await assignEmployeesPermissionsMutation.mutateAsync({
          departmentId: activeDeptDetail.id,
          data: {
            employee_ids: permModalEmployees.map((e) => e.id),
            clear_individual: payload.clear_individual,
            permissions: payload.permissions,
            permission_group_id: payload.permission_group_id,
            role_name: payload.role_name,
            scope_to_department: payload.scope_to_department,
            auto_create_accounts: payload.auto_create_accounts,
            default_password: payload.default_password,
            employee_emails: payload.employee_emails,
          },
        })

        if (res.skipped && res.skipped.length > 0) {
          const reasons = res.skipped.map((s) => `${s.name}: ${s.reason}`).join(' | ')
          if (res.updated_count > 0) {
            toast.warning(
              t('organizationPage.permissions.partialAssignedToast', {
                updated: res.updated_count,
                skipped: res.skipped.length,
                reasons,
                defaultValue: `${res.updated_count} atualizado(s), ${res.skipped.length} ignorado(s): ${reasons}`,
              }),
            )
          } else {
            toast.error(reasons)
          }
        } else {
          toast.success(
            t('organizationPage.permissions.employeesSavedToast', {
              count: res.updated_count,
              defaultValue: `Permissões atribuídas a ${res.updated_count} funcionário(s).`,
            }),
          )
        }
        setSelectedEmployeeIds([])
        setPermModalMode(null)
      } catch (err) {
        toast.error(
          getApiErrorMessage(
            err,
            t('organizationPage.permissions.saveError', {
              defaultValue: 'Não foi possível guardar as permissões.',
            }),
          ),
        )
      }
    }
  }

  const getPermissionSourceBadge = (emp: DepartmentEmployeeItem) => {
    if (!emp.has_user_account) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {t('organizationPage.permissions.source.none', { defaultValue: 'Sem conta' })}
        </Badge>
      )
    }
    if (emp.permission_source === 'individual') {
      return (
        <Badge variant="default" className="bg-primary/15 text-primary border-primary/30" >
          {t('organizationPage.permissions.source.individual', { defaultValue: 'Individual' })}
        </Badge>
      )
    }
    if (emp.permission_source === 'department_and_position') {
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        >
          {t('organizationPage.permissions.source.department_and_position', {
            defaultValue: 'Depto + Cargo',
          })}
        </Badge>
      )
    }
    if (emp.permission_source === 'department') {
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        >
          {t('organizationPage.permissions.source.department', { defaultValue: 'Do departamento' })}
        </Badge>
      )
    }
    if (emp.permission_source === 'position') {
      return (
        <Badge
          variant="secondary"
          className="bg-sky-500/15 text-sky-700 dark:text-sky-300"
        >
          {t('organizationPage.permissions.source.position', { defaultValue: 'Do cargo' })}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary">
        {emp.role_name || t('organizationPage.permissions.source.role', { defaultValue: 'Padrão' })}
      </Badge>
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isSavingPermissions =
    updateDeptPermissionsMutation.isPending || assignEmployeesPermissionsMutation.isPending

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.departments')}
        description={t('organizationPage.departments.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'columns' ? 'default' : 'ghost'}
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={() => setViewMode('columns')}
              >
                <Columns2 className="h-3.5 w-3.5" />
                {t('organizationPage.views.columns', { defaultValue: 'Colunas' })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'orgchart' ? 'default' : 'ghost'}
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={() => setViewMode('orgchart')}
              >
                <Network className="h-3.5 w-3.5" />
                {t('organizationPage.views.orgChart', { defaultValue: 'Organograma' })}
              </Button>
            </div>

            <Button onClick={handleOpenCreate} className="shadow-sm">
              <Plus className="mr-2 h-4 w-4 shrink-0" /> {t('organizationPage.departments.new')}
            </Button>
          </div>
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
          description={
            search
              ? t('organizationPage.empty.filterHint')
              : t('organizationPage.departments.emptyDescription')
          }
        />
      )}

      {/* Vista Organograma */}
      {departments && filtered.length > 0 && viewMode === 'orgchart' && (
        <OrgChartView
          nodes={orgNodes}
          selectedId={effectiveSelectedDepartmentId}
          onSelectNode={handleSelectFromOrgChart}
          onEditNode={(node) => {
            const dept = departments.find((d) => d.id === node.id)
            if (dept) handleOpenEdit(dept)
          }}
          onDeleteNode={(node) => {
            const dept = departments.find((d) => d.id === node.id)
            if (dept) setDeleteDepartmentTarget(dept)
          }}
          onMoveNode={handleMoveDepartment}
          isMoving={updateMutation.isPending}
          hintText={t('organizationPage.departments.orgChartHint', {
            defaultValue: 'Clique num departamento para gerir os seus funcionários e permissões.',
          })}
          selectHint={t('organizationPage.departments.orgChartOpenFlow', {
            defaultValue: 'Gerir equipa e permissões',
          })}
        />
      )}

      {/* Vista em Colunas 25% / 75% */}
      {departments && filtered.length > 0 && viewMode === 'columns' && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Coluna Esquerda (25%) - Lista de Departamentos */}
          <Card className="w-full lg:w-[25%] lg:min-w-[240px] lg:shrink-0">
            <CardContent className="p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('organizationPage.departments.title')} ({filtered.length})
                </span>
              </div>

              <div className="max-h-[68vh] space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((d) => {
                  const isSelected = d.id === effectiveSelectedDepartmentId
                  const hasPerms = (d.effective_permissions_count ?? 0) > 0

                  return (
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectDepartment(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectDepartment(d.id)
                        }
                      }}
                      className={cn(
                        'group cursor-pointer rounded-lg border p-2.5 transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-border/60 bg-card hover:border-primary/40 hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-start gap-2">
                          <div
                            className={cn(
                              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-primary/10 text-primary',
                            )}
                          >
                            <Building2 className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{d.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                                {t('organizationPage.orgChart.levelBadge', { level: d.level ?? 1 })}
                              </Badge>
                              {d.code && (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {d.code}
                                </span>
                              )}
                              {d.status === 'inactive' && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                  {t('organizationPage.status.inactive')}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenEdit(d)
                            }}
                            title={t('organizationPage.actions.edit', {
                              entity: t('organizationPage.departments.singular'),
                            })}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteDepartmentTarget(d)
                            }}
                            title={t('organizationPage.actions.delete', {
                              entity: t('organizationPage.departments.singular'),
                            })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Users className="h-3 w-3" />
                          {t('organizationPage.departments.employeeCount', {
                            count: d.employee_count ?? 0,
                          })}
                        </span>

                        {hasPerms && (
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            <Shield className="h-3 w-3" />
                            {d.effective_permissions_count}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Coluna Direita (75%) - Detalhe do Departamento + Tabela de Funcionários */}
          <div className="w-full min-w-0 space-y-4 lg:flex-1">
            {activeDeptDetail && (
              <>
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        {cameFromOrgChart && (
                          <button
                            type="button"
                            onClick={() => {
                              setCameFromOrgChart(false)
                              setViewMode('orgchart')
                            }}
                            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            {t('organizationPage.departments.backToOrgChart', {
                              defaultValue: 'Voltar ao organograma',
                            })}
                          </button>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-foreground">
                            {activeDeptDetail.name}
                          </h2>
                          <Badge variant="outline" className="text-xs">
                            {t('organizationPage.orgChart.levelBadge', {
                              level: activeDeptDetail.level ?? 1,
                            })}
                          </Badge>
                          {activeDeptDetail.code && (
                            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                              {activeDeptDetail.code}
                            </span>
                          )}
                          <Badge
                            variant={activeDeptDetail.status === 'active' ? 'default' : 'secondary'}
                          >
                            {activeDeptDetail.status === 'active'
                              ? t('organizationPage.status.active')
                              : t('organizationPage.status.inactive')}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {(activeDeptDetail.branch?.name ||
                            branches?.find((b) => b.id === activeDeptDetail.branch_id)?.name) && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {activeDeptDetail.branch?.name ??
                                  branches?.find((b) => b.id === activeDeptDetail.branch_id)?.name}
                              </span>
                            )}
                          {(activeDeptDetail.parent?.name ||
                            departments?.find((p) => p.id === activeDeptDetail.parent_id)?.name) && (
                              <span className="inline-flex items-center gap-1">
                                <Layers className="h-3.5 w-3.5" />
                                {t('organizationPage.departments.parentLabel', {
                                  name:
                                    activeDeptDetail.parent?.name ??
                                    departments?.find((p) => p.id === activeDeptDetail.parent_id)?.name,
                                })}
                              </span>
                            )}
                          {(activeDeptDetail.manager?.full_name ||
                            employeesSummary?.find((e) => e.id === activeDeptDetail.manager_id)
                              ?.full_name) && (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {t('organizationPage.departments.managerLabel', {
                                  name:
                                    activeDeptDetail.manager?.full_name ??
                                    employeesSummary?.find((e) => e.id === activeDeptDetail.manager_id)
                                      ?.full_name,
                                })}
                              </span>
                            )}
                        </div>

                        <div className="pt-1">
                          {(activeDeptDetail.effective_permissions_count ?? 0) > 0 ? (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-primary/30 bg-primary/5 text-xs text-primary"
                            >
                              <Shield className="h-3 w-3" />
                              {activeDeptDetail.permission_group_name
                                ? t('organizationPage.permissions.deptGroupActive', {
                                  group: activeDeptDetail.permission_group_name,
                                  count: activeDeptDetail.effective_permissions_count,
                                  defaultValue: `Grupo "${activeDeptDetail.permission_group_name}" (${activeDeptDetail.effective_permissions_count} permissões)`,
                                })
                                : t('organizationPage.permissions.deptRuleActive', {
                                  count: activeDeptDetail.effective_permissions_count,
                                  defaultValue: `${activeDeptDetail.effective_permissions_count} permissões padrão definidas no departamento`,
                                })}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('organizationPage.permissions.deptRuleEmpty', {
                                defaultValue:
                                  'Sem regra de permissões específica no departamento (funcionários usam o perfil padrão).',
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {canManagePermissions && (
                        <Button
                          type="button"
                          onClick={openDepartmentPermissionsModal}
                          className="shrink-0 gap-2"
                        >
                          <Shield className="h-4 w-4" />
                          {t('organizationPage.permissions.assignToDepartmentBtn', {
                            defaultValue: 'Permissões do departamento',
                          })}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Tabela de Funcionários do Departamento */}
                <Card>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          placeholder={t('organizationPage.departments.searchEmployeesPlaceholder', {
                            defaultValue: 'Pesquisar funcionário neste departamento…',
                          })}
                          className="h-9 pl-9 text-sm"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {canManageEmployees && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1.5 text-xs"
                            onClick={() => setIsAddEmployeesOpen(true)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            {t('organizationPage.assignEmployees.addButton', {
                              defaultValue: 'Adicionar funcionários',
                            })}
                          </Button>
                        )}

                        {canManagePermissions && visibleSelectedEmployeeIds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
                            <span className="text-xs font-medium text-foreground">
                              {t('organizationPage.permissions.selectedCount', {
                                count: visibleSelectedEmployeeIds.length,
                                defaultValue: `${visibleSelectedEmployeeIds.length} selecionado(s)`,
                              })}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 gap-1.5 px-3 text-xs"
                              onClick={() =>
                                openEmployeesPermissionsModal(
                                  departmentEmployees.filter((e) => visibleSelectedEmployeeIds.includes(e.id)),
                                )
                              }
                            >
                              <Shield className="h-3.5 w-3.5" />
                              {t('organizationPage.permissions.assignPermissionsBtn', {
                                defaultValue: 'Atribuir permissões',
                              })}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground"
                              onClick={() => setSelectedEmployeeIds([])}
                            >
                              {t('organizationPage.permissions.clearSelection', {
                                defaultValue: 'Limpar',
                              })}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isLoadingDeptEmployees && <LoadingState />}
                    {isErrorDeptEmployees && (
                      <ErrorState
                        message={t('organizationPage.departments.employeesLoadError', {
                          defaultValue: 'Não foi possível carregar os funcionários deste departamento.',
                        })}
                        onRetry={refetchDeptEmployees}
                      />
                    )}

                    {!isLoadingDeptEmployees && !isErrorDeptEmployees && departmentEmployees.length === 0 && (
                      <EmptyState
                        title={t('organizationPage.departments.noEmployeesTitle', {
                          defaultValue: 'Nenhum funcionário neste departamento',
                        })}
                        description={
                          employeeSearch
                            ? t('organizationPage.empty.filterHint')
                            : t('organizationPage.departments.noEmployeesDesc', {
                              defaultValue:
                                'Os funcionários associados a este departamento aparecerão aqui para gestão de permissões.',
                            })
                        }
                        action={
                          canManageEmployees && !employeeSearch ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setIsAddEmployeesOpen(true)}
                            >
                              <UserPlus className="mr-1.5 h-4 w-4" />
                              {t('organizationPage.assignEmployees.addButton', {
                                defaultValue: 'Adicionar funcionários',
                              })}
                            </Button>
                          ) : undefined
                        }
                      />
                    )}

                    {!isLoadingDeptEmployees && !isErrorDeptEmployees && departmentEmployees.length > 0 && (
                      <div className="rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {canManagePermissions && (
                                <TableHead className="w-10">
                                  <Checkbox
                                    checked={allSelected}
                                    onCheckedChange={(checked) =>
                                      toggleSelectAllEmployees(checked === true)
                                    }
                                    aria-label={t('organizationPage.permissions.selectAllEmployees', {
                                      defaultValue: 'Selecionar todos os funcionários',
                                    })}
                                  />
                                </TableHead>
                              )}
                              <TableHead>
                                {t('organizationPage.departments.table.employee', {
                                  defaultValue: 'Funcionário',
                                })}
                              </TableHead>
                              <TableHead>
                                {t('organizationPage.departments.table.position', {
                                  defaultValue: 'Cargo',
                                })}
                              </TableHead>
                              <TableHead>
                                {t('organizationPage.departments.table.departments', {
                                  defaultValue: 'Departamentos',
                                })}
                              </TableHead>
                              <TableHead>
                                {t('organizationPage.departments.table.permissions', {
                                  defaultValue: 'Permissões no sistema',
                                })}
                              </TableHead>
                              {(canManagePermissions || canManageEmployees) && (
                                <TableHead className="w-20 text-right">
                                  {t('organizationPage.departments.table.actions', {
                                    defaultValue: 'Ações',
                                  })}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {departmentEmployees.map((emp) => {
                              const isChecked = visibleSelectedEmployeeIds.includes(emp.id)
                              const initials = emp.full_name
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase())
                                .join('')

                              return (
                                <TableRow
                                  key={emp.id}
                                  data-state={isChecked ? 'selected' : undefined}
                                  onClick={() => {
                                    if (canManagePermissions) {
                                      toggleEmployeeSelection(emp.id, !isChecked)
                                    }
                                  }}
                                  className={cn(canManagePermissions && 'cursor-pointer')}
                                >
                                  {canManagePermissions && (
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) =>
                                          toggleEmployeeSelection(emp.id, checked === true)
                                        }
                                        aria-label={emp.full_name}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell className="whitespace-normal">
                                    <div className="flex items-center gap-2.5">
                                      <Avatar size="sm" className="h-8 w-8">
                                        <AvatarImage src={emp.photo_path ?? undefined} alt={emp.full_name} />
                                        <AvatarFallback className="text-[11px] font-medium">
                                          {initials || '?'}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">
                                          {emp.full_name}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                          {[emp.employee_code, emp.user_email ?? emp.email]
                                            .filter(Boolean)
                                            .join(' · ') || '—'}
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="whitespace-normal">
                                    {emp.position ? (
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-sm">{emp.position.title}</span>
                                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                          N{emp.position.level}
                                        </Badge>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="whitespace-normal">
                                    {emp.departments && emp.departments.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {emp.departments.map((dept) => (
                                          <Badge
                                            key={dept.id}
                                            variant={
                                              dept.id === activeDeptDetail.id ? 'default' : 'secondary'
                                            }
                                            className="text-[11px] font-normal"
                                          >
                                            {dept.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="whitespace-normal">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {getPermissionSourceBadge(emp)}
                                      {emp.has_user_account && (
                                        <span className="text-xs text-muted-foreground">
                                          {emp.permission_group_name
                                            ? emp.permission_group_name
                                            : `${emp.effective_permissions.length} ${t('organizationPage.permissions.permsSuffix', { defaultValue: 'permissões' })}`}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  {(canManagePermissions || canManageEmployees) && (
                                    <TableCell
                                      className="text-right"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="inline-flex items-center gap-0.5">
                                        {canManagePermissions && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => openEmployeesPermissionsModal([emp])}
                                            title={t('organizationPage.permissions.assignPermissionsBtn', {
                                              defaultValue: 'Atribuir permissões',
                                            })}
                                            className="text-muted-foreground hover:text-primary"
                                          >
                                            <Shield className="h-4 w-4" />
                                          </Button>
                                        )}
                                        {canManageEmployees && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => setRemoveEmployeeTarget(emp)}
                                            title={t('organizationPage.assignEmployees.removeFromDepartment', {
                                              defaultValue: 'Remover do departamento',
                                            })}
                                            className="text-muted-foreground hover:text-destructive"
                                          >
                                            <UserMinus className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Assign Employees Dialog */}
      <AssignEmployeesDialog
        open={isAddEmployeesOpen}
        onOpenChange={setIsAddEmployeesOpen}
        mode="department"
        targetDepartment={activeDeptDetail ?? null}
        isSaving={addEmployeesMutation.isPending}
        onSubmit={handleAddEmployeesToDepartment}
      />

      {/* Simple Permissions Dialog */}
      <SimplePermissionsDialog
        open={permModalMode !== null}
        onOpenChange={(open) => {
          if (!open) setPermModalMode(null)
        }}
        mode={permModalMode ?? 'department'}
        department={activeDeptDetail ?? null}
        selectedEmployees={permModalEmployees}
        catalogPermissions={catalogData?.permissions ?? []}
        permissionGroups={catalogData?.permission_groups ?? []}
        isSaving={isSavingPermissions}
        onSave={handleSavePermissions}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingDepartment
                ? t('organizationPage.actions.edit', {
                  entity: t('organizationPage.departments.singular'),
                })
                : t('organizationPage.departments.new')}
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
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                <Label htmlFor="dept-level">
                  {t('organizationPage.fields.level', { defaultValue: 'Nível' })}
                </Label>
                <Input
                  id="dept-level"
                  type="number"
                  min={1}
                  max={20}
                  value={formData.level ?? 1}
                  onChange={(e) => {
                    setLevelManuallySet(true)
                    setFormData((prev) => ({
                      ...prev,
                      level: e.target.value ? Number(e.target.value) : 1,
                    }))
                    if (formErrors.level) setFormErrors((prev) => ({ ...prev, level: '' }))
                  }}
                />
                {formErrors.level && <p className="text-xs text-destructive">{formErrors.level}</p>}
              </div>

              <div className="min-w-0 space-y-2">
                <Label htmlFor="dept-status">{t('organizationPage.fields.status')}</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: 'active' | 'inactive') =>
                    setFormData((prev) => ({ ...prev, status: val }))
                  }
                >
                  <SelectTrigger id="dept-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('organizationPage.status.active')}</SelectItem>
                    <SelectItem value="inactive">{t('organizationPage.status.inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
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
                  <SelectTrigger id="dept-branch" className="w-full">
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

              <div className="min-w-0 space-y-2">
                <Label htmlFor="dept-parent">{t('organizationPage.departments.parent')}</Label>
                <Select
                  value={formData.parent_id ? String(formData.parent_id) : 'none'}
                  onValueChange={handleParentChange}
                >
                  <SelectTrigger id="dept-parent" className="w-full">
                    <SelectValue placeholder={t('organizationPage.departments.noParent')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.departments.noParent')}</SelectItem>
                    {departments
                      ?.filter((d) => !excludedParentIds.has(d.id))
                      .map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name} (N{d.level ?? 1})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
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
                  <SelectTrigger id="dept-manager" className="w-full">
                    <SelectValue placeholder={t('organizationPage.common.selectManager')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('organizationPage.common.none')}</SelectItem>
                    {employeesSummary?.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-2">
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
                {isSaving
                  ? t('organizationPage.common.saving')
                  : editingDepartment
                    ? t('organizationPage.common.saveChanges')
                    : t('organizationPage.departments.new')}
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
            <AlertDialogTitle>
              {t('organizationPage.actions.delete', {
                entity: t('organizationPage.departments.singular'),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.deleteConfirmation', {
                entity: t('organizationPage.departments.singular'),
              })}{' '}
              <strong className="text-foreground">{deleteDepartmentTarget?.name}</strong>
              {'? '}
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
              {deleteMutation.isPending
                ? t('organizationPage.common.deleting')
                : t('organizationPage.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Employee from Department Confirmation */}
      <AlertDialog
        open={!!removeEmployeeTarget}
        onOpenChange={(open) => !open && setRemoveEmployeeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('organizationPage.assignEmployees.removeFromDepartment', {
                defaultValue: 'Remover do departamento',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.assignEmployees.removeDepartmentConfirm', {
                name: removeEmployeeTarget?.full_name ?? '',
                department: activeDeptDetail?.name ?? '',
                defaultValue: `Deseja remover ${removeEmployeeTarget?.full_name ?? ''} do departamento ${activeDeptDetail?.name ?? ''}?`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeEmployeeMutation.isPending}>
              {t('organizationPage.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveEmployee}
              disabled={removeEmployeeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeEmployeeMutation.isPending
                ? t('organizationPage.common.deleting')
                : t('organizationPage.assignEmployees.removeAction', {
                    defaultValue: 'Remover',
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

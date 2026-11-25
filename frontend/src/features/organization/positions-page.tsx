import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Columns2,
  Layers,
  Network,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
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
import { Switch } from '@/components/ui/switch'
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
  type Position,
  type PositionEmployeeItem,
  type PositionPayload,
  useAddPositionEmployees,
  useAssignPositionEmployeesPermissions,
  useCreatePosition,
  useDeletePosition,
  useDepartments,
  usePermissionsCatalog,
  usePositionEmployees,
  usePositions,
  useRemovePositionEmployee,
  useUpdatePosition,
  useUpdatePositionPermissions,
} from './api'
import { OrgChartView, type OrgChartMovePayload, type OrgChartNode } from './org-chart-view'
import { SimplePermissionsDialog, type SimplePermissionsSavePayload } from './simple-permissions-dialog'
import { AssignEmployeesDialog, type AssignEmployeesSubmitPayload } from './assign-employees-dialog'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

export function PositionsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'

  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'columns' | 'orgchart'>('columns')
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null)
  const [cameFromOrgChart, setCameFromOrgChart] = useState(false)

  // Employee panel states
  const [positionEmpSearch, setPositionEmpSearch] = useState('')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([])
  const [isAddEmployeesOpen, setIsAddEmployeesOpen] = useState(false)
  const [removeEmployeeTarget, setRemoveEmployeeTarget] = useState<PositionEmployeeItem | null>(null)

  // Permissions modal states
  const [permModalMode, setPermModalMode] = useState<'position' | 'employees' | null>(null)
  const [permModalEmployees, setPermModalEmployees] = useState<PositionEmployeeItem[]>([])

  // Create / Edit Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  const [levelManuallySet, setLevelManuallySet] = useState(false)

  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)

  // Form state
  const [formData, setFormData] = useState<PositionPayload>({
    title: '',
    code: '',
    department_id: null,
    parent_id: null,
    level: 1,
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
  const { data: catalogData } = usePermissionsCatalog()

  const createMutation = useCreatePosition()
  const updateMutation = useUpdatePosition()
  const deleteMutation = useDeletePosition()
  const updatePosPermissionsMutation = useUpdatePositionPermissions()
  const assignEmployeesPermissionsMutation = useAssignPositionEmployeesPermissions()
  const addPositionEmployeesMutation = useAddPositionEmployees()
  const removePositionEmployeeMutation = useRemovePositionEmployee()

  // Filter and sort positions by level ASC, title ASC
  const filtered = useMemo(() => {
    return (positions ?? [])
      .filter((p) => {
        const matchesSearch =
          !search ||
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          (p.code && p.code.toLowerCase().includes(search.toLowerCase()))
        const matchesDept =
          departmentFilter === 'all' ||
          (p.department_id && String(p.department_id) === departmentFilter)
        return matchesSearch && matchesDept
      })
      .sort((a, b) => (a.level ?? 1) - (b.level ?? 1) || a.title.localeCompare(b.title))
  }, [positions, search, departmentFilter])

  const selectPosition = (posId: number | null, fromOrgChart = false) => {
    setSelectedPositionId(posId)
    setCameFromOrgChart(fromOrgChart)
    setSelectedEmployeeIds([])
    setPositionEmpSearch('')
  }

  const effectiveSelectedPositionId = useMemo(() => {
    if (filtered.length === 0) return null
    if (selectedPositionId !== null && filtered.some((p) => p.id === selectedPositionId)) {
      return selectedPositionId
    }
    return filtered[0].id
  }, [filtered, selectedPositionId])

  const selectedPositionFromList = useMemo(
    () =>
      filtered.find((p) => p.id === effectiveSelectedPositionId) ??
      positions?.find((p) => p.id === effectiveSelectedPositionId) ??
      null,
    [filtered, positions, effectiveSelectedPositionId],
  )

  const {
    data: positionEmployeesData,
    isLoading: isLoadingPosEmployees,
    isError: isErrorPosEmployees,
    refetch: refetchPosEmployees,
  } = usePositionEmployees(effectiveSelectedPositionId, positionEmpSearch)

  const positionEmployees = useMemo(
    () => positionEmployeesData?.employees ?? [],
    [positionEmployeesData?.employees],
  )
  const activePosDetail = positionEmployeesData?.position ?? selectedPositionFromList
  const canManagePermissions =
    positionEmployeesData?.can_manage_permissions ?? catalogData?.can_manage_permissions ?? false
  const canManagePosEmployees =
    positionEmployeesData?.can_manage_employees ?? canManagePermissions

  const visibleSelectedEmployeeIds = useMemo(() => {
    if (selectedEmployeeIds.length === 0) return []
    const visibleIds = new Set(positionEmployees.map((e) => e.id))
    return selectedEmployeeIds.filter((id) => visibleIds.has(id))
  }, [positionEmployees, selectedEmployeeIds])

  const excludedParentIds = useMemo(() => {
    if (!editingPosition || !positions) return new Set<number>()
    return collectDescendantIds(positions, editingPosition.id)
  }, [editingPosition, positions])

  const orgNodes = useMemo<OrgChartNode[]>(() => {
    return filtered.map((p) => {
      const deptName = p.department?.name ?? departments?.find((d) => d.id === p.department_id)?.name
      return {
        id: p.id,
        parentId: p.parent_id ?? null,
        level: p.level ?? 1,
        title: p.title,
        code: p.code,
        subtitle: deptName ?? t('organizationPage.positions.noDepartment'),
        employeeCount: p.employee_count ?? 0,
        permissionsCount: p.effective_permissions_count ?? 0,
        badgeText: p.is_management ? t('organizationPage.positions.management') : null,
      }
    })
  }, [filtered, departments, t])

  const formatMoney = (value: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value)

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingPosition(null)
    setLevelManuallySet(false)
    setFormData({
      title: '',
      code: '',
      department_id: null,
      parent_id: null,
      level: 1,
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
    setLevelManuallySet(true)
    setFormData({
      title: pos.title,
      code: pos.code ?? '',
      department_id: pos.department_id ?? null,
      parent_id: pos.parent_id ?? null,
      level: pos.level ?? 1,
      description: pos.description ?? '',
      requirements: pos.requirements ?? '',
      salary_min: pos.salary_min ?? null,
      salary_max: pos.salary_max ?? null,
      is_management: Boolean(pos.is_management),
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  const handleParentChange = (val: string) => {
    const parentId = val === 'none' ? null : Number(val)
    const parentPos = parentId ? positions?.find((p) => p.id === parentId) : null
    setFormData((prev) => ({
      ...prev,
      parent_id: parentId,
      level:
        !levelManuallySet && parentPos
          ? Math.min(20, (parentPos.level ?? 1) + 1)
          : !levelManuallySet && !parentId
            ? 1
            : prev.level,
    }))
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.title.trim()) {
      errors.title = t('organizationPage.positions.validation.titleRequired')
    }
    const levelVal = Number(formData.level ?? 1)
    if (!Number.isInteger(levelVal) || levelVal < 1 || levelVal > 20) {
      errors.level = t('organizationPage.validation.levelRange', {
        defaultValue: 'O nível deve estar entre 1 e 20.',
      })
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
      const payload: PositionPayload = {
        ...formData,
        level: levelVal,
        code: formData.code?.trim() || null,
        description: formData.description?.trim() || null,
        requirements: formData.requirements?.trim() || null,
        salary_min: formData.salary_min ? Number(formData.salary_min) : null,
        salary_max: formData.salary_max ? Number(formData.salary_max) : null,
      }

      if (editingPosition) {
        await updateMutation.mutateAsync({ id: editingPosition.id, data: payload })
        toast.success(
          t('organizationPage.toast.updated', { entity: t('organizationPage.positions.singular') }),
        )
      } else {
        const created = await createMutation.mutateAsync(payload)
        if (created?.id) selectPosition(created.id)
        toast.success(
          t('organizationPage.toast.created', { entity: t('organizationPage.positions.singular') }),
        )
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.toast.saveError', { entity: t('organizationPage.positions.singular') }),
        ),
      )
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success(
        t('organizationPage.toast.deleted', { entity: t('organizationPage.positions.singular') }),
      )
      if (effectiveSelectedPositionId === deleteTarget.id) {
        selectPosition(null)
      }
      setDeleteTarget(null)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.toast.deleteError', { entity: t('organizationPage.positions.singular') }),
        ),
      )
    }
  }

  const handleSelectFromOrgChart = (node: OrgChartNode) => {
    selectPosition(node.id, true)
    setViewMode('columns')
  }

  const handleMovePosition = async ({
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
    positionEmployees.length > 0 && visibleSelectedEmployeeIds.length === positionEmployees.length

  const toggleSelectAllEmployees = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds(positionEmployees.map((e) => e.id))
    } else {
      setSelectedEmployeeIds([])
    }
  }

  const toggleEmployeeSelection = (employeeId: number, checked: boolean) => {
    setSelectedEmployeeIds((prev) =>
      checked ? (prev.includes(employeeId) ? prev : [...prev, employeeId]) : prev.filter((id) => id !== employeeId),
    )
  }

  const openPositionPermissionsModal = () => {
    if (!activePosDetail) return
    setPermModalEmployees([])
    setPermModalMode('position')
  }

  const openEmployeesPermissionsModal = (targets: PositionEmployeeItem[]) => {
    if (targets.length === 0) return
    setPermModalEmployees(targets)
    setPermModalMode('employees')
  }

  const handleAddEmployeesToPosition = async ({
    employeeIds,
    syncDepartment,
  }: AssignEmployeesSubmitPayload) => {
    if (!activePosDetail || employeeIds.length === 0) return
    try {
      const res = await addPositionEmployeesMutation.mutateAsync({
        positionId: activePosDetail.id,
        employeeIds,
        syncDepartment,
      })
      toast.success(
        t('organizationPage.assignEmployees.addedToPositionToast', {
          count: res.added_count ?? employeeIds.length,
          defaultValue: `${res.added_count ?? employeeIds.length} funcionário(s) atribuído(s) ao cargo.`,
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
    if (!activePosDetail || !removeEmployeeTarget) return
    try {
      await removePositionEmployeeMutation.mutateAsync({
        positionId: activePosDetail.id,
        employeeId: removeEmployeeTarget.id,
      })
      toast.success(
        t('organizationPage.assignEmployees.removedFromPositionToast', {
          defaultValue: 'Funcionário removido do cargo.',
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
    if (!activePosDetail) return

    if (permModalMode === 'position') {
      try {
        const res = await updatePosPermissionsMutation.mutateAsync({
          positionId: activePosDetail.id,
          data: {
            permissions: payload.permissions,
            permission_group_id: payload.permission_group_id,
            role_name: payload.role_name,
            apply_to_existing_overrides: payload.apply_to_existing_overrides,
          },
        })
        toast.success(
          t('organizationPage.permissions.positionSavedToast', {
            count: res.affected_employees_count ?? 0,
            defaultValue: 'Permissões do cargo guardadas com sucesso.',
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
          positionId: activePosDetail.id,
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

  const getPermissionSourceBadge = (emp: PositionEmployeeItem) => {
    if (!emp.has_user_account) {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {t('organizationPage.permissions.source.none', { defaultValue: 'Sem conta' })}
        </Badge>
      )
    }
    if (emp.permission_source === 'individual') {
      return (
        <Badge variant="default" className="border-primary/30 bg-primary/15 text-primary">
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
    if (emp.permission_source === 'position') {
      return (
        <Badge variant="secondary" className="bg-sky-500/15 text-sky-700 dark:text-sky-300">
          {t('organizationPage.permissions.source.position', { defaultValue: 'Do cargo' })}
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
    return (
      <Badge variant="secondary">
        {emp.role_name || t('organizationPage.permissions.source.role', { defaultValue: 'Padrão' })}
      </Badge>
    )
  }

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isSavingPermissions =
    updatePosPermissionsMutation.isPending || assignEmployeesPermissionsMutation.isPending

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.positions')}
        description={t('organizationPage.positions.description')}
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
              <Plus className="mr-2 h-4 w-4 shrink-0" /> {t('organizationPage.positions.new')}
            </Button>
          </div>
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
          description={
            search
              ? t('organizationPage.empty.filterHint')
              : t('organizationPage.positions.emptyDescription')
          }
        />
      )}

      {/* Vista Organograma */}
      {positions && filtered.length > 0 && viewMode === 'orgchart' && (
        <OrgChartView
          nodes={orgNodes}
          selectedId={effectiveSelectedPositionId}
          onSelectNode={handleSelectFromOrgChart}
          onEditNode={(node) => {
            const pos = positions.find((p) => p.id === node.id)
            if (pos) handleOpenEdit(pos)
          }}
          onDeleteNode={(node) => {
            const pos = positions.find((p) => p.id === node.id)
            if (pos) setDeleteTarget(pos)
          }}
          onMoveNode={handleMovePosition}
          isMoving={updateMutation.isPending}
          hintText={t('organizationPage.positions.orgChartHintMembers', {
            defaultValue:
              'Hierarquia de cargos organizada por nível. Clique num cargo para gerir os seus funcionários e permissões.',
          })}
          selectHint={t('organizationPage.positions.orgChartOpenFlow', {
            defaultValue: 'Gerir equipa e permissões',
          })}
        />
      )}

      {/* Vista em Colunas 25% / 75% */}
      {positions && filtered.length > 0 && viewMode === 'columns' && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* Coluna Esquerda (25%) - Lista de Cargos */}
          <Card className="w-full lg:sticky lg:top-4 lg:w-[25%] lg:min-w-[240px] lg:shrink-0 lg:self-start">
            <CardContent className="p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('organizationPage.positions.title')} ({filtered.length})
                </span>
              </div>

              <div className="max-h-[calc(100vh-5.5rem)] space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((p) => {
                  const isSelected = p.id === effectiveSelectedPositionId
                  const hasPerms = (p.effective_permissions_count ?? 0) > 0
                  const deptName =
                    p.department?.name ?? departments?.find((d) => d.id === p.department_id)?.name

                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectPosition(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectPosition(p.id)
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
                                : 'bg-info/10 text-info',
                            )}
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {p.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                                {t('organizationPage.orgChart.levelBadge', { level: p.level ?? 1 })}
                              </Badge>
                              {p.code && (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  {p.code}
                                </span>
                              )}
                              {p.is_management && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                  {t('organizationPage.positions.management')}
                                </Badge>
                              )}
                            </div>
                            {deptName && (
                              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                {deptName}
                              </p>
                            )}
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
                              handleOpenEdit(p)
                            }}
                            title={t('organizationPage.actions.edit', {
                              entity: t('organizationPage.positions.singular'),
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
                              setDeleteTarget(p)
                            }}
                            title={t('organizationPage.actions.delete', {
                              entity: t('organizationPage.positions.singular'),
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
                            count: p.employee_count ?? 0,
                          })}
                        </span>

                        {hasPerms && (
                          <span className="inline-flex items-center gap-1 font-medium text-primary">
                            <Shield className="h-3 w-3" />
                            {p.effective_permissions_count}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Coluna Direita (75%) - Detalhe do Cargo + Tabela de Funcionários */}
          <div className="w-full min-w-0 space-y-4 lg:flex-1">
            {activePosDetail && (
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
                            {activePosDetail.title}
                          </h2>
                          <Badge variant="outline" className="text-xs">
                            {t('organizationPage.orgChart.levelBadge', {
                              level: activePosDetail.level ?? 1,
                            })}
                          </Badge>
                          {activePosDetail.code && (
                            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                              {activePosDetail.code}
                            </span>
                          )}
                          {activePosDetail.is_management && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Shield className="h-3 w-3 text-warning" />
                              {t('organizationPage.positions.management')}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {activePosDetail.department?.name ??
                              departments?.find((d) => d.id === activePosDetail.department_id)
                                ?.name ??
                              t('organizationPage.positions.noDepartment')}
                          </span>
                          {(activePosDetail.parent?.title ||
                            positions?.find((par) => par.id === activePosDetail.parent_id)
                              ?.title) && (
                              <span className="inline-flex items-center gap-1">
                                <Layers className="h-3.5 w-3.5" />
                                {t('organizationPage.departments.parentLabel', {
                                  name:
                                    activePosDetail.parent?.title ??
                                    positions?.find((par) => par.id === activePosDetail.parent_id)
                                      ?.title,
                                })}
                              </span>
                            )}
                          {(activePosDetail.salary_min !== null ||
                            activePosDetail.salary_max !== null) && (
                              <span className="font-mono">
                                {activePosDetail.salary_min
                                  ? formatMoney(activePosDetail.salary_min)
                                  : '—'}{' '}
                                –{' '}
                                {activePosDetail.salary_max
                                  ? formatMoney(activePosDetail.salary_max)
                                  : '—'}
                              </span>
                            )}
                        </div>

                        <div className="pt-1">
                          {(activePosDetail.effective_permissions_count ?? 0) > 0 ? (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-primary/30 bg-primary/5 text-xs text-primary"
                            >
                              <Shield className="h-3 w-3" />
                              {activePosDetail.permission_group_name
                                ? t('organizationPage.permissions.posGroupActive', {
                                  group: activePosDetail.permission_group_name,
                                  count: activePosDetail.effective_permissions_count,
                                  defaultValue: `Grupo "${activePosDetail.permission_group_name}" (${activePosDetail.effective_permissions_count} permissões)`,
                                })
                                : t('organizationPage.permissions.posRuleActive', {
                                  count: activePosDetail.effective_permissions_count,
                                  defaultValue: `${activePosDetail.effective_permissions_count} permissões padrão definidas no cargo`,
                                })}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('organizationPage.permissions.posRuleEmpty', {
                                defaultValue:
                                  'Sem regra de permissões específica no cargo (funcionários herdam do departamento ou perfil padrão).',
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {canManagePermissions && (
                        <Button
                          type="button"
                          onClick={openPositionPermissionsModal}
                          className="shrink-0 gap-2"
                        >
                          <Shield className="h-4 w-4" />
                          {t('organizationPage.permissions.assignToPositionBtn', {
                            defaultValue: 'Permissões do cargo',
                          })}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Tabela de Funcionários do Cargo */}
                <Card>
                  <CardContent className="space-y-4 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative flex-1 sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={positionEmpSearch}
                          onChange={(e) => setPositionEmpSearch(e.target.value)}
                          placeholder={t('organizationPage.positions.searchEmployeesPlaceholder', {
                            defaultValue: 'Pesquisar funcionário neste cargo…',
                          })}
                          className="h-9 pl-9 text-sm"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {canManagePosEmployees && (
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
                                  positionEmployees.filter((e) =>
                                    visibleSelectedEmployeeIds.includes(e.id),
                                  ),
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
                              className="h-7 px-2 text-xs"
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

                    {isLoadingPosEmployees && <LoadingState />}
                    {isErrorPosEmployees && (
                      <ErrorState
                        message={t('organizationPage.positions.employeesLoadError', {
                          defaultValue: 'Não foi possível carregar os funcionários deste cargo.',
                        })}
                        onRetry={refetchPosEmployees}
                      />
                    )}

                    {!isLoadingPosEmployees && !isErrorPosEmployees && positionEmployees.length === 0 && (
                      <EmptyState
                        title={t('organizationPage.positions.noEmployeesTitle', {
                          defaultValue: 'Nenhum funcionário com este cargo',
                        })}
                        description={
                          positionEmpSearch
                            ? t('organizationPage.empty.filterHint')
                            : t('organizationPage.positions.noEmployeesDesc', {
                              defaultValue:
                                'Adicione funcionários da empresa para ocuparem este cargo.',
                            })
                        }
                        action={
                          canManagePosEmployees && !positionEmpSearch ? (
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

                    {!isLoadingPosEmployees && !isErrorPosEmployees && positionEmployees.length > 0 && (
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
                                {t('organizationPage.departments.table.departments', {
                                  defaultValue: 'Departamentos',
                                })}
                              </TableHead>
                              <TableHead>
                                {t('organizationPage.departments.table.permissions', {
                                  defaultValue: 'Permissões no sistema',
                                })}
                              </TableHead>
                              {(canManagePermissions || canManagePosEmployees) && (
                                <TableHead className="w-20 text-right">
                                  {t('organizationPage.departments.table.actions', {
                                    defaultValue: 'Ações',
                                  })}
                                </TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {positionEmployees.map((emp) => {
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
                                    {emp.departments && emp.departments.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {emp.departments.map((dept) => (
                                          <Badge
                                            key={dept.id}
                                            variant={
                                              dept.id === activePosDetail.department_id
                                                ? 'default'
                                                : 'secondary'
                                            }
                                            className="text-[11px] font-normal"
                                          >
                                            {dept.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    ) : emp.department?.name ? (
                                      <Badge variant="secondary" className="text-[11px] font-normal">
                                        {emp.department.name}
                                      </Badge>
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
                                  {(canManagePermissions || canManagePosEmployees) && (
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
                                        {canManagePosEmployees && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            onClick={() => setRemoveEmployeeTarget(emp)}
                                            title={t('organizationPage.assignEmployees.removeFromPosition', {
                                              defaultValue: 'Remover do cargo',
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
        mode="position"
        targetPosition={activePosDetail ?? null}
        isSaving={addPositionEmployeesMutation.isPending}
        onSubmit={handleAddEmployeesToPosition}
      />

      {/* Simple Permissions Dialog */}
      <SimplePermissionsDialog
        open={permModalMode !== null}
        onOpenChange={(open) => {
          if (!open) setPermModalMode(null)
        }}
        mode={permModalMode === 'position' ? 'position' : 'employees'}
        position={activePosDetail ?? null}
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
              {editingPosition
                ? t('organizationPage.actions.edit', {
                  entity: t('organizationPage.positions.singular'),
                })
                : t('organizationPage.positions.new')}
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
              {formErrors.title && <p className="text-xs text-destructive">{formErrors.title}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Label htmlFor="pos-level">
                  {t('organizationPage.fields.level', { defaultValue: 'Nível' })}
                </Label>
                <Input
                  id="pos-level"
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
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
                  <SelectTrigger id="pos-dept" className="w-full">
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

              <div className="min-w-0 space-y-2">
                <Label htmlFor="pos-parent">
                  {t('organizationPage.positions.parent', { defaultValue: 'Cargo superior' })}
                </Label>
                <Select
                  value={formData.parent_id ? String(formData.parent_id) : 'none'}
                  onValueChange={handleParentChange}
                >
                  <SelectTrigger id="pos-parent" className="w-full">
                    <SelectValue
                      placeholder={t('organizationPage.positions.noParent', {
                        defaultValue: 'Nenhum (topo)',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('organizationPage.positions.noParent', { defaultValue: 'Nenhum (topo)' })}
                    </SelectItem>
                    {positions
                      ?.filter((p) => !excludedParentIds.has(p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title} (N{p.level ?? 1})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pos-salary-min">
                  {t('organizationPage.positions.salaryMinimum', { currency })}
                </Label>
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
                <Label htmlFor="pos-salary-max">
                  {t('organizationPage.positions.salaryMaximum', { currency })}
                </Label>
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
                    if (formErrors.salary_max)
                      setFormErrors((prev) => ({ ...prev, salary_max: '' }))
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
                <Label htmlFor="pos-management" className="text-sm font-medium">
                  {t('organizationPage.positions.managementLabel')}
                </Label>
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
                {isSaving
                  ? t('organizationPage.common.saving')
                  : editingPosition
                    ? t('organizationPage.common.saveChanges')
                    : t('organizationPage.positions.new')}
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
            <AlertDialogTitle>
              {t('organizationPage.actions.delete', {
                entity: t('organizationPage.positions.singular'),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.deleteConfirmation', {
                entity: t('organizationPage.positions.singular'),
              })}{' '}
              <strong className="text-foreground">{deleteTarget?.title}</strong>
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

      {/* Remove Employee from Position Confirmation */}
      <AlertDialog
        open={!!removeEmployeeTarget}
        onOpenChange={(open) => !open && setRemoveEmployeeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('organizationPage.assignEmployees.removeFromPosition', {
                defaultValue: 'Remover do cargo',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('organizationPage.assignEmployees.removePositionConfirm', {
                name: removeEmployeeTarget?.full_name ?? '',
                position: activePosDetail?.title ?? '',
                defaultValue: `Deseja remover ${removeEmployeeTarget?.full_name ?? ''} do cargo ${activePosDetail?.title ?? ''}?`,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePositionEmployeeMutation.isPending}>
              {t('organizationPage.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveEmployee}
              disabled={removePositionEmployeeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removePositionEmployeeMutation.isPending
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

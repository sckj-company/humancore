import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  Building2,
  List,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  useCreatePosition,
  useDeletePosition,
  useDepartments,
  usePositionEmployees,
  usePositions,
  useRemovePositionEmployee,
  useUpdatePosition,
} from './api'
import { OrgChartView, type OrgChartNode } from './org-chart-view'
import { AssignEmployeesDialog, type AssignEmployeesSubmitPayload } from './assign-employees-dialog'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'

export function PositionsPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'

  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'orgchart'>('list')

  // Selected position detail sheet (employees inside position)
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null)
  const [positionEmpSearch, setPositionEmpSearch] = useState('')
  const [isAddEmployeesOpen, setIsAddEmployeesOpen] = useState(false)
  const [removeEmployeeTarget, setRemoveEmployeeTarget] = useState<PositionEmployeeItem | null>(null)

  // Dialog state
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

  const createMutation = useCreatePosition()
  const updateMutation = useUpdatePosition()
  const deleteMutation = useDeletePosition()
  const addPositionEmployeesMutation = useAddPositionEmployees()
  const removePositionEmployeeMutation = useRemovePositionEmployee()

  const {
    data: positionEmployeesData,
    isLoading: isLoadingPosEmployees,
    isError: isErrorPosEmployees,
    refetch: refetchPosEmployees,
  } = usePositionEmployees(selectedPositionId, positionEmpSearch)

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

  const excludedParentIds = useMemo(() => {
    if (!editingPosition || !positions) return new Set<number>()
    return collectDescendantIds(positions, editingPosition.id)
  }, [editingPosition, positions])

  const selectedPosition = useMemo(
    () =>
      positionEmployeesData?.position ??
      positions?.find((p) => p.id === selectedPositionId) ??
      null,
    [positionEmployeesData?.position, positions, selectedPositionId],
  )
  const positionEmployees = positionEmployeesData?.employees ?? []
  const canManagePosEmployees = positionEmployeesData?.can_manage_employees ?? false

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

  const openPositionDetail = (posId: number) => {
    setSelectedPositionId(posId)
    setPositionEmpSearch('')
  }

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
        await createMutation.mutateAsync(payload)
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
      if (selectedPositionId === deleteTarget.id) {
        setSelectedPositionId(null)
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

  const handleAddEmployeesToPosition = async ({
    employeeIds,
    syncDepartment,
  }: AssignEmployeesSubmitPayload) => {
    if (!selectedPosition || employeeIds.length === 0) return
    try {
      const res = await addPositionEmployeesMutation.mutateAsync({
        positionId: selectedPosition.id,
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
    if (!selectedPosition || !removeEmployeeTarget) return
    try {
      await removePositionEmployeeMutation.mutateAsync({
        positionId: selectedPosition.id,
        employeeId: removeEmployeeTarget.id,
      })
      toast.success(
        t('organizationPage.assignEmployees.removedFromPositionToast', {
          defaultValue: 'Funcionário removido do cargo.',
        }),
      )
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

  const isSaving = createMutation.isPending || updateMutation.isPending

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
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                className="h-8 gap-1.5 px-3 text-xs"
                onClick={() => setViewMode('list')}
              >
                <List className="h-3.5 w-3.5" />
                {t('organizationPage.views.list', { defaultValue: 'Listagem' })}
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
          selectedId={selectedPositionId}
          onSelectNode={(node) => openPositionDetail(node.id)}
          onEditNode={(node) => {
            const pos = positions.find((p) => p.id === node.id)
            if (pos) handleOpenEdit(pos)
          }}
          onDeleteNode={(node) => {
            const pos = positions.find((p) => p.id === node.id)
            if (pos) setDeleteTarget(pos)
          }}
          hintText={t('organizationPage.positions.orgChartHintMembers', {
            defaultValue: 'Hierarquia de cargos organizada por nível. Clique num cargo para gerir os funcionários atribuídos.',
          })}
          selectHint={t('organizationPage.positions.manageMembersHint', {
            defaultValue: 'Gerir funcionários',
          })}
        />
      )}

      {/* Vista Listagem */}
      {positions && filtered.length > 0 && viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">
                    {t('organizationPage.fields.level', { defaultValue: 'Nível' })}
                  </TableHead>
                  <TableHead>{t('organizationPage.positions.titleLabel')}</TableHead>
                  <TableHead>
                    {t('organizationPage.positions.parent', { defaultValue: 'Cargo superior' })}
                  </TableHead>
                  <TableHead>{t('organizationPage.fields.department')}</TableHead>
                  <TableHead>
                    {t('organizationPage.positions.salaryBand', { defaultValue: 'Faixa salarial' })}
                  </TableHead>
                  <TableHead>
                    {t('organizationPage.positions.employeesCol', { defaultValue: 'Funcionários' })}
                  </TableHead>
                  <TableHead className="w-28 text-right">
                    {t('organizationPage.departments.table.actions', { defaultValue: 'Ações' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const deptName =
                    p.department?.name ?? departments?.find((d) => d.id === p.department_id)?.name
                  const parentTitle =
                    p.parent?.title ?? positions.find((parent) => parent.id === p.parent_id)?.title

                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => openPositionDetail(p.id)}
                    >
                      <TableCell>
                        <Badge variant="outline" className="font-semibold">
                          {t('organizationPage.orgChart.levelBadge', { level: p.level ?? 1 })}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
                            <Briefcase className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-foreground">{p.title}</span>
                              {p.is_management && (
                                <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                                  <Shield className="h-2.5 w-2.5 text-warning" />
                                  {t('organizationPage.positions.management')}
                                </Badge>
                              )}
                            </div>
                            {p.code && (
                              <span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {p.code}
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {parentTitle ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {deptName ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5 shrink-0" />
                            {deptName}
                          </span>
                        ) : (
                          <span className="italic opacity-70">
                            {t('organizationPage.positions.noDepartment')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.salary_min !== null || p.salary_max !== null ? (
                          <span>
                            {p.salary_min ? formatMoney(p.salary_min) : '—'} –{' '}
                            {p.salary_max ? formatMoney(p.salary_max) : '—'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Users className="h-3.5 w-3.5 text-primary" />
                          {p.employee_count ?? 0}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="inline-flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openPositionDetail(p.id)}
                            title={t('organizationPage.positions.manageMembersHint', {
                              defaultValue: 'Gerir funcionários',
                            })}
                            className="text-muted-foreground hover:text-primary"
                          >
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenEdit(p)}
                            title={t('organizationPage.actions.edit', {
                              entity: t('organizationPage.positions.singular'),
                            })}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteTarget(p)}
                            title={t('organizationPage.actions.delete', {
                              entity: t('organizationPage.positions.singular'),
                            })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Sheet Lateral: Funcionários dentro do Cargo */}
      <Sheet
        open={selectedPositionId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPositionId(null)
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          {selectedPosition && (
            <>
              <SheetHeader className="border-b px-6 py-5 pr-12">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SheetTitle className="text-lg">{selectedPosition.title}</SheetTitle>
                      <Badge variant="outline" className="text-xs">
                        {t('organizationPage.orgChart.levelBadge', {
                          level: selectedPosition.level ?? 1,
                        })}
                      </Badge>
                      {selectedPosition.code && (
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {selectedPosition.code}
                        </span>
                      )}
                      {selectedPosition.is_management && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Shield className="h-3 w-3 text-warning" />
                          {t('organizationPage.positions.management')}
                        </Badge>
                      )}
                    </div>

                    <SheetDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span>
                        {selectedPosition.department?.name ??
                          departments?.find((d) => d.id === selectedPosition.department_id)?.name ??
                          t('organizationPage.positions.noDepartment')}
                      </span>
                      {(selectedPosition.parent?.title ||
                        positions?.find((par) => par.id === selectedPosition.parent_id)?.title) && (
                        <span>
                          ·{' '}
                          {t('organizationPage.positions.parent', { defaultValue: 'Superior' })}:{' '}
                          {selectedPosition.parent?.title ??
                            positions?.find((par) => par.id === selectedPosition.parent_id)?.title}
                        </span>
                      )}
                      {(selectedPosition.salary_min !== null ||
                        selectedPosition.salary_max !== null) && (
                        <span className="font-mono">
                          ·{' '}
                          {selectedPosition.salary_min
                            ? formatMoney(selectedPosition.salary_min)
                            : '—'}{' '}
                          –{' '}
                          {selectedPosition.salary_max
                            ? formatMoney(selectedPosition.salary_max)
                            : '—'}
                        </span>
                      )}
                    </SheetDescription>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => handleOpenEdit(selectedPosition)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('organizationPage.common.edit', { defaultValue: 'Editar' })}
                  </Button>
                </div>
              </SheetHeader>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="relative flex-1">
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

                  {canManagePosEmployees && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => setIsAddEmployeesOpen(true)}
                    >
                      <UserPlus className="h-4 w-4" />
                      {t('organizationPage.assignEmployees.addButton', {
                        defaultValue: 'Adicionar funcionários',
                      })}
                    </Button>
                  )}
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
                          {canManagePosEmployees && (
                            <TableHead className="w-16 text-right">
                              {t('organizationPage.departments.table.actions', {
                                defaultValue: 'Ações',
                              })}
                            </TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionEmployees.map((emp) => {
                          const initials = emp.full_name
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join('')

                          return (
                            <TableRow key={emp.id}>
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
                                      {[emp.employee_code, emp.email].filter(Boolean).join(' · ') ||
                                        '—'}
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
                                        variant="secondary"
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
                              {canManagePosEmployees && (
                                <TableCell className="text-right">
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
                                </TableCell>
                              )}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Assign Employees to Position Dialog */}
      <AssignEmployeesDialog
        open={isAddEmployeesOpen}
        onOpenChange={setIsAddEmployeesOpen}
        mode="position"
        targetPosition={selectedPosition}
        isSaving={addPositionEmployeesMutation.isPending}
        onSubmit={handleAddEmployeesToPosition}
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
                position: selectedPosition?.title ?? '',
                defaultValue: `Deseja remover ${removeEmployeeTarget?.full_name ?? ''} do cargo ${selectedPosition?.title ?? ''}?`,
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

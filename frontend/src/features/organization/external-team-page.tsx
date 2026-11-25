import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ban,
  Building2,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared/page-header'
import {
  type ExternalTeamMember,
  type PermissionCatalogItem,
  useCreatePlatformAdminFromOrg,
  useExternalTeam,
  usePermissionsCatalog,
  useUpdateExternalTeamPermissions,
} from './api'
import { SimplePermissionsDialog, type SimplePermissionsSavePayload } from './simple-permissions-dialog'
import { getApiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type CreateAdminPresetKey = 'hrOps' | 'payroll' | 'teamManager' | 'fullTenant'

const SENSITIVE_FIELD_PREFIXES = [
  'field.employee.salary.',
  'field.employee.fiscal_ids.',
  'field.contract.base_salary.',
  'field.contract.compensation_terms.',
  'field.payroll.',
  'field.attendance.salary_deduction.',
  'field.benefit.amounts.',
  'field.deduction.amounts.',
  'field.payslip.salary_details.',
  'field.report.salary_costs.',
]

function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_PREFIXES.some((prefix) => name.startsWith(prefix))
}

function buildPresetPermissions(
  preset: CreateAdminPresetKey,
  catalogPermissions: PermissionCatalogItem[],
  allowSensitive: boolean,
): string[] {
  const hiddenGroups = new Set(['tenant', 'system'])
  const selected = new Set<string>()

  const hrManageGroups = new Set([
    'employee',
    'department',
    'position',
    'branch',
    'contract',
    'attendance',
    'leave',
    'document',
    'recruitment',
    'performance',
    'training',
    'benefit',
    'deduction',
  ])
  const payrollFullGroups = new Set(['payroll', 'payslip', 'salary-component', 'benefit', 'deduction'])
  const managerGroups = new Set(['attendance', 'leave'])
  const viewOnlyGroups = new Set(['report', 'audit', 'setting'])
  const viewActions = new Set(['view_any', 'view', 'export', 'print'])

  for (const perm of catalogPermissions) {
    const group = perm.group_name ?? 'other'
    if (hiddenGroups.has(group)) continue

    const isField = perm.name.startsWith('field.')
    const sensitive = isField && isSensitiveFieldName(perm.name)
    if (sensitive && !allowSensitive && preset !== 'payroll') {
      continue
    }

    if (preset === 'fullTenant') {
      if (!isField || !sensitive || allowSensitive) {
        selected.add(perm.name)
      }
      continue
    }

    if (preset === 'hrOps') {
      if (hrManageGroups.has(group)) {
        if (!perm.name.startsWith('force_delete_') && !perm.name.startsWith('restore_')) {
          selected.add(perm.name)
        }
      } else if (viewOnlyGroups.has(group)) {
        if (isField || [...viewActions].some((a) => perm.name.startsWith(`${a}_`))) {
          selected.add(perm.name)
        }
      }
      continue
    }

    if (preset === 'payroll') {
      if (payrollFullGroups.has(group)) {
        selected.add(perm.name)
      } else if (
        ['employee', 'contract', 'attendance', 'leave', 'report', 'audit'].includes(group) &&
        ((isField && perm.name.endsWith('.view')) ||
          [...viewActions].some((a) => perm.name.startsWith(`${a}_`)))
      ) {
        selected.add(perm.name)
      }
      continue
    }

    if (preset === 'teamManager') {
      if (managerGroups.has(group)) {
        if (!perm.name.startsWith('delete_') && !perm.name.startsWith('force_delete_')) {
          selected.add(perm.name)
        }
      } else if (
        ['employee', 'contract', 'document', 'report'].includes(group) &&
        ((isField && perm.name.endsWith('.view')) ||
          [...viewActions].some((a) => perm.name.startsWith(`${a}_`)))
      ) {
        selected.add(perm.name)
      }
    }
  }

  return [...selected]
}

export function ExternalTeamPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = useExternalTeam()
  const { data: catalogData } = usePermissionsCatalog()
  const updateExternalMutation = useUpdateExternalTeamPermissions()
  const createPlatformAdminMutation = useCreatePlatformAdminFromOrg()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [pendingAction, setPendingAction] = useState<{
    mode: 'hide_salaries' | 'restore_default' | 'block'
    userIds: number[]
    source: 'row' | 'bulk'
  } | null>(null)

  // Permissions dialog state
  const [permModalOpen, setPermModalOpen] = useState(false)
  const [permTargetMembers, setPermTargetMembers] = useState<ExternalTeamMember[]>([])

  // Create platform admin modal state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'super-admin-limited' | 'super-admin'>('super-admin-limited')
  const [newPreset, setNewPreset] = useState<CreateAdminPresetKey>('hrOps')
  const [allowSensitiveByDefault, setAllowSensitiveByDefault] = useState(true)
  const [hideSalariesHere, setHideSalariesHere] = useState(false)
  const [canManageSuperAdmins, setCanManageSuperAdmins] = useState(false)

  const members = useMemo(() => data?.members ?? [], [data?.members])
  const departments = useMemo(() => data?.departments ?? [], [data?.departments])
  const canCreatePlatformUsers = data?.can_create_platform_users ?? false
  const canCreateFullSuperAdmin = data?.can_create_full_super_admin ?? false

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return members.filter((m) => {
      const matchesSearch =
        !query ||
        m.name.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        m.source_label.toLowerCase().includes(query)

      const matchesFilter =
        statusFilter === 'all' ||
        (statusFilter === 'no_salary' && !m.has_salary_access && m.status_in_company !== 'blocked') ||
        (statusFilter !== 'no_salary' && m.status_in_company === statusFilter)

      return matchesSearch && matchesFilter
    })
  }, [members, search, statusFilter])

  const selectableFiltered = useMemo(() => filtered.filter((m) => !m.is_protected), [filtered])

  const visibleSelectedIds = useMemo(() => {
    if (selectedUserIds.length === 0) return []
    const valid = new Set(selectableFiltered.map((m) => m.id))
    return selectedUserIds.filter((id) => valid.has(id))
  }, [selectableFiltered, selectedUserIds])

  const allSelected =
    selectableFiltered.length > 0 && visibleSelectedIds.length === selectableFiltered.length

  const toggleSelectAll = (checked: boolean) => {
    setSelectedUserIds(checked ? selectableFiltered.map((m) => m.id) : [])
  }

  const toggleSelection = (userId: number, checked: boolean) => {
    setSelectedUserIds((prev) =>
      checked ? (prev.includes(userId) ? prev : [...prev, userId]) : prev.filter((id) => id !== userId),
    )
  }

  const openCustomizeModal = (targets: ExternalTeamMember[]) => {
    const editable = targets.filter((m) => !m.is_protected)
    if (editable.length === 0) return
    setPermTargetMembers(editable)
    setPermModalOpen(true)
  }

  const handleQuickAction = async (
    targetIds: number[],
    mode: 'hide_salaries' | 'restore_default' | 'block',
    source: 'row' | 'bulk' = 'row',
  ) => {
    if (targetIds.length === 0) return
    setPendingAction({ mode, userIds: targetIds, source })
    try {
      const res = await updateExternalMutation.mutateAsync({
        user_ids: targetIds,
        mode,
      })
      if (mode === 'hide_salaries') {
        toast.success(
          t('organizationPage.externalTeam.hideSalariesToast', {
            count: res.updated_count,
            defaultValue: `Salários ocultados nesta empresa para ${res.updated_count} utilizador(es).`,
          }),
        )
      } else if (mode === 'restore_default') {
        toast.success(
          t('organizationPage.externalTeam.restoredToast', {
            count: res.updated_count,
            defaultValue: `Padrão global restaurado para ${res.updated_count} utilizador(es).`,
          }),
        )
      } else {
        toast.success(
          t('organizationPage.externalTeam.blockedToast', {
            count: res.updated_count,
            defaultValue: `Acesso bloqueado nesta empresa para ${res.updated_count} utilizador(es).`,
          }),
        )
      }
      setSelectedUserIds([])
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.permissions.saveError', {
            defaultValue: 'Não foi possível guardar as permissões.',
          }),
        ),
      )
    } finally {
      setPendingAction(null)
    }
  }

  const handleSaveExternalPermissions = async (payload: SimplePermissionsSavePayload) => {
    if (permTargetMembers.length === 0) return
    try {
      await updateExternalMutation.mutateAsync({
        user_ids: permTargetMembers.map((m) => m.id),
        mode: payload.clear_individual ? 'restore_default' : 'customize',
        permissions: payload.clear_individual ? null : payload.permissions,
        permission_group_id: payload.clear_individual ? null : payload.permission_group_id,
        role_name: payload.clear_individual ? null : payload.role_name,
        department_ids: payload.clear_individual ? null : (payload.department_ids ?? null),
      })
      toast.success(
        payload.clear_individual
          ? t('organizationPage.externalTeam.restoredToast', {
              count: permTargetMembers.length,
              defaultValue: 'Padrão global restaurado com sucesso.',
            })
          : t('organizationPage.externalTeam.savedToast', {
              count: permTargetMembers.length,
              defaultValue: 'Permissões nesta empresa atualizadas com sucesso.',
            }),
      )
      setSelectedUserIds([])
      setPermModalOpen(false)
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

  const openCreatePlatformDialog = () => {
    setNewName('')
    setNewEmail('')
    setNewPassword('')
    setNewRole('super-admin-limited')
    setNewPreset('hrOps')
    setAllowSensitiveByDefault(true)
    setHideSalariesHere(false)
    setCanManageSuperAdmins(false)
    setCreateDialogOpen(true)
  }

  const handleCreatePlatformAdmin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim() || newPassword.trim().length < 8) {
      toast.error(
        t('organizationPage.externalTeam.validationError', {
          defaultValue: 'Preencha nome, email válido e palavra-passe com pelo menos 8 caracteres.',
        }),
      )
      return
    }

    const perms =
      newRole === 'super-admin'
        ? []
        : buildPresetPermissions(newPreset, catalogData?.permissions ?? [], allowSensitiveByDefault)

    const defaultRoleName =
      newPreset === 'fullTenant'
        ? 'admin'
        : newPreset === 'teamManager'
          ? 'manager'
          : 'hr-manager'

    try {
      await createPlatformAdminMutation.mutateAsync({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        permissions: perms,
        role_name: defaultRoleName,
        can_manage_super_admins: newRole === 'super-admin-limited' && canManageSuperAdmins,
        hide_salaries_in_current_company: newRole === 'super-admin-limited' && hideSalariesHere,
      })
      toast.success(
        newRole === 'super-admin'
          ? t('organizationPage.externalTeam.createdFullToast', {
              defaultValue: 'Super-Admin Total criado com sucesso.',
            })
          : t('organizationPage.externalTeam.createdLimitedToast', {
              defaultValue: 'Super-Admin Limitado criado com sucesso.',
            }),
      )
      setCreateDialogOpen(false)
    } catch (err) {
      toast.error(
        getApiErrorMessage(
          err,
          t('organizationPage.externalTeam.createError', {
            defaultValue: 'Não foi possível criar o administrador.',
          }),
        ),
      )
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('organizationPage.externalTeam.title', {
          defaultValue: 'Equipa Externa & Plataforma',
        })}
        description={t('organizationPage.externalTeam.description', {
          defaultValue:
            'Controle exceções de acesso (como ocultar salários ou limitar departamentos) apenas nesta empresa para utilizadores do Super Admin e empresa gestora, sem afetar as restantes empresas.',
        })}
        actions={
          canCreatePlatformUsers ? (
            <Button onClick={openCreatePlatformDialog} className="gap-1.5 shadow-sm">
              <Plus className="h-4 w-4" />
              {t('organizationPage.externalTeam.newPlatformAdmin', {
                defaultValue: 'Novo Super-Admin',
              })}
            </Button>
          ) : undefined
        }
      />

      {/* Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            {t('organizationPage.externalTeam.helperBanner', {
              defaultValue:
                'As alterações feitas aqui aplicam-se exclusivamente a esta empresa. Nas restantes empresas (atuais ou futuras), o utilizador mantém normalmente o seu perfil global.',
            })}
          </p>
        </CardContent>
      </Card>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 sm:max-w-xl">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('organizationPage.externalTeam.searchPlaceholder', {
                    defaultValue: 'Pesquisar por nome, email ou perfil…',
                  })}
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('organizationPage.externalTeam.filterAll', {
                      defaultValue: 'Todos os estados nesta empresa',
                    })}
                  </SelectItem>
                  <SelectItem value="global_default">
                    {t('organizationPage.externalTeam.statusGlobal', {
                      defaultValue: 'Padrão Global',
                    })}
                  </SelectItem>
                  <SelectItem value="customized">
                    {t('organizationPage.externalTeam.statusCustomized', {
                      defaultValue: 'Personalizado nesta empresa',
                    })}
                  </SelectItem>
                  <SelectItem value="no_salary">
                    {t('organizationPage.externalTeam.filterNoSalary', {
                      defaultValue: 'Salários ocultos nesta empresa',
                    })}
                  </SelectItem>
                  <SelectItem value="blocked">
                    {t('organizationPage.externalTeam.statusBlocked', {
                      defaultValue: 'Bloqueado nesta empresa',
                    })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {visibleSelectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5">
                <span className="text-xs font-medium text-foreground">
                  {t('organizationPage.permissions.selectedCount', {
                    count: visibleSelectedIds.length,
                    defaultValue: `${visibleSelectedIds.length} selecionado(s)`,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1.5 px-3 text-xs"
                  onClick={() =>
                    openCustomizeModal(
                      selectableFiltered.filter((m) => visibleSelectedIds.includes(m.id)),
                    )
                  }
                >
                  <Shield className="h-3.5 w-3.5" />
                  {t('organizationPage.externalTeam.customizeBtn', {
                    defaultValue: 'Personalizar nesta empresa',
                  })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={updateExternalMutation.isPending}
                  onClick={() => handleQuickAction(visibleSelectedIds, 'hide_salaries', 'bulk')}
                >
                  {pendingAction?.source === 'bulk' && pendingAction.mode === 'hide_salaries' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('organizationPage.externalTeam.hidingSalariesProgress', {
                        defaultValue: 'A ocultar salários…',
                      })}
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      {t('organizationPage.externalTeam.hideSalariesBtn', {
                        defaultValue: 'Ocultar salários',
                      })}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  disabled={updateExternalMutation.isPending}
                  onClick={() => handleQuickAction(visibleSelectedIds, 'restore_default', 'bulk')}
                >
                  {pendingAction?.source === 'bulk' && pendingAction.mode === 'restore_default' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('organizationPage.externalTeam.restoringDefaultProgress', {
                        defaultValue: 'A restaurar padrão…',
                      })}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t('organizationPage.externalTeam.restoreDefaultBtn', {
                        defaultValue: 'Usar padrão global',
                      })}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedUserIds([])}
                >
                  {t('organizationPage.permissions.clearSelection', { defaultValue: 'Limpar' })}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && (
        <ErrorState
          message={t('organizationPage.externalTeam.loadError', {
            defaultValue: 'Não foi possível carregar os utilizadores externos.',
          })}
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title={t('organizationPage.externalTeam.emptyTitle', {
            defaultValue: 'Nenhum utilizador externo encontrado',
          })}
          description={t('organizationPage.externalTeam.emptyDesc', {
            defaultValue:
              'Utilizadores de Super-Admin ou de empresa gestora com acesso a esta empresa aparecerão aqui.',
          })}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      disabled={selectableFiltered.length === 0}
                      onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                      aria-label={t('organizationPage.permissions.selectAllEmployees', {
                        defaultValue: 'Selecionar todos',
                      })}
                    />
                  </TableHead>
                  <TableHead>
                    {t('organizationPage.externalTeam.colUser', { defaultValue: 'Utilizador' })}
                  </TableHead>
                  <TableHead>
                    {t('organizationPage.externalTeam.colOrigin', { defaultValue: 'Origem / Perfil' })}
                  </TableHead>
                  <TableHead>
                    {t('organizationPage.externalTeam.colRule', {
                      defaultValue: 'Regra nesta empresa',
                    })}
                  </TableHead>
                  <TableHead>
                    {t('organizationPage.externalTeam.colSalaries', {
                      defaultValue: 'Dados salariais',
                    })}
                  </TableHead>
                  <TableHead className="w-36 text-right">
                    {t('organizationPage.departments.table.actions', { defaultValue: 'Ações' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => {
                  const isChecked = visibleSelectedIds.includes(member.id)
                  const isRowPending = pendingAction?.userIds.includes(member.id) ?? false
                  const rowPendingMode = isRowPending ? pendingAction?.mode : null
                  const initials = member.name
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase())
                    .join('')

                  return (
                    <TableRow
                      key={member.id}
                      data-state={isChecked ? 'selected' : undefined}
                      onClick={() => {
                        if (!member.is_protected && !isRowPending) {
                          toggleSelection(member.id, !isChecked)
                        }
                      }}
                      className={cn(
                        !member.is_protected && 'cursor-pointer',
                        isRowPending && 'bg-primary/5 opacity-80 transition-opacity',
                      )}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isChecked}
                          disabled={member.is_protected || isRowPending}
                          onCheckedChange={(checked) => toggleSelection(member.id, checked === true)}
                          aria-label={member.name}
                        />
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-2.5">
                          <Avatar size="sm" className="h-8 w-8">
                            <AvatarFallback className="text-[11px] font-medium">
                              {initials || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">
                                {member.name}
                              </span>
                              {member.is_current_user && (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                  {t('organizationPage.externalTeam.youBadge', {
                                    defaultValue: 'Você',
                                  })}
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={member.source_type === 'super_admin_full' ? 'default' : 'secondary'}
                          className="gap-1 text-xs"
                        >
                          {member.source_type === 'super_admin_full' ? (
                            <ShieldAlert className="h-3 w-3" />
                          ) : member.source_type === 'super_admin_limited' ? (
                            <UserCheck className="h-3 w-3" />
                          ) : (
                            <Building2 className="h-3 w-3" />
                          )}
                          {member.source_label}
                        </Badge>
                      </TableCell>

                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isRowPending ? (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-primary/40 bg-primary/10 text-xs text-primary"
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {rowPendingMode === 'hide_salaries'
                                ? t('organizationPage.externalTeam.hidingSalariesProgress', {
                                    defaultValue: 'A ocultar salários…',
                                  })
                                : rowPendingMode === 'restore_default'
                                  ? t('organizationPage.externalTeam.restoringDefaultProgress', {
                                      defaultValue: 'A restaurar padrão…',
                                    })
                                  : t('organizationPage.externalTeam.blockingProgress', {
                                      defaultValue: 'A bloquear acesso…',
                                    })}
                            </Badge>
                          ) : (
                            <>
                              {member.status_in_company === 'global_default' && (
                                <Badge variant="outline" className="text-xs">
                                  {t('organizationPage.externalTeam.statusGlobal', {
                                    defaultValue: 'Padrão Global',
                                  })}
                                </Badge>
                              )}
                              {member.status_in_company === 'customized' && (
                                <Badge
                                  variant="secondary"
                                  className="bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                >
                                  {t('organizationPage.externalTeam.statusCustomized', {
                                    defaultValue: 'Personalizado nesta empresa',
                                  })}
                                </Badge>
                              )}
                              {member.status_in_company === 'blocked' && (
                                <Badge variant="destructive">
                                  {t('organizationPage.externalTeam.statusBlocked', {
                                    defaultValue: 'Bloqueado nesta empresa',
                                  })}
                                </Badge>
                              )}
                            </>
                          )}
                          {member.permission_group_name && (
                            <span className="text-xs text-muted-foreground">
                              {member.permission_group_name}
                            </span>
                          )}
                          {member.department_scope_ids.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              {t('organizationPage.externalTeam.deptScopeCount', {
                                count: member.department_scope_ids.length,
                                defaultValue: `${member.department_scope_ids.length} depto(s)`,
                              })}
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        {isRowPending &&
                        (rowPendingMode === 'hide_salaries' || rowPendingMode === 'restore_default') ? (
                          <Badge
                            variant="outline"
                            className="gap-1.5 border-primary/40 bg-primary/10 text-xs text-primary"
                          >
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {rowPendingMode === 'hide_salaries'
                              ? t('organizationPage.externalTeam.hidingSalariesProgress', {
                                  defaultValue: 'A ocultar salários…',
                                })
                              : t('organizationPage.externalTeam.restoringDefaultProgress', {
                                  defaultValue: 'A restaurar padrão…',
                                })}
                          </Badge>
                        ) : member.status_in_company === 'blocked' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : member.has_salary_access ? (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          >
                            {t('organizationPage.externalTeam.salaryVisible', {
                              defaultValue: 'Vê salários',
                            })}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          >
                            <EyeOff className="h-3 w-3" />
                            {t('organizationPage.externalTeam.salaryHidden', {
                              defaultValue: 'Salários ocultos',
                            })}
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {member.is_protected ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                            title={t('organizationPage.externalTeam.protectedHint', {
                              defaultValue: 'Acesso global protegido',
                            })}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <div className="inline-flex items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={updateExternalMutation.isPending}
                              onClick={() => openCustomizeModal([member])}
                              title={t('organizationPage.externalTeam.customizeBtn', {
                                defaultValue: 'Personalizar nesta empresa',
                              })}
                              className="text-muted-foreground hover:text-primary"
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            {member.has_salary_access && member.status_in_company !== 'blocked' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={updateExternalMutation.isPending}
                                onClick={() => handleQuickAction([member.id], 'hide_salaries')}
                                title={t('organizationPage.externalTeam.hideSalariesBtn', {
                                  defaultValue: 'Ocultar salários nesta empresa',
                                })}
                                className="text-muted-foreground hover:text-amber-600"
                              >
                                {isRowPending && rowPendingMode === 'hide_salaries' ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                                ) : (
                                  <EyeOff className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {member.status_in_company !== 'global_default' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={updateExternalMutation.isPending}
                                onClick={() => handleQuickAction([member.id], 'restore_default')}
                                title={t('organizationPage.externalTeam.restoreDefaultBtn', {
                                  defaultValue: 'Usar padrão global',
                                })}
                                className="text-muted-foreground hover:text-emerald-600"
                              >
                                {isRowPending && rowPendingMode === 'restore_default' ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {member.status_in_company !== 'blocked' && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={updateExternalMutation.isPending}
                                onClick={() => handleQuickAction([member.id], 'block')}
                                title={t('organizationPage.externalTeam.blockBtn', {
                                  defaultValue: 'Bloquear acesso nesta empresa',
                                })}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                {isRowPending && rowPendingMode === 'block' ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                                ) : (
                                  <Ban className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Simple Permissions Dialog in External Mode */}
      <SimplePermissionsDialog
        open={permModalOpen}
        onOpenChange={setPermModalOpen}
        mode="external"
        selectedEmployees={[]}
        externalMembers={permTargetMembers}
        availableDepartments={departments}
        catalogPermissions={catalogData?.permissions ?? []}
        permissionGroups={catalogData?.permission_groups ?? []}
        isSaving={updateExternalMutation.isPending}
        onSave={handleSaveExternalPermissions}
      />

      {/* Create Platform Super-Admin Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('organizationPage.externalTeam.createDialogTitle', {
                defaultValue: 'Criar Super-Admin da Plataforma',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('organizationPage.externalTeam.createDialogDesc', {
                defaultValue:
                  'Crie um Super-Admin Limitado (ideal para RH ou equipa operacional com exceções por empresa) ou um Super-Admin Total.',
              })}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePlatformAdmin} className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ext-admin-name">
                  {t('organizationPage.externalTeam.nameLabel', { defaultValue: 'Nome completo' })} *
                </Label>
                <Input
                  id="ext-admin-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Ana Silva"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext-admin-email">
                  {t('organizationPage.externalTeam.emailLabel', { defaultValue: 'Email de acesso' })} *
                </Label>
                <Input
                  id="ext-admin-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="ana.rh@empresa.ao"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ext-admin-password">
                {t('organizationPage.permissions.initialPasswordLabel', {
                  defaultValue: 'Palavra-passe inicial:',
                })}{' '}
                *
              </Label>
              <Input
                id="ext-admin-password"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t('organizationPage.permissions.initialPasswordPlaceholder', {
                  defaultValue: 'Mínimo 8 caracteres…',
                })}
                required
              />
            </div>

            {/* Role Selector Cards */}
            <div className="space-y-2">
              <Label>
                {t('organizationPage.externalTeam.accountTypeLabel', {
                  defaultValue: 'Tipo de conta',
                })}
              </Label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setNewRole('super-admin-limited')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    newRole === 'super-admin-limited'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <UserCheck className="h-4 w-4 text-primary" />
                    {t('organizationPage.externalTeam.limitedRoleTitle', {
                      defaultValue: 'Super-Admin Limitado',
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('organizationPage.externalTeam.limitedRoleDesc', {
                      defaultValue:
                        'Acede a todas as empresas com o perfil escolhido e permite ocultar salários ou personalizar por empresa.',
                    })}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={!canCreateFullSuperAdmin}
                  onClick={() => canCreateFullSuperAdmin && setNewRole('super-admin')}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    newRole === 'super-admin'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40',
                    !canCreateFullSuperAdmin && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    {t('organizationPage.externalTeam.fullRoleTitle', {
                      defaultValue: 'Super-Admin Total',
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canCreateFullSuperAdmin
                      ? t('organizationPage.externalTeam.fullRoleDesc', {
                          defaultValue:
                            'Acesso total irrestrito a toda a plataforma e todas as empresas (sem restrições por empresa).',
                        })
                      : t('organizationPage.externalTeam.onlyFullCanCreateFull', {
                          defaultValue: 'Apenas um Super-Admin Total pode criar outro Super-Admin Total.',
                        })}
                  </p>
                </button>
              </div>
            </div>

            {newRole === 'super-admin-limited' && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {t('organizationPage.externalTeam.defaultProfileLabel', {
                      defaultValue: 'Perfil padrão global (para todas as empresas)',
                    })}
                  </Label>
                  <Select
                    value={newPreset}
                    onValueChange={(val: CreateAdminPresetKey) => setNewPreset(val)}
                  >
                    <SelectTrigger className="w-full bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hrOps">
                        {t('organizationPage.externalTeam.presetHrOps', {
                          defaultValue: 'RH Operacional (Equipa, contratos, férias, assiduidade)',
                        })}
                      </SelectItem>
                      <SelectItem value="payroll">
                        {t('organizationPage.externalTeam.presetPayroll', {
                          defaultValue: 'Folha & Financeiro (Processamento salarial e recibos)',
                        })}
                      </SelectItem>
                      <SelectItem value="teamManager">
                        {t('organizationPage.externalTeam.presetTeamManager', {
                          defaultValue: 'Gestor de Equipa (Aprovar férias e assiduidade)',
                        })}
                      </SelectItem>
                      <SelectItem value="fullTenant">
                        {t('organizationPage.externalTeam.presetFullTenant', {
                          defaultValue: 'Administrador Completo de Empresas (Tudo em cada empresa)',
                        })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
                  <div>
                    <Label htmlFor="ext-sensitive-default" className="text-xs font-medium">
                      {t('organizationPage.externalTeam.allowSalaryByDefaultLabel', {
                        defaultValue: 'Permitir ver/editar salários por defeito (nas restantes empresas)',
                      })}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('organizationPage.externalTeam.allowSalaryByDefaultDesc', {
                        defaultValue:
                          'Mantém salários visíveis globalmente e permite restringir apenas em empresas específicas.',
                      })}
                    </p>
                  </div>
                  <Switch
                    id="ext-sensitive-default"
                    checked={allowSensitiveByDefault}
                    onCheckedChange={setAllowSensitiveByDefault}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                  <div>
                    <Label htmlFor="ext-hide-here" className="text-xs font-medium">
                      {t('organizationPage.externalTeam.hideHereLabel', {
                        defaultValue: 'Ocultar salários já nesta empresa atual',
                      })}
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t('organizationPage.externalTeam.hideHereDesc', {
                        defaultValue:
                          'Cria logo a exceção nesta empresa mantendo acesso normal a todas as outras.',
                      })}
                    </p>
                  </div>
                  <Switch
                    id="ext-hide-here"
                    checked={hideSalariesHere}
                    onCheckedChange={setHideSalariesHere}
                  />
                </div>

                {canCreateFullSuperAdmin && (
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5">
                    <div>
                      <Label htmlFor="ext-manage-sa" className="text-xs font-medium">
                        {t('organizationPage.externalTeam.canManageLimitedLabel', {
                          defaultValue: 'Permitir criar e gerir outros Super-Admins Limitados',
                        })}
                      </Label>
                    </div>
                    <Switch
                      id="ext-manage-sa"
                      checked={canManageSuperAdmins}
                      onCheckedChange={setCanManageSuperAdmins}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createPlatformAdminMutation.isPending}
              >
                {t('organizationPage.common.cancel')}
              </Button>
              <Button type="submit" disabled={createPlatformAdminMutation.isPending}>
                {createPlatformAdminMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {t('organizationPage.common.saving')}
                  </>
                ) : (
                  t('organizationPage.externalTeam.createSubmit', {
                    defaultValue: 'Criar utilizador',
                  })
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Building2, Layers, Search, Shield, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Tenant } from '@/types'

export interface PermissionItem {
  name: string
  group_name: string | null
}

export interface PermissionGroupRecord {
  id: number
  name: string
  description: string | null
  permissions: string[]
  is_system: boolean
}

export interface TenantAccessDraft {
  tenant_id: number
  permission_group_id: number | null
  role_name: string
  permissions: string[]
  department_ids: number[]
}

const STANDARD_ACTIONS = [
  'force_delete',
  'view_any',
  'view',
  'create',
  'update',
  'delete',
  'restore',
  'approve',
  'reject',
  'process',
  'close',
  'export',
  'print',
  'configure',
] as const

function translateSingleLocale(
  t: TFunction,
  name: string,
  lng?: string,
): string {
  const opts = lng ? { lng, postProcess: [] as string[] } : {}

  // 1. Campo / Coluna: field.<resource>.<field>.<view|edit>
  if (name.startsWith('field.')) {
    const [, resource, field, mode] = name.split('.')
    if (resource && field && mode) {
      const modeLabel = t(`superAdminPage.fieldModes.${mode}`, { ...opts, defaultValue: mode })
      const fieldLabel = t(`superAdminPage.fieldPermissions.${resource}.${field}`, {
        ...opts,
        defaultValue: field.replaceAll('_', ' '),
      })
      return `${modeLabel} · ${fieldLabel}`
    }
  }

  // 2. Permissões globais (system)
  const globalLabel = t(`superAdminPage.permissionLabels.${name}`, { ...opts, defaultValue: '' }).trim()
  if (globalLabel) return globalLabel

  // 3. Ação padrão: <action>_<resource>
  const action = STANDARD_ACTIONS.find((candidate) => name.startsWith(`${candidate}_`))
  if (!action) {
    return t('superAdminPage.permissionFallback', { ...opts, name, defaultValue: name })
  }

  const shortActionLabel = t(`superAdminPage.permissionShortActions.${action}`, {
    ...opts,
    defaultValue: '',
  }).trim()
  if (shortActionLabel) {
    return shortActionLabel
  }

  const resource = name.slice(action.length + 1).replaceAll('_', '-')
  const resourceForm = action === 'view_any' ? 'plural' : 'singular'
  const resourceLabel = resource
    ? t(`superAdminPage.permissionResources.${resource}.${resourceForm}`, { ...opts, defaultValue: '' }).trim()
    : ''

  if (!resourceLabel) {
    return t('superAdminPage.permissionFallback', { ...opts, name, defaultValue: name })
  }

  return t(`superAdminPage.permissionActions.${action}`, {
    ...opts,
    resource: resourceLabel,
    defaultValue: name,
  }).trim() || name
}

export function getPermissionDisplayLabel(t: TFunction, name: string): string {
  const isBilingual = typeof localStorage !== 'undefined' && localStorage.getItem('hrms_bilingual') === 'true'
  if (!isBilingual) {
    return translateSingleLocale(t, name)
  }

  const pt = translateSingleLocale(t, name, 'pt')
  const zh = translateSingleLocale(t, name, 'zh')
  if (!zh || pt === zh) return pt
  return `${pt}\n${zh}`
}

export function PermissionSelector({
  permissions,
  selectedPermissions,
  onChange,
  lockedPermissions = [],
  maxHeightClass = 'max-h-72',
}: {
  permissions: PermissionItem[]
  selectedPermissions: string[]
  onChange: (next: string[]) => void
  lockedPermissions?: string[]
  maxHeightClass?: string
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const lockedSet = useMemo(() => new Set(lockedPermissions), [lockedPermissions])
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions])

  const grouped = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const map: Record<string, { actions: PermissionItem[]; fields: PermissionItem[] }> = {}

    for (const perm of permissions) {
      const group = perm.group_name ?? 'other'
      const label = getPermissionDisplayLabel(t, perm.name)
      const groupLabel = t(`superAdminPage.permissionGroups.${group}`, { defaultValue: group })
      if (query && !`${label} ${perm.name} ${groupLabel}`.toLocaleLowerCase().includes(query)) {
        continue
      }

      map[group] ??= { actions: [], fields: [] }
      if (perm.name.startsWith('field.')) {
        map[group].fields.push(perm)
      } else {
        map[group].actions.push(perm)
      }
    }

    return map
  }, [permissions, search, t])

  const toggleSingle = (name: string, checked: boolean) => {
    if (lockedSet.has(name)) return
    const next = new Set(selectedSet)
    if (checked) next.add(name)
    else next.delete(name)
    for (const locked of lockedSet) next.add(locked)
    onChange([...next])
  }

  const toggleGroup = (items: PermissionItem[], checked: boolean) => {
    const next = new Set(selectedSet)
    for (const item of items) {
      if (lockedSet.has(item.name)) continue
      if (checked) next.add(item.name)
      else next.delete(item.name)
    }
    for (const locked of lockedSet) next.add(locked)
    onChange([...next])
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('superAdminPage.searchPermissions', { defaultValue: 'Filtrar permissões ou campos...' })}
          className="h-8 pl-8 text-xs"
        />
      </div>

      <div className={`${maxHeightClass} space-y-2 overflow-y-auto rounded-md border p-2.5`}>
        {Object.keys(grouped).length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
        ) : (
          Object.entries(grouped).map(([group, { actions, fields }]) => {
            const allGroupItems = [...actions, ...fields]
            const allSelected = allGroupItems.length > 0 && allGroupItems.every((p) => selectedSet.has(p.name))
            const selectedCount = allGroupItems.filter((p) => selectedSet.has(p.name)).length

            return (
              <div key={group} className="rounded-md border border-border/70 px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer select-none text-sm font-medium">
                      {t(`superAdminPage.permissionGroups.${group}`, {
                        defaultValue: t('superAdminPage.otherPermissions'),
                      })}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({selectedCount}/{allGroupItems.length})
                      </span>
                    </summary>

                    <div className="mt-2.5 space-y-3">
                      {actions.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('superAdminPage.moduleActionsHeading', { defaultValue: 'Ações do módulo' })}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {actions.map((permission) => {
                              const checked = selectedSet.has(permission.name)
                              const locked = lockedSet.has(permission.name)
                              return (
                                <label key={permission.name} className="flex items-start gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={checked}
                                    disabled={locked}
                                    onChange={(event) => toggleSingle(permission.name, event.target.checked)}
                                  />
                                  <span className="leading-snug">
                                    {getPermissionDisplayLabel(t, permission.name)}
                                    {locked ? ` (${t('superAdminPage.required')})` : ''}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {fields.length > 0 && (
                        <div className="space-y-1.5 border-t border-border/50 pt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                            {t('superAdminPage.fieldPermissionsHeading', { defaultValue: 'Permissões por campo / colunas' })}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {fields.map((permission) => {
                              const checked = selectedSet.has(permission.name)
                              return (
                                <label key={permission.name} className="flex items-start gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    checked={checked}
                                    onChange={(event) => toggleSingle(permission.name, event.target.checked)}
                                  />
                                  <span className="leading-snug">{getPermissionDisplayLabel(t, permission.name)}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>

                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => toggleGroup(allGroupItems, event.target.checked)}
                    />
                    <span>{t('superAdminPage.selectAllGroup')}</span>
                  </label>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function TenantDepartmentSelector({
  tenantId,
  selectedDepartmentIds,
  onChange,
}: {
  tenantId: number
  selectedDepartmentIds: number[]
  onChange: (next: number[]) => void
}) {
  const { t } = useTranslation()
  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['superadmin', 'tenant-departments', tenantId],
    queryFn: () => api.get<Array<{ id: number; name: string }>>(`superadmin/tenants/${tenantId}/departments`),
    enabled: tenantId > 0,
  })

  const allDepartments = selectedDepartmentIds.length === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium">
          {t('superAdminPage.departmentScope', { defaultValue: 'Departamentos permitidos' })}
        </Label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allDepartments}
            onChange={(e) => {
              if (e.target.checked) onChange([])
              else if (departments.length > 0) onChange([departments[0].id])
            }}
          />
          <span>{t('superAdminPage.allDepartments', { defaultValue: 'Todos os departamentos' })}</span>
        </label>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : departments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('superAdminPage.noDepartmentsForTenant', { defaultValue: 'Sem departamentos registados nesta empresa.' })}
        </p>
      ) : (
        <div className="grid max-h-32 gap-1.5 overflow-y-auto rounded border border-border/70 p-2 sm:grid-cols-2">
          {departments.map((dept) => {
            const checked = allDepartments || selectedDepartmentIds.includes(dept.id)
            return (
              <label key={dept.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (allDepartments) {
                      if (!e.target.checked) {
                        onChange(departments.filter((d) => d.id !== dept.id).map((d) => d.id))
                      }
                      return
                    }
                    const next = e.target.checked
                      ? [...selectedDepartmentIds, dept.id]
                      : selectedDepartmentIds.filter((id) => id !== dept.id)
                    if (next.length === departments.length) {
                      onChange([])
                    } else {
                      onChange(next)
                    }
                  }}
                />
                <span className="truncate">{dept.name}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

const PLATFORM_ONLY_PERMISSIONS = new Set([
  'manage_platform',
  'manage_super_admins',
  'view_any_tenant',
  'view_tenant',
  'create_tenant',
  'update_tenant',
  'delete_tenant',
  'restore_tenant',
  'force_delete_tenant',
])

function haveSameSharedAccessConfig(accesses: TenantAccessDraft[]): boolean {
  if (accesses.length <= 1) return true
  const first = accesses[0]
  const firstPerms = [...first.permissions].sort().join('\0')
  return accesses.every(
    (item) =>
      (item.permission_group_id ?? null) === (first.permission_group_id ?? null)
      && item.role_name === first.role_name
      && [...item.permissions].sort().join('\0') === firstPerms,
  )
}

export function TenantAccessScopeEditor({
  tenants,
  permissionGroups,
  allPermissions,
  accesses,
  onChange,
  defaultRole = 'employee',
  basePermissions = [],
}: {
  tenants: Tenant[]
  permissionGroups: PermissionGroupRecord[]
  allPermissions: PermissionItem[]
  accesses: TenantAccessDraft[]
  onChange: (next: TenantAccessDraft[]) => void
  defaultRole?: string
  basePermissions?: string[]
}) {
  const { t } = useTranslation()
  const [companySearch, setCompanySearch] = useState('')
  const [shareConfig, setShareConfig] = useState<boolean>(() => haveSameSharedAccessConfig(accesses))
  const [sharedEdited, setSharedEdited] = useState(false)

  const allowedPermissionSet = useMemo(
    () => new Set(allPermissions.map((p) => p.name)),
    [allPermissions],
  )

  const filterAssignablePermissions = useMemo(
    () => (perms: string[]) => {
      const noPlatform = perms.filter((p) => !PLATFORM_ONLY_PERMISSIONS.has(p))
      const filtered = allowedPermissionSet.size > 0
        ? noPlatform.filter((p) => allowedPermissionSet.has(p))
        : noPlatform
      return [...new Set(filtered)]
    },
    [allowedPermissionSet],
  )

  const sanitizedBasePermissions = useMemo(
    () => filterAssignablePermissions(basePermissions),
    [basePermissions, filterAssignablePermissions],
  )

  const [draftSharedConfig, setDraftSharedConfig] = useState<{
    permission_group_id: number | null
    role_name: string
    permissions: string[]
  }>(() => ({
    permission_group_id: accesses[0]?.permission_group_id ?? null,
    role_name: accesses[0]?.role_name || defaultRole,
    permissions: accesses[0]?.permissions
      ? filterAssignablePermissions(accesses[0].permissions)
      : sanitizedBasePermissions,
  }))

  useEffect(() => {
    if (!haveSameSharedAccessConfig(accesses)) {
      setShareConfig(false)
    }
  }, [accesses])

  const currentShared = useMemo(() => {
    if (accesses.length > 0) {
      return {
        permission_group_id: accesses[0].permission_group_id ?? null,
        role_name: accesses[0].role_name || defaultRole,
        permissions: filterAssignablePermissions(accesses[0].permissions ?? []),
      }
    }
    if (sharedEdited) {
      return {
        ...draftSharedConfig,
        permissions: filterAssignablePermissions(draftSharedConfig.permissions),
      }
    }
    return {
      permission_group_id: null,
      role_name: defaultRole,
      permissions: sanitizedBasePermissions,
    }
  }, [accesses, defaultRole, draftSharedConfig, filterAssignablePermissions, sanitizedBasePermissions, sharedEdited])

  const assignedTenantIds = useMemo(
    () => new Set(accesses.map((a) => a.tenant_id)),
    [accesses],
  )

  const filteredTenants = useMemo(() => {
    const query = companySearch.trim().toLocaleLowerCase()
    if (!query) return tenants
    return tenants.filter((tnt) => `${tnt.name} ${tnt.tax_id ?? ''} ${tnt.slug ?? ''}`.toLocaleLowerCase().includes(query))
  }, [tenants, companySearch])

  const tenantMap = useMemo(() => {
    const map = new Map<number, Tenant>()
    for (const tnt of tenants) map.set(tnt.id, tnt)
    return map
  }, [tenants])

  const toggleCompany = (tenantId: number, checked: boolean) => {
    if (checked) {
      if (assignedTenantIds.has(tenantId)) return
      onChange([
        ...accesses,
        {
          tenant_id: tenantId,
          permission_group_id: currentShared.permission_group_id,
          role_name: currentShared.role_name,
          permissions: [...currentShared.permissions],
          department_ids: [],
        },
      ])
    } else {
      onChange(accesses.filter((item) => item.tenant_id !== tenantId))
    }
  }

  const selectAllFiltered = () => {
    const additions: TenantAccessDraft[] = []
    for (const tnt of filteredTenants) {
      if (!assignedTenantIds.has(tnt.id)) {
        additions.push({
          tenant_id: tnt.id,
          permission_group_id: currentShared.permission_group_id,
          role_name: currentShared.role_name,
          permissions: [...currentShared.permissions],
          department_ids: [],
        })
      }
    }
    if (additions.length > 0) {
      onChange([...accesses, ...additions])
    }
  }

  const clearAllCompanies = () => {
    if (accesses.length > 0) {
      onChange([])
    }
  }

  const updateSharedConfig = (patch: Partial<{ permission_group_id: number | null; role_name: string; permissions: string[] }>) => {
    const nextConfig = {
      permission_group_id: patch.permission_group_id !== undefined ? patch.permission_group_id : currentShared.permission_group_id,
      role_name: patch.role_name !== undefined ? patch.role_name : currentShared.role_name,
      permissions: patch.permissions !== undefined ? filterAssignablePermissions(patch.permissions) : currentShared.permissions,
    }
    setSharedEdited(true)
    setDraftSharedConfig(nextConfig)
    if (accesses.length > 0) {
      onChange(
        accesses.map((item) => ({
          ...item,
          permission_group_id: nextConfig.permission_group_id,
          role_name: nextConfig.role_name,
          permissions: [...nextConfig.permissions],
        })),
      )
    }
  }

  const handleToggleShareConfig = (enabled: boolean) => {
    setShareConfig(enabled)
    if (enabled && accesses.length > 0) {
      const template = {
        permission_group_id: accesses[0].permission_group_id ?? null,
        role_name: accesses[0].role_name || defaultRole,
        permissions: filterAssignablePermissions(accesses[0].permissions ?? []),
      }
      setSharedEdited(true)
      setDraftSharedConfig(template)
      onChange(
        accesses.map((item) => ({
          ...item,
          permission_group_id: template.permission_group_id,
          role_name: template.role_name,
          permissions: [...template.permissions],
        })),
      )
    }
  }

  const updateAccessByTenantId = (tenantId: number, patch: Partial<TenantAccessDraft>) => {
    onChange(accesses.map((item) => (item.tenant_id === tenantId ? { ...item, ...patch } : item)))
  }

  const removeAccessByTenantId = (tenantId: number) => {
    onChange(accesses.filter((item) => item.tenant_id !== tenantId))
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" />
            {t('superAdminPage.companyAccessTitle', { defaultValue: 'Acesso por Empresa e Departamento' })}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('superAdminPage.companyAccessDescription', {
              defaultValue: 'Defina quais empresas, grupos de permissões e departamentos o utilizador pode aceder.',
            })}
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-normal">
          {t('superAdminPage.selectedCompaniesCount', {
            selected: accesses.length,
            total: tenants.length,
            defaultValue: `${accesses.length} / ${tenants.length} selecionadas`,
          })}
        </Badge>
      </div>

      {/* Seleção rápida de empresas por checkbox */}
      <div className="space-y-2 rounded-md border bg-card p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder={t('superAdminPage.searchCompanies', { defaultValue: 'Pesquisar empresas...' })}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={filteredTenants.length === 0 || filteredTenants.every((tnt) => assignedTenantIds.has(tnt.id))}
            onClick={selectAllFiltered}
          >
            {t('superAdminPage.selectAllCompanies', { defaultValue: 'Selecionar todas' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={accesses.length === 0}
            onClick={clearAllCompanies}
          >
            {t('superAdminPage.clearCompanies', { defaultValue: 'Limpar' })}
          </Button>
        </div>

        {filteredTenants.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
        ) : (
          <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border/60 bg-muted/15 p-2 sm:grid-cols-2">
            {filteredTenants.map((tnt) => {
              const checked = assignedTenantIds.has(tnt.id)
              const taxIdLabel = `${t('superAdminPage.taxIdShort', { defaultValue: 'NIF' })}: ${tnt.tax_id?.trim() || '—'}`
              return (
                <label
                  key={tnt.id}
                  title={`${tnt.name} (${taxIdLabel})`}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 transition-colors ${
                    checked
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border/60 bg-background hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    checked={checked}
                    onChange={(e) => toggleCompany(tnt.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="truncate text-xs font-medium leading-tight text-foreground">{tnt.name}</p>
                    <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">{taxIdLabel}</p>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {tenants.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0"
            checked={shareConfig}
            onChange={(e) => handleToggleShareConfig(e.target.checked)}
          />
          <span>
            {t('superAdminPage.shareCompanyConfig', {
              defaultValue: 'Partilhar grupo, papel e permissões entre as empresas selecionadas',
            })}
          </span>
        </label>
      )}

      {accesses.length === 0 && !shareConfig ? (
        <p className="rounded border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          {t('superAdminPage.noCompanyScopes', {
            defaultValue: 'Sem vínculos específicos por empresa. O utilizador usará apenas o escopo padrão.',
          })}
        </p>
      ) : shareConfig ? (
        <div className="space-y-3">
          <div className="space-y-3 rounded-md border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                {t('superAdminPage.sharedConfigHeading', { defaultValue: 'Configuração partilhada' })}
              </span>
              {accesses.length === 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {t('superAdminPage.noCompanyScopes', {
                    defaultValue: 'Sem vínculos específicos por empresa. O utilizador usará apenas o escopo padrão.',
                  })}
                </span>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3 text-primary" />
                    {t('superAdminPage.permissionGroupLabel', { defaultValue: 'Grupo de permissões' })}
                  </span>
                </Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs"
                  value={currentShared.permission_group_id ?? ''}
                  onChange={(e) => {
                    const groupId = e.target.value ? Number(e.target.value) : null
                    const group = permissionGroups.find((g) => g.id === groupId)
                    updateSharedConfig({
                      permission_group_id: groupId,
                      permissions: group ? filterAssignablePermissions(group.permissions) : currentShared.permissions,
                    })
                  }}
                >
                  <option value="">{t('superAdminPage.customPermissions', { defaultValue: 'Personalizado' })}</option>
                  {permissionGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{t('superAdminPage.roleLabel', { defaultValue: 'Papel' })}</Label>
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs"
                  value={currentShared.role_name}
                  onChange={(e) => updateSharedConfig({ role_name: e.target.value })}
                >
                  <option value="admin">{t('superAdminPage.roles.admin')}</option>
                  <option value="hr-manager">{t('superAdminPage.roles.hr-manager')}</option>
                  <option value="manager">{t('superAdminPage.roles.manager')}</option>
                  <option value="employee">{t('superAdminPage.roles.employee')}</option>
                </select>
              </div>
            </div>

            <details className="rounded border border-border/70 px-2.5 py-2">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  {t('superAdminPage.sharedCompanyPermissionsLabel', {
                    defaultValue: 'Permissões partilhadas nas empresas selecionadas',
                  })}
                </span>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {currentShared.permissions.length}
                </Badge>
              </summary>
              <div className="mt-2">
                <PermissionSelector
                  permissions={allPermissions}
                  selectedPermissions={currentShared.permissions}
                  onChange={(permissions) => updateSharedConfig({
                    permission_group_id: null,
                    permissions,
                  })}
                  maxHeightClass="max-h-56"
                />
              </div>
            </details>
          </div>

          {accesses.length > 0 && (
            <div className="space-y-2 rounded-md border bg-card p-3">
              <p className="text-xs font-semibold">
                {t('superAdminPage.departmentsByCompanyHeading', {
                  defaultValue: 'Departamentos por empresa (opcional)',
                })}
              </p>
              <div className="space-y-2">
                {accesses.map((access) => {
                  const tnt = tenantMap.get(access.tenant_id)
                  const deptLabel = access.department_ids.length === 0
                    ? t('superAdminPage.allDepartments', { defaultValue: 'Todos os departamentos' })
                    : t('superAdminPage.selectedDepartmentsCount', {
                        count: access.department_ids.length,
                        defaultValue: `${access.department_ids.length} selecionado(s)`,
                      })

                  return (
                    <details key={access.tenant_id} className="rounded border border-border/70 px-2.5 py-2">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium">
                        <span className="truncate">{tnt?.name ?? `#${access.tenant_id}`}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {deptLabel}
                          </Badge>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            title={t('common.delete')}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              removeAccessByTenantId(access.tenant_id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </summary>
                      <div className="mt-2 border-t border-border/50 pt-2">
                        <TenantDepartmentSelector
                          tenantId={access.tenant_id}
                          selectedDepartmentIds={access.department_ids}
                          onChange={(department_ids) => updateAccessByTenantId(access.tenant_id, { department_ids })}
                        />
                      </div>
                    </details>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {accesses.map((access) => {
            const tnt = tenantMap.get(access.tenant_id)
            const accessPermissions = filterAssignablePermissions(access.permissions ?? [])

            return (
              <div key={access.tenant_id} className="space-y-3 rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                  <span className="text-xs font-semibold">{tnt?.name ?? `#${access.tenant_id}`}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title={t('common.delete')}
                    onClick={() => removeAccessByTenantId(access.tenant_id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3 w-3 text-primary" />
                        {t('superAdminPage.permissionGroupLabel', { defaultValue: 'Grupo de permissões' })}
                      </span>
                    </Label>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs"
                      value={access.permission_group_id ?? ''}
                      onChange={(e) => {
                        const groupId = e.target.value ? Number(e.target.value) : null
                        const group = permissionGroups.find((g) => g.id === groupId)
                        updateAccessByTenantId(access.tenant_id, {
                          permission_group_id: groupId,
                          permissions: group ? filterAssignablePermissions(group.permissions) : accessPermissions,
                        })
                      }}
                    >
                      <option value="">{t('superAdminPage.customPermissions', { defaultValue: 'Personalizado' })}</option>
                      {permissionGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{t('superAdminPage.roleLabel', { defaultValue: 'Papel' })}</Label>
                    <select
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs"
                      value={access.role_name}
                      onChange={(e) => updateAccessByTenantId(access.tenant_id, { role_name: e.target.value })}
                    >
                      <option value="admin">{t('superAdminPage.roles.admin')}</option>
                      <option value="hr-manager">{t('superAdminPage.roles.hr-manager')}</option>
                      <option value="manager">{t('superAdminPage.roles.manager')}</option>
                      <option value="employee">{t('superAdminPage.roles.employee')}</option>
                    </select>
                  </div>
                </div>

                <TenantDepartmentSelector
                  tenantId={access.tenant_id}
                  selectedDepartmentIds={access.department_ids}
                  onChange={(department_ids) => updateAccessByTenantId(access.tenant_id, { department_ids })}
                />

                <details className="rounded border border-border/70 px-2.5 py-2">
                  <summary className="flex cursor-pointer items-center justify-between text-xs font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-primary" />
                      {t('superAdminPage.companyPermissionsLabel', { defaultValue: 'Permissões nesta empresa' })}
                    </span>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {accessPermissions.length}
                    </Badge>
                  </summary>
                  <div className="mt-2">
                    <PermissionSelector
                      permissions={allPermissions}
                      selectedPermissions={accessPermissions}
                      onChange={(permissions) => updateAccessByTenantId(access.tenant_id, {
                        permission_group_id: null,
                        permissions: filterAssignablePermissions(permissions),
                      })}
                      maxHeightClass="max-h-56"
                    />
                  </div>
                </details>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

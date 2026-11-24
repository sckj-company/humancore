import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Building2, ChevronDown, Eye, Layers, Search, Shield, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
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
  permissions: string[] | null
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

const VIEW_ACTIONS = new Set(['view_any', 'view', 'export', 'print'])

const MANAGE_ACTIONS = new Set([
  'view_any',
  'view',
  'export',
  'print',
  'create',
  'update',
  'approve',
  'reject',
  'process',
  'configure',
])

const MODULE_RELEVANT_ACTIONS: Record<string, Set<string>> = {
  tenant: new Set(['view_any', 'view', 'create', 'update', 'delete']),
  user: new Set(['view_any', 'view', 'create', 'update', 'delete']),
  employee: new Set(['view_any', 'view', 'create', 'update', 'delete', 'export', 'print']),
  department: new Set(['view_any', 'view', 'create', 'update', 'delete']),
  position: new Set(['view_any', 'view', 'create', 'update', 'delete']),
  branch: new Set(['view_any', 'view', 'create', 'update', 'delete']),
  contract: new Set(['view_any', 'view', 'create', 'update', 'delete', 'print', 'export']),
  attendance: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve', 'reject', 'export']),
  leave: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve', 'reject', 'export']),
  payroll: new Set(['view_any', 'view', 'create', 'update', 'process', 'close', 'export', 'print', 'configure']),
  payslip: new Set(['view_any', 'view', 'export', 'print']),
  'salary-component': new Set(['view_any', 'view', 'create', 'update', 'delete', 'configure']),
  benefit: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve']),
  deduction: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve']),
  recruitment: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve']),
  document: new Set(['view_any', 'view', 'create', 'update', 'delete', 'export', 'print']),
  performance: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve']),
  training: new Set(['view_any', 'view', 'create', 'update', 'delete', 'approve']),
  report: new Set(['view_any', 'view', 'export', 'print']),
  setting: new Set(['view_any', 'view', 'update', 'configure']),
  audit: new Set(['view_any', 'view', 'export']),
  'email-template': new Set(['view_any', 'view', 'create', 'update', 'delete']),
}

const MANAGER_SAFE_FIELD_PERMISSIONS = new Set([
  'field.employee.personal_identity.view',
  'field.employee.contact_address.view',
  'field.employee.organization.view',
  'field.contract.dates_notes.view',
  'field.attendance.clock_times.view',
  'field.attendance.overtime_lateness.view',
  'field.leave.balances.view',
  'field.leave.documents.view',
])

const SALARY_FIELD_PREFIXES = [
  'field.employee.salary.',
  'field.contract.base_salary.',
  'field.contract.compensation_terms.',
  'field.payroll.',
  'field.payslip.salary_details.',
  'field.attendance.salary_deduction.',
  'field.benefit.amounts.',
  'field.deduction.amounts.',
  'field.report.salary_costs.',
]

const PERSONAL_FISCAL_FIELD_PREFIXES = [
  'field.employee.fiscal_ids.',
  'field.employee.personal_identity.',
  'field.employee.contact_address.',
]

type ModuleAccessLevel = 'none' | 'view' | 'manage' | 'full' | 'custom'
type PresetKey = 'readOnly' | 'hrOps' | 'payroll' | 'teamManager' | 'fullAccess'

interface ModuleBucket {
  group: string
  relevantActions: PermissionItem[]
  technicalActions: PermissionItem[]
  fields: PermissionItem[]
  viewNames: string[]
  manageNames: string[]
  fullNames: string[]
  allNames: string[]
}

interface PairedFieldRow {
  key: string
  resource: string
  field: string
  viewPerm?: PermissionItem
  editPerm?: PermissionItem
}

function getActionFromPermission(name: string): string | null {
  return STANDARD_ACTIONS.find((candidate) => name.startsWith(`${candidate}_`)) ?? null
}

function setsEqual(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false
  const actualSet = new Set(actual)
  return expected.every((item) => actualSet.has(item))
}

function getFieldDisplayLabel(t: TFunction, resource: string, field: string): string {
  const isBilingual = typeof localStorage !== 'undefined' && localStorage.getItem('hrms_bilingual') === 'true'
  const pt = t(`superAdminPage.fieldPermissions.${resource}.${field}`, {
    ...(isBilingual ? { lng: 'pt', postProcess: [] as string[] } : {}),
    defaultValue: field.replaceAll('_', ' '),
  })
  if (!isBilingual) return pt
  const zh = t(`superAdminPage.fieldPermissions.${resource}.${field}`, {
    lng: 'zh',
    postProcess: [] as string[],
    defaultValue: '',
  })
  if (!zh || pt === zh) return pt
  return `${pt} / ${zh}`
}

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
  const action = getActionFromPermission(name)
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
  const [activeView, setActiveView] = useState<'modules' | 'fields'>('modules')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [showTechnicalGroups, setShowTechnicalGroups] = useState<Record<string, boolean>>({})

  const lockedSet = useMemo(() => new Set(lockedPermissions), [lockedPermissions])
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions])

  const { actionPerms, fieldPerms, selectedActionCount, selectedFieldCount, availableSet } = useMemo(() => {
    const actions: PermissionItem[] = []
    const fields: PermissionItem[] = []
    const allNames = new Set<string>()
    let selActions = 0
    let selFields = 0
    for (const perm of permissions) {
      allNames.add(perm.name)
      if (perm.name.startsWith('field.')) {
        fields.push(perm)
        if (selectedSet.has(perm.name)) selFields++
      } else {
        actions.push(perm)
        if (selectedSet.has(perm.name)) selActions++
      }
    }
    return {
      actionPerms: actions,
      fieldPerms: fields,
      selectedActionCount: selActions,
      selectedFieldCount: selFields,
      availableSet: allNames,
    }
  }, [permissions, selectedSet])

  const moduleBuckets = useMemo<ModuleBucket[]>(() => {
    const byGroup = new Map<string, { actions: PermissionItem[]; fields: PermissionItem[] }>()

    for (const perm of permissions) {
      const group = perm.group_name ?? 'other'
      let entry = byGroup.get(group)
      if (!entry) {
        entry = { actions: [], fields: [] }
        byGroup.set(group, entry)
      }
      if (perm.name.startsWith('field.')) {
        entry.fields.push(perm)
      } else {
        entry.actions.push(perm)
      }
    }

    const buckets: ModuleBucket[] = []
    for (const [group, { actions, fields }] of byGroup.entries()) {
      const relevantSet = MODULE_RELEVANT_ACTIONS[group]
      const relevantActions: PermissionItem[] = []
      const technicalActions: PermissionItem[] = []

      for (const perm of actions) {
        const action = getActionFromPermission(perm.name)
        if (!relevantSet || action === null || relevantSet.has(action) || lockedSet.has(perm.name)) {
          relevantActions.push(perm)
        } else {
          technicalActions.push(perm)
        }
      }

      const viewNames = [
        ...relevantActions
          .filter((p) => {
            const action = getActionFromPermission(p.name)
            return action !== null && VIEW_ACTIONS.has(action)
          })
          .map((p) => p.name),
        ...fields.filter((p) => p.name.endsWith('.view')).map((p) => p.name),
      ]

      const manageNames = [
        ...relevantActions
          .filter((p) => {
            const action = getActionFromPermission(p.name)
            return action === null || MANAGE_ACTIONS.has(action)
          })
          .map((p) => p.name),
        ...fields.map((p) => p.name),
      ]

      const fullNames = [...relevantActions.map((p) => p.name), ...fields.map((p) => p.name)]
      const allNames = [...fullNames, ...technicalActions.map((p) => p.name)]

      buckets.push({
        group,
        relevantActions,
        technicalActions,
        fields,
        viewNames,
        manageNames,
        fullNames,
        allNames,
      })
    }

    return buckets
  }, [permissions, lockedSet])

  const commitSelection = (next: Set<string>) => {
    for (const locked of lockedSet) {
      if (availableSet.has(locked) || selectedSet.has(locked)) {
        next.add(locked)
      }
    }
    onChange([...next])
  }

  const clearAllPermissions = () => {
    commitSelection(new Set())
  }

  const enableAllFieldPermissions = () => {
    const next = new Set(selectedSet)
    for (const fieldPerm of fieldPerms) next.add(fieldPerm.name)
    commitSelection(next)
  }

  const applyFieldPrivacyAction = (action: 'viewAll' | 'editAll' | 'hideSalaries' | 'hidePersonalFiscal') => {
    const next = new Set(selectedSet)
    if (action === 'viewAll') {
      for (const fieldPerm of fieldPerms) {
        if (fieldPerm.name.endsWith('.view')) next.add(fieldPerm.name)
      }
    } else if (action === 'editAll') {
      for (const fieldPerm of fieldPerms) {
        next.add(fieldPerm.name)
      }
    } else if (action === 'hideSalaries') {
      for (const name of [...next]) {
        if (SALARY_FIELD_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          next.delete(name)
        }
      }
    } else if (action === 'hidePersonalFiscal') {
      for (const name of [...next]) {
        if (PERSONAL_FISCAL_FIELD_PREFIXES.some((prefix) => name.startsWith(prefix))) {
          next.delete(name)
        }
      }
    }
    commitSelection(next)
  }

  const applyPreset = (preset: PresetKey) => {
    const next = new Set<string>()
    const bucketMap = new Map(moduleBuckets.map((b) => [b.group, b]))

    if (preset === 'fullAccess') {
      for (const perm of permissions) next.add(perm.name)
    } else if (preset === 'readOnly') {
      for (const bucket of moduleBuckets) {
        if (bucket.group === 'system') continue
        for (const name of bucket.viewNames) next.add(name)
      }
    } else if (preset === 'hrOps') {
      const manageGroups = [
        'employee', 'department', 'position', 'branch', 'contract',
        'attendance', 'leave', 'document', 'recruitment',
        'performance', 'training', 'benefit', 'deduction',
      ]
      const viewGroups = ['report', 'payslip', 'setting', 'audit']
      for (const g of manageGroups) {
        for (const name of bucketMap.get(g)?.manageNames ?? []) next.add(name)
      }
      for (const g of viewGroups) {
        for (const name of bucketMap.get(g)?.viewNames ?? []) next.add(name)
      }
    } else if (preset === 'payroll') {
      const fullGroups = ['payroll', 'payslip', 'salary-component', 'benefit', 'deduction']
      const viewGroups = ['employee', 'contract', 'attendance', 'leave', 'report', 'audit']
      for (const g of fullGroups) {
        for (const name of bucketMap.get(g)?.fullNames ?? []) next.add(name)
      }
      for (const g of viewGroups) {
        for (const name of bucketMap.get(g)?.viewNames ?? []) next.add(name)
      }
    } else if (preset === 'teamManager') {
      for (const g of ['attendance', 'leave']) {
        const bucket = bucketMap.get(g)
        if (!bucket) continue
        for (const p of bucket.relevantActions) {
          const action = getActionFromPermission(p.name)
          if (action === null || MANAGE_ACTIONS.has(action)) next.add(p.name)
        }
      }
      for (const g of ['employee', 'contract', 'document', 'report']) {
        const bucket = bucketMap.get(g)
        if (!bucket) continue
        for (const p of bucket.relevantActions) {
          const action = getActionFromPermission(p.name)
          if (action !== null && VIEW_ACTIONS.has(action)) next.add(p.name)
        }
      }
      for (const fieldPerm of fieldPerms) {
        if (MANAGER_SAFE_FIELD_PERMISSIONS.has(fieldPerm.name)) {
          next.add(fieldPerm.name)
        }
      }
    }

    commitSelection(next)
  }

  const getModuleLevel = (bucket: ModuleBucket): ModuleAccessLevel => {
    const selectedInModule = bucket.allNames.filter((n) => selectedSet.has(n))
    if (selectedInModule.length === 0) return 'none'
    if (bucket.fullNames.length > 0 && bucket.fullNames.every((n) => selectedSet.has(n))) {
      return 'full'
    }
    if (bucket.manageNames.length > 0 && setsEqual(selectedInModule, bucket.manageNames)) {
      return 'manage'
    }
    if (bucket.viewNames.length > 0 && setsEqual(selectedInModule, bucket.viewNames)) {
      return 'view'
    }
    return 'custom'
  }

  const setModuleLevel = (bucket: ModuleBucket, level: Exclude<ModuleAccessLevel, 'custom'>) => {
    const next = new Set(selectedSet)
    for (const name of bucket.allNames) {
      if (!lockedSet.has(name)) next.delete(name)
    }
    const toAdd =
      level === 'none'
        ? []
        : level === 'view'
          ? bucket.viewNames
          : level === 'manage'
            ? bucket.manageNames
            : bucket.fullNames
    for (const name of toAdd) next.add(name)
    commitSelection(next)
  }

  const toggleSingle = (name: string, checked: boolean) => {
    if (lockedSet.has(name)) return
    const next = new Set(selectedSet)
    if (checked) next.add(name)
    else next.delete(name)
    commitSelection(next)
  }

  const toggleFieldPair = (row: PairedFieldRow, mode: 'view' | 'edit', checked: boolean) => {
    const next = new Set(selectedSet)
    if (mode === 'view') {
      if (row.viewPerm) {
        if (checked) next.add(row.viewPerm.name)
        else {
          next.delete(row.viewPerm.name)
          if (row.editPerm) next.delete(row.editPerm.name)
        }
      }
    } else if (row.editPerm) {
      if (checked) {
        next.add(row.editPerm.name)
        if (row.viewPerm) next.add(row.viewPerm.name)
      } else {
        next.delete(row.editPerm.name)
      }
    }
    commitSelection(next)
  }

  const normalizedQuery = search.trim().toLocaleLowerCase()

  const filteredModules = useMemo(() => {
    return moduleBuckets
      .map((bucket) => {
        const groupLabel = t(`superAdminPage.permissionGroups.${bucket.group}`, {
          defaultValue: t('superAdminPage.otherPermissions'),
        })
        if (!normalizedQuery) {
          return {
            bucket,
            groupLabel,
            relevantMatches: bucket.relevantActions,
            technicalMatches: bucket.technicalActions,
            groupMatched: false,
          }
        }

        const groupMatched = `${groupLabel} ${bucket.group}`.toLocaleLowerCase().includes(normalizedQuery)
        if (groupMatched) {
          return {
            bucket,
            groupLabel,
            relevantMatches: bucket.relevantActions,
            technicalMatches: bucket.technicalActions,
            groupMatched: true,
          }
        }

        const matchesPerm = (p: PermissionItem) =>
          `${getPermissionDisplayLabel(t, p.name)} ${p.name}`.toLocaleLowerCase().includes(normalizedQuery)

        const relevantMatches = bucket.relevantActions.filter(matchesPerm)
        const technicalMatches = bucket.technicalActions.filter(matchesPerm)
        const fieldMatched = bucket.fields.some(matchesPerm)

        if (relevantMatches.length === 0 && technicalMatches.length === 0 && !fieldMatched) {
          return null
        }

        return {
          bucket,
          groupLabel,
          relevantMatches,
          technicalMatches,
          groupMatched: false,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [moduleBuckets, normalizedQuery, t])

  const groupedFieldRows = useMemo(() => {
    const groups: Array<{ group: string; groupLabel: string; rows: PairedFieldRow[] }> = []
    for (const bucket of moduleBuckets) {
      if (bucket.fields.length === 0) continue
      const groupLabel = t(`superAdminPage.permissionGroups.${bucket.group}`, {
        defaultValue: t('superAdminPage.otherPermissions'),
      })
      const pairMap = new Map<string, PairedFieldRow>()
      for (const perm of bucket.fields) {
        const [, resource, field, mode] = perm.name.split('.')
        if (!resource || !field || !mode) continue
        const key = `${resource}.${field}`
        let row = pairMap.get(key)
        if (!row) {
          row = { key, resource, field }
          pairMap.set(key, row)
        }
        if (mode === 'view') row.viewPerm = perm
        else if (mode === 'edit') row.editPerm = perm
      }

      const groupMatched = normalizedQuery
        ? `${groupLabel} ${bucket.group}`.toLocaleLowerCase().includes(normalizedQuery)
        : true

      const rows = [...pairMap.values()].filter((row) => {
        if (!normalizedQuery || groupMatched) return true
        const fieldLabel = getFieldDisplayLabel(t, row.resource, row.field)
        return `${fieldLabel} ${row.resource}.${row.field}`.toLocaleLowerCase().includes(normalizedQuery)
      })

      if (rows.length > 0) {
        groups.push({ group: bucket.group, groupLabel, rows })
      }
    }
    return groups
  }, [moduleBuckets, normalizedQuery, t])

  const presetItems: Array<{ key: PresetKey; label: string }> = [
    { key: 'readOnly', label: t('superAdminPage.presetReadOnly', { defaultValue: 'Só Leitura' }) },
    { key: 'hrOps', label: t('superAdminPage.presetHrOps', { defaultValue: 'RH Operacional' }) },
    { key: 'payroll', label: t('superAdminPage.presetPayroll', { defaultValue: 'Folha & Financeiro' }) },
    { key: 'teamManager', label: t('superAdminPage.presetTeamManager', { defaultValue: 'Gestor de Equipa' }) },
    { key: 'fullAccess', label: t('superAdminPage.presetFullAccess', { defaultValue: 'Acesso Total' }) },
  ]

  const levelButtons: Array<{ level: Exclude<ModuleAccessLevel, 'custom'>; label: string }> = [
    { level: 'none', label: t('superAdminPage.levelNone', { defaultValue: 'Sem acesso' }) },
    { level: 'view', label: t('superAdminPage.levelView', { defaultValue: 'Ver' }) },
    { level: 'manage', label: t('superAdminPage.levelManage', { defaultValue: 'Gerir' }) },
    { level: 'full', label: t('superAdminPage.levelFull', { defaultValue: 'Total' }) },
  ]

  return (
    <div className="space-y-2.5">
      {/* Barra de Perfis Rápidos */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" />
          {t('superAdminPage.presetsLabel', { defaultValue: 'Perfis rápidos:' })}
        </span>
        {presetItems.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={permissions.length === 0}
            onClick={() => applyPreset(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs text-muted-foreground"
          disabled={selectedPermissions.length <= lockedSet.size}
          onClick={clearAllPermissions}
        >
          {t('superAdminPage.clearPermissions', { defaultValue: 'Limpar' })}
        </Button>
      </div>

      {/* Pesquisa + Contagem */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('superAdminPage.searchPermissions', { defaultValue: 'Filtrar módulos, permissões ou campos...' })}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-[11px] text-muted-foreground">
          {t('superAdminPage.permissionsSummaryCount', {
            actions: selectedActionCount,
            totalActions: actionPerms.length,
            fields: selectedFieldCount,
            totalFields: fieldPerms.length,
            defaultValue: `${selectedActionCount}/${actionPerms.length} ações · ${selectedFieldCount}/${fieldPerms.length} campos`,
          })}
        </span>
      </div>

      {/* Abas: Módulos vs Dados Sensíveis */}
      {fieldPerms.length > 0 && (
        <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveView('modules')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors',
              activeView === 'modules'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('superAdminPage.modulesTab', { defaultValue: 'Módulos' })}
            <span className="text-[11px] text-muted-foreground">({selectedActionCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('fields')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors',
              activeView === 'fields'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            {t('superAdminPage.sensitiveFieldsTab', { defaultValue: 'Dados Sensíveis / Colunas' })}
            <span className="text-[11px] text-muted-foreground">
              ({selectedFieldCount}/{fieldPerms.length})
            </span>
          </button>
        </div>
      )}

      {selectedActionCount > 0 && selectedFieldCount === 0 && fieldPerms.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>
            {t('superAdminPage.noFieldPermissionsWarning', {
              defaultValue: 'Nenhuma permissão por campo/coluna selecionada: salários, NIF/INSS, contactos e colunas da folha ficarão ocultos.',
            })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-amber-500/40 bg-background text-xs"
            onClick={enableAllFieldPermissions}
          >
            {t('superAdminPage.enableAllFieldPermissions', { defaultValue: 'Ativar todas as colunas/campos' })}
          </Button>
        </div>
      )}

      {activeView === 'modules' || fieldPerms.length === 0 ? (
        <div className={`${maxHeightClass} space-y-2 overflow-y-auto rounded-md border p-2.5`}>
          {filteredModules.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
          ) : (
            filteredModules.map(({ bucket, groupLabel, relevantMatches, technicalMatches }) => {
              const level = getModuleLevel(bucket)
              const hasSelectedTechnical = bucket.technicalActions.some((p) => selectedSet.has(p.name))
              const isTechnicalShown = Boolean(showTechnicalGroups[bucket.group]) || hasSelectedTechnical || (Boolean(normalizedQuery) && technicalMatches.length > 0)
              const isExpanded = Boolean(expandedGroups[bucket.group]) || (Boolean(normalizedQuery) && (relevantMatches.length > 0 || technicalMatches.length > 0))

              const visibleBaseCount = bucket.relevantActions.length + bucket.fields.length
              const selectedVisibleBaseCount =
                bucket.relevantActions.filter((p) => selectedSet.has(p.name)).length +
                bucket.fields.filter((p) => selectedSet.has(p.name)).length
              const selectedAllCount = bucket.allNames.filter((n) => selectedSet.has(n)).length

              const totalToShow = isTechnicalShown ? bucket.allNames.length : visibleBaseCount
              const selectedToShow = isTechnicalShown ? selectedAllCount : selectedVisibleBaseCount

              return (
                <div key={bucket.group} className="rounded-md border border-border/70 px-3 py-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">{groupLabel}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        ({selectedToShow}/{totalToShow})
                      </span>
                      {level === 'custom' && (
                        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                          {t('superAdminPage.levelCustom', { defaultValue: 'Personalizado' })}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5">
                        {levelButtons.map((btn) => {
                          const active = level === btn.level
                          return (
                            <button
                              key={btn.level}
                              type="button"
                              onClick={() => setModuleLevel(bucket, btn.level)}
                              className={cn(
                                'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                                active
                                  ? btn.level === 'none'
                                    ? 'bg-background text-foreground shadow-xs'
                                    : 'bg-primary text-primary-foreground shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {btn.label}
                            </button>
                          )
                        })}
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [bucket.group]: !isExpanded,
                          }))
                        }
                      >
                        {t('superAdminPage.advancedToggle', { defaultValue: 'Avançado' })}
                        <ChevronDown
                          className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
                        />
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 space-y-2 border-t border-border/50 pt-2.5">
                      {relevantMatches.length > 0 && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {relevantMatches.map((permission) => {
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
                      )}

                      {bucket.technicalActions.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {!hasSelectedTechnical && (
                            <button
                              type="button"
                              className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              onClick={() =>
                                setShowTechnicalGroups((prev) => ({
                                  ...prev,
                                  [bucket.group]: !prev[bucket.group],
                                }))
                              }
                            >
                              {t('superAdminPage.showTechnicalActions', {
                                count: bucket.technicalActions.length,
                                defaultValue: `Mostrar técnicas (+${bucket.technicalActions.length})`,
                              })}
                            </button>
                          )}

                          {isTechnicalShown && technicalMatches.length > 0 && (
                            <div className="grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-2">
                              {technicalMatches.map((permission) => {
                                const checked = selectedSet.has(permission.name)
                                const locked = lockedSet.has(permission.name)
                                return (
                                  <label key={permission.name} className="flex items-start gap-2 text-xs text-muted-foreground">
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
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => applyFieldPrivacyAction('viewAll')}
            >
              {t('superAdminPage.fieldsViewAll', { defaultValue: 'Ver todos os dados' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => applyFieldPrivacyAction('editAll')}
            >
              {t('superAdminPage.fieldsEditAll', { defaultValue: 'Editar todos os dados' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => applyFieldPrivacyAction('hideSalaries')}
            >
              {t('superAdminPage.fieldsHideSalaries', { defaultValue: 'Ocultar salários' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => applyFieldPrivacyAction('hidePersonalFiscal')}
            >
              {t('superAdminPage.fieldsHidePersonalFiscal', { defaultValue: 'Ocultar dados pessoais/fiscais' })}
            </Button>
          </div>

          <div className={`${maxHeightClass} space-y-2.5 overflow-y-auto rounded-md border p-2.5`}>
            {groupedFieldRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
            ) : (
              groupedFieldRows.map(({ group, groupLabel, rows }) => (
                <div key={group} className="rounded-md border border-border/70 px-3 py-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {groupLabel}
                  </p>
                  <div className="divide-y divide-border/50">
                    {rows.map((row) => {
                      const viewChecked = row.viewPerm ? selectedSet.has(row.viewPerm.name) : false
                      const editChecked = row.editPerm ? selectedSet.has(row.editPerm.name) : false
                      return (
                        <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
                          <span className="font-medium text-foreground">
                            {getFieldDisplayLabel(t, row.resource, row.field)}
                          </span>
                          <div className="flex items-center gap-4">
                            {row.viewPerm && (
                              <label className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                                <input
                                  type="checkbox"
                                  checked={viewChecked}
                                  onChange={(e) => toggleFieldPair(row, 'view', e.target.checked)}
                                />
                                <span>{t('superAdminPage.fieldModes.view', { defaultValue: 'Ver' })}</span>
                              </label>
                            )}
                            {row.editPerm && (
                              <label className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                                <input
                                  type="checkbox"
                                  checked={editChecked}
                                  onChange={(e) => toggleFieldPair(row, 'edit', e.target.checked)}
                                />
                                <span>{t('superAdminPage.fieldModes.edit', { defaultValue: 'Editar' })}</span>
                              </label>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
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
  const serialize = (perms: string[] | null) => (perms === null ? '__INHERIT__' : [...perms].sort().join('\0'))
  const first = accesses[0]
  const firstPerms = serialize(first.permissions)
  return accesses.every(
    (item) =>
      (item.permission_group_id ?? null) === (first.permission_group_id ?? null)
      && item.role_name === first.role_name
      && serialize(item.permissions) === firstPerms,
  )
}

function areAccessesInheritingGlobal(accesses: TenantAccessDraft[]): boolean {
  return accesses.length === 0 || accesses.every(
    (item) => (item.permission_group_id ?? null) === null && (item.permissions === null || item.permissions.length === 0),
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
  const [inheritGlobal, setInheritGlobal] = useState<boolean>(() => areAccessesInheritingGlobal(accesses))
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
    permissions: string[] | null
  }>(() => ({
    permission_group_id: accesses[0]?.permission_group_id ?? null,
    role_name: accesses[0]?.role_name || defaultRole,
    permissions: accesses[0]?.permissions != null
      ? filterAssignablePermissions(accesses[0].permissions)
      : null,
  }))

  useEffect(() => {
    if (!haveSameSharedAccessConfig(accesses)) {
      setShareConfig(false)
    }
    if (accesses.some((item) => (item.permission_group_id ?? null) !== null || (item.permissions !== null && item.permissions.length > 0))) {
      setInheritGlobal(false)
    }
  }, [accesses])

  const currentShared = useMemo(() => {
    if (inheritGlobal) {
      return {
        permission_group_id: null,
        role_name: accesses[0]?.role_name || draftSharedConfig.role_name || defaultRole,
        permissions: null as string[] | null,
      }
    }
    if (accesses.length > 0) {
      const firstPerms = accesses[0].permissions
      return {
        permission_group_id: accesses[0].permission_group_id ?? null,
        role_name: accesses[0].role_name || defaultRole,
        permissions: firstPerms === null ? sanitizedBasePermissions : filterAssignablePermissions(firstPerms),
      }
    }
    if (sharedEdited) {
      return {
        ...draftSharedConfig,
        permissions: draftSharedConfig.permissions === null
          ? sanitizedBasePermissions
          : filterAssignablePermissions(draftSharedConfig.permissions),
      }
    }
    return {
      permission_group_id: null,
      role_name: defaultRole,
      permissions: sanitizedBasePermissions,
    }
  }, [accesses, defaultRole, draftSharedConfig, filterAssignablePermissions, inheritGlobal, sanitizedBasePermissions, sharedEdited])

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
          permission_group_id: inheritGlobal ? null : currentShared.permission_group_id,
          role_name: currentShared.role_name,
          permissions: inheritGlobal ? null : [...(currentShared.permissions ?? sanitizedBasePermissions)],
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
          permission_group_id: inheritGlobal ? null : currentShared.permission_group_id,
          role_name: currentShared.role_name,
          permissions: inheritGlobal ? null : [...(currentShared.permissions ?? sanitizedBasePermissions)],
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

  const handleToggleInheritGlobal = (enabled: boolean) => {
    setInheritGlobal(enabled)
    const nextRole = accesses[0]?.role_name || draftSharedConfig.role_name || defaultRole
    if (enabled) {
      setShareConfig(true)
      setDraftSharedConfig({
        permission_group_id: null,
        role_name: nextRole,
        permissions: null,
      })
      if (accesses.length > 0) {
        onChange(
          accesses.map((item) => ({
            ...item,
            permission_group_id: null,
            role_name: nextRole,
            permissions: null,
          })),
        )
      }
    } else {
      const nextPerms = [...sanitizedBasePermissions]
      setSharedEdited(true)
      setDraftSharedConfig({
        permission_group_id: null,
        role_name: nextRole,
        permissions: nextPerms,
      })
      if (accesses.length > 0) {
        onChange(
          accesses.map((item) => ({
            ...item,
            permission_group_id: null,
            role_name: item.role_name || nextRole,
            permissions: item.permissions === null || item.permissions.length === 0
              ? [...nextPerms]
              : filterAssignablePermissions(item.permissions),
          })),
        )
      }
    }
  }

  const updateSharedConfig = (patch: Partial<{ permission_group_id: number | null; role_name: string; permissions: string[] | null }>) => {
    const resolvedPermissions = patch.permissions !== undefined
      ? (patch.permissions === null ? null : filterAssignablePermissions(patch.permissions))
      : currentShared.permissions
    const nextConfig = {
      permission_group_id: patch.permission_group_id !== undefined ? patch.permission_group_id : currentShared.permission_group_id,
      role_name: patch.role_name !== undefined ? patch.role_name : currentShared.role_name,
      permissions: resolvedPermissions,
    }
    setSharedEdited(true)
    setDraftSharedConfig(nextConfig)
    if (accesses.length > 0) {
      onChange(
        accesses.map((item) => ({
          ...item,
          permission_group_id: nextConfig.permission_group_id,
          role_name: nextConfig.role_name,
          permissions: nextConfig.permissions === null ? null : [...nextConfig.permissions],
        })),
      )
    }
  }

  const handleToggleShareConfig = (enabled: boolean) => {
    setShareConfig(enabled)
    if (enabled && accesses.length > 0) {
      const firstPerms = accesses[0].permissions
      const template = {
        permission_group_id: accesses[0].permission_group_id ?? null,
        role_name: accesses[0].role_name || defaultRole,
        permissions: firstPerms === null ? [...sanitizedBasePermissions] : filterAssignablePermissions(firstPerms),
      }
      setSharedEdited(true)
      setDraftSharedConfig(template)
      onChange(
        accesses.map((item) => ({
          ...item,
          permission_group_id: template.permission_group_id,
          role_name: template.role_name,
          permissions: template.permissions === null ? null : [...template.permissions],
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
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0"
              checked={inheritGlobal}
              onChange={(e) => handleToggleInheritGlobal(e.target.checked)}
            />
            <span>
              {t('superAdminPage.inheritGlobalPermissions', {
                defaultValue: 'Usar automaticamente as mesmas permissões globais definidas acima (sincronizado)',
              })}
            </span>
          </label>

          {!inheritGlobal && (
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
        </div>
      )}

      {inheritGlobal ? (
        <div className="space-y-3">
          {accesses.length > 0 && (
            <div className="space-y-3 rounded-md border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {t('superAdminPage.inheritGlobalHint', {
                    count: sanitizedBasePermissions.length,
                    defaultValue: `Todas as empresas selecionadas herdarão as ${sanitizedBasePermissions.length} permissões de empresa configuradas acima.`,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t('superAdminPage.roleLabel', { defaultValue: 'Papel' })}</Label>
                  <select
                    className="h-8 rounded-md border border-input bg-transparent px-2.5 text-xs"
                    value={currentShared.role_name}
                    onChange={(e) => {
                      const nextRole = e.target.value
                      onChange(accesses.map((item) => ({ ...item, role_name: nextRole })))
                    }}
                  >
                    <option value="admin">{t('superAdminPage.roles.admin')}</option>
                    <option value="hr-manager">{t('superAdminPage.roles.hr-manager')}</option>
                    <option value="manager">{t('superAdminPage.roles.manager')}</option>
                    <option value="employee">{t('superAdminPage.roles.employee')}</option>
                  </select>
                </div>
              </div>
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
      ) : accesses.length === 0 && !shareConfig ? (
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
                      permissions: group ? filterAssignablePermissions(group.permissions) : (currentShared.permissions ?? sanitizedBasePermissions),
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
                  {(currentShared.permissions ?? sanitizedBasePermissions).length}
                </Badge>
              </summary>
              <div className="mt-2">
                <PermissionSelector
                  permissions={allPermissions}
                  selectedPermissions={currentShared.permissions ?? sanitizedBasePermissions}
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
            const accessPermissions = access.permissions === null
              ? sanitizedBasePermissions
              : filterAssignablePermissions(access.permissions)

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

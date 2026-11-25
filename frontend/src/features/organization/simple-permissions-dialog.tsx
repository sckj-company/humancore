import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Eye,
  KeyRound,
  Layers,
  Lock,
  Mail,
  Search,
  Shield,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getPermissionDisplayLabel } from '@/features/admin/permissions-editor'
import type {
  Department,
  DepartmentEmployeeItem,
  ExternalTeamMember,
  PermissionCatalogItem,
  PermissionGroupSummary,
  Position,
  PositionEmployeeItem,
} from './api'

type PermissionEmployeeItem = DepartmentEmployeeItem | PositionEmployeeItem

type ModuleAccessLevel = 'none' | 'view' | 'manage' | 'full' | 'custom'
type SimplePresetKey = 'employee' | 'teamManager' | 'hrOps' | 'payroll' | 'fullAccess'

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

const SENSITIVE_FIELD_PREFIXES = [
  'field.employee.salary.',
  'field.employee.fiscal_ids.',
  'field.contract.base_salary.',
  'field.contract.compensation_terms.',
  'field.payroll.base_salary.',
  'field.payroll.gross_salary.',
  'field.payroll.allowances.',
  'field.payroll.inss.',
  'field.payroll.irt.',
  'field.payroll.deductions.',
  'field.payroll.net_salary.',
  'field.payroll.employer_cost.',
  'field.attendance.salary_deduction.',
  'field.benefit.amounts.',
  'field.deduction.amounts.',
  'field.payslip.salary_details.',
  'field.report.salary_costs.',
]

const NON_SENSITIVE_FIELD_DEFAULTS = new Set([
  'field.employee.personal_identity.view',
  'field.employee.contact_address.view',
  'field.employee.organization.view',
  'field.contract.dates_notes.view',
  'field.attendance.clock_times.view',
  'field.attendance.overtime_lateness.view',
  'field.payroll.attendance_metrics.view',
  'field.leave.balances.view',
  'field.leave.documents.view',
])

const HIDDEN_SIMPLE_GROUPS = new Set(['tenant', 'system'])

function getActionFromPermission(name: string): string | null {
  return STANDARD_ACTIONS.find((candidate) => name.startsWith(`${candidate}_`)) ?? null
}

function isSensitiveField(name: string): boolean {
  return SENSITIVE_FIELD_PREFIXES.some((prefix) => name.startsWith(prefix))
}

interface ModuleBucket {
  group: string
  relevantActions: PermissionCatalogItem[]
  viewActions: string[]
  manageActions: string[]
  fullActions: string[]
  nonSensitiveViewFields: string[]
  nonSensitiveEditFields: string[]
  sensitiveViewFields: string[]
  sensitiveEditFields: string[]
  allActionNames: string[]
  allFieldNames: string[]
}

export interface SimplePermissionsSavePayload {
  permissions: string[] | null
  permission_group_id: number | null
  role_name: string | null
  clear_individual?: boolean
  apply_to_existing_overrides?: boolean
  scope_to_department?: boolean
  department_ids?: number[] | null
  auto_create_accounts?: boolean
  default_password?: string | null
  employee_emails?: Record<number, string>
}

interface SensitiveFieldPair {
  key: string
  resource: string
  field: string
  viewPerm?: PermissionCatalogItem
  editPerm?: PermissionCatalogItem
}

function resolveModuleLevel(bucket: ModuleBucket, selectedSet: Set<string>): ModuleAccessLevel {
  const selectedActions = bucket.allActionNames.filter((n) => selectedSet.has(n))
  if (selectedActions.length === 0) return 'none'

  const hasAllFull = bucket.fullActions.length > 0 && bucket.fullActions.every((n) => selectedSet.has(n))
  if (hasAllFull) return 'full'

  const hasAllManage =
    bucket.manageActions.length > 0 &&
    bucket.manageActions.every((n) => selectedSet.has(n)) &&
    selectedActions.every((n) => bucket.manageActions.includes(n))
  if (hasAllManage) return 'manage'

  const hasAllView =
    bucket.viewActions.length > 0 &&
    bucket.viewActions.every((n) => selectedSet.has(n)) &&
    selectedActions.every((n) => bucket.viewActions.includes(n))
  if (hasAllView) return 'view'

  return 'custom'
}

function getInitialDialogState(
  mode: 'department' | 'position' | 'employees' | 'external',
  department: Department | null | undefined,
  position: Position | null | undefined,
  selectedEmployees: PermissionEmployeeItem[],
  externalMembers: ExternalTeamMember[],
  permissionGroups: PermissionGroupSummary[],
) {
  if (mode === 'external') {
    const singleExt = externalMembers.length === 1 ? externalMembers[0] : null
    if (singleExt) {
      const initialPerms = singleExt.effective_permissions ?? []
      return {
        selectedPermissions: [...initialPerms],
        selectedGroupId: singleExt.permission_group_id ?? null,
        roleName: singleExt.role_name ?? 'hr-manager',
        allowSensitiveData: initialPerms.some(isSensitiveField),
        scopeToDepartment: false,
        selectedDeptScopeIds: [...(singleExt.department_scope_ids ?? [])],
      }
    }
    const baseExt = externalMembers[0]?.effective_permissions ?? []
    return {
      selectedPermissions: [...baseExt],
      selectedGroupId: null,
      roleName: 'hr-manager',
      allowSensitiveData: baseExt.some(isSensitiveField),
      scopeToDepartment: false,
      selectedDeptScopeIds: [] as number[],
    }
  }

  if (mode === 'department' && department) {
    const group = permissionGroups.find((g) => g.id === department.permission_group_id)
    const initialPerms =
      department.default_permissions && department.default_permissions.length > 0
        ? department.default_permissions
        : group?.permissions ?? []

    return {
      selectedPermissions: [...initialPerms],
      selectedGroupId: department.permission_group_id ?? null,
      roleName: department.default_role_name ?? null,
      allowSensitiveData: initialPerms.some(isSensitiveField),
      scopeToDepartment: false,
      selectedDeptScopeIds: [] as number[],
    }
  }

  if (mode === 'position' && position) {
    const group = permissionGroups.find((g) => g.id === position.permission_group_id)
    const initialPerms =
      position.default_permissions && position.default_permissions.length > 0
        ? position.default_permissions
        : group?.permissions ?? []

    return {
      selectedPermissions: [...initialPerms],
      selectedGroupId: position.permission_group_id ?? null,
      roleName: position.default_role_name ?? null,
      allowSensitiveData: initialPerms.some(isSensitiveField),
      scopeToDepartment: false,
      selectedDeptScopeIds: [] as number[],
    }
  }

  const single = selectedEmployees.length === 1 ? selectedEmployees[0] : null
  const targetDeptId = department?.id ?? position?.department_id ?? -1
  const hasTargetDept = Boolean(department?.id || position?.department_id)
  if (single && single.has_user_account) {
    const initialPerms = single.effective_permissions ?? []
    return {
      selectedPermissions: [...initialPerms],
      selectedGroupId: single.permission_group_id ?? null,
      roleName: single.role_name ?? null,
      allowSensitiveData: initialPerms.some(isSensitiveField),
      scopeToDepartment:
        single.department_scope_ids.length > 0
          ? single.department_scope_ids.includes(targetDeptId)
          : hasTargetDept,
      selectedDeptScopeIds: [] as number[],
    }
  }

  const targetRule = department ?? position
  const inheritedPerms = targetRule?.default_permissions ?? []
  return {
    selectedPermissions: [...inheritedPerms],
    selectedGroupId: targetRule?.permission_group_id ?? null,
    roleName: targetRule?.default_role_name ?? 'employee',
    allowSensitiveData: inheritedPerms.some(isSensitiveField),
    scopeToDepartment: hasTargetDept,
    selectedDeptScopeIds: [] as number[],
  }
}

export function SimplePermissionsDialog({
  open,
  onOpenChange,
  mode,
  department,
  position,
  selectedEmployees,
  externalMembers = [],
  availableDepartments = [],
  catalogPermissions,
  permissionGroups,
  isSaving,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'department' | 'position' | 'employees' | 'external'
  department?: Department | null
  position?: Position | null
  selectedEmployees: PermissionEmployeeItem[]
  externalMembers?: ExternalTeamMember[]
  availableDepartments?: Array<{ id: number; name: string; code?: string | null }>
  catalogPermissions: PermissionCatalogItem[]
  permissionGroups: PermissionGroupSummary[]
  isSaving: boolean
  onSave: (payload: SimplePermissionsSavePayload) => Promise<void> | void
}) {
  const instanceKey = `${mode}-${department?.id ?? 'none'}-${position?.id ?? 'none'}-${selectedEmployees.map((e) => e.id).join(',')}-${externalMembers.map((m) => m.id).join(',')}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <SimplePermissionsDialogBody
          key={instanceKey}
          onOpenChange={onOpenChange}
          mode={mode}
          department={department}
          position={position}
          selectedEmployees={selectedEmployees}
          externalMembers={externalMembers}
          availableDepartments={availableDepartments}
          catalogPermissions={catalogPermissions}
          permissionGroups={permissionGroups}
          isSaving={isSaving}
          onSave={onSave}
        />
      )}
    </Dialog>
  )
}

function SimplePermissionsDialogBody({
  onOpenChange,
  mode,
  department,
  position,
  selectedEmployees,
  externalMembers,
  availableDepartments,
  catalogPermissions,
  permissionGroups,
  isSaving,
  onSave,
}: {
  onOpenChange: (open: boolean) => void
  mode: 'department' | 'position' | 'employees' | 'external'
  department?: Department | null
  position?: Position | null
  selectedEmployees: PermissionEmployeeItem[]
  externalMembers: ExternalTeamMember[]
  availableDepartments: Array<{ id: number; name: string; code?: string | null }>
  catalogPermissions: PermissionCatalogItem[]
  permissionGroups: PermissionGroupSummary[]
  isSaving: boolean
  onSave: (payload: SimplePermissionsSavePayload) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [initialState] = useState(() =>
    getInitialDialogState(
      mode,
      department,
      position,
      selectedEmployees,
      externalMembers,
      permissionGroups,
    ),
  )
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(initialState.selectedPermissions)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(initialState.selectedGroupId)
  const [roleName, setRoleName] = useState<string | null>(initialState.roleName)
  const [allowSensitiveData, setAllowSensitiveData] = useState(initialState.allowSensitiveData)
  const [search, setSearch] = useState('')
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  // Contextual options
  const [applyToExistingOverrides, setApplyToExistingOverrides] = useState(false)
  const [scopeToDepartment, setScopeToDepartment] = useState(initialState.scopeToDepartment)
  const [selectedDeptScopeIds, setSelectedDeptScopeIds] = useState<number[]>(
    initialState.selectedDeptScopeIds,
  )
  const [autoCreateAccounts, setAutoCreateAccounts] = useState(false)
  const [defaultPassword, setDefaultPassword] = useState('')
  const [employeeEmails, setEmployeeEmails] = useState<Record<number, string>>({})

  const moduleBuckets = useMemo<ModuleBucket[]>(() => {
    const byGroup = new Map<string, { actions: PermissionCatalogItem[]; fields: PermissionCatalogItem[] }>()

    for (const perm of catalogPermissions) {
      const group = perm.group_name ?? 'other'
      if (HIDDEN_SIMPLE_GROUPS.has(group)) continue
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
      const relevantActions = actions.filter((p) => {
        const action = getActionFromPermission(p.name)
        return !relevantSet || action === null || relevantSet.has(action)
      })

      const viewActions = relevantActions
        .filter((p) => {
          const action = getActionFromPermission(p.name)
          return action !== null && VIEW_ACTIONS.has(action)
        })
        .map((p) => p.name)

      const manageActions = relevantActions
        .filter((p) => {
          const action = getActionFromPermission(p.name)
          return action === null || MANAGE_ACTIONS.has(action)
        })
        .map((p) => p.name)

      const fullActions = relevantActions.map((p) => p.name)

      const nonSensitiveViewFields = fields
        .filter((p) => !isSensitiveField(p.name) && p.name.endsWith('.view'))
        .map((p) => p.name)
      const nonSensitiveEditFields = fields
        .filter((p) => !isSensitiveField(p.name) && p.name.endsWith('.edit'))
        .map((p) => p.name)
      const sensitiveViewFields = fields
        .filter((p) => isSensitiveField(p.name) && p.name.endsWith('.view'))
        .map((p) => p.name)
      const sensitiveEditFields = fields
        .filter((p) => isSensitiveField(p.name) && p.name.endsWith('.edit'))
        .map((p) => p.name)

      buckets.push({
        group,
        relevantActions,
        viewActions,
        manageActions,
        fullActions,
        nonSensitiveViewFields,
        nonSensitiveEditFields,
        sensitiveViewFields,
        sensitiveEditFields,
        allActionNames: actions.map((p) => p.name),
        allFieldNames: fields.map((p) => p.name),
      })
    }

    return buckets
  }, [catalogPermissions])

  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions])

  const getModuleLevel = (bucket: ModuleBucket): ModuleAccessLevel =>
    resolveModuleLevel(bucket, selectedSet)

  const applyModuleLevel = (
    bucket: ModuleBucket,
    level: Exclude<ModuleAccessLevel, 'custom'>,
    sensitiveEnabled = allowSensitiveData,
  ) => {
    setSelectedGroupId(null)
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      for (const n of bucket.allActionNames) next.delete(n)
      for (const n of bucket.allFieldNames) next.delete(n)

      if (level === 'view') {
        for (const n of bucket.viewActions) next.add(n)
        for (const n of bucket.nonSensitiveViewFields) next.add(n)
        if (sensitiveEnabled) {
          for (const n of bucket.sensitiveViewFields) next.add(n)
        }
      } else if (level === 'manage') {
        for (const n of bucket.manageActions) next.add(n)
        for (const n of bucket.nonSensitiveViewFields) next.add(n)
        for (const n of bucket.nonSensitiveEditFields) next.add(n)
        if (sensitiveEnabled) {
          for (const n of bucket.sensitiveViewFields) next.add(n)
          for (const n of bucket.sensitiveEditFields) next.add(n)
        }
      } else if (level === 'full') {
        for (const n of bucket.fullActions) next.add(n)
        for (const n of bucket.nonSensitiveViewFields) next.add(n)
        for (const n of bucket.nonSensitiveEditFields) next.add(n)
        if (sensitiveEnabled) {
          for (const n of bucket.sensitiveViewFields) next.add(n)
          for (const n of bucket.sensitiveEditFields) next.add(n)
        }
      }

      return [...next]
    })
  }

  const sensitiveFieldPairs = useMemo<SensitiveFieldPair[]>(() => {
    const pairMap = new Map<string, SensitiveFieldPair>()
    for (const perm of catalogPermissions) {
      if (!isSensitiveField(perm.name)) continue
      const [, resource, field, modePart] = perm.name.split('.')
      if (!resource || !field || !modePart) continue
      const key = `${resource}.${field}`
      let pair = pairMap.get(key)
      if (!pair) {
        pair = { key, resource, field }
        pairMap.set(key, pair)
      }
      if (modePart === 'view') pair.viewPerm = perm
      else if (modePart === 'edit') pair.editPerm = perm
    }
    return [...pairMap.values()]
  }, [catalogPermissions])

  const handleToggleSensitiveData = (enabled: boolean) => {
    setAllowSensitiveData(enabled)
    setSelectedGroupId(null)
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (!enabled) {
        for (const name of [...next]) {
          if (isSensitiveField(name)) next.delete(name)
        }
        return [...next]
      }

      let addedForActiveModule = false
      for (const bucket of moduleBuckets) {
        const level = getModuleLevel(bucket)
        if (level === 'none') continue
        for (const n of bucket.sensitiveViewFields) {
          next.add(n)
          addedForActiveModule = true
        }
        if (level === 'manage' || level === 'full') {
          for (const n of bucket.sensitiveEditFields) {
            next.add(n)
            addedForActiveModule = true
          }
        }
      }

      if (!addedForActiveModule) {
        for (const pair of sensitiveFieldPairs) {
          if (pair.viewPerm) next.add(pair.viewPerm.name)
        }
      }

      return [...next]
    })
  }

  const toggleSensitiveFieldPair = (
    pair: SensitiveFieldPair,
    fieldMode: 'view' | 'edit',
    checked: boolean,
  ) => {
    setSelectedGroupId(null)
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (fieldMode === 'view' && pair.viewPerm) {
        if (checked) {
          next.add(pair.viewPerm.name)
        } else {
          next.delete(pair.viewPerm.name)
          if (pair.editPerm) next.delete(pair.editPerm.name)
        }
      } else if (fieldMode === 'edit' && pair.editPerm) {
        if (checked) {
          next.add(pair.editPerm.name)
          if (pair.viewPerm) next.add(pair.viewPerm.name)
        } else {
          next.delete(pair.editPerm.name)
        }
      }
      return [...next]
    })
  }

  const applyAllSensitiveFields = (action: 'viewAll' | 'editAll' | 'clear') => {
    setSelectedGroupId(null)
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (action === 'clear') {
        for (const name of [...next]) {
          if (isSensitiveField(name)) next.delete(name)
        }
        return [...next]
      }
      for (const pair of sensitiveFieldPairs) {
        if (pair.viewPerm) next.add(pair.viewPerm.name)
        if (action === 'editAll' && pair.editPerm) next.add(pair.editPerm.name)
      }
      return [...next]
    })
  }

  const applyPreset = (preset: SimplePresetKey) => {
    setSelectedGroupId(null)
    const bucketMap = new Map(moduleBuckets.map((b) => [b.group, b]))
    const next = new Set<string>()
    let nextSensitive = allowSensitiveData

    if (preset === 'employee') {
      setRoleName('employee')
      const allowed = [
        'view_employee',
        'view_contract',
        'view_attendance',
        'create_attendance',
        'view_leave',
        'create_leave',
        'view_payslip',
        'view_document',
        'view_report',
      ]
      const validSet = new Set(catalogPermissions.map((p) => p.name))
      for (const name of allowed) {
        if (validSet.has(name)) next.add(name)
      }
      for (const name of NON_SENSITIVE_FIELD_DEFAULTS) {
        if (validSet.has(name)) next.add(name)
      }
      if (validSet.has('field.employee.salary.view') && nextSensitive) {
        next.add('field.employee.salary.view')
      }
      if (validSet.has('field.payslip.salary_details.view')) {
        next.add('field.payslip.salary_details.view')
      }
      setSelectedPermissions([...next])
      return
    }

    if (preset === 'teamManager') {
      setRoleName('manager')
      for (const g of ['attendance', 'leave']) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.manageActions) next.add(n)
        for (const n of b.nonSensitiveViewFields) next.add(n)
        for (const n of b.nonSensitiveEditFields) next.add(n)
      }
      for (const g of ['employee', 'contract', 'document', 'report']) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.viewActions) next.add(n)
        for (const n of b.nonSensitiveViewFields) next.add(n)
      }
      setSelectedPermissions([...next])
      return
    }

    if (preset === 'hrOps') {
      setRoleName('hr-manager')
      const manageGroups = [
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
      ]
      const viewGroups = ['report', 'payslip', 'setting', 'audit']
      for (const g of manageGroups) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.manageActions) next.add(n)
        for (const n of b.nonSensitiveViewFields) next.add(n)
        for (const n of b.nonSensitiveEditFields) next.add(n)
        if (nextSensitive) {
          for (const n of b.sensitiveViewFields) next.add(n)
          for (const n of b.sensitiveEditFields) next.add(n)
        }
      }
      for (const g of viewGroups) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.viewActions) next.add(n)
        for (const n of b.nonSensitiveViewFields) next.add(n)
        if (nextSensitive) {
          for (const n of b.sensitiveViewFields) next.add(n)
        }
      }
      setSelectedPermissions([...next])
      return
    }

    if (preset === 'payroll') {
      setRoleName('hr-manager')
      nextSensitive = true
      setAllowSensitiveData(true)
      const fullGroups = ['payroll', 'payslip', 'salary-component', 'benefit', 'deduction']
      const viewGroups = ['employee', 'contract', 'attendance', 'leave', 'report', 'audit']
      for (const g of fullGroups) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.fullActions) next.add(n)
        for (const n of b.allFieldNames) next.add(n)
      }
      for (const g of viewGroups) {
        const b = bucketMap.get(g)
        if (!b) continue
        for (const n of b.viewActions) next.add(n)
        for (const n of b.nonSensitiveViewFields) next.add(n)
        for (const n of b.sensitiveViewFields) next.add(n)
      }
      setSelectedPermissions([...next])
      return
    }

    if (preset === 'fullAccess') {
      setRoleName('admin')
      nextSensitive = true
      setAllowSensitiveData(true)
      for (const b of moduleBuckets) {
        for (const n of b.fullActions) next.add(n)
        for (const n of b.allFieldNames) next.add(n)
      }
      setSelectedPermissions([...next])
    }
  }

  const applyPermissionGroup = (group: PermissionGroupSummary) => {
    setSelectedGroupId(group.id)
    setSelectedPermissions([...group.permissions])
    setAllowSensitiveData(group.permissions.some(isSensitiveField))
  }

  const toggleSingleAction = (bucket: ModuleBucket, permName: string, checked: boolean) => {
    setSelectedGroupId(null)
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(permName)
        for (const n of bucket.nonSensitiveViewFields) next.add(n)
        if (allowSensitiveData) {
          for (const n of bucket.sensitiveViewFields) next.add(n)
        }
      } else {
        next.delete(permName)
      }
      return [...next]
    })
  }

  const normalizedQuery = search.trim().toLowerCase()
  const filteredBuckets = useMemo(() => {
    return moduleBuckets.filter((bucket) => {
      if (!normalizedQuery) return true
      const groupLabel = t(`superAdminPage.permissionGroups.${bucket.group}`, {
        defaultValue: bucket.group,
      }).toLowerCase()
      return groupLabel.includes(normalizedQuery) || bucket.group.toLowerCase().includes(normalizedQuery)
    })
  }, [moduleBuckets, normalizedQuery, t])

  const activeModulesCount = useMemo(
    () => moduleBuckets.filter((b) => resolveModuleLevel(b, selectedSet) !== 'none').length,
    [moduleBuckets, selectedSet],
  )

  const missingAccountsCount = useMemo(
    () => selectedEmployees.filter((e) => !e.has_user_account).length,
    [selectedEmployees],
  )

  const missingEmailEmployees = useMemo(
    () => selectedEmployees.filter((e) => !e.has_user_account && !(e.email ?? '').trim()),
    [selectedEmployees],
  )

  const selectedSensitiveCount = useMemo(
    () => selectedPermissions.filter(isSensitiveField).length,
    [selectedPermissions],
  )

  const singleEmployee = mode === 'employees' && selectedEmployees.length === 1 ? selectedEmployees[0] : null
  const canRevertToDepartment =
    Boolean(singleEmployee?.has_user_account) && singleEmployee?.permission_source === 'individual'

  const presets: Array<{ key: SimplePresetKey; label: string; desc: string }> = [
    {
      key: 'employee',
      label: t('organizationPage.permissions.presets.employee', { defaultValue: 'Colaborador' }),
      desc: t('organizationPage.permissions.presets.employeeDesc', { defaultValue: 'Auto-serviço básico' }),
    },
    {
      key: 'teamManager',
      label: t('organizationPage.permissions.presets.teamManager', { defaultValue: 'Gestor de Equipa' }),
      desc: t('organizationPage.permissions.presets.teamManagerDesc', { defaultValue: 'Aprovar férias e presenças' }),
    },
    {
      key: 'hrOps',
      label: t('organizationPage.permissions.presets.hrOps', { defaultValue: 'RH Operacional' }),
      desc: t('organizationPage.permissions.presets.hrOpsDesc', { defaultValue: 'Equipa, contratos e assiduidade' }),
    },
    {
      key: 'payroll',
      label: t('organizationPage.permissions.presets.payroll', { defaultValue: 'Folha & Financeiro' }),
      desc: t('organizationPage.permissions.presets.payrollDesc', { defaultValue: 'Processamento salarial completo' }),
    },
    {
      key: 'fullAccess',
      label: t('organizationPage.permissions.presets.fullAccess', { defaultValue: 'Administrador' }),
      desc: t('organizationPage.permissions.presets.fullAccessDesc', { defaultValue: 'Acesso total aos módulos' }),
    },
  ]

  const levelButtons: Array<{ level: Exclude<ModuleAccessLevel, 'custom'>; label: string }> = [
    { level: 'none', label: t('superAdminPage.levelNone', { defaultValue: 'Sem acesso' }) },
    { level: 'view', label: t('superAdminPage.levelView', { defaultValue: 'Ver' }) },
    { level: 'manage', label: t('superAdminPage.levelManage', { defaultValue: 'Gerir' }) },
    { level: 'full', label: t('superAdminPage.levelFull', { defaultValue: 'Total' }) },
  ]

  const isEntityRuleMode = mode === 'department' || mode === 'position'
  const singleExternal = mode === 'external' && externalMembers.length === 1 ? externalMembers[0] : null
  const canRevertExternal =
    mode === 'external' &&
    Boolean(singleExternal && singleExternal.status_in_company !== 'global_default')
  const scopeDepartmentName = department?.name ?? position?.department?.name ?? ''
  const canScopeToDepartment = scopeDepartmentName.trim() !== ''

  const toggleDeptScopeId = (deptId: number) => {
    setSelectedDeptScopeIds((prev) =>
      prev.includes(deptId) ? prev.filter((id) => id !== deptId) : [...prev, deptId],
    )
  }

  const handleSave = () => {
    const cleanedEmails: Record<number, string> = {}
    if (mode === 'employees' && autoCreateAccounts) {
      for (const emp of missingEmailEmployees) {
        const val = (employeeEmails[emp.id] ?? '').trim()
        if (val) cleanedEmails[emp.id] = val
      }
    }

    onSave({
      permissions: selectedGroupId ? null : selectedPermissions,
      permission_group_id: selectedGroupId,
      role_name: roleName,
      ...(isEntityRuleMode
        ? { apply_to_existing_overrides: applyToExistingOverrides }
        : mode === 'external'
          ? {
              department_ids:
                selectedDeptScopeIds.length > 0 ? selectedDeptScopeIds : null,
            }
          : {
              scope_to_department: canScopeToDepartment ? scopeToDepartment : false,
              auto_create_accounts: autoCreateAccounts,
              default_password: autoCreateAccounts && defaultPassword ? defaultPassword : null,
              ...(Object.keys(cleanedEmails).length > 0 ? { employee_emails: cleanedEmails } : {}),
            }),
    })
  }

  const handleClearDepartment = () => {
    onSave({
      permissions: [],
      permission_group_id: null,
      role_name: null,
      apply_to_existing_overrides: applyToExistingOverrides,
    })
  }

  const handleUseDepartmentPermissions = () => {
    onSave({
      permissions: null,
      permission_group_id: null,
      role_name: null,
      clear_individual: true,
    })
  }

  const hasInvalidMissingEmail =
    mode === 'employees' &&
    missingAccountsCount > 0 &&
    autoCreateAccounts &&
    missingEmailEmployees.some((emp) => {
      const val = (employeeEmails[emp.id] ?? '').trim()
      return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    })

  const disableSaveForAccountCreation =
    mode === 'employees' &&
    missingAccountsCount > 0 &&
    autoCreateAccounts &&
    (defaultPassword.trim().length < 8 || hasInvalidMissingEmail)

  return (
    <DialogContent className="flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            {mode === 'department'
              ? t('organizationPage.permissions.departmentTitle', {
                  name: department?.name ?? '',
                  defaultValue: `Permissões do departamento: ${department?.name ?? ''}`,
                })
              : mode === 'position'
                ? t('organizationPage.permissions.positionTitle', {
                    name: position?.title ?? '',
                    defaultValue: `Permissões do cargo: ${position?.title ?? ''}`,
                  })
                : mode === 'external'
                  ? externalMembers.length === 1
                    ? t('organizationPage.externalTeam.modalSingleTitle', {
                        name: externalMembers[0].name,
                        defaultValue: `Permissões nesta empresa: ${externalMembers[0].name}`,
                      })
                    : t('organizationPage.externalTeam.modalMultiTitle', {
                        count: externalMembers.length,
                        defaultValue: `Permissões nesta empresa (${externalMembers.length} utilizadores)`,
                      })
                  : selectedEmployees.length === 1
                    ? t('organizationPage.permissions.singleEmployeeTitle', {
                        name: selectedEmployees[0].full_name,
                        defaultValue: `Permissões de ${selectedEmployees[0].full_name}`,
                      })
                    : t('organizationPage.permissions.multiEmployeesTitle', {
                        count: selectedEmployees.length,
                        defaultValue: `Atribuir permissões a ${selectedEmployees.length} funcionários`,
                      })}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === 'department'
              ? t('organizationPage.permissions.departmentDescription', {
                  defaultValue:
                    'Escolha um perfil rápido ou defina os módulos abaixo. Os funcionários deste departamento herdam estas permissões automaticamente.',
                })
              : mode === 'position'
                ? t('organizationPage.permissions.positionDescription', {
                    defaultValue:
                      'Escolha um perfil rápido ou defina os módulos abaixo. Os funcionários com este cargo herdam estas permissões automaticamente.',
                  })
                : mode === 'external'
                  ? t('organizationPage.externalTeam.modalDesc', {
                      defaultValue:
                        'Estas permissões aplicam-se apenas a esta empresa. Nas restantes empresas o utilizador mantém o acesso padrão.',
                    })
                  : t('organizationPage.permissions.employeesDescription', {
                      defaultValue:
                        'Escolha um perfil rápido ou ajuste os módulos de acesso para os funcionários selecionados.',
                    })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* 1. Perfis Rápidos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {t('organizationPage.permissions.quickProfiles', { defaultValue: '1. Perfil rápido (1 clique)' })}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setSelectedGroupId(null)
                  setSelectedPermissions([])
                }}
              >
                {t('superAdminPage.clearPermissions', { defaultValue: 'Limpar tudo' })}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className="flex flex-col items-start rounded-lg border border-border/80 bg-card p-2.5 text-left transition-all hover:border-primary/60 hover:bg-primary/5"
                >
                  <span className="text-xs font-semibold text-foreground">{preset.label}</span>
                  <span className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{preset.desc}</span>
                </button>
              ))}
            </div>

            {permissionGroups.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  {t('organizationPage.permissions.savedGroups', { defaultValue: 'Grupos:' })}
                </span>
                {permissionGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => applyPermissionGroup(g)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                      selectedGroupId === g.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-muted/40 text-foreground hover:border-primary/50',
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Controlo simples e seleção detalhada de dados salariais e fiscais */}
          <div className="space-y-3 rounded-lg border border-border/80 bg-muted/25 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <Label htmlFor="sensitive-toggle" className="text-xs font-semibold">
                    {t('organizationPage.permissions.sensitiveToggleLabel', {
                      defaultValue: 'Permitir ver/editar dados salariais e fiscais',
                    })}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t('organizationPage.permissions.sensitiveToggleDesc', {
                      defaultValue:
                        'Controla salários, NIF, INSS e valores financeiros nos módulos com acesso.',
                    })}
                  </p>
                </div>
              </div>
              <Switch
                id="sensitive-toggle"
                checked={allowSensitiveData}
                onCheckedChange={handleToggleSensitiveData}
              />
            </div>

            {allowSensitiveData && sensitiveFieldPairs.length > 0 && (
              <div className="space-y-2.5 border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {t('organizationPage.permissions.sensitiveFieldsHeader', {
                      count: selectedSensitiveCount,
                      defaultValue: `Campos salariais e fiscais (${selectedSensitiveCount} selecionados)`,
                    })}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => applyAllSensitiveFields('viewAll')}
                    >
                      {t('organizationPage.permissions.sensitiveViewAll', {
                        defaultValue: 'Ver todos',
                      })}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => applyAllSensitiveFields('editAll')}
                    >
                      {t('organizationPage.permissions.sensitiveEditAll', {
                        defaultValue: 'Ver e editar todos',
                      })}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-muted-foreground"
                      onClick={() => applyAllSensitiveFields('clear')}
                    >
                      {t('organizationPage.permissions.clearSelection', { defaultValue: 'Limpar' })}
                    </Button>
                  </div>
                </div>

                <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {sensitiveFieldPairs.map((pair) => {
                    const fieldLabel = t(`superAdminPage.fieldPermissions.${pair.resource}.${pair.field}`, {
                      defaultValue: pair.field.replaceAll('_', ' '),
                    })
                    const groupLabel = t(`superAdminPage.permissionGroups.${pair.resource}`, {
                      defaultValue: pair.resource,
                    })
                    const canView = Boolean(pair.viewPerm && selectedSet.has(pair.viewPerm.name))
                    const canEdit = Boolean(pair.editPerm && selectedSet.has(pair.editPerm.name))

                    return (
                      <div
                        key={pair.key}
                        className="flex flex-col justify-between gap-2 rounded-md border border-border/70 bg-background p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground" title={fieldLabel}>
                            {fieldLabel}
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground">{groupLabel}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {pair.viewPerm && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                              <Checkbox
                                checked={canView}
                                onCheckedChange={(checked) =>
                                  toggleSensitiveFieldPair(pair, 'view', checked === true)
                                }
                              />
                              <span>{t('superAdminPage.fieldModes.view', { defaultValue: 'Ver' })}</span>
                            </label>
                          )}
                          {pair.editPerm && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                              <Checkbox
                                checked={canEdit}
                                onCheckedChange={(checked) =>
                                  toggleSensitiveFieldPair(pair, 'edit', checked === true)
                                }
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
            )}
          </div>

          {/* 3. Módulos */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('organizationPage.permissions.modulesSection', { defaultValue: '2. Acesso por módulo' })}
              </Label>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('organizationPage.permissions.searchModule', {
                    defaultValue: 'Filtrar módulo…',
                  })}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/80">
              {filteredBuckets.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{t('common.no_data')}</p>
              ) : (
                filteredBuckets.map((bucket) => {
                  const level = getModuleLevel(bucket)
                  const groupLabel = t(`superAdminPage.permissionGroups.${bucket.group}`, {
                    defaultValue: bucket.group,
                  })
                  const isExpanded = expandedGroup === bucket.group

                  return (
                    <div key={bucket.group} className="px-3 py-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{groupLabel}</span>
                          {level === 'custom' && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
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
                                  onClick={() => applyModuleLevel(bucket, btn.level)}
                                  className={cn(
                                    'rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
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
                            className="h-7 w-7 p-0 text-muted-foreground"
                            onClick={() => setExpandedGroup(isExpanded ? null : bucket.group)}
                            title={t('superAdminPage.advancedToggle', { defaultValue: 'Detalhes' })}
                          >
                            <ChevronDown
                              className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')}
                            />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-2 grid gap-1.5 rounded-md bg-muted/30 p-2.5 sm:grid-cols-2">
                          {bucket.relevantActions.map((perm) => (
                            <label key={perm.name} className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={selectedSet.has(perm.name)}
                                onChange={(e) => toggleSingleAction(bucket, perm.name, e.target.checked)}
                              />
                              <span className="leading-snug">{getPermissionDisplayLabel(t, perm.name)}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 4. Opções Contextuais */}
          {isEntityRuleMode && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <Label htmlFor="apply-overrides" className="text-xs font-medium">
                    {t('organizationPage.permissions.applyToOverridesLabel', {
                      defaultValue: 'Substituir também permissões individuais existentes',
                    })}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t('organizationPage.permissions.applyToOverridesDesc', {
                      defaultValue:
                        'Funcionários sem permissão individual herdam sempre automaticamente.',
                    })}
                  </p>
                </div>
              </div>
              <Switch
                id="apply-overrides"
                checked={applyToExistingOverrides}
                onCheckedChange={setApplyToExistingOverrides}
              />
            </div>
          )}

          {mode === 'employees' && (
            <div className="space-y-2.5">
              {canScopeToDepartment && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <Label htmlFor="scope-dept" className="text-xs font-medium">
                        {t('organizationPage.permissions.scopeToDepartmentLabel', {
                          name: scopeDepartmentName,
                          defaultValue: `Limitar visualização apenas ao departamento (${scopeDepartmentName})`,
                        })}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {t('organizationPage.permissions.scopeToDepartmentDesc', {
                          defaultValue:
                            'Quando ativo, estes utilizadores só acedem aos dados deste departamento.',
                        })}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="scope-dept"
                    checked={scopeToDepartment}
                    onCheckedChange={setScopeToDepartment}
                  />
                </div>
              )}

              {missingAccountsCount > 0 && (
                <div className="space-y-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div>
                        <Label htmlFor="auto-create-acc" className="text-xs font-semibold">
                          {t('organizationPage.permissions.missingAccountsTitle', {
                            count: missingAccountsCount,
                            defaultValue: `${missingAccountsCount} funcionário(s) sem conta de acesso`,
                          })}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          {t('organizationPage.permissions.missingAccountsDesc', {
                            defaultValue:
                              'Ative para criar conta automaticamente usando o email do funcionário.',
                          })}
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="auto-create-acc"
                      checked={autoCreateAccounts}
                      onCheckedChange={setAutoCreateAccounts}
                    />
                  </div>

                  {autoCreateAccounts && (
                    <div className="space-y-2.5 pt-1">
                      {missingEmailEmployees.length > 0 && (
                        <div className="space-y-2 rounded-md border border-amber-500/30 bg-background/80 p-2.5">
                          <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Mail className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            {t('organizationPage.permissions.missingEmailsSection', {
                              defaultValue: 'Indique o email para os funcionários sem email registado:',
                            })}
                          </Label>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {missingEmailEmployees.map((emp) => (
                              <div key={emp.id} className="space-y-1">
                                <Label
                                  htmlFor={`emp-email-${emp.id}`}
                                  className="block truncate text-[11px] text-muted-foreground"
                                >
                                  {emp.full_name}
                                  {emp.employee_code ? ` (${emp.employee_code})` : ''} *
                                </Label>
                                <Input
                                  id={`emp-email-${emp.id}`}
                                  type="email"
                                  value={employeeEmails[emp.id] ?? ''}
                                  onChange={(e) =>
                                    setEmployeeEmails((prev) => ({
                                      ...prev,
                                      [emp.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={t('organizationPage.permissions.emailPlaceholder', {
                                    defaultValue: 'email@empresa.ao',
                                  })}
                                  className="h-8 bg-background text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                        <Label
                          htmlFor="initial-password"
                          className="flex shrink-0 items-center gap-1.5 text-xs font-medium"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {t('organizationPage.permissions.initialPasswordLabel', {
                            defaultValue: 'Palavra-passe inicial:',
                          })}
                        </Label>
                        <Input
                          id="initial-password"
                          type="password"
                          value={defaultPassword}
                          onChange={(e) => setDefaultPassword(e.target.value)}
                          placeholder={t('organizationPage.permissions.initialPasswordPlaceholder', {
                            defaultValue: 'Mínimo 8 caracteres…',
                          })}
                          className="h-8 bg-background text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'external' && availableDepartments.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/80 bg-muted/20 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-medium">
                    {t('organizationPage.externalTeam.limitDepartmentsLabel', {
                      defaultValue: 'Limitar a departamentos específicos nesta empresa (opcional)',
                    })}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t('organizationPage.externalTeam.limitDepartmentsDesc', {
                      defaultValue:
                        'Deixe todos desmarcados para aceder a todos os departamentos desta empresa.',
                    })}
                  </p>
                </div>
                {selectedDeptScopeIds.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSelectedDeptScopeIds([])}
                  >
                    {t('organizationPage.permissions.clearSelection', { defaultValue: 'Limpar' })}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {availableDepartments.map((dept) => {
                  const checked = selectedDeptScopeIds.includes(dept.id)
                  return (
                    <label
                      key={dept.id}
                      className={cn(
                        'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                        checked
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDeptScopeId(dept.id)}
                      />
                      <span>{dept.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-6 py-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium">
              {t('organizationPage.permissions.activeModulesCount', {
                count: activeModulesCount,
                defaultValue: `${activeModulesCount} módulos com acesso`,
              })}
            </Badge>

            {mode === 'department' && (department?.effective_permissions_count ?? 0) > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                disabled={isSaving}
                onClick={handleClearDepartment}
              >
                {t('organizationPage.permissions.clearDepartment', {
                  defaultValue: 'Remover regra do departamento',
                })}
              </Button>
            )}

            {mode === 'position' && (position?.effective_permissions_count ?? 0) > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                disabled={isSaving}
                onClick={handleClearDepartment}
              >
                {t('organizationPage.permissions.clearPosition', {
                  defaultValue: 'Remover regra do cargo',
                })}
              </Button>
            )}

            {(canRevertToDepartment || canRevertExternal) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isSaving}
                onClick={handleUseDepartmentPermissions}
              >
                {mode === 'external'
                  ? t('organizationPage.externalTeam.restoreDefaultBtn', {
                      defaultValue: 'Usar padrão global',
                    })
                  : position && !department
                    ? t('organizationPage.permissions.usePositionDefault', {
                        defaultValue: 'Usar permissões do cargo',
                      })
                    : t('organizationPage.permissions.useDepartmentDefault', {
                        defaultValue: 'Usar permissões do departamento',
                      })}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t('organizationPage.common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || disableSaveForAccountCreation}
            >
              {isSaving
                ? t('organizationPage.common.saving')
                : t('organizationPage.permissions.saveButton', { defaultValue: 'Guardar permissões' })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
  )
}

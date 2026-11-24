import type { TFunction } from 'i18next'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import type { EChartsOption } from 'echarts'
import {
  Building2,
  Users,
  Globe2,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Power,
  UserRound,
  Layers,
  UserPlus,
  X,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Hash,
  Factory,
  KeyRound,
  ShieldCheck,
  Activity,
  UserCog,
  AlertTriangle,
  ArrowUpRight,
  Copy,
  ClipboardPaste,
  FileSpreadsheet,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { hasPermission, useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import { Chart } from '@/components/charts/chart'
import {
  PermissionSelector,
  TenantAccessScopeEditor,
  type PermissionGroupRecord,
  type TenantAccessDraft,
} from '@/features/admin/permissions-editor'
import { PlansManagementTab } from '@/features/admin/plans-management-tab'
import { PlatformBillingTab } from '@/features/admin/platform-billing-tab'
import { RelationshipsAndSubscriptionsTab } from '@/features/admin/relationships-tab'
import { CompanyDossierModal, CompanyPayrollReportsTab } from '@/features/admin/company-payroll-reports-tab'
import type { Paginated, Tenant } from '@/types'

// ── Constantes Angola ─────────────────────────────────────────────────────────

const ANGOLA_PROVINCES = [
  'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando Cubango',
  'Cuanza Norte', 'Cuanza Sul', 'Cunene', 'Huambo', 'Huíla',
  'Luanda', 'Lunda Norte', 'Lunda Sul', 'Malanje', 'Moxico',
  'Namibe', 'Uíge', 'Zaire',
]

const LEGAL_ENTITY_TYPE_VALUES = [
  'lda',
  'sa',
  'unipessoal',
  'em',
  'cooperativa',
  'epe',
  'ong',
  'outro',
] as const

const ECONOMIC_SECTORS = [
  { value: 'Agricultura e Pecuária', key: 'agriculture' },
  { value: 'Pesca', key: 'fishing' },
  { value: 'Mineração e Recursos Naturais', key: 'mining' },
  { value: 'Petróleo e Gás', key: 'oil_gas' },
  { value: 'Indústria Transformadora', key: 'manufacturing' },
  { value: 'Construção Civil', key: 'construction' },
  { value: 'Comércio e Distribuição', key: 'commerce' },
  { value: 'Transportes e Logística', key: 'transport' },
  { value: 'Tecnologia e Telecomunicações', key: 'tech' },
  { value: 'Serviços Financeiros e Banca', key: 'finance' },
  { value: 'Saúde', key: 'health' },
  { value: 'Educação', key: 'education' },
  { value: 'Hotelaria e Turismo', key: 'tourism' },
  { value: 'Serviços Gerais', key: 'services' },
  { value: 'Administração Pública', key: 'public_admin' },
  { value: 'Outro', key: 'other' },
] as const

const CURRENCY_CODES = ['AOA', 'USD', 'EUR', 'ZAR', 'CNY'] as const
const LOCALE_CODES = ['pt', 'en', 'zh'] as const
const TIMEZONE_IDS = [
  'Africa/Luanda',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'UTC',
  'Europe/Lisbon',
] as const

const STATUS_VARIANT = { active: 'success', inactive: 'secondary', suspended: 'warning' } as const

// ── Schema de validação ───────────────────────────────────────────────────────

function createTenantSchema(t: TFunction) {
  return z.object({
    // Identificação
    name: z.string().min(2, t('superAdminPage.validation.nameRequired')),
    slug: z.string().min(2, t('superAdminPage.validation.slugInvalid')).regex(/^[a-z0-9-]+$/, t('superAdminPage.validation.slugInvalid')),
    legal_entity_type: z.string().optional().or(z.literal('')),
    tax_id: z.string().optional().or(z.literal('')),
    inss_number: z.string().optional().or(z.literal('')),
    economic_sector: z.string().optional().or(z.literal('')),

    // Contactos
    email: z.string().email(t('superAdminPage.validation.invalidEmail')).optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    website: z.string().url(t('superAdminPage.validation.invalidUrl')).optional().or(z.literal('')),

    // Morada
    address: z.string().optional().or(z.literal('')),
    city: z.string().optional().or(z.literal('')),
    province: z.string().optional().or(z.literal('')),
    country: z.string().optional().or(z.literal('')),
    postal_code: z.string().optional().or(z.literal('')),

    // Configurações
    currency: z.string().length(3, t('superAdminPage.validation.currencyLength')).optional().or(z.literal('')),
    locale: z.string().optional().or(z.literal('')),
    timezone: z.string().optional().or(z.literal('')),
    status: z.enum(['active', 'inactive', 'suspended']),

    // Admin inicial
    admin_name: z.string().optional().or(z.literal('')),
    admin_email: z.string().email(t('superAdminPage.validation.invalidEmail')).optional().or(z.literal('')),
    admin_password: z.string().min(8, t('superAdminPage.validation.passwordMin')).optional().or(z.literal('')),
  })
}

type TenantForm = z.infer<ReturnType<typeof createTenantSchema>>

const emptyForm: TenantForm = {
  name: '',
  slug: '',
  legal_entity_type: '',
  tax_id: '',
  inss_number: '',
  economic_sector: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  province: 'Luanda',
  country: 'Angola',
  postal_code: '',
  currency: 'AOA',
  locale: 'pt',
  timezone: 'Africa/Luanda',
  status: 'active',
  admin_name: '',
  admin_email: '',
  admin_password: '',
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TenantAccessSummary {
  id?: number
  tenant_id: number
  tenant_name?: string | null
  tenant_slug?: string | null
  permission_group_id: number | null
  permission_group_name?: string | null
  role_name?: string | null
  permissions?: string[] | null
  resolved_permissions?: string[]
  department_ids?: number[]
}

interface TenantUser {
  id: number
  name: string
  email: string
  is_active: boolean
  roles: string[]
  permissions?: string[]
  direct_permissions?: string[]
  tenant_accesses?: TenantAccessSummary[]
  created_at?: string
}

interface TenantPermissionsResponse {
  permissions: PlatformPermission[]
  role_permissions: Record<string, string[]>
}

interface SuperAdminDashboardData {
  kpis: {
    total_tenants: number
    active_tenants: number
    suspended_tenants: number
    total_employees: number
    active_employees: number
    total_users: number
    super_admins: number
  }
  tenant_trend: { month: string; label: string; count: number }[]
  by_status: Record<string, number>
  segments: { small: number; medium: number; large: number }
}

interface PlatformPermission {
  name: string
  group_name: string | null
}

interface PlatformUser {
  id: number
  name: string
  email: string
  is_active: boolean
  roles: string[]
  permissions: string[]
  tenant_accesses?: TenantAccessSummary[]
}

interface PasswordTarget {
  id: number
  name: string
}

interface PlatformUsersResponse {
  users: PlatformUser[]
  permissions: PlatformPermission[]
}

interface NewPlatformUser {
  name: string
  email: string
  password: string
  role: 'super-admin' | 'super-admin-limited'
  permissions: string[]
}

const emptyPlatformUser: NewPlatformUser = {
  name: '',
  email: '',
  password: '',
  role: 'super-admin-limited',
  permissions: ['view_any_tenant'],
}

function createUserSchema(t: TFunction) {
  return z.object({
    name: z.string().min(2, t('superAdminPage.validation.nameRequired')),
    email: z.string().email(t('superAdminPage.validation.invalidEmail')),
    password: z.string().min(8, t('superAdminPage.validation.passwordMin')),
    role: z.enum(['admin', 'hr-manager', 'manager', 'employee']),
    permissions: z.array(z.string()).default([]),
  })
}
type UserForm = z.infer<ReturnType<typeof createUserSchema>>
const emptyUserForm: UserForm = { name: '', email: '', password: '', role: 'admin', permissions: [] }

function toTenantAccessDrafts(accesses?: TenantAccessSummary[]): TenantAccessDraft[] {
  return (accesses ?? []).map((a) => ({
    tenant_id: a.tenant_id,
    permission_group_id: a.permission_group_id ?? null,
    role_name: a.role_name || 'employee',
    permissions: a.permission_group_id == null && (a.permissions == null || a.permissions.length === 0)
      ? null
      : (a.permissions ?? a.resolved_permissions ?? []),
    department_ids: a.department_ids ?? [],
  }))
}

function CopyPermissionsControls({
  users,
  copied,
  onSelectUser,
  onPasteCopied,
  selectPlaceholder,
  pasteLabel,
}: {
  users: Array<{ id: number; name: string; permissions?: string[] }>
  copied: { sourceUserId: number; sourceUserName: string; permissions: string[] } | null
  onSelectUser: (userId: number) => void
  onPasteCopied: () => void
  selectPlaceholder: string
  pasteLabel: string
}) {
  if (users.length === 0 && !copied) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {users.length > 0 && (
        <select
          aria-label={selectPlaceholder}
          className="h-8 max-w-full rounded-md border border-input bg-transparent px-2.5 text-xs"
          value=""
          onChange={(event) => {
            const selectedId = Number(event.target.value)
            if (selectedId) onSelectUser(selectedId)
          }}
        >
          <option value="">{selectPlaceholder}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({(u.permissions ?? []).length})
            </option>
          ))}
        </select>
      )}
      {copied && (
        <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={onPasteCopied}>
          <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
          {pasteLabel}
        </Button>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SuperAdminPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const currentUser = useAuthStore((state) => state.user)
  const isFullSuperAdmin = currentUser?.roles.includes('super-admin') ?? false
  const canManagePlatform = isFullSuperAdmin || hasPermission(currentUser, 'manage_platform')
  const canManagePlatformUsers = isFullSuperAdmin || hasPermission(currentUser, 'manage_super_admins')
  const canCreateTenant = hasPermission(currentUser, 'create_tenant')
  const canUpdateTenant = hasPermission(currentUser, 'update_tenant')
  const canDeleteTenant = hasPermission(currentUser, 'delete_tenant')
  const canViewTenantUsers = canUpdateTenant && hasPermission(currentUser, 'view_tenant')
  const canSetUserPassword = currentUser?.roles.includes('super-admin') ?? false
  const [searchParams] = useSearchParams()
  const urlStatus = searchParams.get('status')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(
    urlStatus && ['all', 'active', 'inactive', 'suspended'].includes(urlStatus) ? urlStatus : 'all',
  )
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  useEffect(() => {
    if (urlStatus && ['all', 'active', 'inactive', 'suspended'].includes(urlStatus)) {
      setStatusFilter(urlStatus)
      setPage(1)
    }
  }, [urlStatus])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [form, setForm] = useState<TenantForm>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'info' | 'address' | 'config' | 'admin'>('info')

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [dossierTenantId, setDossierTenantId] = useState<number | null>(null)
  const [usersDialogOpen, setUsersDialogOpen] = useState(false)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm)
  const [userTenantAccesses, setUserTenantAccesses] = useState<TenantAccessDraft[]>([])
  const [userErrors, setUserErrors] = useState<Record<string, string>>({})
  const [editingTenantUser, setEditingTenantUser] = useState<TenantUser | null>(null)
  const [tenantUserRole, setTenantUserRole] = useState<UserForm['role']>('employee')
  const [tenantUserActive, setTenantUserActive] = useState(true)
  const [tenantUserPermissions, setTenantUserPermissions] = useState<string[]>([])
  const [editingTenantUserAccesses, setEditingTenantUserAccesses] = useState<TenantAccessDraft[]>([])
  const [platformUserDialogOpen, setPlatformUserDialogOpen] = useState(false)
  const [platformUserForm, setPlatformUserForm] = useState<NewPlatformUser>(emptyPlatformUser)
  const [platformUserAccesses, setPlatformUserAccesses] = useState<TenantAccessDraft[]>([])
  const [editingPlatformUser, setEditingPlatformUser] = useState<PlatformUser | null>(null)
  const [editingPlatformUserRole, setEditingPlatformUserRole] = useState<'super-admin' | 'super-admin-limited'>('super-admin-limited')
  const [platformUserPermissions, setPlatformUserPermissions] = useState<string[]>([])
  const [editingPlatformUserAccesses, setEditingPlatformUserAccesses] = useState<TenantAccessDraft[]>([])
  const [permissionGroupDialogOpen, setPermissionGroupDialogOpen] = useState(false)
  const [editingPermissionGroup, setEditingPermissionGroup] = useState<PermissionGroupRecord | null>(null)
  const [permissionGroupForm, setPermissionGroupForm] = useState<{
    name: string
    description: string
    permissions: string[]
  }>({ name: '', description: '', permissions: [] })
  const [copiedTenantPermissions, setCopiedTenantPermissions] = useState<{
    sourceUserId: number
    sourceUserName: string
    permissions: string[]
  } | null>(null)
  const [copiedPlatformPermissions, setCopiedPlatformPermissions] = useState<{
    sourceUserId: number
    sourceUserName: string
    permissions: string[]
  } | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')

  const dashboardQuery = useQuery<SuperAdminDashboardData>({
    queryKey: ['superadmin', 'dashboard'],
    queryFn: () => api.get<SuperAdminDashboardData>('superadmin/dashboard'),
  })

  const { data: tenants, isLoading: loadingTenants } = useQuery({
    queryKey: ['superadmin', 'tenants', search, statusFilter, page, perPage],
    queryFn: () =>
      api.get<Paginated<Tenant>>('superadmin/tenants', {
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        per_page: perPage,
      }),
  })

  useEffect(() => {
    if (tenants?.meta && tenants.meta.last_page > 0 && page > tenants.meta.last_page) {
      setPage(tenants.meta.last_page)
    }
  }, [tenants?.meta, page])

  const { data: tenantUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'],
    queryFn: () => api.get<TenantUser[]>(`superadmin/tenants/${selectedTenant!.id}/users`),
    enabled: !!selectedTenant,
  })

  const tenantPermissionsQuery = useQuery<TenantPermissionsResponse>({
    queryKey: ['superadmin', 'tenant-permissions'],
    queryFn: () => api.get<TenantPermissionsResponse>('superadmin/tenant-permissions'),
    enabled: usersDialogOpen || userDialogOpen || !!editingTenantUser || permissionGroupDialogOpen || platformUserDialogOpen || !!editingPlatformUser,
  })

  const permissionGroupsQuery = useQuery({
    queryKey: ['superadmin', 'permission-groups'],
    queryFn: () => api.get<PermissionGroupRecord[]>('superadmin/permission-groups'),
  })

  const allTenantsQuery = useQuery({
    queryKey: ['superadmin', 'all-tenants-for-scopes'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 1000 }),
  })

  const platformUsersQuery = useQuery({
    queryKey: ['superadmin', 'platform-users'],
    queryFn: () => api.get<PlatformUsersResponse>('superadmin/platform-users'),
    enabled: canManagePlatformUsers,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['superadmin'] })
    qc.invalidateQueries({ queryKey: ['dashboard', 'super-admin'] })
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setActiveTab('info')
    setDialogOpen(true)
  }

  const openEdit = (t: Tenant) => {
    setEditing(t)
    setForm({
      name: t.name,
      slug: t.slug,
      legal_entity_type: (t as any).legal_entity_type ?? '',
      tax_id: t.tax_id ?? '',
      inss_number: (t as any).inss_number ?? '',
      economic_sector: (t as any).economic_sector ?? '',
      email: t.email ?? '',
      phone: t.phone ?? '',
      website: (t as any).website ?? '',
      address: (t as any).address ?? '',
      city: (t as any).city ?? '',
      province: (t as any).province ?? 'Luanda',
      country: (t as any).country ?? 'Angola',
      postal_code: (t as any).postal_code ?? '',
      currency: t.currency ?? 'AOA',
      locale: t.locale ?? 'pt',
      timezone: t.timezone ?? 'Africa/Luanda',
      status: t.status,
      admin_name: '',
      admin_email: '',
      admin_password: '',
    })
    setErrors({})
    setActiveTab('info')
    setDialogOpen(true)
  }

  const openUsers = (t: Tenant) => {
    setSelectedTenant(t)
    setUsersDialogOpen(true)
  }

  const saveTenant = useMutation({
    mutationFn: (data: TenantForm) =>
      editing
        ? api.put<Tenant>(`superadmin/tenants/${editing.id}`, data)
        : api.post<Tenant>('superadmin/tenants', data),
    onSuccess: () => {
      toast.success(editing ? t('superAdminPage.companyUpdated') : t('superAdminPage.companyCreated'))
      setDialogOpen(false)
      invalidate()
    },
    onError: (e) => {
      const msg = getApiErrorMessage(e, t('superAdminPage.companySaveError'))
      setErrors({ form: msg })
      toast.error(msg)
    },
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Tenant['status'] }) =>
      api.put<Tenant>(`superadmin/tenants/${id}`, { status }),
    onSuccess: () => { toast.success(t('superAdminPage.companyStatusUpdated')); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('common.error'))),
  })

  const deleteTenant = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/tenants/${id}`),
    onSuccess: () => { toast.success(t('superAdminPage.companyDeleted')); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('superAdminPage.companyDeleteError'))),
  })

  const createUser = useMutation({
    mutationFn: (data: UserForm & { tenant_accesses?: TenantAccessDraft[] }) =>
      api.post<TenantUser>(`superadmin/tenants/${selectedTenant!.id}/users`, data),
    onSuccess: () => {
      toast.success(t('superAdminPage.tenantUserCreated', { defaultValue: 'Utilizador criado com sucesso' }))
      setUserDialogOpen(false)
      setUserForm(emptyUserForm)
      setUserTenantAccesses([])
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('superAdminPage.tenantUserCreateError', { defaultValue: 'Erro ao criar utilizador' }))),
  })

  const updateTenantUser = useMutation({
    mutationFn: ({
      userId,
      role,
      is_active,
      permissions,
      tenant_accesses,
    }: {
      userId: number
      role: UserForm['role']
      is_active: boolean
      permissions: string[]
      tenant_accesses?: TenantAccessDraft[]
    }) =>
      api.put<TenantUser>(`superadmin/tenants/${selectedTenant!.id}/users/${userId}`, {
        role,
        is_active,
        permissions,
        tenant_accesses,
      }),
    onSuccess: () => {
      toast.success(t('superAdminPage.tenantUserUpdated', { defaultValue: 'Utilizador e permissões atualizados com sucesso' }))
      setEditingTenantUser(null)
      setEditingTenantUserAccesses([])
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('superAdminPage.tenantUserUpdateError', { defaultValue: 'Erro ao atualizar utilizador' }))),
  })

  const deleteUser = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      api.delete(`superadmin/tenants/${selectedTenant!.id}/users/${userId}`),
    onSuccess: () => {
      toast.success(t('superAdminPage.tenantUserDeleted', { defaultValue: 'Utilizador eliminado' }))
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('common.error', { defaultValue: 'Erro' }))),
  })

  const updateUserPassword = useMutation({
    mutationFn: ({ userId, password, password_confirmation }: { userId: number; password: string; password_confirmation: string }) =>
      api.put(`superadmin/users/${userId}/password`, { password, password_confirmation }),
    onSuccess: () => {
      toast.success(t('passwordReset.updated', { defaultValue: 'Palavra-passe atualizada com sucesso' }))
      setPasswordTarget(null)
      setNewPassword('')
      setPasswordConfirmation('')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('common.error', { defaultValue: 'Erro ao atualizar palavra-passe' }))),
  })

  const createPlatformUser = useMutation({
    mutationFn: (data: {
      name: string
      email: string
      password: string
      role: 'super-admin' | 'super-admin-limited'
      permissions?: string[]
      tenant_accesses?: TenantAccessDraft[]
    }) =>
      api.post<PlatformUser>('superadmin/platform-users', data),
    onSuccess: () => {
      toast.success(t('superAdminPage.created'))
      setPlatformUserDialogOpen(false)
      setPlatformUserForm(emptyPlatformUser)
      setPlatformUserAccesses([])
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
      invalidate()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.createError'))),
  })

  const updatePlatformUser = useMutation({
    mutationFn: ({
      id,
      role,
      permissions,
      tenant_accesses,
    }: {
      id: number
      role: 'super-admin' | 'super-admin-limited'
      permissions?: string[]
      tenant_accesses?: TenantAccessDraft[]
    }) =>
      api.put<PlatformUser>(`superadmin/platform-users/${id}`, { role, permissions, tenant_accesses }),
    onSuccess: () => {
      toast.success(t('superAdminPage.permissionsUpdated'))
      setEditingPlatformUser(null)
      setEditingPlatformUserAccesses([])
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.updateError'))),
  })

  const deletePlatformUser = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/platform-users/${id}`),
    onSuccess: () => {
      toast.success(t('superAdminPage.deleted'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
      invalidate()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.deleteError'))),
  })

  const savePermissionGroup = useMutation({
    mutationFn: (payload: { id?: number; name: string; description: string; permissions: string[] }) =>
      payload.id
        ? api.put<PermissionGroupRecord>(`superadmin/permission-groups/${payload.id}`, payload)
        : api.post<PermissionGroupRecord>('superadmin/permission-groups', payload),
    onSuccess: () => {
      toast.success(t('superAdminPage.permissionGroupSaved', { defaultValue: 'Grupo de permissões guardado com sucesso.' }))
      setPermissionGroupDialogOpen(false)
      setEditingPermissionGroup(null)
      setPermissionGroupForm({ name: '', description: '', permissions: [] })
      qc.invalidateQueries({ queryKey: ['superadmin', 'permission-groups'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.permissionGroupSaveError', { defaultValue: 'Erro ao guardar grupo de permissões.' }))),
  })

  const deletePermissionGroup = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/permission-groups/${id}`),
    onSuccess: () => {
      toast.success(t('superAdminPage.permissionGroupDeleted', { defaultValue: 'Grupo de permissões eliminado.' }))
      qc.invalidateQueries({ queryKey: ['superadmin', 'permission-groups'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('common.error', { defaultValue: 'Erro' }))),
  })

  const handleSubmit = () => {
    const parsed = createTenantSchema(t).safeParse(form)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message })
      setErrors(errs)
      return
    }
    setErrors({})
    saveTenant.mutate(parsed.data)
  }

  const handleUserSubmit = () => {
    const parsed = createUserSchema(t).safeParse(userForm)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message })
      setUserErrors(errs)
      return
    }
    setUserErrors({})
    createUser.mutate({
      ...parsed.data,
      tenant_accesses: userTenantAccesses.map((a) => ({
        ...a,
        permissions: a.permissions === null ? null : normalizeTenantPermissions(a.permissions),
      })),
    })
  }

  const openCreatePlatformUser = () => {
    setPlatformUserForm(emptyPlatformUser)
    setPlatformUserAccesses([])
    setPlatformUserDialogOpen(true)
  }

  const handlePlatformUserSubmit = () => {
    if (!platformUserForm.name.trim() || !platformUserForm.email.trim() || platformUserForm.password.length < 8) {
      toast.error(t('superAdminPage.requiredFields'))
      return
    }
    if (platformUserForm.role === 'super-admin') {
      createPlatformUser.mutate({
        name: platformUserForm.name,
        email: platformUserForm.email,
        password: platformUserForm.password,
        role: 'super-admin',
      })
      return
    }
    if (!platformUserForm.permissions.includes('view_any_tenant')) {
      toast.error(t('superAdminPage.tenantPermissionRequired'))
      return
    }
    createPlatformUser.mutate({
      ...platformUserForm,
      tenant_accesses: platformUserAccesses.map((a) => ({
        ...a,
        permissions: a.permissions === null ? null : normalizeTenantPermissions(a.permissions),
      })),
    })
  }

  const openPlatformUserEdit = (user: PlatformUser) => {
    const isFull = user.roles.includes('super-admin')
    setEditingPlatformUser(user)
    setEditingPlatformUserRole(isFull ? 'super-admin' : 'super-admin-limited')
    setPlatformUserPermissions(
      isFull
        ? normalizePlatformPermissions(user.permissions ?? [])
        : [...user.permissions],
    )
    setEditingPlatformUserAccesses(toTenantAccessDrafts(user.tenant_accesses))
  }

  const handlePlatformUserPermissionsSubmit = () => {
    if (!editingPlatformUser) return
    if (editingPlatformUserRole === 'super-admin') {
      updatePlatformUser.mutate({
        id: editingPlatformUser.id,
        role: 'super-admin',
      })
      return
    }
    if (!platformUserPermissions.includes('view_any_tenant')) {
      toast.error(t('superAdminPage.tenantPermissionRequired'))
      return
    }
    updatePlatformUser.mutate({
      id: editingPlatformUser.id,
      role: 'super-admin-limited',
      permissions: platformUserPermissions,
      tenant_accesses: editingPlatformUserAccesses.map((a) => ({
        ...a,
        permissions: a.permissions === null ? null : normalizeTenantPermissions(a.permissions),
      })),
    })
  }

  const openTenantUserEdit = (u: TenantUser) => {
    const currentRole = (u.roles[0] as UserForm['role']) ?? 'employee'
    setEditingTenantUser(u)
    setTenantUserRole(currentRole)
    setTenantUserActive(u.is_active)
    setTenantUserPermissions([...(u.permissions ?? [])])
    setEditingTenantUserAccesses(toTenantAccessDrafts(u.tenant_accesses))
  }

  const handleTenantUserRoleChange = (role: UserForm['role']) => {
    setTenantUserRole(role)
    const defaults = tenantPermissionsQuery.data?.role_permissions?.[role] ?? []
    setTenantUserPermissions(defaults)
  }

  const handleNewUserRoleChange = (role: UserForm['role']) => {
    const defaults = tenantPermissionsQuery.data?.role_permissions?.[role] ?? []
    setUserForm((prev) => ({ ...prev, role, permissions: defaults }))
  }

  const platformOnlyPerms = new Set([
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

  const normalizeTenantPermissions = (perms: string[]) => {
    const allowed = new Set((tenantPermissionsQuery.data?.permissions ?? []).map((p) => p.name))
    const withoutPlatform = perms.filter((p) => !platformOnlyPerms.has(p))
    const filtered = allowed.size > 0 ? withoutPlatform.filter((p) => allowed.has(p)) : withoutPlatform
    return [...new Set(filtered)]
  }

  const normalizePlatformPermissions = (perms: string[]) => {
    const allowed = new Set((platformUsersQuery.data?.permissions ?? []).map((p) => p.name))
    const filtered = allowed.size > 0 ? perms.filter((p) => allowed.has(p)) : [...perms]
    if (!filtered.includes('view_any_tenant')) filtered.push('view_any_tenant')
    return [...new Set(filtered)]
  }

  const copyTenantUserPermissions = (u: TenantUser) => {
    const permissions = normalizeTenantPermissions(u.permissions ?? [])
    setCopiedTenantPermissions({
      sourceUserId: u.id,
      sourceUserName: u.name,
      permissions,
    })
    toast.success(t('superAdminPage.permissionsCopied', { name: u.name, count: permissions.length }))
  }

  const copyPlatformUserPermissions = (u: PlatformUser) => {
    const permissions = normalizePlatformPermissions(u.permissions ?? [])
    setCopiedPlatformPermissions({
      sourceUserId: u.id,
      sourceUserName: u.name,
      permissions,
    })
    toast.success(t('superAdminPage.permissionsCopied', { name: u.name, count: permissions.length }))
  }

  const dashboardData = dashboardQuery.data
  const trendOption: EChartsOption = useMemo(() => {
    const labels = (dashboardData?.tenant_trend ?? []).map((d) => {
      if (!d.month) return d.label
      const dt = new Date(`${d.month}-01T00:00:00`)
      if (Number.isNaN(dt.getTime())) return d.label
      try {
        return new Intl.DateTimeFormat(i18n.language, { month: 'short', year: '2-digit' }).format(dt)
      } catch {
        return d.label
      }
    })
    const values = (dashboardData?.tenant_trend ?? []).map((d) => d.count)
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
        padding: [8, 12],
      },
      grid: { left: 0, right: 0, top: 12, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: 'var(--muted-foreground)', fontSize: 11, margin: 12 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'var(--border)', type: 'dashed' } },
        axisLabel: { color: 'var(--muted-foreground)', fontSize: 11 },
      },
      series: [
        {
          name: t('superAdminPage.companiesSeries'),
          type: 'bar',
          barWidth: '45%',
          data: values,
          itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [dashboardData, t, i18n.language])

  const statusOption: EChartsOption = useMemo(() => {
    const statusItems = Object.entries(dashboardData?.by_status ?? {}).map(([k, v]) => ({
      name: t(`superAdminDashboard.status.${k}`, {
        defaultValue: k === 'active' ? 'Ativas' : k === 'suspended' ? 'Suspensas' : 'Inativas',
      }),
      value: v,
    }))
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'var(--popover)',
        borderColor: 'var(--border)',
        textStyle: { color: 'var(--popover-foreground)' },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        bottom: 0,
        textStyle: { fontSize: 11, color: 'var(--muted-foreground)' },
        itemWidth: 8,
        itemHeight: 8,
        formatter: (name: string) => {
          const item = statusItems.find((entry) => entry.name === name)
          return item ? `${name}: ${item.value}` : name
        },
      },
      color: ['#10b981', '#94a3b8', '#ef4444'],
      series: [
        {
          name: t('superAdminDashboard.byStatus'),
          type: 'pie',
          radius: ['46%', '68%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 4, borderColor: 'var(--card)', borderWidth: 2 },
          label: { show: true, formatter: '{c}', fontSize: 11, fontWeight: 600, color: 'var(--foreground)' },
          labelLine: { show: true, length: 6, length2: 6 },
          data: statusItems.map((item) => ({
            ...item,
            label: { show: item.value > 0 },
            labelLine: { show: item.value > 0 },
          })),
        },
      ],
    }
  }, [dashboardData, t])

  const platformPermissionList = platformUsersQuery.data?.permissions ?? []
  const tenantPermissionList = tenantPermissionsQuery.data?.permissions ?? []
  const permissionGroupsList = permissionGroupsQuery.data ?? []
  const scopeTenantsList = allTenantsQuery.data?.data ?? tenants?.data ?? []

  const tabs = [
    { id: 'info' as const, label: t('superAdminPage.formTabs.info') },
    { id: 'address' as const, label: t('superAdminPage.formTabs.address') },
    { id: 'config' as const, label: t('superAdminPage.formTabs.config') },
    ...(!editing ? [{ id: 'admin' as const, label: t('superAdminPage.formTabs.admin') }] : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('superAdminPage.eyebrow')}
        title={t('superAdminPage.pageTitle')}
        description={t('superAdminPage.pageDescription')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManagePlatformUsers && (
              <Button size="sm" variant="outline" onClick={openCreatePlatformUser}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                {t('superAdminPage.createButton')}
              </Button>
            )}
            {canCreateTenant && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('superAdminPage.newCompany')}
              </Button>
            )}
          </div>
        }
      />

      {/* ── Dashboard do Super Admin ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('superAdminPage.kpiCompanies', { active: dashboardData?.kpis.active_tenants ?? 0 })}
          value={dashboardData?.kpis.total_tenants ?? tenants?.meta?.total ?? 0}
          icon={Building2}
          accent="primary"
        />
        <KpiCard
          label={t('superAdminPage.kpiEmployees', { active: dashboardData?.kpis.active_employees ?? 0 })}
          value={dashboardData?.kpis.total_employees ?? 0}
          icon={Users}
          accent="success"
        />
        <KpiCard
          label={t('superAdminPage.kpiUsers', { superAdmins: dashboardData?.kpis.super_admins ?? 0 })}
          value={dashboardData?.kpis.total_users ?? 0}
          icon={UserCog}
          accent="info"
        />
        <KpiCard
          label={t('superAdminPage.kpiSuspended')}
          value={dashboardData?.kpis.suspended_tenants ?? 0}
          icon={AlertTriangle}
          accent={(dashboardData?.kpis.suspended_tenants ?? 0) > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {dashboardData && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                {t('superAdminPage.trendTitle')}
              </CardTitle>
              <CardDescription>{t('superAdminPage.trendDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pt-2">
              <Chart option={trendOption} height={220} />
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="h-4 w-4 text-primary" />
                {t('superAdminPage.statusAndSizeTitle')}
              </CardTitle>
              <CardDescription>{t('superAdminPage.statusAndSizeDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-2">
              <Chart option={statusOption} height={175} />
              <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">{t('superAdminPage.sizeSmall')}</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.small}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('superAdminPage.sizeMedium')}</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.medium}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('superAdminPage.sizeLarge')}</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.large}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Abas de Gestão ───────────────────────────────────────────── */}
      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1.5 rounded-lg border border-border/60 bg-muted/60 p-1.5">
          <TabsTrigger value="tenants" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
            <Building2 className="h-4 w-4" />
            {t('superAdminPage.registeredTenantsTab', { defaultValue: 'Empresas registadas' })}
          </TabsTrigger>
          {canManagePlatform && (
            <TabsTrigger value="plans" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
              <Layers className="h-4 w-4" />
              {t('superAdminPage.plansTab')}
            </TabsTrigger>
          )}
          <TabsTrigger value="relationships" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
            <Globe2 className="h-4 w-4" />
            {t('superAdminPage.hierarchyTab')}
          </TabsTrigger>
          {canManagePlatform && (
            <TabsTrigger value="billing" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
              <Activity className="h-4 w-4" />
              {t('superAdminPage.billingTab')}
            </TabsTrigger>
          )}
          <TabsTrigger value="payroll-reports" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            {t('companyReports.tabTitleShort', { defaultValue: 'Relatórios & Resumos' })}
          </TabsTrigger>
          <TabsTrigger value="permission-groups" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
            <Layers className="h-4 w-4" />
            {t('superAdminPage.permissionGroupsTab', { defaultValue: 'Grupos de permissões' })}
          </TabsTrigger>
          {canManagePlatformUsers && (
            <TabsTrigger value="platform-users" className="flex-none gap-2 px-3 py-1.5 text-xs sm:text-sm">
              <ShieldCheck className="h-4 w-4" />
              {t('superAdminPage.title')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tenants">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{t('superAdminPage.registeredTenantsTab')}</CardTitle>
                <CardDescription>{t('superAdminPage.registeredTenantsDescription')}</CardDescription>
              </div>
              {canCreateTenant && (
                <Button size="sm" className="shrink-0" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('superAdminPage.newCompany')}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtros */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder={t('superAdminPage.searchTenantsPlaceholder')}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm sm:w-44"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="all">{t('superAdminPage.allStatuses')}</option>
                  <option value="active">{t('superAdminPage.tenantStatuses.active')}</option>
                  <option value="inactive">{t('superAdminPage.tenantStatuses.inactive')}</option>
                  <option value="suspended">{t('superAdminPage.tenantStatuses.suspended')}</option>
                </select>
              </div>

              {/* Tabela */}
              {loadingTenants ? (
                <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                      <tr className="text-xs text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.companyLabel')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.taxIdShort')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.locationLabel')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.status')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.employeesCol')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.departmentsCol')}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.usersCol', { defaultValue: 'Utilizadores' })}</th>
                        <th className="px-3 py-2.5 font-medium">{t('superAdminPage.createdAtCol')}</th>
                        <th className="px-3 py-2.5 text-right font-medium">{t('superAdminPage.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(tenants?.data ?? []).map((tenantItem) => (
                        <tr key={tenantItem.id} className="hover:bg-muted/40">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                                <Building2 className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{tenantItem.name}</p>
                                <p className="text-xs text-muted-foreground">{tenantItem.slug} · {(tenantItem as any).legal_entity_type?.toUpperCase() ?? '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {tenantItem.tax_id ?? '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {(tenantItem as any).province ?? (tenantItem as any).city ?? '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={STATUS_VARIANT[tenantItem.status] ?? 'secondary'}>
                              {t(`superAdminPage.tenantStatuses.${tenantItem.status}`, { defaultValue: tenantItem.status })}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                              {tenantItem.stats?.employees ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Layers className="h-3.5 w-3.5" />
                              {tenantItem.stats?.departments ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Users className="h-3.5 w-3.5" />
                              {tenantItem.stats?.users ?? 0}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {tenantItem.created_at ? new Date(tenantItem.created_at).toLocaleDateString(i18n.language) : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                title={t('superAdminPage.openTenantPanel')}
                                aria-label={t('superAdminPage.openTenantPanel')}
                                onClick={() => {
                                  localStorage.setItem('hrms_selected_tenant', String(tenantItem.id))
                                  navigate('/')
                                  window.location.reload()
                                }}
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title={t('companyReports.dossierRowAction', { defaultValue: 'Gerar Dossiê Completo PDF' })}
                                aria-label={t('companyReports.dossierRowAction', { defaultValue: 'Gerar Dossiê Completo PDF' })}
                                onClick={() => setDossierTenantId(tenantItem.id)}
                              >
                                <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                              </Button>
                              {canViewTenantUsers && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title={t('superAdminPage.manageUsersPermissions')}
                                  aria-label={t('superAdminPage.manageUsersPermissions')}
                                  onClick={() => openUsers(tenantItem)}
                                >
                                  <Users className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canUpdateTenant && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={t('superAdminPage.editCompany')}
                                    aria-label={t('superAdminPage.editCompany')}
                                    onClick={() => openEdit(tenantItem)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    title={tenantItem.status === 'suspended' ? t('superAdminPage.reactivateCompany') : t('superAdminPage.suspendCompany')}
                                    aria-label={tenantItem.status === 'suspended' ? t('superAdminPage.reactivateCompany') : t('superAdminPage.suspendCompany')}
                                    disabled={setStatus.isPending}
                                    onClick={() => setStatus.mutate({ id: tenantItem.id, status: tenantItem.status === 'suspended' ? 'active' : 'suspended' })}
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {canDeleteTenant && (
                                <Button
                                  size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  title={t('superAdminPage.deleteCompany')}
                                  aria-label={t('superAdminPage.deleteCompany')}
                                  disabled={deleteTenant.isPending}
                                  onClick={() => { if (window.confirm(t('superAdminPage.confirmDeleteCompany', { name: tenantItem.name }))) deleteTenant.mutate(tenantItem.id) }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!loadingTenants && (tenants?.data ?? []).length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                            {t('superAdminPage.noCompaniesFound')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {!loadingTenants && (tenants?.meta?.total ?? 0) > 0 && tenants?.meta && (
                <div className="flex flex-col gap-3 border-t border-border pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-muted-foreground">
                    {t('superAdminPage.pagination', {
                      current: tenants.meta.current_page,
                      pages: tenants.meta.last_page,
                      total: tenants.meta.total,
                      defaultValue: 'Página {{current}} de {{pages}} · {{total}} no total',
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t('superAdminPage.perPageLabel', { defaultValue: 'Empresas por página' })}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value))
                        setPage(1)
                      }}
                    >
                      {[20, 50, 100].map((count) => (
                        <option key={count} value={count}>
                          {t('superAdminPage.perPage', { count, defaultValue: '{{count}} / página' })}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t('common.previous')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= tenants.meta.last_page}
                      onClick={() => setPage((p) => Math.min(tenants.meta.last_page, p + 1))}
                    >
                      {t('common.next')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

          <TabsContent value="permission-groups">
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">
                    {t('superAdminPage.permissionGroupsTitle', { defaultValue: 'Grupos de Permissões Reutilizáveis' })}
                  </CardTitle>
                  <CardDescription>
                    {t('superAdminPage.permissionGroupsDescription', {
                      defaultValue: 'Crie perfis de permissões (incluindo permissões por campo e salários) para vincular rapidamente a empresas e departamentos.',
                    })}
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setEditingPermissionGroup(null)
                    setPermissionGroupForm({ name: '', description: '', permissions: [] })
                    setPermissionGroupDialogOpen(true)
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('superAdminPage.createPermissionGroup', { defaultValue: 'Novo grupo' })}
                </Button>
              </CardHeader>
              <CardContent>
                {permissionGroupsQuery.isLoading ? (
                  <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.name')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('common.description', { defaultValue: 'Descrição' })}</th>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.assignedPermissions')}</th>
                          <th className="px-3 py-2.5 text-right font-medium">{t('superAdminPage.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {permissionGroupsList.map((group) => (
                          <tr key={group.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2.5 font-medium">{group.name}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">{group.description || '—'}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className="text-xs">
                                {group.permissions.length}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title={t('common.edit')}
                                  onClick={() => {
                                    setEditingPermissionGroup(group)
                                    setPermissionGroupForm({
                                      name: group.name,
                                      description: group.description ?? '',
                                      permissions: [...group.permissions],
                                    })
                                    setPermissionGroupDialogOpen(true)
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={deletePermissionGroup.isPending}
                                  onClick={() => {
                                    if (window.confirm(t('superAdminPage.confirmDeletePermissionGroup', { name: group.name, defaultValue: `Eliminar o grupo "${group.name}"?` }))) {
                                      deletePermissionGroup.mutate(group.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {permissionGroupsList.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                              {t('superAdminPage.noPermissionGroups', { defaultValue: 'Nenhum grupo de permissões criado.' })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        {canManagePlatform && (
          <TabsContent value="plans">
            <PlansManagementTab />
          </TabsContent>
        )}

        <TabsContent value="relationships">
          <RelationshipsAndSubscriptionsTab />
        </TabsContent>

        {canManagePlatform && (
          <TabsContent value="billing">
            <PlatformBillingTab />
          </TabsContent>
        )}

        {canManagePlatformUsers && (
          <TabsContent value="platform-users">
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">{t('superAdminPage.title')}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{t('superAdminPage.description')}</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={openCreatePlatformUser}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  {t('superAdminPage.createButton')}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {copiedPlatformPermissions && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-2">
                      <ClipboardPaste className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {t('superAdminPage.permissionsCopied', {
                          name: copiedPlatformPermissions.sourceUserName,
                          count: copiedPlatformPermissions.permissions.length,
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={t('common.cancel')}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setCopiedPlatformPermissions(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {platformUsersQuery.isLoading ? (
                  <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : platformUsersQuery.isError ? (
                  <div className="flex items-center justify-between gap-3 text-sm text-destructive">
                    <span>{getApiErrorMessage(platformUsersQuery.error, t('superAdminPage.loadError'))}</span>
                    <Button size="sm" variant="outline" onClick={() => platformUsersQuery.refetch()}>{t('superAdminPage.retry')}</Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.user')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.type')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.assignedPermissions')}</th>
                          <th className="px-3 py-2.5 font-medium">{t('superAdminPage.status')}</th>
                          <th className="px-3 py-2.5 text-right font-medium">{t('superAdminPage.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(platformUsersQuery.data?.users ?? []).map((platformUser) => (
                          <tr key={platformUser.id}>
                            <td className="px-3 py-2.5">
                              <p className="font-medium">{platformUser.name}</p>
                              <p className="text-xs text-muted-foreground">{platformUser.email}</p>
                            </td>
                            <td className="px-3 py-2.5">{platformUser.roles.includes('super-admin') ? t('superAdminPage.fullAdmin') : t('superAdminPage.restrictedAdmin')}</td>
                            <td className="px-3 py-2.5">{platformUser.permissions.length}</td>
                            <td className="px-3 py-2.5">{platformUser.is_active ? t('superAdminPage.active') : t('superAdminPage.inactive')}</td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  aria-label={t('superAdminPage.copyPermissionsFor', { name: platformUser.name })}
                                  title={t('superAdminPage.copyPermissions')}
                                  onClick={() => copyPlatformUserPermissions(platformUser)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {canSetUserPassword && platformUser.id !== currentUser?.id && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    aria-label={t('passwordReset.changePasswordFor', { name: platformUser.name })}
                                    title={t('passwordReset.changePassword')}
                                    onClick={() => setPasswordTarget(platformUser)}
                                  >
                                    <KeyRound className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {(platformUser.roles.includes('super-admin-limited') || isFullSuperAdmin) && platformUser.id !== currentUser?.id && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-label={t('superAdminPage.editPermissions')}
                                      title={t('superAdminPage.editPermissions')}
                                      onClick={() => openPlatformUserEdit(platformUser)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      aria-label={t('superAdminPage.deleteUser')}
                                      title={t('superAdminPage.deleteUser')}
                                      disabled={deletePlatformUser.isPending}
                                      onClick={() => {
                                        if (window.confirm(t('superAdminPage.confirmDelete', { name: platformUser.name }))) {
                                          deletePlatformUser.mutate(platformUser.id)
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="payroll-reports">
          <CompanyPayrollReportsTab tenants={scopeTenantsList} />
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Criar / Editar Empresa ──────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] w-[95vw] h-[700px] max-h-[92vh] flex flex-col p-0 overflow-hidden gap-0">
          {/* Header fixo */}
          <div className="px-6 pt-6 pb-3 border-b bg-background shrink-0">
            <DialogHeader className="mb-3">
              <DialogTitle className="text-lg">
                {editing ? t('superAdminPage.editCompany') : t('superAdminPage.registerCompany')}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editing
                  ? t('superAdminPage.editCompanyDescription')
                  : t('superAdminPage.registerCompanyDescription')}
              </DialogDescription>
            </DialogHeader>

            {/* Tabs de navegação do formulário */}
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Área de conteúdo que se adapta sem alterar o tamanho da modal */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* ── Tab: Identificação ──────────────────────────────── */}
            {activeTab === 'info' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.companyNameLabel')} *</Label>
                    <Input
                      placeholder={t('superAdminPage.companyNamePlaceholder')}
                      value={form.name}
                      onChange={(e) => {
                        const name = e.target.value
                        const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                        setForm({ ...form, name, slug: form.slug || slug })
                      }}
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.slugLabel')} *</Label>
                    <Input
                      placeholder={t('superAdminPage.slugPlaceholder')}
                      value={form.slug}
                      disabled={!!editing}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    />
                    {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.legalEntityTypeLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.legal_entity_type}
                      onChange={(e) => setForm({ ...form, legal_entity_type: e.target.value })}
                    >
                      <option value="">{t('superAdminPage.selectPlaceholder')}</option>
                      {LEGAL_ENTITY_TYPE_VALUES.map((val) => (
                        <option key={val} value={val}>{t(`superAdminPage.legalEntityTypes.${val}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.economicSectorLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.economic_sector}
                      onChange={(e) => setForm({ ...form, economic_sector: e.target.value })}
                    >
                      <option value="">{t('superAdminPage.selectPlaceholder')}</option>
                      {ECONOMIC_SECTORS.map((s) => (
                        <option key={s.value} value={s.value}>{t(`superAdminPage.economicSectors.${s.key}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('superAdminPage.taxIdLabel')}
                    </Label>
                    <Input
                      placeholder={t('superAdminPage.taxIdPlaceholder')}
                      value={form.tax_id}
                      onChange={(e) => setForm({ ...form, tax_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    />
                    <p className="text-[10px] text-muted-foreground">{t('superAdminPage.taxIdHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('superAdminPage.inssNumberLabel')}
                    </Label>
                    <Input
                      placeholder={t('superAdminPage.inssNumberPlaceholder')}
                      value={form.inss_number}
                      onChange={(e) => setForm({ ...form, inss_number: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">{t('superAdminPage.inssNumberHint')}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('superAdminPage.email')}
                    </Label>
                    <Input type="email" placeholder="geral@empresa.ao" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {t('superAdminPage.phoneLabel')}
                    </Label>
                    <Input placeholder="+244 222 000 000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.websiteLabel')}</Label>
                    <Input placeholder="https://empresa.ao" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    {errors.website && <p className="text-xs text-destructive">{errors.website}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.companyStatusLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as Tenant['status'] })}
                    >
                      <option value="active">{t('superAdminPage.tenantStatuses.active')}</option>
                      <option value="inactive">{t('superAdminPage.tenantStatuses.inactive')}</option>
                      <option value="suspended">{t('superAdminPage.tenantStatuses.suspended')}</option>
                    </select>
                  </div>
                </div>

                {!editing && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5 text-primary" />
                    {t('superAdminPage.createTabsHint')}
                  </p>
                )}
              </div>
            )}

            {/* ── Tab: Localização ────────────────────────────────── */}
            {activeTab === 'address' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {t('superAdminPage.addressLabel')}
                  </Label>
                  <Input placeholder={t('superAdminPage.addressPlaceholder')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.cityLabel')}</Label>
                    <Input placeholder={t('superAdminPage.cityPlaceholder')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.postalCodeLabel')}</Label>
                    <Input placeholder="Ex: 1104" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.provinceLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.province}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                    >
                      <option value="">{t('superAdminPage.selectProvincePlaceholder')}</option>
                      {ANGOLA_PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.countryLabel')}</Label>
                    <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">{t('superAdminPage.geoBoxTitle')}</p>
                  <p>{t('superAdminPage.geoBoxDescription')}</p>
                </div>
              </div>
            )}

            {/* ── Tab: Configurações ──────────────────────────────── */}
            {activeTab === 'config' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.currencyLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    >
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>{t(`superAdminPage.currencies.${code}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.localeLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.locale}
                      onChange={(e) => setForm({ ...form, locale: e.target.value })}
                    >
                      {LOCALE_CODES.map((code) => (
                        <option key={code} value={code}>{t(`superAdminPage.languages.${code}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('superAdminPage.timezoneLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    >
                      {TIMEZONE_IDS.map((tz) => (
                        <option key={tz} value={tz}>{t(`superAdminPage.timezones.${tz}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground">{t('superAdminPage.fiscalBoxTitle')}</p>
                  <p>• {t('superAdminPage.fiscalBulletCurrency')}</p>
                  <p>• {t('superAdminPage.fiscalBulletTimezone')}</p>
                  <p>• {t('superAdminPage.fiscalBulletFiscalYear')}</p>
                </div>
              </div>
            )}

            {/* ── Tab: Admin Inicial (apenas criação) ─────────────── */}
            {activeTab === 'admin' && !editing && (
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                  {t('superAdminPage.initialAdminBanner')}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('superAdminPage.adminNameLabel')}</Label>
                  <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder={t('superAdminPage.adminNamePlaceholder')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('superAdminPage.adminEmailLabel')}</Label>
                  <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@empresa.ao" />
                  {errors.admin_email && <p className="text-xs text-destructive">{errors.admin_email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('superAdminPage.adminPasswordLabel')}</Label>
                  <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder={t('superAdminPage.adminPasswordPlaceholder')} />
                  {errors.admin_password && <p className="text-xs text-destructive">{errors.admin_password}</p>}
                </div>
              </div>
            )}

            {errors.form && <p className="text-sm text-destructive mt-3">{errors.form}</p>}
          </div>

          {/* Rodapé fixo com botões estáveis */}
          <div className="px-6 py-4 border-t bg-muted/20 shrink-0 flex justify-between gap-2">
            {/* Navegação entre tabs */}
            <div className="flex gap-2">
              {tabs.indexOf(tabs.find((t) => t.id === activeTab)!) > 0 && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    const idx = tabs.findIndex((t) => t.id === activeTab)
                    setActiveTab(tabs[idx - 1].id)
                  }}
                >
                  {t('common.previous')}
                </Button>
              )}
              {tabs.indexOf(tabs.find((t) => t.id === activeTab)!) < tabs.length - 1 && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => {
                    const idx = tabs.findIndex((t) => t.id === activeTab)
                    setActiveTab(tabs[idx + 1].id)
                  }}
                >
                  {t('common.next')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmit} disabled={saveTenant.isPending}>
                {saveTenant.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editing ? t('superAdminPage.saveChanges') : t('superAdminPage.registerCompanyButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Utilizadores da Empresa ──────────────────────────── */}
      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {t('superAdminPage.tenantUsersDialogTitle', { tenant: selectedTenant?.name ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('superAdminPage.tenantUsersDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {copiedTenantPermissions ? (
              <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs">
                <ClipboardPaste className="h-3.5 w-3.5 text-primary" />
                <span>
                  {t('superAdminPage.permissionsCopied', {
                    name: copiedTenantPermissions.sourceUserName,
                    count: copiedTenantPermissions.permissions.length,
                  })}
                </span>
                <button
                  type="button"
                  aria-label={t('superAdminPage.clearCopiedPermissions')}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setCopiedTenantPermissions(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : <span />}
            <Button
              size="sm"
              onClick={() => {
                const defaultRole: UserForm['role'] = 'admin'
                const defaultPerms = tenantPermissionsQuery.data?.role_permissions?.[defaultRole] ?? []
                setUserForm({ ...emptyUserForm, role: defaultRole, permissions: defaultPerms })
                setUserTenantAccesses([])
                setUserErrors({})
                setUserDialogOpen(true)
              }}
            >
              <UserPlus className="mr-1.5 h-4 w-4" /> {t('superAdminPage.newUserButton')}
            </Button>
          </div>
          {loadingUsers ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">{t('superAdminPage.name')}</th>
                    <th className="px-3 py-2.5 font-medium">{t('superAdminPage.roleLabel')}</th>
                    <th className="px-3 py-2.5 font-medium">{t('superAdminPage.permissions')}</th>
                    <th className="px-3 py-2.5 font-medium">{t('superAdminPage.status')}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('superAdminPage.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(tenantUsers ?? []).map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-xs">
                            {t(`superAdminPage.roles.${r}`, { defaultValue: r })}
                          </Badge>
                        ))}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {t('superAdminPage.permissionsCountBadge', { count: (u.permissions ?? []).length })}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={u.is_active ? 'success' : 'secondary'}>
                          {u.is_active ? t('superAdminPage.active') : t('superAdminPage.inactive')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t('superAdminPage.copyPermissionsFor', { name: u.name })}
                            title={t('superAdminPage.copyPermissions')}
                            onClick={() => copyTenantUserPermissions(u)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t('superAdminPage.editRoleAndPermissions')}
                            aria-label={t('superAdminPage.editRoleAndPermissions')}
                            onClick={() => openTenantUserEdit(u)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                          {canSetUserPassword && (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={t('passwordReset.changePasswordFor', { name: u.name })}
                              title={t('passwordReset.changePassword')}
                              onClick={() => setPasswordTarget(u)}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            title={t('superAdminPage.deleteUser')}
                            aria-label={t('superAdminPage.deleteUser')}
                            disabled={deleteUser.isPending}
                            onClick={() => { if (window.confirm(t('superAdminPage.confirmDelete', { name: u.name }))) deleteUser.mutate({ userId: u.id }) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(tenantUsers ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">{t('superAdminPage.noUsersFound')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adicionar Utilizador Plataforma ───────────────────── */}
      <Dialog open={platformUserDialogOpen} onOpenChange={setPlatformUserDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {platformUserForm.role === 'super-admin'
                ? t('superAdminPage.dialogTitleFull', { defaultValue: 'Criar super-administrador total' })
                : t('superAdminPage.dialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {platformUserForm.role === 'super-admin'
                ? t('superAdminPage.dialogDescriptionFull', {
                    defaultValue: 'Este utilizador terá acesso total e irrestrito a toda a plataforma e a todas as empresas, igual ao seu perfil.',
                  })
                : t('superAdminPage.dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.name')} *</Label>
                <Input value={platformUserForm.name} onChange={(event) => setPlatformUserForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.email')} *</Label>
                <Input type="email" value={platformUserForm.email} onChange={(event) => setPlatformUserForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t('superAdminPage.initialPassword')} *</Label>
                <Input type="password" minLength={8} value={platformUserForm.password} onChange={(event) => setPlatformUserForm((current) => ({ ...current, password: event.target.value }))} />
              </div>
            </div>

            {isFullSuperAdmin && (
              <div className="space-y-2">
                <Label>{t('superAdminPage.platformRoleLabel', { defaultValue: 'Tipo de Super-Administrador' })}</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPlatformUserForm((current) => ({ ...current, role: 'super-admin' }))}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      platformUserForm.role === 'super-admin'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/40'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {t('superAdminPage.fullAdmin')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('superAdminPage.fullAdminRoleHint', {
                        defaultValue: 'Acesso total igual ao seu: todas as permissões da plataforma e todas as empresas.',
                      })}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlatformUserForm((current) => ({ ...current, role: 'super-admin-limited' }))}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      platformUserForm.role === 'super-admin-limited'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/40'
                    }`}
                  >
                    <p className="text-sm font-semibold">{t('superAdminPage.restrictedAdmin')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('superAdminPage.restrictedAdminRoleHint', {
                        defaultValue: 'Escolher exatamente quais ações, campos e empresas pode gerir.',
                      })}
                    </p>
                  </button>
                </div>
              </div>
            )}

            {platformUserForm.role === 'super-admin' ? (
              <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {t('superAdminPage.fullAdminBannerTitle', {
                      defaultValue: 'Super-administrador total (sem restrições)',
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('superAdminPage.fullAdminBannerBody', {
                      defaultValue: 'Recebe automaticamente todas as permissões do sistema (incluindo gestão da plataforma, criação de outros super-admins e acesso irrestrito a todas as empresas).',
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
                    <p className="text-xs text-muted-foreground">{t('superAdminPage.permissionsDescription')}</p>
                  </div>
                  <CopyPermissionsControls
                    users={platformUsersQuery.data?.users ?? []}
                    copied={copiedPlatformPermissions}
                    selectPlaceholder={t('superAdminPage.copyFromUser')}
                    pasteLabel={t('superAdminPage.pastePermissionsFrom', { name: copiedPlatformPermissions?.sourceUserName ?? '' })}
                    onSelectUser={(userId) => {
                      const source = (platformUsersQuery.data?.users ?? []).find((u) => u.id === userId)
                      if (!source) return
                      const next = normalizePlatformPermissions(source.permissions ?? [])
                      setPlatformUserForm((current) => ({ ...current, permissions: next }))
                      toast.success(t('superAdminPage.permissionsAppliedFrom', { name: source.name }))
                    }}
                    onPasteCopied={() => {
                      if (!copiedPlatformPermissions) return
                      const next = normalizePlatformPermissions(copiedPlatformPermissions.permissions)
                      setPlatformUserForm((current) => ({ ...current, permissions: next }))
                      toast.success(t('superAdminPage.permissionsAppliedFrom', { name: copiedPlatformPermissions.sourceUserName }))
                    }}
                  />
                  <PermissionSelector
                    permissions={platformPermissionList}
                    selectedPermissions={platformUserForm.permissions}
                    lockedPermissions={['view_any_tenant']}
                    onChange={(permissions) => setPlatformUserForm((current) => ({ ...current, permissions }))}
                  />
                </div>

                <TenantAccessScopeEditor
                  key={`create-platform-user-${platformUserDialogOpen}`}
                  tenants={scopeTenantsList}
                  permissionGroups={permissionGroupsList}
                  allPermissions={tenantPermissionList.length > 0 ? tenantPermissionList : normalizeTenantPermissions(platformPermissionList.map((p) => p.name)).map((name) => ({ name, group_name: platformPermissionList.find((p) => p.name === name)?.group_name ?? null }))}
                  accesses={platformUserAccesses}
                  onChange={setPlatformUserAccesses}
                  defaultRole="hr-manager"
                  basePermissions={normalizeTenantPermissions(platformUserForm.permissions)}
                />
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPlatformUserDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handlePlatformUserSubmit} disabled={createPlatformUser.isPending}>
                {createPlatformUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('superAdminPage.createUser')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingPlatformUser}
        onOpenChange={(open) => {
          if (!open) setEditingPlatformUser(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('superAdminPage.editDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('superAdminPage.editDialogDescription', { name: editingPlatformUser?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isFullSuperAdmin && (
              <div className="space-y-2">
                <Label>{t('superAdminPage.platformRoleLabel', { defaultValue: 'Tipo de Super-Administrador' })}</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setEditingPlatformUserRole('super-admin')}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      editingPlatformUserRole === 'super-admin'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/40'
                    }`}
                  >
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      {t('superAdminPage.fullAdmin')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('superAdminPage.fullAdminRoleHint', {
                        defaultValue: 'Acesso total igual ao seu: todas as permissões da plataforma e todas as empresas.',
                      })}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlatformUserRole('super-admin-limited')
                      setPlatformUserPermissions((prev) => normalizePlatformPermissions(prev))
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      editingPlatformUserRole === 'super-admin-limited'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background hover:bg-muted/40'
                    }`}
                  >
                    <p className="text-sm font-semibold">{t('superAdminPage.restrictedAdmin')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('superAdminPage.restrictedAdminRoleHint', {
                        defaultValue: 'Escolher exatamente quais ações, campos e empresas pode gerir.',
                      })}
                    </p>
                  </button>
                </div>
              </div>
            )}

            {editingPlatformUserRole === 'super-admin' ? (
              <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-sm">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {t('superAdminPage.fullAdminBannerTitle', {
                      defaultValue: 'Super-administrador total (sem restrições)',
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('superAdminPage.fullAdminBannerBody', {
                      defaultValue: 'Recebe automaticamente todas as permissões do sistema (incluindo gestão da plataforma, criação de outros super-admins e acesso irrestrito a todas as empresas).',
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
                  <p className="text-xs text-muted-foreground">{t('superAdminPage.permissionsDescription')}</p>
                  <CopyPermissionsControls
                    users={(platformUsersQuery.data?.users ?? []).filter((u) => u.id !== editingPlatformUser?.id)}
                    copied={copiedPlatformPermissions && copiedPlatformPermissions.sourceUserId !== editingPlatformUser?.id ? copiedPlatformPermissions : null}
                    selectPlaceholder={t('superAdminPage.copyFromUser')}
                    pasteLabel={t('superAdminPage.pastePermissionsFrom', { name: copiedPlatformPermissions?.sourceUserName ?? '' })}
                    onSelectUser={(userId) => {
                      const source = (platformUsersQuery.data?.users ?? []).find((u) => u.id === userId)
                      if (!source) return
                      const next = normalizePlatformPermissions(source.permissions ?? [])
                      setPlatformUserPermissions(next)
                      toast.success(t('superAdminPage.permissionsAppliedFrom', { name: source.name }))
                    }}
                    onPasteCopied={() => {
                      if (!copiedPlatformPermissions) return
                      const next = normalizePlatformPermissions(copiedPlatformPermissions.permissions)
                      setPlatformUserPermissions(next)
                      toast.success(t('superAdminPage.permissionsAppliedFrom', { name: copiedPlatformPermissions.sourceUserName }))
                    }}
                  />
                </div>

                <PermissionSelector
                  permissions={platformPermissionList}
                  selectedPermissions={platformUserPermissions}
                  lockedPermissions={['view_any_tenant']}
                  onChange={setPlatformUserPermissions}
                  maxHeightClass="max-h-[45vh]"
                />

                <TenantAccessScopeEditor
                  key={`edit-platform-user-${editingPlatformUser?.id ?? 'none'}`}
                  tenants={scopeTenantsList}
                  permissionGroups={permissionGroupsList}
                  allPermissions={tenantPermissionList.length > 0 ? tenantPermissionList : normalizeTenantPermissions(platformPermissionList.map((p) => p.name)).map((name) => ({ name, group_name: platformPermissionList.find((p) => p.name === name)?.group_name ?? null }))}
                  accesses={editingPlatformUserAccesses}
                  onChange={setEditingPlatformUserAccesses}
                  defaultRole="hr-manager"
                  basePermissions={normalizeTenantPermissions(platformUserPermissions)}
                />
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingPlatformUser(null)}>{t('common.cancel')}</Button>
              <Button onClick={handlePlatformUserPermissionsSubmit} disabled={updatePlatformUser.isPending}>
                {updatePlatformUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('superAdminPage.savePermissions')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t('superAdminPage.newTenantUserTitle', { tenant: selectedTenant?.name ?? '', defaultValue: `Novo utilizador — ${selectedTenant?.name ?? ''}` })}
            </DialogTitle>
            <DialogDescription>
              {t('superAdminPage.newTenantUserDescription', { defaultValue: 'Criar um novo utilizador e definir o papel, permissões e empresas/departamentos associados.' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.name')} *</Label>
                <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                {userErrors.name && <p className="text-xs text-destructive">{userErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.email')} *</Label>
                <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                {userErrors.email && <p className="text-xs text-destructive">{userErrors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.initialPassword')} *</Label>
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                {userErrors.password && <p className="text-xs text-destructive">{userErrors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.roleLabel', { defaultValue: 'Papel' })} *</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={userForm.role}
                  onChange={(e) => handleNewUserRoleChange(e.target.value as UserForm['role'])}
                >
                  <option value="admin">{t('superAdminPage.roles.admin')}</option>
                  <option value="hr-manager">{t('superAdminPage.roles.hr-manager')}</option>
                  <option value="manager">{t('superAdminPage.roles.manager')}</option>
                  <option value="employee">{t('superAdminPage.roles.employee')}</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('superAdminPage.selectedCount', { count: userForm.permissions.length, defaultValue: `${userForm.permissions.length} selecionadas` })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleNewUserRoleChange(userForm.role)}
                >
                  {t('superAdminPage.restoreRolePermissions', { defaultValue: 'Restaurar do papel' })}
                </Button>
              </div>
              <CopyPermissionsControls
                users={tenantUsers ?? []}
                copied={copiedTenantPermissions}
                selectPlaceholder={t('superAdminPage.copyFromUser')}
                pasteLabel={t('superAdminPage.pastePermissionsFrom', { name: copiedTenantPermissions?.sourceUserName ?? '' })}
                onSelectUser={(userId) => {
                  const source = (tenantUsers ?? []).find((u) => u.id === userId)
                  if (!source) return
                  const next = normalizeTenantPermissions(source.permissions ?? [])
                  setUserForm((current) => ({ ...current, permissions: next }))
                  toast.success(t('superAdminPage.permissionsAppliedFrom', { name: source.name }))
                }}
                onPasteCopied={() => {
                  if (!copiedTenantPermissions) return
                  const next = normalizeTenantPermissions(copiedTenantPermissions.permissions)
                  setUserForm((current) => ({ ...current, permissions: next }))
                  toast.success(t('superAdminPage.permissionsAppliedFrom', { name: copiedTenantPermissions.sourceUserName }))
                }}
              />
              <PermissionSelector
                permissions={tenantPermissionList}
                selectedPermissions={userForm.permissions}
                onChange={(permissions) => setUserForm((current) => ({ ...current, permissions }))}
                maxHeightClass="max-h-64"
              />
            </div>

            <TenantAccessScopeEditor
              tenants={scopeTenantsList}
              permissionGroups={permissionGroupsList}
              allPermissions={tenantPermissionList}
              accesses={userTenantAccesses}
              onChange={setUserTenantAccesses}
              defaultRole={userForm.role}
              basePermissions={userForm.permissions}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleUserSubmit} disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('superAdminPage.createUser')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Editar Papel & Permissões do Utilizador da Empresa ── */}
      <Dialog
        open={!!editingTenantUser}
        onOpenChange={(open) => {
          if (!open) setEditingTenantUser(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {t('superAdminPage.permissions')} — {editingTenantUser?.name}
            </DialogTitle>
            <DialogDescription>
              {t('superAdminPage.editTenantUserDescription', {
                email: editingTenantUser?.email ?? '',
                tenant: selectedTenant?.name ?? '',
                defaultValue: `Gerir papel, estado e permissões de ${editingTenantUser?.email ?? ''} em ${selectedTenant?.name ?? ''}.`,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.roleLabel', { defaultValue: 'Papel' })}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={tenantUserRole}
                  onChange={(e) => handleTenantUserRoleChange(e.target.value as UserForm['role'])}
                >
                  <option value="admin">{t('superAdminPage.roles.admin')}</option>
                  <option value="hr-manager">{t('superAdminPage.roles.hr-manager')}</option>
                  <option value="manager">{t('superAdminPage.roles.manager')}</option>
                  <option value="employee">{t('superAdminPage.roles.employee')}</option>
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tenantUserActive}
                    onChange={(e) => setTenantUserActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{t('superAdminPage.activeUser', { defaultValue: 'Utilizador ativo' })}</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('superAdminPage.selectedCount', { count: tenantUserPermissions.length, defaultValue: `${tenantUserPermissions.length} selecionadas` })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleTenantUserRoleChange(tenantUserRole)}
                >
                  {t('superAdminPage.applyRolePermissions', { defaultValue: 'Aplicar permissões do papel' })}
                </Button>
              </div>
              <CopyPermissionsControls
                users={(tenantUsers ?? []).filter((u) => u.id !== editingTenantUser?.id)}
                copied={copiedTenantPermissions && copiedTenantPermissions.sourceUserId !== editingTenantUser?.id ? copiedTenantPermissions : null}
                selectPlaceholder={t('superAdminPage.copyFromUser')}
                pasteLabel={t('superAdminPage.pastePermissionsFrom', { name: copiedTenantPermissions?.sourceUserName ?? '' })}
                onSelectUser={(userId) => {
                  const source = (tenantUsers ?? []).find((u) => u.id === userId)
                  if (!source) return
                  const next = normalizeTenantPermissions(source.permissions ?? [])
                  setTenantUserPermissions(next)
                  toast.success(t('superAdminPage.permissionsAppliedFrom', { name: source.name }))
                }}
                onPasteCopied={() => {
                  if (!copiedTenantPermissions) return
                  const next = normalizeTenantPermissions(copiedTenantPermissions.permissions)
                  setTenantUserPermissions(next)
                  toast.success(t('superAdminPage.permissionsAppliedFrom', { name: copiedTenantPermissions.sourceUserName }))
                }}
              />
              <PermissionSelector
                permissions={tenantPermissionList}
                selectedPermissions={tenantUserPermissions}
                onChange={setTenantUserPermissions}
                maxHeightClass="max-h-[45vh]"
              />
            </div>

            <TenantAccessScopeEditor
              tenants={scopeTenantsList}
              permissionGroups={permissionGroupsList}
              allPermissions={tenantPermissionList}
              accesses={editingTenantUserAccesses}
              onChange={setEditingTenantUserAccesses}
              defaultRole={tenantUserRole}
              basePermissions={tenantUserPermissions}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTenantUser(null)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => {
                  if (!editingTenantUser) return
                  updateTenantUser.mutate({
                    userId: editingTenantUser.id,
                    role: tenantUserRole,
                    is_active: tenantUserActive,
                    permissions: tenantUserPermissions,
                    tenant_accesses: editingTenantUserAccesses.map((a) => ({
                      ...a,
                      permissions: a.permissions === null ? null : normalizeTenantPermissions(a.permissions),
                    })),
                  })
                }}
                disabled={updateTenantUser.isPending}
              >
                {updateTenantUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('superAdminPage.savePermissions')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Criar / Editar Grupo de Permissões ───────────────── */}
      <Dialog open={permissionGroupDialogOpen} onOpenChange={setPermissionGroupDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingPermissionGroup
                ? t('superAdminPage.editPermissionGroup', { defaultValue: 'Editar grupo de permissões' })
                : t('superAdminPage.createPermissionGroup', { defaultValue: 'Novo grupo de permissões' })}
            </DialogTitle>
            <DialogDescription>
              {t('superAdminPage.permissionGroupModalDescription', {
                defaultValue: 'Defina as ações de módulo e permissões por campo que fazem parte deste grupo.',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('superAdminPage.name')} *</Label>
                <Input
                  value={permissionGroupForm.name}
                  onChange={(e) => setPermissionGroupForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('superAdminPage.permissionGroupNamePlaceholder', { defaultValue: 'Ex: Operador Folha Sem Salários' })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('common.description', { defaultValue: 'Descrição' })}</Label>
                <Input
                  value={permissionGroupForm.description}
                  onChange={(e) => setPermissionGroupForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            <PermissionSelector
              permissions={tenantPermissionList}
              selectedPermissions={permissionGroupForm.permissions}
              onChange={(permissions) => setPermissionGroupForm((prev) => ({ ...prev, permissions }))}
              maxHeightClass="max-h-[50vh]"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPermissionGroupDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button
                disabled={!permissionGroupForm.name.trim() || permissionGroupForm.permissions.length === 0 || savePermissionGroup.isPending}
                onClick={() => savePermissionGroup.mutate({
                  id: editingPermissionGroup?.id,
                  name: permissionGroupForm.name.trim(),
                  description: permissionGroupForm.description.trim(),
                  permissions: permissionGroupForm.permissions,
                })}
              >
                {savePermissionGroup.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('superAdminPage.savePermissions')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!passwordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null)
            setNewPassword('')
            setPasswordConfirmation('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('passwordReset.changePassword')}</DialogTitle>
            <DialogDescription>
              {t('passwordReset.adminChangeDescription', { name: passwordTarget?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-new-password">{t('passwordReset.newPassword')}</Label>
              <Input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-confirm-password">{t('passwordReset.confirmPassword')}</Label>
              <Input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPasswordTarget(null)
                  setNewPassword('')
                  setPasswordConfirmation('')
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                disabled={updateUserPassword.isPending || newPassword.length < 8 || newPassword !== passwordConfirmation}
                onClick={() => {
                  if (passwordTarget) {
                    updateUserPassword.mutate({
                      userId: passwordTarget.id,
                      password: newPassword,
                      password_confirmation: passwordConfirmation,
                    })
                  }
                }}
              >
                {updateUserPassword.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('passwordReset.savePassword')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CompanyDossierModal
        tenants={scopeTenantsList}
        initialTenantId={dossierTenantId}
        open={dossierTenantId != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDossierTenantId(null)
        }}
      />
    </div>
  )
}
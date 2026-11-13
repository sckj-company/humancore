import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
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
import type { Paginated, Tenant } from '@/types'

// ── Constantes Angola ─────────────────────────────────────────────────────────

const ANGOLA_PROVINCES = [
  'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando Cubango',
  'Cuanza Norte', 'Cuanza Sul', 'Cunene', 'Huambo', 'Huíla',
  'Luanda', 'Lunda Norte', 'Lunda Sul', 'Malanje', 'Moxico',
  'Namibe', 'Uíge', 'Zaire',
]

const LEGAL_ENTITY_TYPES = [
  { value: 'lda', label: 'Sociedade por Quotas (Lda.)' },
  { value: 'sa', label: 'Sociedade Anónima (S.A.)' },
  { value: 'unipessoal', label: 'Sociedade Unipessoal' },
  { value: 'em', label: 'Empresa em Nome Individual' },
  { value: 'cooperativa', label: 'Cooperativa' },
  { value: 'epe', label: 'Empresa Pública (E.P.E.)' },
  { value: 'ong', label: 'ONG / Associação' },
  { value: 'outro', label: 'Outro' },
]

const ECONOMIC_SECTORS = [
  'Agricultura e Pecuária',
  'Pesca',
  'Mineração e Recursos Naturais',
  'Petróleo e Gás',
  'Indústria Transformadora',
  'Construção Civil',
  'Comércio e Distribuição',
  'Transportes e Logística',
  'Tecnologia e Telecomunicações',
  'Serviços Financeiros e Banca',
  'Saúde',
  'Educação',
  'Hotelaria e Turismo',
  'Serviços Gerais',
  'Administração Pública',
  'Outro',
]

const STATUS_VARIANT = { active: 'success', inactive: 'secondary', suspended: 'warning' } as const

// ── Schema de validação ───────────────────────────────────────────────────────

const tenantSchema = z.object({
  // Identificação
  name: z.string().min(2, 'Nome é obrigatório'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug inválido (minúsculas, números, hífens)'),
  legal_entity_type: z.string().optional().or(z.literal('')),
  tax_id: z.string().optional().or(z.literal('')),          // NIF angolano
  inss_number: z.string().optional().or(z.literal('')),     // Nº INSS
  economic_sector: z.string().optional().or(z.literal('')),

  // Contactos
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  website: z.string().url('URL inválido').optional().or(z.literal('')),

  // Morada
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  province: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  postal_code: z.string().optional().or(z.literal('')),

  // Configurações
  currency: z.string().length(3).optional().or(z.literal('')),
  locale: z.string().optional().or(z.literal('')),
  timezone: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),

  // Admin inicial
  admin_name: z.string().optional().or(z.literal('')),
  admin_email: z.string().email('Email inválido').optional().or(z.literal('')),
  admin_password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
})

type TenantForm = z.infer<typeof tenantSchema>

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

interface TenantUser {
  id: number
  name: string
  email: string
  is_active: boolean
  roles: string[]
  permissions?: string[]
  direct_permissions?: string[]
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
  permissions: string[]
}

const emptyPlatformUser: NewPlatformUser = {
  name: '',
  email: '',
  password: '',
  permissions: ['view_any_tenant'],
}

function togglePermissionGroup(
  currentPermissions: string[],
  groupPermissions: PlatformPermission[],
  selected: boolean,
): string[] {
  const permissions = new Set(currentPermissions)
  for (const { name } of groupPermissions) {
    if (name === 'view_any_tenant') continue
    if (selected) permissions.add(name)
    else permissions.delete(name)
  }
  permissions.add('view_any_tenant')
  return [...permissions]
}

const userSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['admin', 'hr-manager', 'manager', 'employee']),
  permissions: z.array(z.string()).default([]),
})
type UserForm = z.infer<typeof userSchema>
const emptyUserForm: UserForm = { name: '', email: '', password: '', role: 'admin', permissions: [] }

function toggleTenantPermissionGroup(
  currentPermissions: string[],
  groupPermissions: PlatformPermission[],
  selected: boolean,
): string[] {
  const permissions = new Set(currentPermissions)
  for (const { name } of groupPermissions) {
    if (selected) permissions.add(name)
    else permissions.delete(name)
  }
  return [...permissions]
}

// ── Componente principal ──────────────────────────────────────────────────────

export function SuperAdminPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const currentUser = useAuthStore((state) => state.user)
  const canManagePlatformUsers = currentUser?.roles.includes('super-admin') || hasPermission(currentUser, 'manage_super_admins')
  const canCreateTenant = hasPermission(currentUser, 'create_tenant')
  const canUpdateTenant = hasPermission(currentUser, 'update_tenant')
  const canDeleteTenant = hasPermission(currentUser, 'delete_tenant')
  const canViewTenantUsers = canUpdateTenant && hasPermission(currentUser, 'view_tenant')
  const canSetUserPassword = currentUser?.roles.includes('super-admin') ?? false
  const getPermissionLabel = (name: string) => {
    const globalLabel = t(`superAdminPage.permissionLabels.${name}`, { defaultValue: '' }).trim()
    if (globalLabel) return globalLabel

    const action = ['force_delete', 'view_any', 'view', 'create', 'update', 'delete', 'restore', 'approve', 'reject', 'process', 'close', 'export', 'print', 'configure']
      .find((candidate) => name.startsWith(`${candidate}_`))
    const resource = action ? name.slice(action.length + 1) : ''
    const normalizedResource = resource.replaceAll('_', '-')
    const resourceForm = action === 'view_any' ? 'plural' : 'singular'
    const resourceLabel = normalizedResource
      ? t(`superAdminPage.permissionResources.${normalizedResource}.${resourceForm}`, { defaultValue: '' }).trim()
      : ''
    if (!action || !resourceLabel) {
      return t('superAdminPage.permissionFallback', { name, defaultValue: name })
    }

    const label = t(`superAdminPage.permissionActions.${action}`, {
      resource: resourceLabel,
      defaultValue: '',
    }).trim()
    return label || t('superAdminPage.permissionFallback', { name, defaultValue: name })
  }
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [form, setForm] = useState<TenantForm>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'info' | 'address' | 'config' | 'admin'>('info')

  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [usersDialogOpen, setUsersDialogOpen] = useState(false)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm)
  const [userErrors, setUserErrors] = useState<Record<string, string>>({})
  const [editingTenantUser, setEditingTenantUser] = useState<TenantUser | null>(null)
  const [tenantUserRole, setTenantUserRole] = useState<UserForm['role']>('employee')
  const [tenantUserActive, setTenantUserActive] = useState(true)
  const [tenantUserPermissions, setTenantUserPermissions] = useState<string[]>([])
  const [platformUserDialogOpen, setPlatformUserDialogOpen] = useState(false)
  const [platformUserForm, setPlatformUserForm] = useState<NewPlatformUser>(emptyPlatformUser)
  const [editingPlatformUser, setEditingPlatformUser] = useState<PlatformUser | null>(null)
  const [platformUserPermissions, setPlatformUserPermissions] = useState<string[]>([])
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')

  const dashboardQuery = useQuery<SuperAdminDashboardData>({
    queryKey: ['superadmin', 'dashboard'],
    queryFn: () => api.get<SuperAdminDashboardData>('superadmin/dashboard'),
  })

  const { data: tenants, isLoading: loadingTenants } = useQuery({
    queryKey: ['superadmin', 'tenants', search, statusFilter],
    queryFn: () =>
      api.get<Paginated<Tenant>>('superadmin/tenants', {
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        per_page: 20,
      }),
  })

  const { data: tenantUsers, isLoading: loadingUsers } = useQuery({
    queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'],
    queryFn: () => api.get<TenantUser[]>(`superadmin/tenants/${selectedTenant!.id}/users`),
    enabled: !!selectedTenant,
  })

  const tenantPermissionsQuery = useQuery<TenantPermissionsResponse>({
    queryKey: ['superadmin', 'tenant-permissions'],
    queryFn: () => api.get<TenantPermissionsResponse>('superadmin/tenant-permissions'),
    enabled: usersDialogOpen || userDialogOpen || !!editingTenantUser,
  })

  const platformUsersQuery = useQuery({
    queryKey: ['superadmin', 'platform-users'],
    queryFn: () => api.get<PlatformUsersResponse>('superadmin/platform-users'),
    enabled: canManagePlatformUsers,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['superadmin'] })
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
      toast.success(editing ? 'Empresa atualizada com sucesso' : 'Empresa criada com sucesso')
      setDialogOpen(false)
      invalidate()
    },
    onError: (e) => {
      const msg = getApiErrorMessage(e, 'Erro ao guardar empresa')
      setErrors({ form: msg })
      toast.error(msg)
    },
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Tenant['status'] }) =>
      api.put<Tenant>(`superadmin/tenants/${id}`, { status }),
    onSuccess: () => { toast.success('Estado atualizado'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
  })

  const deleteTenant = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/tenants/${id}`),
    onSuccess: () => { toast.success('Empresa eliminada'); invalidate() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar empresa')),
  })

  const createUser = useMutation({
    mutationFn: (data: UserForm) =>
      api.post<TenantUser>(`superadmin/tenants/${selectedTenant!.id}/users`, data),
    onSuccess: () => {
      toast.success('Utilizador criado com sucesso')
      setUserDialogOpen(false)
      setUserForm(emptyUserForm)
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao criar utilizador')),
  })

  const updateTenantUser = useMutation({
    mutationFn: ({ userId, role, is_active, permissions }: { userId: number; role: UserForm['role']; is_active: boolean; permissions: string[] }) =>
      api.put<TenantUser>(`superadmin/tenants/${selectedTenant!.id}/users/${userId}`, { role, is_active, permissions }),
    onSuccess: () => {
      toast.success('Utilizador e permissões atualizados com sucesso')
      setEditingTenantUser(null)
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atualizar utilizador')),
  })

  const deleteUser = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      api.delete(`superadmin/tenants/${selectedTenant!.id}/users/${userId}`),
    onSuccess: () => {
      toast.success('Utilizador eliminado')
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
  })

  const updateUserPassword = useMutation({
    mutationFn: ({ userId, password, password_confirmation }: { userId: number; password: string; password_confirmation: string }) =>
      api.put(`superadmin/users/${userId}/password`, { password, password_confirmation }),
    onSuccess: () => {
      toast.success('Palavra-passe atualizada com sucesso')
      setPasswordTarget(null)
      setNewPassword('')
      setPasswordConfirmation('')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Erro ao atualizar palavra-passe')),
  })

  const createPlatformUser = useMutation({
    mutationFn: (data: NewPlatformUser) => api.post<PlatformUser>('superadmin/platform-users', data),
    onSuccess: () => {
      toast.success(t('superAdminPage.created'))
      setPlatformUserDialogOpen(false)
      setPlatformUserForm(emptyPlatformUser)
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.createError'))),
  })

  const updatePlatformUser = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      api.put<PlatformUser>(`superadmin/platform-users/${id}`, { permissions }),
    onSuccess: () => {
      toast.success(t('superAdminPage.permissionsUpdated'))
      setEditingPlatformUser(null)
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.updateError'))),
  })

  const deletePlatformUser = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/platform-users/${id}`),
    onSuccess: () => {
      toast.success(t('superAdminPage.deleted'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'platform-users'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('superAdminPage.deleteError'))),
  })

  const handleSubmit = () => {
    const parsed = tenantSchema.safeParse(form)
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
    const parsed = userSchema.safeParse(userForm)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message })
      setUserErrors(errs)
      return
    }
    setUserErrors({})
    createUser.mutate(parsed.data)
  }

  const handlePlatformUserSubmit = () => {
    if (!platformUserForm.name.trim() || !platformUserForm.email.trim() || platformUserForm.password.length < 8) {
      toast.error(t('superAdminPage.requiredFields'))
      return
    }
    if (!platformUserForm.permissions.includes('view_any_tenant')) {
      toast.error(t('superAdminPage.tenantPermissionRequired'))
      return
    }
    createPlatformUser.mutate(platformUserForm)
  }

  const openPlatformUserEdit = (user: PlatformUser) => {
    setEditingPlatformUser(user)
    setPlatformUserPermissions([...user.permissions])
  }

  const handlePlatformUserPermissionsSubmit = () => {
    if (!editingPlatformUser) return
    if (!platformUserPermissions.includes('view_any_tenant')) {
      toast.error(t('superAdminPage.tenantPermissionRequired'))
      return
    }
    updatePlatformUser.mutate({ id: editingPlatformUser.id, permissions: platformUserPermissions })
  }

  const openTenantUserEdit = (u: TenantUser) => {
    const currentRole = (u.roles[0] as UserForm['role']) ?? 'employee'
    setEditingTenantUser(u)
    setTenantUserRole(currentRole)
    setTenantUserActive(u.is_active)
    setTenantUserPermissions([...(u.permissions ?? [])])
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

  const tenantPermissionGroups = (tenantPermissionsQuery.data?.permissions ?? []).reduce<Record<string, PlatformPermission[]>>(
    (groups, permission) => {
      const group = permission.group_name ?? 'outros'
      groups[group] ??= []
      groups[group].push(permission)
      return groups
    },
    {},
  )

  const dashboardData = dashboardQuery.data
  const trendOption: EChartsOption = useMemo(() => {
    const labels = (dashboardData?.tenant_trend ?? []).map((d) => d.label)
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
          name: 'Empresas',
          type: 'bar',
          barWidth: '45%',
          data: values,
          itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
        },
      ],
    }
  }, [dashboardData])

  const statusOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)' },
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11, color: 'var(--muted-foreground)' },
      itemWidth: 8,
      itemHeight: 8,
    },
    color: ['#10b981', '#94a3b8', '#ef4444'],
    series: [
      {
        name: 'Estado',
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 4, borderColor: 'var(--card)', borderWidth: 2 },
        label: { show: false },
        data: Object.entries(dashboardData?.by_status ?? {}).map(([k, v]) => ({
          name: k === 'active' ? 'Ativas' : k === 'suspended' ? 'Suspensas' : 'Inativas',
          value: v,
        })),
      },
    ],
  }), [dashboardData])

  const platformPermissionGroups = (platformUsersQuery.data?.permissions ?? []).reduce<Record<string, PlatformPermission[]>>(
    (groups, permission) => {
      const group = permission.group_name ?? 'outros'
      groups[group] ??= []
      groups[group].push(permission)
      return groups
    },
    {},
  )

  const tabs = [
    { id: 'info' as const, label: 'Identificação' },
    { id: 'address' as const, label: 'Localização' },
    { id: 'config' as const, label: 'Configurações' },
    ...(!editing ? [{ id: 'admin' as const, label: 'Admin Inicial' }] : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SUPER ADMIN"
        title="Gestão de Empresas & Painel Global"
        description="Monitorize a plataforma, gira empresas (tenants), utilizadores e permissões"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManagePlatformUsers && (
              <Button size="sm" variant="outline" onClick={() => setPlatformUserDialogOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                {t('superAdminPage.createButton')}
              </Button>
            )}
            {canCreateTenant && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nova empresa
              </Button>
            )}
          </div>
        }
      />

      {/* ── Dashboard do Super Admin ─────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={`Total de Empresas (${dashboardData?.kpis.active_tenants ?? 0} ativas)`}
          value={dashboardData?.kpis.total_tenants ?? tenants?.meta?.total ?? 0}
          icon={Building2}
          accent="primary"
        />
        <KpiCard
          label={`Funcionários (${dashboardData?.kpis.active_employees ?? 0} ativos)`}
          value={dashboardData?.kpis.total_employees ?? 0}
          icon={Users}
          accent="success"
        />
        <KpiCard
          label={`Utilizadores (${dashboardData?.kpis.super_admins ?? 0} super-admins)`}
          value={dashboardData?.kpis.total_users ?? 0}
          icon={UserCog}
          accent="info"
        />
        <KpiCard
          label="Empresas Suspensas"
          value={dashboardData?.kpis.suspended_tenants ?? 0}
          icon={AlertTriangle}
          accent={(dashboardData?.kpis.suspended_tenants ?? 0) > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {dashboardData && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Crescimento de Empresas (12 meses)
              </CardTitle>
              <CardDescription>Novas empresas registadas por mês</CardDescription>
            </CardHeader>
            <CardContent>
              <Chart option={trendOption} className="h-[220px]" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="h-4 w-4 text-primary" />
                Estado & Porte
              </CardTitle>
              <CardDescription>Distribuição atual das empresas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Chart option={statusOption} className="h-[155px]" />
              <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Pequenas</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.small}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Médias</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.medium}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Grandes</p>
                  <p className="font-semibold tabular-nums">{dashboardData.segments.large}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Abas de Gestão ───────────────────────────────────────────── */}
      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tenants" className="gap-2">
            <Building2 className="h-4 w-4" />
            Empresas registadas
          </TabsTrigger>
          {canManagePlatformUsers && (
            <TabsTrigger value="platform-users" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              {t('superAdminPage.title')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tenants">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Empresas registadas</CardTitle>
                <CardDescription>Selecione uma empresa para abrir o painel operacional ou gerir os seus utilizadores e permissões</CardDescription>
              </div>
              {canCreateTenant && (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nova empresa
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
                    placeholder="Pesquisar por nome, NIF ou email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm sm:w-44"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos os estados</option>
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                  <option value="suspended">Suspensa</option>
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
                        <th className="px-3 py-2.5 font-medium">Empresa</th>
                        <th className="px-3 py-2.5 font-medium">NIF</th>
                        <th className="px-3 py-2.5 font-medium">Localização</th>
                        <th className="px-3 py-2.5 font-medium">Estado</th>
                        <th className="px-3 py-2.5 font-medium">Funcionários</th>
                        <th className="px-3 py-2.5 font-medium">Departamentos</th>
                        <th className="px-3 py-2.5 font-medium">Criada em</th>
                        <th className="px-3 py-2.5 text-right font-medium">Ações</th>
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
                              {tenantItem.status === 'active' ? 'Ativa' : tenantItem.status === 'suspended' ? 'Suspensa' : 'Inativa'}
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
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {tenantItem.created_at ? new Date(tenantItem.created_at).toLocaleDateString('pt') : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Abrir painel desta empresa"
                                onClick={() => {
                                  localStorage.setItem('hrms_selected_tenant', String(tenantItem.id))
                                  navigate('/')
                                  window.location.reload()
                                }}
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                              {canViewTenantUsers && (
                                <Button size="sm" variant="ghost" title="Gerir utilizadores e permissões" onClick={() => openUsers(tenantItem)}>
                                  <Users className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canUpdateTenant && (
                                <>
                                  <Button size="sm" variant="ghost" title="Editar empresa" onClick={() => openEdit(tenantItem)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    title={tenantItem.status === 'suspended' ? 'Reativar empresa' : 'Suspender empresa'}
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
                                  disabled={deleteTenant.isPending}
                                  onClick={() => { if (window.confirm(`Eliminar a empresa "${tenantItem.name}"?`)) deleteTenant.mutate(tenantItem.id) }}
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
                          <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                            Nenhuma empresa encontrada.
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

        {canManagePlatformUsers && (
          <TabsContent value="platform-users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{t('superAdminPage.title')}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{t('superAdminPage.description')}</p>
                </div>
                <Button size="sm" onClick={() => setPlatformUserDialogOpen(true)}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  {t('superAdminPage.createButton')}
                </Button>
              </CardHeader>
              <CardContent>
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
                                {platformUser.roles.includes('super-admin-limited') && platformUser.id !== currentUser?.id && (
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
      </Tabs>

      {/* ── Dialog: Criar / Editar Empresa ──────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] w-[95vw] h-[700px] max-h-[92vh] flex flex-col p-0 overflow-hidden gap-0">
          {/* Header fixo */}
          <div className="px-6 pt-6 pb-3 border-b bg-background shrink-0">
            <DialogHeader className="mb-3">
              <DialogTitle className="text-lg">{editing ? 'Editar empresa' : 'Registar nova empresa'}</DialogTitle>
              <DialogDescription className="text-xs">
                {editing
                  ? 'Atualize os dados de registo da empresa.'
                  : 'Preencha os dados para registar uma nova empresa na plataforma.'}
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
                    <Label>Nome da empresa *</Label>
                    <Input
                      placeholder="Ex: Empresa Exemplo, Lda."
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
                    <Label>Slug (identificador único) *</Label>
                    <Input
                      placeholder="ex: empresa-exemplo"
                      value={form.slug}
                      disabled={!!editing}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    />
                    {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Tipo de pessoa jurídica</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.legal_entity_type}
                      onChange={(e) => setForm({ ...form, legal_entity_type: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {LEGAL_ENTITY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sector de actividade</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.economic_sector}
                      onChange={(e) => setForm({ ...form, economic_sector: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {ECONOMIC_SECTORS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      NIF (Nº de Identificação Fiscal)
                    </Label>
                    <Input
                      placeholder="Ex: 5000012345"
                      value={form.tax_id}
                      onChange={(e) => setForm({ ...form, tax_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    />
                    <p className="text-[10px] text-muted-foreground">10 dígitos numéricos (AGT Angola)</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      Nº INSS
                    </Label>
                    <Input
                      placeholder="Ex: 123456789"
                      value={form.inss_number}
                      onChange={(e) => setForm({ ...form, inss_number: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground">Nº de inscrição no INSS</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Email
                    </Label>
                    <Input type="email" placeholder="geral@empresa.ao" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Telefone
                    </Label>
                    <Input placeholder="+244 222 000 000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Website</Label>
                    <Input placeholder="https://empresa.ao" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    {errors.website && <p className="text-xs text-destructive">{errors.website}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Estado da empresa</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as Tenant['status'] })}
                    >
                      <option value="active">Ativa</option>
                      <option value="inactive">Inativa</option>
                      <option value="suspended">Suspensa</option>
                    </select>
                  </div>
                </div>

                {!editing && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5 text-primary" />
                    Utilize as abas acima para configurar a localização, moeda e administrador inicial.
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
                    Endereço
                  </Label>
                  <Input placeholder="Rua, Nº, Bairro" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Município / Cidade</Label>
                    <Input placeholder="Ex: Luanda, Talatona" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Código Postal</Label>
                    <Input placeholder="Ex: 1104" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Província</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.province}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                    >
                      <option value="">Selecione a província...</option>
                      {ANGOLA_PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>País</Label>
                    <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Registo Geográfico em Angola</p>
                  <p>As 18 províncias e respectivos municípios seguem a divisão político-administrativa da República de Angola.</p>
                </div>
              </div>
            )}

            {/* ── Tab: Configurações ──────────────────────────────── */}
            {activeTab === 'config' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Moeda</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    >
                      <option value="AOA">AOA — Kwanza angolano</option>
                      <option value="USD">USD — Dólar americano</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="ZAR">ZAR — Rand sul-africano</option>
                      <option value="CNY">CNY — Yuan chinês</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Idioma (Locale)</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.locale}
                      onChange={(e) => setForm({ ...form, locale: e.target.value })}
                    >
                      <option value="pt">Português</option>
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fuso horário</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={form.timezone}
                      onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    >
                      <option value="Africa/Luanda">África/Luanda (WAT +01:00)</option>
                      <option value="Africa/Johannesburg">África/Joanesburgo (SAST +02:00)</option>
                      <option value="Africa/Nairobi">África/Nairobi (EAT +03:00)</option>
                      <option value="UTC">UTC +00:00</option>
                      <option value="Europe/Lisbon">Europa/Lisboa (WET)</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground space-y-1.5">
                  <p className="font-medium text-foreground">Padrão de Configuração Fiscal em Angola</p>
                  <p>• Moeda oficial: Kwanza (AOA)</p>
                  <p>• Fuso horário: Horário da África Ocidental (WAT, UTC+1)</p>
                  <p>• O ano fiscal em Angola coincide com o ano civil (01 de Janeiro a 31 de Dezembro).</p>
                </div>
              </div>
            )}

            {/* ── Tab: Admin Inicial (apenas criação) ─────────────── */}
            {activeTab === 'admin' && !editing && (
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                  Crie o primeiro utilizador administrador com acesso total a esta empresa. Se optar por não preencher agora, poderá criar e associar utilizadores posteriormente.
                </div>
                <div className="space-y-1.5">
                  <Label>Nome do administrador</Label>
                  <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} placeholder="Ex: João Silva" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email do administrador</Label>
                  <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} placeholder="admin@empresa.ao" />
                  {errors.admin_email && <p className="text-xs text-destructive">{errors.admin_email}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Palavra-passe</Label>
                  <Input type="password" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} placeholder="Mínimo 8 caracteres" />
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
                  Anterior
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
                  Próximo
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={saveTenant.isPending}>
                {saveTenant.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editing ? 'Guardar alterações' : 'Registar empresa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Utilizadores da Empresa ──────────────────────────── */}
      <Dialog open={usersDialogOpen} onOpenChange={setUsersDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Utilizadores — {selectedTenant?.name}
            </DialogTitle>
            <DialogDescription>Gerir os utilizadores, papéis e permissões desta empresa.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                const defaultRole: UserForm['role'] = 'admin'
                const defaultPerms = tenantPermissionsQuery.data?.role_permissions?.[defaultRole] ?? []
                setUserForm({ ...emptyUserForm, role: defaultRole, permissions: defaultPerms })
                setUserErrors({})
                setUserDialogOpen(true)
              }}
            >
              <UserPlus className="mr-1.5 h-4 w-4" /> Novo utilizador
            </Button>
          </div>
          {loadingUsers ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Nome</th>
                    <th className="px-3 py-2.5 font-medium">Papel</th>
                    <th className="px-3 py-2.5 font-medium">Permissões</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ações</th>
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
                        {u.roles.map((r) => <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-xs">
                          {(u.permissions ?? []).length} permissões
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={u.is_active ? 'success' : 'secondary'}>{u.is_active ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Editar papel e permissões"
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
                            disabled={deleteUser.isPending}
                            onClick={() => { if (window.confirm(`Eliminar utilizador "${u.name}"?`)) deleteUser.mutate({ userId: u.id }) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(tenantUsers ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nenhum utilizador encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adicionar Utilizador ─────────────────────────────── */}
      <Dialog open={platformUserDialogOpen} onOpenChange={setPlatformUserDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('superAdminPage.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('superAdminPage.dialogDescription')}
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
            <div className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
                <p className="text-xs text-muted-foreground">{t('superAdminPage.permissionsDescription')}</p>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
                {Object.entries(platformPermissionGroups).map(([group, permissions]) => (
                  <div key={group} className="flex items-start gap-3 rounded border border-border/70 px-3 py-2">
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t(`superAdminPage.permissionGroups.${group}`, { defaultValue: t('superAdminPage.otherPermissions') })}{' '}
                        <span className="text-xs font-normal text-muted-foreground">({permissions.length})</span>
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {permissions.map((permission) => {
                          const checked = platformUserForm.permissions.includes(permission.name)
                          const required = permission.name === 'view_any_tenant'
                          return (
                            <label key={permission.name} className="flex items-start gap-2 text-xs">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                disabled={required}
                                onChange={(event) => setPlatformUserForm((current) => ({
                                  ...current,
                                  permissions: event.target.checked
                                    ? [...current.permissions, permission.name]
                                    : current.permissions.filter((name) => name !== permission.name),
                                }))}
                              />
                              <span>{getPermissionLabel(permission.name)}{required ? ` (${t('superAdminPage.required')})` : ''}</span>
                            </label>
                          )
                        })}
                      </div>
                    </details>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={permissions.every(({ name }) => platformUserForm.permissions.includes(name))}
                        onChange={(event) => setPlatformUserForm((current) => ({
                          ...current,
                          permissions: togglePermissionGroup(current.permissions, permissions, event.target.checked),
                        }))}
                      />
                      {t('superAdminPage.selectAllGroup')}
                    </label>
                  </div>
                ))}
              </div>
            </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('superAdminPage.editDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('superAdminPage.editDialogDescription', { name: editingPlatformUser?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('superAdminPage.permissions')}</h3>
              <p className="text-xs text-muted-foreground">{t('superAdminPage.permissionsDescription')}</p>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-md border p-3">
              {Object.entries(platformPermissionGroups).map(([group, permissions]) => (
                <div key={group} className="flex items-start gap-3 rounded border border-border/70 px-3 py-2">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t(`superAdminPage.permissionGroups.${group}`, { defaultValue: t('superAdminPage.otherPermissions') })}{' '}
                      <span className="text-xs font-normal text-muted-foreground">({permissions.length})</span>
                    </summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {permissions.map((permission) => {
                        const checked = platformUserPermissions.includes(permission.name)
                        const required = permission.name === 'view_any_tenant'
                        return (
                          <label key={permission.name} className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={checked}
                              disabled={required}
                              onChange={(event) => setPlatformUserPermissions((current) => (
                                event.target.checked
                                  ? [...current, permission.name]
                                  : current.filter((name) => name !== permission.name)
                              ))}
                            />
                            <span>{getPermissionLabel(permission.name)}{required ? ` (${t('superAdminPage.required')})` : ''}</span>
                          </label>
                        )
                      })}
                    </div>
                  </details>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={permissions.every(({ name }) => platformUserPermissions.includes(name))}
                      onChange={(event) => setPlatformUserPermissions((current) => (
                        togglePermissionGroup(current, permissions, event.target.checked)
                      ))}
                    />
                    {t('superAdminPage.selectAllGroup')}
                  </label>
                </div>
              ))}
            </div>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo utilizador — {selectedTenant?.name}</DialogTitle>
            <DialogDescription>Criar um novo utilizador e definir o papel e permissões para esta empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                {userErrors.name && <p className="text-xs text-destructive">{userErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                {userErrors.email && <p className="text-xs text-destructive">{userErrors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Palavra-passe *</Label>
                <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                {userErrors.password && <p className="text-xs text-destructive">{userErrors.password}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Papel *</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={userForm.role}
                  onChange={(e) => handleNewUserRoleChange(e.target.value as UserForm['role'])}
                >
                  <option value="admin">Admin</option>
                  <option value="hr-manager">HR Manager</option>
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Permissões</h3>
                  <p className="text-xs text-muted-foreground">
                    Pré-selecionadas pelo papel; pode personalizar livremente ({userForm.permissions.length} selecionadas).
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleNewUserRoleChange(userForm.role)}
                >
                  Restaurar do papel
                </Button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                {Object.entries(tenantPermissionGroups).map(([group, permissions]) => (
                  <div key={group} className="flex items-start gap-3 rounded border border-border/70 px-3 py-2">
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t(`superAdminPage.permissionGroups.${group}`, { defaultValue: group })}{' '}
                        <span className="text-xs font-normal text-muted-foreground">({permissions.length})</span>
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {permissions.map((permission) => (
                          <label key={permission.name} className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={userForm.permissions.includes(permission.name)}
                              onChange={(event) => setUserForm((current) => ({
                                ...current,
                                permissions: event.target.checked
                                  ? [...current.permissions, permission.name]
                                  : current.permissions.filter((name) => name !== permission.name),
                              }))}
                            />
                            <span>{getPermissionLabel(permission.name)}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={permissions.every(({ name }) => userForm.permissions.includes(name))}
                        onChange={(event) => setUserForm((current) => ({
                          ...current,
                          permissions: toggleTenantPermissionGroup(current.permissions, permissions, event.target.checked),
                        }))}
                      />
                      {t('superAdminPage.selectAllGroup')}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleUserSubmit} disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Criar utilizador
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Permissões — {editingTenantUser?.name}
            </DialogTitle>
            <DialogDescription>
              Gerir papel, estado e permissões de {editingTenantUser?.email} em {selectedTenant?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={tenantUserRole}
                  onChange={(e) => handleTenantUserRoleChange(e.target.value as UserForm['role'])}
                >
                  <option value="admin">Admin</option>
                  <option value="hr-manager">HR Manager</option>
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
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
                  Utilizador ativo
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Permissões</h3>
                  <p className="text-xs text-muted-foreground">
                    {tenantUserPermissions.length} permissões selecionadas
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleTenantUserRoleChange(tenantUserRole)}
                >
                  Aplicar permissões do papel
                </Button>
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-md border p-3">
                {Object.entries(tenantPermissionGroups).map(([group, permissions]) => (
                  <div key={group} className="flex items-start gap-3 rounded border border-border/70 px-3 py-2">
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm font-medium">
                        {t(`superAdminPage.permissionGroups.${group}`, { defaultValue: group })}{' '}
                        <span className="text-xs font-normal text-muted-foreground">({permissions.length})</span>
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {permissions.map((permission) => (
                          <label key={permission.name} className="flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={tenantUserPermissions.includes(permission.name)}
                              onChange={(event) => setTenantUserPermissions((current) => (
                                event.target.checked
                                  ? [...current, permission.name]
                                  : current.filter((name) => name !== permission.name)
                              ))}
                            />
                            <span>{getPermissionLabel(permission.name)}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={permissions.every(({ name }) => tenantUserPermissions.includes(name))}
                        onChange={(event) => setTenantUserPermissions((current) => (
                          toggleTenantPermissionGroup(current, permissions, event.target.checked)
                        ))}
                      />
                      {t('superAdminPage.selectAllGroup')}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingTenantUser(null)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!editingTenantUser) return
                  updateTenantUser.mutate({
                    userId: editingTenantUser.id,
                    role: tenantUserRole,
                    is_active: tenantUserActive,
                    permissions: tenantUserPermissions,
                  })
                }}
                disabled={updateTenantUser.isPending}
              >
                {updateTenantUser.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Guardar permissões
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
    </div>
  )
}
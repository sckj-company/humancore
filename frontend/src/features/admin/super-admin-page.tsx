import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, LoadingState } from '@/components/shared/page-header'
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
  created_at?: string
}

const userSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  role: z.enum(['admin', 'hr-manager', 'manager', 'employee']),
})
type UserForm = z.infer<typeof userSchema>
const emptyUserForm: UserForm = { name: '', email: '', password: '', role: 'admin' }

// ── Componente principal ──────────────────────────────────────────────────────

export function SuperAdminPage() {
  const qc = useQueryClient()
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

  const deleteUser = useMutation({
    mutationFn: ({ userId }: { userId: number }) =>
      api.delete(`superadmin/tenants/${selectedTenant!.id}/users/${userId}`),
    onSuccess: () => {
      toast.success('Utilizador eliminado')
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants', selectedTenant?.id, 'users'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
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
        title="Gestão de Empresas"
        description="Registe e gira as empresas (tenants) da plataforma"
      />

      {/* ── Listagem de empresas ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Empresas registadas</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova empresa
          </Button>
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
                  {(tenants?.data ?? []).map((t) => (
                    <tr key={t.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Building2 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.slug} · {(t as any).legal_entity_type?.toUpperCase() ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {t.tax_id ?? '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {(t as any).province ?? (t as any).city ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'secondary'}>
                          {t.status === 'active' ? 'Ativa' : t.status === 'suspended' ? 'Suspensa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.stats?.employees ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          {t.stats?.departments ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString('pt') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Gerir utilizadores" onClick={() => openUsers(t)}>
                            <Users className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            title={t.status === 'suspended' ? 'Reativar empresa' : 'Suspender empresa'}
                            disabled={setStatus.isPending}
                            onClick={() => setStatus.mutate({ id: t.id, status: t.status === 'suspended' ? 'active' : 'suspended' })}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                            disabled={deleteTenant.isPending}
                            onClick={() => { if (window.confirm(`Eliminar a empresa "${t.name}"?`)) deleteTenant.mutate(t.id) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
                      <option value="fr">Français</option>
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Utilizadores — {selectedTenant?.name}
            </DialogTitle>
            <DialogDescription>Gerir os utilizadores desta empresa.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setUserForm(emptyUserForm); setUserErrors({}); setUserDialogOpen(true) }}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Novo utilizador
            </Button>
          </div>
          {loadingUsers ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Nome</th>
                    <th className="px-3 py-2.5 font-medium">Papel</th>
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
                        <Badge variant={u.is_active ? 'success' : 'secondary'}>{u.is_active ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          disabled={deleteUser.isPending}
                          onClick={() => { if (window.confirm(`Eliminar utilizador "${u.name}"?`)) deleteUser.mutate({ userId: u.id }) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(tenantUsers ?? []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Nenhum utilizador encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Adicionar Utilizador ─────────────────────────────── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo utilizador — {selectedTenant?.name}</DialogTitle>
            <DialogDescription>Criar um novo utilizador para esta empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserForm['role'] })}
              >
                <option value="admin">Admin</option>
                <option value="hr-manager">HR Manager</option>
                <option value="manager">Manager</option>
                <option value="employee">Employee</option>
              </select>
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
    </div>
  )
}
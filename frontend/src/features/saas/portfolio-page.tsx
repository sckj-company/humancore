import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Unlink,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { Tenant } from '@/types'

interface PortfolioDashboardResponse {
  manager_tenant: Tenant
  entitlements: {
    agency: {
      can_manage_other_tenants: boolean
      can_create_managed_tenants: boolean
      max_managed_tenants: number | null
      can_manage_child_users: boolean
    }
    limits: Record<string, number | string | null>
    usage: { employees: number; managed_tenants: number }
    quota_scope: string
  }
  kpis: {
    managed_tenants_active: number
    max_managed_tenants: number | null
    portfolio_employees: number
    max_employees: number | null
    pending_payrolls_total: number
  }
  items: Array<{
    relationship_id: number
    relationship_type: 'bpo' | 'accounting' | 'consulting' | 'holding' | 'reseller'
    relationship_status: string
    management_scope?: { allowed_modules?: string[] | null } | null
    tenant: Tenant
    stats: { employees: number; users: number; pending_payrolls: number }
  }>
}

interface TeamAccessResponse {
  users: Array<{
    user_id: number
    name: string
    email: string
    roles: string[]
    access: {
      id: number
      is_active: boolean
      role_name?: string | null
      permission_group_id?: number | null
      permission_group_name?: string | null
      department_ids: number[]
    } | null
  }>
  departments: Array<{ id: number; name: string }>
  permission_groups: Array<{ id: number; name: string }>
}

export function PortfolioPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<PortfolioDashboardResponse['items'][number] | null>(null)
  const [teamModalTenant, setTeamModalTenant] = useState<Tenant | null>(null)

  const [form, setForm] = useState({
    name: '',
    tax_id: '',
    email: '',
    phone: '',
    city: 'Luanda',
    province: 'Luanda',
    relationship_type: 'bpo',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    notes: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', 'dashboard'],
    queryFn: () => api.get<PortfolioDashboardResponse>('portfolio/dashboard'),
  })

  const { data: teamAccessData, refetch: refetchTeamAccess } = useQuery({
    queryKey: ['portfolio', 'team-access', teamModalTenant?.id],
    queryFn: () => api.get<TeamAccessResponse>(`portfolio/tenants/${teamModalTenant!.id}/team-access`),
    enabled: Boolean(teamModalTenant),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('portfolio/tenants', form),
    onSuccess: () => {
      toast.success(t('saas.portfolio.toastCreated'))
      setCreateOpen(false)
      setForm({
        name: '',
        tax_id: '',
        email: '',
        phone: '',
        city: 'Luanda',
        province: 'Luanda',
        relationship_type: 'bpo',
        admin_name: '',
        admin_email: '',
        admin_password: '',
        notes: '',
      })
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.portfolio.toastCreateError'))),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingTenant) throw new Error('Invalid tenant')
      return api.put(`portfolio/tenants/${editingTenant.tenant.id}`, {
        name: form.name,
        tax_id: form.tax_id || null,
        email: form.email || null,
        phone: form.phone || null,
        relationship_type: form.relationship_type,
        notes: form.notes || null,
      })
    },
    onSuccess: () => {
      toast.success(t('saas.portfolio.toastUpdated'))
      setEditingTenant(null)
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.portfolio.toastUpdateError'))),
  })

  const revokeMutation = useMutation({
    mutationFn: (managedTenantId: number) => api.delete(`portfolio/tenants/${managedTenantId}`),
    onSuccess: () => {
      toast.success(t('saas.portfolio.toastRevoked'))
      qc.invalidateQueries({ queryKey: ['portfolio'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.portfolio.toastRevokeError'))),
  })

  const syncTeamMutation = useMutation({
    mutationFn: (payload: {
      user_id: number
      enabled: boolean
      role_name?: string
      permission_group_id?: number | null
    }) => api.post(`portfolio/tenants/${teamModalTenant!.id}/team-access`, payload),
    onSuccess: () => {
      toast.success(t('saas.portfolio.toastTeamUpdated'))
      refetchTeamAccess()
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.portfolio.toastTeamError'))),
  })

  const enterManagedTenant = (tenantId: number) => {
    localStorage.setItem('hrms_selected_tenant', String(tenantId))
    window.location.assign('/dashboard')
  }

  const canCreate = Boolean(data?.entitlements?.agency?.can_create_managed_tenants)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('saas.portfolio.title')}
        description={t('saas.portfolio.description')}
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setForm({
                  name: '',
                  tax_id: '',
                  email: '',
                  phone: '',
                  city: 'Luanda',
                  province: 'Luanda',
                  relationship_type: 'bpo',
                  admin_name: '',
                  admin_email: '',
                  admin_password: '',
                  notes: '',
                })
                setCreateOpen(true)
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('saas.portfolio.newCompany')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('saas.portfolio.kpiManaged')}
          value={`${data?.kpis.managed_tenants_active ?? 0} / ${data?.kpis.max_managed_tenants ?? '∞'}`}
          icon={Building2}
        />
        <KpiCard
          label={t('saas.portfolio.kpiEmployees')}
          value={`${data?.kpis.portfolio_employees ?? 0} / ${data?.kpis.max_employees ?? '∞'}`}
          icon={Users}
        />
        <KpiCard
          label={t('saas.portfolio.kpiPayrolls')}
          value={data?.kpis.pending_payrolls_total ?? 0}
          icon={Wallet}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('saas.portfolio.listTitle')}</CardTitle>
          <CardDescription>{t('saas.portfolio.listDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.items?.length ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t('saas.portfolio.empty')}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.items.map((item) => (
                <Card key={item.relationship_id} className="border-border/80">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{item.tenant.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {t('saas.portfolio.nifLabel')}: {item.tenant.tax_id || '—'} •{' '}
                          {t(`saas.relationshipTypes.${item.relationship_type}`, {
                            defaultValue: item.relationship_type.toUpperCase(),
                          })}
                        </p>
                      </div>
                      <Badge variant={item.relationship_status === 'active' ? 'default' : 'outline'}>
                        {t(`saas.statuses.${item.relationship_status}`, { defaultValue: item.relationship_status })}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">{t('saas.portfolio.statEmployees')}</p>
                        <p className="text-sm font-bold">{item.stats.employees}</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">{t('saas.portfolio.statUsers')}</p>
                        <p className="text-sm font-bold">{item.stats.users}</p>
                      </div>
                      <div className="rounded border p-2">
                        <p className="text-muted-foreground">{t('saas.portfolio.statOpenPayrolls')}</p>
                        <p className="text-sm font-bold">{item.stats.pending_payrolls}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="flex-1" onClick={() => enterManagedTenant(item.tenant.id)}>
                        <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                        {t('saas.portfolio.enterCompany')}
                      </Button>
                      {data.entitlements.agency.can_manage_child_users && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTeamModalTenant(item.tenant)}
                          title={t('saas.portfolio.teamButtonTitle')}
                        >
                          <Shield className="mr-1 h-3.5 w-3.5" />
                          {t('saas.portfolio.teamButton')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingTenant(item)
                          setForm({
                            name: item.tenant.name,
                            tax_id: item.tenant.tax_id ?? '',
                            email: item.tenant.email ?? '',
                            phone: item.tenant.phone ?? '',
                            city: item.tenant.city ?? 'Luanda',
                            province: item.tenant.province ?? 'Luanda',
                            relationship_type: item.relationship_type,
                            admin_name: '',
                            admin_email: '',
                            admin_password: '',
                            notes: '',
                          })
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(t('saas.portfolio.confirmRevoke', { name: item.tenant.name }))) {
                            revokeMutation.mutate(item.tenant.id)
                          }
                        }}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Criar / Editar Empresa Gerida */}
      <Dialog
        open={createOpen || Boolean(editingTenant)}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditingTenant(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingTenant
                ? t('saas.portfolio.editTitle', { name: editingTenant.tenant.name })
                : t('saas.portfolio.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('saas.portfolio.formDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('saas.portfolio.companyNameLabel')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('saas.portfolio.companyNamePlaceholder')} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.portfolio.nifLabel')}</Label>
                <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} placeholder={t('saas.portfolio.nifPlaceholder')} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.portfolio.emailLabel')}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.portfolio.phoneLabel')}</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.portfolio.managementTypeLabel')}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.relationship_type}
                  onChange={(e) => setForm({ ...form, relationship_type: e.target.value })}
                >
                  <option value="bpo">{t('saas.relationshipTypes.bpo')}</option>
                  <option value="accounting">{t('saas.relationshipTypes.accounting')}</option>
                  <option value="consulting">{t('saas.relationshipTypes.consulting')}</option>
                  <option value="holding">{t('saas.relationshipTypes.holding')}</option>
                  <option value="reseller">{t('saas.relationshipTypes.reseller')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t('saas.portfolio.cityLabel')}</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>

            {!editingTenant && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-semibold">{t('saas.portfolio.clientAdminSection')}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder={t('saas.portfolio.adminNamePlaceholder')} value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
                  <Input type="email" placeholder={t('saas.portfolio.adminEmailPlaceholder')} value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} />
                  <Input type="password" placeholder={t('saas.portfolio.adminPasswordPlaceholder')} value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setCreateOpen(false); setEditingTenant(null) }}>
                {t('saas.common.cancel')}
              </Button>
              <Button
                disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => (editingTenant ? updateMutation.mutate() : createMutation.mutate())}
              >
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editingTenant ? t('saas.common.save') : t('saas.portfolio.createCompanySubmit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Delegar Equipa da Gestora */}
      <Dialog open={Boolean(teamModalTenant)} onOpenChange={(o) => !o && setTeamModalTenant(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('saas.portfolio.teamModalTitle', { name: teamModalTenant?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('saas.portfolio.teamModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(teamAccessData?.users ?? []).map((u) => {
              const isEnabled = Boolean(u.access?.is_active)
              return (
                <div key={u.user_id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.email} • {u.roles.join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEnabled && (
                      <select
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                        value={u.access?.role_name ?? 'hr-manager'}
                        onChange={(e) =>
                          syncTeamMutation.mutate({
                            user_id: u.user_id,
                            enabled: true,
                            role_name: e.target.value,
                            permission_group_id: u.access?.permission_group_id ?? null,
                          })
                        }
                      >
                        <option value="admin">{t('saas.portfolio.roles.admin')}</option>
                        <option value="hr-manager">{t('saas.portfolio.roles.hr-manager')}</option>
                        <option value="manager">{t('saas.portfolio.roles.manager')}</option>
                        <option value="employee">{t('saas.portfolio.roles.employee')}</option>
                      </select>
                    )}
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        syncTeamMutation.mutate({
                          user_id: u.user_id,
                          enabled: checked,
                          role_name: u.access?.role_name ?? 'hr-manager',
                        })
                      }
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building2, Check, Link2, Loader2, Plus, Search, Settings2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Paginated, Plan, Tenant, TenantEntitlements, TenantRelationship } from '@/types'

export function RelationshipsAndSubscriptionsTab() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [linkOpen, setLinkOpen] = useState(false)
  const [managerId, setManagerId] = useState('')
  const [selectedManagedIds, setSelectedManagedIds] = useState<number[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [relType, setRelType] = useState<'bpo' | 'accounting' | 'consulting' | 'holding' | 'reseller'>('bpo')

  const [overrideTenant, setOverrideTenant] = useState<Tenant | null>(null)
  const [subPlanId, setSubPlanId] = useState('')
  const [subStatus, setSubStatus] = useState('active')
  const [subCustomPrice, setSubCustomPrice] = useState('')
  const [overrideMaxEmployees, setOverrideMaxEmployees] = useState('')
  const [overrideMaxUsers, setOverrideMaxUsers] = useState('')
  const [overrideMaxManaged, setOverrideMaxManaged] = useState('')

  const { data: relationships = [], isLoading } = useQuery({
    queryKey: ['superadmin', 'relationships'],
    queryFn: () => api.get<TenantRelationship[]>('superadmin/relationships'),
  })

  const { data: tenantsPage } = useQuery({
    queryKey: ['superadmin', 'tenants-all-rel'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 500 }),
  })

  const { data: plans = [] } = useQuery({
    queryKey: ['superadmin', 'plans'],
    queryFn: () => api.get<Plan[]>('superadmin/plans'),
  })

  const attachMutation = useMutation({
    mutationFn: () =>
      api.post('superadmin/relationships', {
        manager_tenant_id: Number(managerId),
        managed_tenant_ids: selectedManagedIds,
        relationship_type: relType,
      }),
    onSuccess: () => {
      toast.success(t('saas.relationships.toastAttached'))
      setLinkOpen(false)
      setManagerId('')
      setSelectedManagedIds([])
      setClientSearch('')
      qc.invalidateQueries({ queryKey: ['superadmin', 'relationships'] })
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.relationships.toastAttachError'))),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/relationships/${id}`),
    onSuccess: () => {
      toast.success(t('saas.relationships.toastRevoked'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'relationships'] })
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.relationships.toastRevokeError'))),
  })

  const openTenantOverride = async (tenant: Tenant) => {
    setOverrideTenant(tenant)
    try {
      const ent = await api.get<TenantEntitlements>(`superadmin/tenants/${tenant.id}/subscription`)
      setSubPlanId(ent.plan?.id ? String(ent.plan.id) : '')
      setSubStatus(ent.subscription?.status ?? 'active')
      setSubCustomPrice(ent.subscription?.custom_price != null ? String(ent.subscription.custom_price) : '')
      const ov = (ent.subscription?.overrides ?? {}) as Record<string, Record<string, unknown>>
      setOverrideMaxEmployees(ov.limits?.max_employees != null ? String(ov.limits.max_employees) : '')
      setOverrideMaxUsers(ov.limits?.max_users != null ? String(ov.limits.max_users) : '')
      setOverrideMaxManaged(ov.agency_config?.max_managed_tenants != null ? String(ov.agency_config.max_managed_tenants) : '')
    } catch {
      setSubPlanId('')
    }
  }

  const saveOverrideMutation = useMutation({
    mutationFn: () => {
      if (!overrideTenant) throw new Error('Invalid tenant')
      const overrides: Record<string, unknown> = {}
      const limitOv: Record<string, number> = {}
      if (overrideMaxEmployees.trim() !== '') limitOv.max_employees = Number(overrideMaxEmployees)
      if (overrideMaxUsers.trim() !== '') limitOv.max_users = Number(overrideMaxUsers)
      if (Object.keys(limitOv).length > 0) overrides.limits = limitOv

      if (overrideMaxManaged.trim() !== '') {
        overrides.agency_config = { max_managed_tenants: Number(overrideMaxManaged) }
      }

      return api.put(`superadmin/tenants/${overrideTenant.id}/subscription`, {
        ...(subPlanId ? { plan_id: Number(subPlanId) } : {}),
        status: subStatus,
        custom_price: subCustomPrice.trim() !== '' ? Number(subCustomPrice) : null,
        overrides: Object.keys(overrides).length > 0 ? overrides : null,
      })
    },
    onSuccess: () => {
      toast.success(t('saas.relationships.toastSubscriptionUpdated'))
      setOverrideTenant(null)
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.relationships.toastSubscriptionError'))),
  })

  const allTenants = tenantsPage?.data ?? []
  const candidateManagedTenants = allTenants
    .filter((tn) => String(tn.id) !== managerId)
    .filter((tn) => `${tn.name} ${tn.slug} ${tn.tax_id ?? ''}`.toLowerCase().includes(clientSearch.trim().toLowerCase()))

  const selectableCandidateIds = candidateManagedTenants
    .filter((tn) => !tn.managed_by || String(tn.managed_by.manager_tenant_id) === managerId)
    .map((tn) => tn.id)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" />
              {t('saas.relationships.title')}
            </CardTitle>
            <CardDescription>{t('saas.relationships.description')}</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedManagedIds([])
              setClientSearch('')
              setLinkOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('saas.relationships.linkButton')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : relationships.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('saas.relationships.empty')}</p>
          ) : (
            <div className="space-y-2">
              {relationships.map((rel) => (
                <div key={rel.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {rel.manager_tenant?.name} → {rel.managed_tenant?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('saas.relationships.typeClientMeta', {
                        type: t(`saas.relationshipTypes.${rel.relationship_type}`, { defaultValue: rel.relationship_type.toUpperCase() }),
                        nif: rel.managed_tenant?.tax_id || '—',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={rel.status === 'active' ? 'default' : 'outline'}>
                      {t(`saas.statuses.${rel.status}`, { defaultValue: rel.status })}
                    </Badge>
                    {rel.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm(t('saas.relationships.confirmRevoke'))) {
                            revokeMutation.mutate(rel.id)
                          }
                        }}
                      >
                        <Unlink className="mr-1 h-3.5 w-3.5" />
                        {t('saas.relationships.revokeButton')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overrides rápidos por empresa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('saas.relationships.overridesTitle')}</CardTitle>
          <CardDescription>{t('saas.relationships.overridesDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {allTenants.map((tenant) => (
              <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tenant.managed_by
                        ? t('saas.relationships.managedByPrefix', { name: tenant.managed_by.manager_tenant_name })
                        : t('saas.relationships.planPrefix', { name: tenant.subscription?.plan_name ?? t('saas.relationships.noPlan') })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tenant.subscription && (
                    <Badge variant={tenant.subscription.status === 'active' ? 'default' : 'secondary'}>
                      {t(`saas.statuses.${tenant.subscription.status}`, { defaultValue: tenant.subscription.status })}
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openTenantOverride(tenant)}>
                    <Settings2 className="mr-1 h-3.5 w-3.5" />
                    {t('saas.relationships.configureButton')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Criar Relação (Multi-Seleção de Empresas Geridas) */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('saas.relationships.linkDialogTitle')}</DialogTitle>
            <DialogDescription>{t('saas.relationships.linkDialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t('saas.relationships.managerCompanyLabel')}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={managerId}
                onChange={(e) => {
                  const nextManagerId = e.target.value
                  setManagerId(nextManagerId)
                  setSelectedManagedIds((prev) => prev.filter((id) => String(id) !== nextManagerId))
                }}
              >
                <option value="">{t('saas.relationships.selectManager')}</option>
                {allTenants.map((tn) => (
                  <option key={tn.id} value={tn.id}>
                    {tn.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t('saas.relationships.relationshipTypeLabel')}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={relType}
                onChange={(e) => setRelType(e.target.value as typeof relType)}
              >
                <option value="bpo">{t('saas.relationshipTypes.bpo')}</option>
                <option value="accounting">{t('saas.relationshipTypes.accounting')}</option>
                <option value="consulting">{t('saas.relationshipTypes.consulting')}</option>
                <option value="holding">{t('saas.relationshipTypes.holding')}</option>
                <option value="reseller">{t('saas.relationshipTypes.reseller')}</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>{t('saas.relationships.clientCompaniesLabel')}</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!managerId || selectableCandidateIds.length === 0}
                  onClick={() =>
                    setSelectedManagedIds((prev) => Array.from(new Set([...prev, ...selectableCandidateIds])))
                  }
                >
                  {t('saas.relationships.selectAllVisible')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={selectedManagedIds.length === 0}
                  onClick={() => setSelectedManagedIds([])}
                >
                  {t('saas.relationships.clearSelection')}
                </Button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t('saas.relationships.searchClientsPlaceholder')}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {candidateManagedTenants.map((tenant) => {
              const checked = selectedManagedIds.includes(tenant.id)
              const managedByOther =
                Boolean(tenant.managed_by) && String(tenant.managed_by?.manager_tenant_id) !== managerId

              return (
                <button
                  key={tenant.id}
                  type="button"
                  disabled={managedByOther}
                  onClick={() =>
                    setSelectedManagedIds((prev) =>
                      checked ? prev.filter((id) => id !== tenant.id) : [...prev, tenant.id],
                    )
                  }
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    managedByOther
                      ? 'cursor-not-allowed opacity-50'
                      : checked
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-accent'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tenant.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tenant.slug}
                        {tenant.tax_id ? ` • ${tenant.tax_id}` : ''}
                        {tenant.managed_by
                          ? ` • ${t('saas.relationships.alreadyManagedBy', { name: tenant.managed_by.manager_tenant_name })}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-xs text-muted-foreground">
              {t('saas.relationships.selectedClientsCount', { count: selectedManagedIds.length })}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLinkOpen(false)}>
                {t('saas.common.cancel')}
              </Button>
              <Button
                disabled={!managerId || selectedManagedIds.length === 0 || attachMutation.isPending}
                onClick={() => attachMutation.mutate()}
              >
                {attachMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('saas.relationships.linkSubmitCount', { count: selectedManagedIds.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Subscrição e Overrides por Empresa */}
      <Dialog open={Boolean(overrideTenant)} onOpenChange={(o) => !o && setOverrideTenant(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('saas.relationships.overrideDialogTitle', { name: overrideTenant?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('saas.relationships.overrideDialogDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('saas.relationships.planLabel')}</Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={subPlanId} onChange={(e) => setSubPlanId(e.target.value)}>
                  <option value="">{t('saas.relationships.selectPlan')}</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.base_price} {p.currency})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>{t('saas.relationships.subscriptionStatusLabel')}</Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={subStatus} onChange={(e) => setSubStatus(e.target.value)}>
                  <option value="active">{t('saas.statuses.active')}</option>
                  <option value="pending_payment">{t('saas.statuses.pending_payment')}</option>
                  <option value="grace_period">{t('saas.statuses.grace_period')}</option>
                  <option value="suspended">{t('saas.statuses.suspended')}</option>
                  <option value="cancelled">{t('saas.statuses.cancelled')}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('saas.relationships.customPriceLabel')}</Label>
                <Input type="number" min={0} placeholder={t('saas.relationships.customPricePlaceholder')} value={subCustomPrice} onChange={(e) => setSubCustomPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('saas.relationships.overrideMaxEmployees')}</Label>
                <Input type="number" min={0} placeholder={t('saas.relationships.usePlanDefaultPlaceholder')} value={overrideMaxEmployees} onChange={(e) => setOverrideMaxEmployees(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('saas.relationships.overrideMaxUsers')}</Label>
                <Input type="number" min={0} placeholder={t('saas.relationships.usePlanDefaultPlaceholder')} value={overrideMaxUsers} onChange={(e) => setOverrideMaxUsers(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('saas.relationships.overrideMaxManaged')}</Label>
                <Input type="number" min={0} placeholder={t('saas.relationships.usePlanDefaultPlaceholder')} value={overrideMaxManaged} onChange={(e) => setOverrideMaxManaged(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOverrideTenant(null)}>{t('saas.common.cancel')}</Button>
              <Button disabled={saveOverrideMutation.isPending} onClick={() => saveOverrideMutation.mutate()}>
                {t('saas.relationships.saveSubscription')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

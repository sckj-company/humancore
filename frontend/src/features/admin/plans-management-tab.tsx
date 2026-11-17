import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Check,
  Copy,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Paginated, Plan, PlanAgencyConfig, PlanCatalogResponse, Tenant } from '@/types'

interface PlanDraft {
  name: string
  slug: string
  code: string
  description: string
  badge_text: string
  visibility: 'public' | 'private' | 'archived'
  is_active: boolean
  sort_order: number
  billing_cycle: string
  custom_cycle_days: string
  currency: string
  base_price: string
  pricing_model: string
  included_employees: string
  extra_employee_price: string
  included_managed_tenants: string
  extra_managed_tenant_price: string
  setup_fee: string
  grace_period_days: string
  features: Record<string, boolean>
  limits: Record<string, string>
  hard_limit_behavior: 'block' | 'allow_and_bill_overage'
  agency_config: PlanAgencyConfig
  custom_rules: Array<{ key: string; value: string }>
}

function createEmptyDraft(catalog?: PlanCatalogResponse): PlanDraft {
  const limits: Record<string, string> = {}
  if (catalog) {
    Object.entries(catalog.defaults.limits).forEach(([k, v]) => {
      if (k !== 'hard_limit_behavior') {
        limits[k] = v === null || v === undefined ? '' : String(v)
      }
    })
  }
  return {
    name: '',
    slug: '',
    code: '',
    description: '',
    badge_text: '',
    visibility: 'public',
    is_active: true,
    sort_order: 0,
    billing_cycle: 'monthly',
    custom_cycle_days: '',
    currency: 'AOA',
    base_price: '0',
    pricing_model: 'flat',
    included_employees: '0',
    extra_employee_price: '0',
    included_managed_tenants: '0',
    extra_managed_tenant_price: '0',
    setup_fee: '0',
    grace_period_days: '5',
    features: { ...(catalog?.defaults.features ?? {}) },
    limits,
    hard_limit_behavior: 'block',
    agency_config: {
      ...(catalog?.defaults.agency_config ?? {
        can_manage_other_tenants: false,
        can_create_managed_tenants: false,
        can_link_existing_tenants: false,
        max_managed_tenants: 0,
        max_hierarchy_depth: 0,
        quota_scope: 'pooled_under_manager',
        can_manage_child_users: true,
        can_customize_child_permissions: true,
      }),
    },
    custom_rules: [],
  }
}

function draftFromPlan(plan: Plan, catalog?: PlanCatalogResponse): PlanDraft {
  const limits: Record<string, string> = {}
  const limitKeys = Object.keys(catalog?.limits ?? plan.limits)
  for (const key of limitKeys) {
    if (key === 'hard_limit_behavior') continue
    const val = plan.limits[key]
    limits[key] = val === null || val === undefined ? '' : String(val)
  }

  return {
    name: plan.name,
    slug: plan.slug,
    code: plan.code ?? '',
    description: plan.description ?? '',
    badge_text: plan.badge_text ?? '',
    visibility: plan.visibility,
    is_active: plan.is_active,
    sort_order: plan.sort_order ?? 0,
    billing_cycle: plan.billing_cycle,
    custom_cycle_days: plan.custom_cycle_days ? String(plan.custom_cycle_days) : '',
    currency: plan.currency,
    base_price: String(plan.base_price ?? 0),
    pricing_model: plan.pricing_model,
    included_employees: String(plan.included_employees ?? 0),
    extra_employee_price: String(plan.extra_employee_price ?? 0),
    included_managed_tenants: String(plan.included_managed_tenants ?? 0),
    extra_managed_tenant_price: String(plan.extra_managed_tenant_price ?? 0),
    setup_fee: String(plan.setup_fee ?? 0),
    grace_period_days: String(plan.grace_period_days ?? 5),
    features: { ...(catalog?.defaults.features ?? {}), ...plan.features },
    limits,
    hard_limit_behavior:
      plan.limits?.hard_limit_behavior === 'allow_and_bill_overage' ? 'allow_and_bill_overage' : 'block',
    agency_config: { ...plan.agency_config },
    custom_rules: Object.entries(plan.custom_rules ?? {}).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    })),
  }
}

export function PlansManagementTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [draft, setDraft] = useState<PlanDraft>(() => createEmptyDraft())

  const [assignPlan, setAssignPlan] = useState<Plan | null>(null)
  const [selectedTenantIds, setSelectedTenantIds] = useState<number[]>([])
  const [tenantSearch, setTenantSearch] = useState('')
  const [assignCustomPrice, setAssignCustomPrice] = useState('')
  const [assignStatus, setAssignStatus] = useState<'active' | 'pending_payment'>('active')

  const { data: catalog } = useQuery({
    queryKey: ['superadmin', 'plans', 'catalog'],
    queryFn: () => api.get<PlanCatalogResponse>('superadmin/plans/catalog'),
  })

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['superadmin', 'plans'],
    queryFn: () => api.get<Plan[]>('superadmin/plans'),
  })

  const { data: tenantsPage } = useQuery({
    queryKey: ['superadmin', 'tenants-for-plans'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 500 }),
    enabled: Boolean(assignPlan),
  })

  const savePlanMutation = useMutation({
    mutationFn: () => {
      const limitsPayload: Record<string, unknown> = {
        hard_limit_behavior: draft.hard_limit_behavior,
      }
      Object.entries(draft.limits).forEach(([k, v]) => {
        limitsPayload[k] = v.trim() === '' ? null : Number(v)
      })

      const customRulesPayload: Record<string, unknown> = {}
      draft.custom_rules.forEach((rule) => {
        const key = rule.key.trim()
        if (key) {
          if (rule.value === 'true') customRulesPayload[key] = true
          else if (rule.value === 'false') customRulesPayload[key] = false
          else if (rule.value !== '' && !Number.isNaN(Number(rule.value))) customRulesPayload[key] = Number(rule.value)
          else customRulesPayload[key] = rule.value
        }
      })

      const payload = {
        name: draft.name,
        slug: draft.slug || null,
        code: draft.code || null,
        description: draft.description || null,
        badge_text: draft.badge_text || null,
        visibility: draft.visibility,
        is_active: draft.is_active,
        sort_order: Number(draft.sort_order) || 0,
        billing_cycle: draft.billing_cycle,
        custom_cycle_days: draft.billing_cycle === 'custom_days' && draft.custom_cycle_days ? Number(draft.custom_cycle_days) : null,
        currency: draft.currency.toUpperCase(),
        base_price: Number(draft.base_price) || 0,
        pricing_model: draft.pricing_model,
        included_employees: Number(draft.included_employees) || 0,
        extra_employee_price: Number(draft.extra_employee_price) || 0,
        included_managed_tenants: Number(draft.included_managed_tenants) || 0,
        extra_managed_tenant_price: Number(draft.extra_managed_tenant_price) || 0,
        setup_fee: Number(draft.setup_fee) || 0,
        grace_period_days: Number(draft.grace_period_days) || 0,
        features: draft.features,
        limits: limitsPayload,
        agency_config: draft.agency_config,
        custom_rules: customRulesPayload,
      }

      if (editingPlan) {
        return api.put(`superadmin/plans/${editingPlan.id}`, payload)
      }
      return api.post('superadmin/plans', payload)
    },
    onSuccess: () => {
      toast.success(editingPlan ? t('saas.plans.toastUpdated') : t('saas.plans.toastCreated'))
      setBuilderOpen(false)
      setEditingPlan(null)
      qc.invalidateQueries({ queryKey: ['superadmin', 'plans'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.plans.toastSaveError'))),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.post(`superadmin/plans/${id}/duplicate`),
    onSuccess: () => {
      toast.success(t('saas.plans.toastDuplicated'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'plans'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.plans.toastDuplicateError'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/plans/${id}`),
    onSuccess: () => {
      toast.success(t('saas.plans.toastDeleted'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'plans'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.plans.toastDeleteError'))),
  })

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!assignPlan) throw new Error('Invalid plan')
      return api.post(`superadmin/plans/${assignPlan.id}/assign-tenants`, {
        tenant_ids: selectedTenantIds,
        status: assignStatus,
        custom_price: assignCustomPrice.trim() !== '' ? Number(assignCustomPrice) : null,
      })
    },
    onSuccess: () => {
      toast.success(t('saas.plans.toastAssigned'))
      setAssignPlan(null)
      setSelectedTenantIds([])
      setAssignCustomPrice('')
      qc.invalidateQueries({ queryKey: ['superadmin', 'plans'] })
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.plans.toastAssignError'))),
  })

  const openCreate = () => {
    setEditingPlan(null)
    setDraft(createEmptyDraft(catalog))
    setBuilderOpen(true)
  }

  const openEdit = (plan: Plan) => {
    setEditingPlan(plan)
    setDraft(draftFromPlan(plan, catalog))
    setBuilderOpen(true)
  }

  const groupedFeatures = Object.entries(catalog?.features ?? {}).reduce<
    Record<string, Array<{ key: string; label: string; description: string }>>
  >((acc, [key, meta]) => {
    const grp = meta.group || 'core'
    if (!acc[grp]) acc[grp] = []
    acc[grp].push({
      key,
      label: t(`saas.features.${key}.label`, { defaultValue: meta.label }),
      description: t(`saas.features.${key}.description`, { defaultValue: meta.description }),
    })
    return acc
  }, {})

  const allTenants = tenantsPage?.data ?? []
  const filteredTenants = allTenants.filter((tn) =>
    `${tn.name} ${tn.slug} ${tn.tax_id ?? ''}`.toLowerCase().includes(tenantSearch.trim().toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              {t('saas.plans.title')}
            </CardTitle>
            <CardDescription>{t('saas.plans.description')}</CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('saas.plans.createButton')}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {t('saas.plans.empty')}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {plans.map((plan) => {
                const enabledCount = Object.values(plan.features).filter(Boolean).length
                const totalFeatures = Object.keys(plan.features).length
                const visibilityLabel =
                  plan.visibility === 'public'
                    ? t('saas.plans.visibilityPublic')
                    : plan.visibility === 'private'
                      ? t('saas.plans.visibilityPrivate')
                      : t('saas.plans.visibilityArchived')

                return (
                  <Card key={plan.id} className="flex flex-col justify-between border-border/80">
                    <CardHeader className="space-y-2 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                            {plan.badge_text && <Badge variant="secondary">{plan.badge_text}</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {plan.code || plan.slug} • {visibilityLabel}
                          </p>
                        </div>
                        <Badge variant={plan.is_active ? 'default' : 'outline'}>
                          {plan.is_active ? t('saas.common.active') : t('saas.common.inactive')}
                        </Badge>
                      </div>
                      {plan.description && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{plan.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="rounded-md bg-muted/50 p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-lg font-bold text-foreground">
                            {Number(plan.base_price).toLocaleString(i18n.language)} {plan.currency}
                          </span>
                          <span className="text-muted-foreground">
                            / {t(`saas.cycles.${plan.billing_cycle}`, { defaultValue: catalog?.billing_cycles[plan.billing_cycle]?.label ?? plan.billing_cycle })}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t(`saas.pricingModels.${plan.pricing_model}`, { defaultValue: catalog?.pricing_models[plan.pricing_model] ?? plan.pricing_model })}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded border px-2.5 py-1.5">
                          <span className="text-muted-foreground">{t('saas.plans.employeesLabel')}</span>
                          <p className="font-semibold">
                            {plan.limits.max_employees === null ? t('saas.common.unlimited') : plan.limits.max_employees}
                          </p>
                        </div>
                        <div className="rounded border px-2.5 py-1.5">
                          <span className="text-muted-foreground">{t('saas.plans.usersLabel')}</span>
                          <p className="font-semibold">
                            {plan.limits.max_users === null ? t('saas.common.unlimited') : plan.limits.max_users}
                          </p>
                        </div>
                        <div className="rounded border px-2.5 py-1.5">
                          <span className="text-muted-foreground">{t('saas.plans.modulesLabel')}</span>
                          <p className="font-semibold">
                            {enabledCount} / {totalFeatures}
                          </p>
                        </div>
                        <div className="rounded border px-2.5 py-1.5">
                          <span className="text-muted-foreground">{t('saas.plans.linkedCompaniesLabel')}</span>
                          <p className="font-semibold">{plan.active_subscriptions_count ?? 0}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded border px-2.5 py-1.5">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          {t('saas.plans.manageOthersLabel')}
                        </span>
                        <Badge variant={plan.agency_config.can_manage_other_tenants ? 'default' : 'outline'}>
                          {plan.agency_config.can_manage_other_tenants
                            ? `${t('saas.common.yes')} (${plan.agency_config.max_managed_tenants ?? '∞'})`
                            : t('saas.common.no')}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 flex-1 text-xs"
                          onClick={() => {
                            setAssignPlan(plan)
                            setSelectedTenantIds([])
                            setTenantSearch('')
                          }}
                        >
                          <Link2 className="mr-1 h-3.5 w-3.5" />
                          {t('saas.plans.linkCompanies')}
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2.5" onClick={() => openEdit(plan)} title={t('saas.plans.editTooltip')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5"
                          onClick={() => duplicateMutation.mutate(plan.id)}
                          title={t('saas.plans.duplicateTooltip')}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(t('saas.plans.confirmDelete', { name: plan.name }))) {
                              deleteMutation.mutate(plan.id)
                            }
                          }}
                          title={t('saas.plans.deleteTooltip')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Construtor de Plano Customizado */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlan
                ? t('saas.plans.builderEditTitle', { name: editingPlan.name })
                : t('saas.plans.builderCreateTitle')}
            </DialogTitle>
            <DialogDescription>{t('saas.plans.builderDescription')}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="general">{t('saas.plans.tabGeneral')}</TabsTrigger>
              <TabsTrigger value="features">
                {t('saas.plans.tabFeatures', { count: Object.values(draft.features).filter(Boolean).length })}
              </TabsTrigger>
              <TabsTrigger value="limits">{t('saas.plans.tabLimits')}</TabsTrigger>
              <TabsTrigger value="agency">{t('saas.plans.tabAgency')}</TabsTrigger>
              <TabsTrigger value="custom">{t('saas.plans.tabCustom')}</TabsTrigger>
            </TabsList>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <TabsContent value="general" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.nameLabel')}</Label>
                    <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t('saas.plans.namePlaceholder')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.codeLabel')}</Label>
                    <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder={t('saas.plans.codePlaceholder')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.slugLabel')}</Label>
                    <Input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder={t('saas.plans.slugPlaceholder')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.badgeLabel')}</Label>
                    <Input value={draft.badge_text} onChange={(e) => setDraft({ ...draft, badge_text: e.target.value })} placeholder={t('saas.plans.badgePlaceholder')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.visibilityLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={draft.visibility}
                      onChange={(e) => setDraft({ ...draft, visibility: e.target.value as PlanDraft['visibility'] })}
                    >
                      <option value="public">{t('saas.plans.visibilityPublic')}</option>
                      <option value="private">{t('saas.plans.visibilityPrivateOption')}</option>
                      <option value="archived">{t('saas.plans.visibilityArchived')}</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>{t('saas.plans.planActiveLabel')}</Label>
                      <p className="text-xs text-muted-foreground">{t('saas.plans.planActiveDesc')}</p>
                    </div>
                    <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t('saas.plans.descriptionLabel')}</Label>
                  <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t('saas.plans.descriptionPlaceholder')} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.billingCycleLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={draft.billing_cycle}
                      onChange={(e) => setDraft({ ...draft, billing_cycle: e.target.value })}
                    >
                      {Object.entries(catalog?.billing_cycles ?? { monthly: { label: 'Mensal' } }).map(([k, v]) => (
                        <option key={k} value={k}>
                          {t(`saas.cycles.${k}`, { defaultValue: v.label })}
                        </option>
                      ))}
                    </select>
                  </div>
                  {draft.billing_cycle === 'custom_days' && (
                    <div className="space-y-1.5">
                      <Label>{t('saas.plans.customDaysLabel')}</Label>
                      <Input type="number" min={1} value={draft.custom_cycle_days} onChange={(e) => setDraft({ ...draft, custom_cycle_days: e.target.value })} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.currencyLabel')}</Label>
                    <Input maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.basePriceLabel')}</Label>
                    <Input type="number" min={0} value={draft.base_price} onChange={(e) => setDraft({ ...draft, base_price: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.pricingModelLabel')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={draft.pricing_model}
                      onChange={(e) => setDraft({ ...draft, pricing_model: e.target.value })}
                    >
                      {Object.entries(catalog?.pricing_models ?? { flat: 'Flat' }).map(([k, v]) => (
                        <option key={k} value={k}>
                          {t(`saas.pricingModels.${k}`, { defaultValue: v })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.graceDaysLabel')}</Label>
                    <Input type="number" min={0} value={draft.grace_period_days} onChange={(e) => setDraft({ ...draft, grace_period_days: e.target.value })} />
                  </div>
                </div>

                {draft.pricing_model !== 'flat' && (
                  <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('saas.plans.includedEmployees')}</Label>
                      <Input type="number" min={0} value={draft.included_employees} onChange={(e) => setDraft({ ...draft, included_employees: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('saas.plans.extraEmployeePrice')}</Label>
                      <Input type="number" min={0} value={draft.extra_employee_price} onChange={(e) => setDraft({ ...draft, extra_employee_price: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('saas.plans.includedManagedTenants')}</Label>
                      <Input type="number" min={0} value={draft.included_managed_tenants} onChange={(e) => setDraft({ ...draft, included_managed_tenants: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('saas.plans.extraManagedTenantPrice')}</Label>
                      <Input type="number" min={0} value={draft.extra_managed_tenant_price} onChange={(e) => setDraft({ ...draft, extra_managed_tenant_price: e.target.value })} />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="features" className="mt-0 space-y-4">
                {Object.entries(groupedFeatures).map(([groupKey, items]) => (
                  <div key={groupKey} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{t(`saas.featureGroups.${groupKey}`, { defaultValue: groupKey })}</h4>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const next = { ...draft.features }
                            items.forEach((it) => {
                              next[it.key] = true
                            })
                            setDraft({ ...draft, features: next })
                          }}
                        >
                          {t('saas.plans.enableAll')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const next = { ...draft.features }
                            items.forEach((it) => {
                              next[it.key] = false
                            })
                            setDraft({ ...draft, features: next })
                          }}
                        >
                          {t('saas.plans.disableAll')}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((item) => (
                        <label
                          key={item.key}
                          className="flex cursor-pointer items-center justify-between gap-2 rounded border px-3 py-2 text-xs hover:bg-accent/50"
                        >
                          <div>
                            <p className="font-medium text-foreground">{item.label}</p>
                            <p className="text-[11px] text-muted-foreground">{item.description}</p>
                          </div>
                          <Switch
                            checked={Boolean(draft.features[item.key])}
                            onCheckedChange={(checked) =>
                              setDraft({ ...draft, features: { ...draft.features, [item.key]: checked } })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="limits" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Object.entries(catalog?.limits ?? {}).map(([key, meta]) => (
                    <div key={key} className="space-y-1.5 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                          {t(`saas.limits.${key}.label`, { defaultValue: meta.label })}
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          {t(`saas.limits.${key}.unit`, { defaultValue: meta.unit })}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        placeholder={t('saas.common.unlimited')}
                        value={draft.limits[key] ?? ''}
                        onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, [key]: e.target.value } })}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t(`saas.limits.${key}.description`, { defaultValue: meta.description })}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 rounded-md border p-3">
                  <Label>{t('saas.plans.limitBehaviorLabel')}</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={draft.hard_limit_behavior}
                    onChange={(e) =>
                      setDraft({ ...draft, hard_limit_behavior: e.target.value as PlanDraft['hard_limit_behavior'] })
                    }
                  >
                    <option value="block">{t('saas.plans.limitBehaviorBlock')}</option>
                    <option value="allow_and_bill_overage">{t('saas.plans.limitBehaviorOverage')}</option>
                  </select>
                </div>
              </TabsContent>

              <TabsContent value="agency" className="mt-0 space-y-4">
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                  {t('saas.plans.agencyHint')}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>{t('saas.plans.canManageOthers')}</Label>
                      <p className="text-xs text-muted-foreground">{t('saas.plans.canManageOthersDesc')}</p>
                    </div>
                    <Switch
                      checked={draft.agency_config.can_manage_other_tenants}
                      onCheckedChange={(v) =>
                        setDraft({
                          ...draft,
                          agency_config: {
                            ...draft.agency_config,
                            can_manage_other_tenants: v,
                            max_hierarchy_depth: v ? Math.max(1, draft.agency_config.max_hierarchy_depth) : 0,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>{t('saas.plans.canCreateManaged')}</Label>
                      <p className="text-xs text-muted-foreground">{t('saas.plans.canCreateManagedDesc')}</p>
                    </div>
                    <Switch
                      checked={draft.agency_config.can_create_managed_tenants}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      onCheckedChange={(v) =>
                        setDraft({ ...draft, agency_config: { ...draft.agency_config, can_create_managed_tenants: v } })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.maxManagedTenants')}</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={t('saas.common.unlimited')}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      value={draft.agency_config.max_managed_tenants ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agency_config: {
                            ...draft.agency_config,
                            max_managed_tenants: e.target.value === '' ? null : Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.hierarchyDepth')}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      value={draft.agency_config.max_hierarchy_depth}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agency_config: { ...draft.agency_config, max_hierarchy_depth: Number(e.target.value) || 0 },
                        })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">{t('saas.plans.hierarchyDepthHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('saas.plans.quotaScope')}</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={draft.agency_config.quota_scope}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          agency_config: {
                            ...draft.agency_config,
                            quota_scope: e.target.value as PlanAgencyConfig['quota_scope'],
                          },
                        })
                      }
                    >
                      <option value="pooled_under_manager">{t('saas.plans.quotaScopePooled')}</option>
                      <option value="per_managed_tenant">{t('saas.plans.quotaScopePerTenant')}</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>{t('saas.plans.delegateTeam')}</Label>
                      <p className="text-xs text-muted-foreground">{t('saas.plans.delegateTeamDesc')}</p>
                    </div>
                    <Switch
                      checked={draft.agency_config.can_manage_child_users}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      onCheckedChange={(v) =>
                        setDraft({ ...draft, agency_config: { ...draft.agency_config, can_manage_child_users: v } })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label>{t('saas.plans.customizeChildPerms')}</Label>
                      <p className="text-xs text-muted-foreground">{t('saas.plans.customizeChildPermsDesc')}</p>
                    </div>
                    <Switch
                      checked={draft.agency_config.can_customize_child_permissions}
                      disabled={!draft.agency_config.can_manage_other_tenants}
                      onCheckedChange={(v) =>
                        setDraft({
                          ...draft,
                          agency_config: { ...draft.agency_config, can_customize_child_permissions: v },
                        })
                      }
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="custom" className="mt-0 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{t('saas.plans.customRulesHint')}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft({ ...draft, custom_rules: [...draft.custom_rules, { key: '', value: '' }] })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('saas.plans.addRule')}
                  </Button>
                </div>
                {draft.custom_rules.length === 0 ? (
                  <p className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                    {t('saas.plans.noCustomRules')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {draft.custom_rules.map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder={t('saas.plans.ruleKeyPlaceholder')}
                          value={rule.key}
                          onChange={(e) => {
                            const next = [...draft.custom_rules]
                            next[idx] = { ...next[idx], key: e.target.value }
                            setDraft({ ...draft, custom_rules: next })
                          }}
                        />
                        <Input
                          placeholder={t('saas.plans.ruleValuePlaceholder')}
                          value={rule.value}
                          onChange={(e) => {
                            const next = [...draft.custom_rules]
                            next[idx] = { ...next[idx], value: e.target.value }
                            setDraft({ ...draft, custom_rules: next })
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              custom_rules: draft.custom_rules.filter((_, i) => i !== idx),
                            })
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <div className="mt-4 flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>
              {t('saas.common.cancel')}
            </Button>
            <Button onClick={() => savePlanMutation.mutate()} disabled={!draft.name.trim() || savePlanMutation.isPending}>
              {savePlanMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingPlan ? t('saas.plans.saveChanges') : t('saas.plans.createPlan')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Vincular Plano a N Empresas */}
      <Dialog open={Boolean(assignPlan)} onOpenChange={(open) => !open && setAssignPlan(null)}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('saas.plans.assignTitle', { name: assignPlan?.name ?? '' })}</DialogTitle>
            <DialogDescription>{t('saas.plans.assignDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('saas.plans.initialStatus')}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={assignStatus}
                onChange={(e) => setAssignStatus(e.target.value as 'active' | 'pending_payment')}
              >
                <option value="active">{t('saas.statuses.active')}</option>
                <option value="pending_payment">{t('saas.statuses.pending_payment')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('saas.plans.customPriceOptional')}</Label>
              <Input
                type="number"
                min={0}
                placeholder={t('saas.plans.defaultPricePlaceholder', {
                  price: assignPlan?.base_price ?? 0,
                  currency: assignPlan?.currency ?? 'AOA',
                })}
                value={assignCustomPrice}
                onChange={(e) => setAssignCustomPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t('saas.plans.searchTenantsPlaceholder')}
              value={tenantSearch}
              onChange={(e) => setTenantSearch(e.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredTenants.map((tenant) => {
              const checked = selectedTenantIds.includes(tenant.id)
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() =>
                    setSelectedTenantIds((prev) =>
                      checked ? prev.filter((id) => id !== tenant.id) : [...prev, tenant.id],
                    )
                  }
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    checked ? 'bg-primary/10 text-primary' : 'hover:bg-accent'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tenant.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tenant.slug}{' '}
                        {tenant.subscription?.plan_name
                          ? `• ${t('saas.plans.currentPlanPrefix', { name: tenant.subscription.plan_name })}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border ${
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
              {t('saas.plans.selectedCount', { count: selectedTenantIds.length })}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAssignPlan(null)}>
                {t('saas.common.cancel')}
              </Button>
              <Button
                disabled={selectedTenantIds.length === 0 || assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                {assignMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('saas.plans.linkButtonCount', { count: selectedTenantIds.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

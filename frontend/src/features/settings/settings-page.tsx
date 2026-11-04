import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Save,
  Loader2,
  Building2,
  Clock,
  Wallet,
  Palmtree,
  Mail,
  Scale,
  ShieldAlert,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { SalaryComponentRegulationsPage } from '@/features/settings/salary-component-regulations-page'
import { PayrollTaxRulesPage } from '@/features/settings/payroll-tax-rules-page'
import type { Paginated, SettingGroups, SettingItem, Tenant } from '@/types'

type ScalarValue = string | number | boolean

const SETTING_GROUP_META: { key: string; icon: typeof Building2; title: string }[] = [
  { key: 'company', icon: Building2, title: 'Empresa' },
  { key: 'hr', icon: Clock, title: 'Recursos Humanos' },
  { key: 'payroll', icon: Wallet, title: 'Folha de Pagamento' },
  { key: 'leave', icon: Palmtree, title: 'Férias e Ausências' },
  { key: 'communication', icon: Mail, title: 'Comunicação' },
]
const GROUP_ORDER = SETTING_GROUP_META.map((g) => g.key)

// ─── Super-Admin Tenant Banner ─────────────────────────────────────────────────
function SuperAdminTenantBanner({
  selectedTenantId,
  onChange,
}: {
  selectedTenantId: string
  onChange: (id: string) => void
}) {
  const qc = useQueryClient()
  const { data: tenantPage } = useQuery({
    queryKey: ['superadmin', 'tenant-list-settings'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 1000 }),
  })

  const selectedTenant = tenantPage?.data?.find((t) => String(t.id) === selectedTenantId)

  return (
    <Card className="border-amber-500/40 bg-amber-500/5 shadow-xs">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Modo Super Administrador
              </p>
              <p className="text-xs text-muted-foreground">
                Está a gerir configurações de{' '}
                <span className="font-medium text-foreground">
                  {selectedTenant?.name ?? 'empresa não selecionada'}
                </span>
                . As alterações afetam apenas este tenant.
              </p>
            </div>
          </div>
          <div className="w-full sm:w-72 shrink-0">
            <Select
              value={selectedTenantId}
              onValueChange={(id) => {
                onChange(id)
                localStorage.setItem('hrms_selected_tenant', id)
                qc.invalidateQueries({ queryKey: ['settings'] })
                qc.invalidateQueries({ queryKey: ['payroll'] })
                qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
                qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
              }}
            >
              <SelectTrigger className="w-full bg-background border-amber-300/50">
                <SelectValue placeholder="Selecione uma empresa…" />
              </SelectTrigger>
              <SelectContent>
                {tenantPage?.data?.map((tenant) => (
                  <SelectItem key={tenant.id} value={String(tenant.id)}>
                    <span className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {tenant.name}
                      {tenant.status !== 'active' && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                          {tenant.status}
                        </Badge>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Settings Page ─────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.roles?.includes('super-admin') ?? false
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
  const queryClient = useQueryClient()

  // Shared super-admin tenant selection (synced with localStorage + api header)
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => {
    return localStorage.getItem('hrms_selected_tenant') || String(user?.tenant?.id || '')
  })

  // If super-admin has no tenant selected yet, pick the first active one
  const { data: tenantPage } = useQuery({
    queryKey: ['superadmin', 'tenant-list-settings'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 1000 }),
    enabled: isSuperAdmin,
  })

  useEffect(() => {
    if (isSuperAdmin && !selectedTenantId && tenantPage?.data?.length) {
      const firstId = String(tenantPage.data[0].id)
      setSelectedTenantId(firstId)
      localStorage.setItem('hrms_selected_tenant', firstId)
    }
  }, [isSuperAdmin, selectedTenantId, tenantPage])

  // General settings state
  const [edits, setEdits] = useState<Record<string, ScalarValue | string>>({})
  const [dirtyGroups, setDirtyGroups] = useState<Set<string>>(new Set())

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingGroups>('settings'),
    enabled: isAdmin,
  })

  const groups = useMemo(() => {
    if (!data) return []
    return GROUP_ORDER.map((key) => ({ key, items: data[key] ?? [] })).filter((g) => g.items.length > 0)
  }, [data])

  useEffect(() => {
    if (!data) return
    const next: Record<string, ScalarValue | string> = {}
    Object.values(data).flat().forEach((s) => {
      if (typeof s.value === 'string' || typeof s.value === 'number' || typeof s.value === 'boolean') {
        next[`${s.group}.${s.key}`] = s.value
      }
    })
    setEdits(next)
  }, [data])

  const save = useMutation({
    mutationFn: async (groupKey: string) => {
      const groupItems = data?.[groupKey] ?? []
      const values: Record<string, ScalarValue | string> = {}
      groupItems.forEach((s) => {
        const field = `${s.group}.${s.key}`
        values[s.key] = coerce(s, edits[field])
      })
      return api.put('settings/bulk', { group: groupKey, values })
    },
    onSuccess: () => {
      toast.success('Configurações guardadas')
      setDirtyGroups(new Set())
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao guardar')),
  })

  if (!isAdmin) {
    return <ErrorState message="Não tem permissão para ver as configurações." onRetry={() => {}} />
  }

  const update = (field: string, value: ScalarValue | string) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    const groupKey = field.split('.')[0]
    setDirtyGroups((prev) => new Set(prev).add(groupKey))
  }

  const handleTenantChange = (id: string) => {
    setSelectedTenantId(id)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title', { defaultValue: 'Configurações' })}
        description="Configure a empresa, os horários e as regras do sistema."
      />

      {/* Super-Admin Banner */}
      {isSuperAdmin && (
        <SuperAdminTenantBanner
          selectedTenantId={selectedTenantId}
          onChange={handleTenantChange}
        />
      )}

      {/* Master Tabs */}
      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="h-4 w-4" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="salary-components" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Componentes Salariais
          </TabsTrigger>
          <TabsTrigger value="tax-rules" className="gap-2">
            <Scale className="h-4 w-4" />
            Regras Fiscais &amp; INSS
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Geral ── */}
        <TabsContent value="general" className="mt-6">
          {isLoading && <LoadingState />}
          {isError && <ErrorState message="Não foi possível carregar as configurações." onRetry={refetch} />}
          {!isLoading && !isError && (
            <Tabs defaultValue={groups[0]?.key} orientation="vertical" className="flex flex-col gap-6">
              <TabsList className="flex-wrap h-auto justify-start gap-1 bg-transparent p-0">
                {groups.map(({ key }) => {
                  const Icon = SETTING_GROUP_META.find((g) => g.key === key)?.icon ?? Building2
                  const dirty = dirtyGroups.has(key)
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none border border-transparent data-[state=active]:border-border"
                    >
                      <Icon className="h-4 w-4" />
                      {SETTING_GROUP_META.find((g) => g.key === key)?.title ?? key}
                      {dirty && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
              {groups.map(({ key, items }) => (
                <TabsContent key={key} value={key}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{SETTING_GROUP_META.find((g) => g.key === key)?.title ?? key}</CardTitle>
                      <CardDescription>Atualize as definições deste módulo.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 sm:grid-cols-2">
                      {items
                        .filter((s) => isEditable(s))
                        .map((s) => (
                          <SettingField
                            key={s.key}
                            setting={s}
                            value={edits[`${s.group}.${s.key}`]}
                            onChange={(v) => update(`${s.group}.${s.key}`, v)}
                          />
                        ))}
                    </CardContent>
                    <CardFooter className="justify-end border-t px-6 py-4">
                      <Button
                        onClick={() => save.mutate(key)}
                        disabled={save.isPending || !dirtyGroups.has(key)}
                      >
                        {save.isPending && save.variables === key ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Guardar
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        {/* ── Tab: Componentes Salariais ── */}
        <TabsContent value="salary-components" className="mt-6">
          <SalaryComponentRegulationsPage
            embeddedTenantId={selectedTenantId}
            onTenantChange={handleTenantChange}
          />
        </TabsContent>

        {/* ── Tab: Regras Fiscais & INSS ── */}
        <TabsContent value="tax-rules" className="mt-6">
          <PayrollTaxRulesPage
            embeddedTenantId={selectedTenantId}
            onTenantChange={handleTenantChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Helper components ─────────────────────────────────────────────────────────
const BOOLEAN_KEYS = new Set(['enabled', 'required', 'requires_approval', 'allow_negative_balance', 'overtime_enabled'])
const JSON_KEYS = new Set(['brackets', 'branding', 'workweek'])

function isEditable(s: SettingItem): boolean {
  if (JSON_KEYS.has(s.key)) return true
  if (typeof s.value === 'string' || typeof s.value === 'number' || typeof s.value === 'boolean') return true
  return false
}

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: SettingItem
  value: ScalarValue | string | undefined
  onChange: (v: ScalarValue | string) => void
}) {
  const label = setting.key.replaceAll('.', '. ')
  const isBool = typeof setting.value === 'boolean' || BOOLEAN_KEYS.has(setting.key)
  const isJson = JSON_KEYS.has(setting.key)

  if (isBool) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <Label className="font-medium">{humanize(label)}</Label>
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`set-${setting.key}`}>{humanize(label)}</Label>
      {isJson ? (
        <Textarea
          id={`set-${setting.key}`}
          value={Array.isArray(value) ? JSON.stringify(value) : String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="font-mono text-xs"
        />
      ) : (
        <Input
          id={`set-${setting.key}`}
          type={typeof value === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function humanize(key: string): string {
  return key
    .split('.')
    .map(
      (part) =>
        part
          .replace(/_/g, ' ')
          .replace(/^\w/, (c) => c.toUpperCase()),
    )
    .join(' — ')
}

function coerce(setting: SettingItem, value: ScalarValue | string | undefined): ScalarValue | string {
  if (value === undefined) {
    if (typeof setting.value === 'number') return 0
    if (typeof setting.value === 'boolean') return Boolean(setting.value)
    return ''
  }
  if (typeof setting.value === 'number') return Number(value)
  if (typeof setting.value === 'boolean') return Boolean(value)
  if (JSON_KEYS.has(setting.key)) {
    try {
      return JSON.parse(String(value)) as string
    } catch {
      return String(value)
    }
  }
  return String(value)
}

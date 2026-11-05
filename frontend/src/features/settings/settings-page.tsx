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
  FileCheck,
  Plus,
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
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { SalaryComponentRegulationsPage } from '@/features/settings/salary-component-regulations-page'
import { PayrollTaxRulesPage } from '@/features/settings/payroll-tax-rules-page'
import type { DocumentRequirement, SettingGroups, SettingItem } from '@/types'

type ScalarValue = string | number | boolean

const SETTING_GROUP_META: { key: string; icon: typeof Building2; title: string }[] = [
  { key: 'company', icon: Building2, title: 'Empresa' },
  { key: 'hr', icon: Clock, title: 'Recursos Humanos' },
  { key: 'payroll', icon: Wallet, title: 'Folha de Pagamento' },
  { key: 'leave', icon: Palmtree, title: 'Férias e Ausências' },
  { key: 'communication', icon: Mail, title: 'Comunicação' },
]
const DISCOUNT_SETTINGS: { key: string; label: string; description: string }[] = [
  { key: 'discounts.absence_daily_amount', label: 'Falta diária', description: 'Valor descontado por falta injustificada ou sem consentimento explícito.' },
  { key: 'discounts.lateness_hourly_amount', label: 'Atraso por hora', description: 'Valor aplicado por hora de atraso registada.' },
  { key: 'discounts.lateness_minute_amount', label: 'Atraso por minuto', description: 'Valor aplicado por minuto de atraso quando a empresa usa desconto em minutos em vez de horas.' },
  { key: 'discounts.lateness_free_occurrences_per_week', label: 'Atrasos livres por semana', description: 'Número de atrasos permitidos sem desconto em cada semana.' },
  { key: 'discounts.lateness_weekly_accumulation_minutes', label: 'Acumulação semanal', description: 'Minutos acumulados por semana antes de iniciar o desconto adicional.' },
  { key: 'discounts.dayoff_daily_amount', label: 'Folga diária', description: 'Valor aplicado quando a folga é concedida ou descontada por dia.' },
  { key: 'discounts.default_amount', label: 'Desconto padrão', description: 'Valor base para situações de desconto não específicas.' },
]
const GROUP_ORDER = SETTING_GROUP_META.map((g) => g.key)
const REQUIRED_DOCUMENT_PRESETS: DocumentRequirement[] = [
  { type: 'cv', label: 'Currículo (CV)' },
  { type: 'criminal_record', label: 'Registo criminal' },
  { type: 'term', label: 'Termo de responsabilidade' },
  { type: 'contract', label: 'Contrato de trabalho' },
  { type: 'medical', label: 'Atestado médico' },
  { type: 'bank_proof', label: 'Comprovativo bancário' },
  { type: 'id_card', label: 'Bilhete de identidade (BI)' },
]

// ─── Super-Admin Tenant Banner ─────────────────────────────────────────────────
function SuperAdminTenantBanner() {
  return (
    <div className="flex items-start gap-3 border border-amber-500/30 bg-amber-500/5 p-4">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-foreground">Modo Super Administrador</p>
        <p className="text-xs text-muted-foreground">
          As configurações aplicam-se à empresa ativa, selecionada no cabeçalho.
        </p>
      </div>
    </div>
  )
}

// ─── Settings Page ─────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.roles?.includes('super-admin') ?? false
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
  const queryClient = useQueryClient()

  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') || String(user?.tenant?.id || '')

  // General settings state
  const [edits, setEdits] = useState<Record<string, ScalarValue | string>>({})
  const [dirtyGroups, setDirtyGroups] = useState<Set<string>>(new Set())
  const [requiredDocuments, setRequiredDocuments] = useState<DocumentRequirement[]>([])
  const [newDocumentName, setNewDocumentName] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingGroups>('settings'),
    enabled: isAdmin,
  })
  const { data: documentSettings } = useQuery({
    queryKey: ['settings', 'documents'],
    queryFn: () => api.get<SettingGroups>('settings', { group: 'documents' }),
    enabled: isAdmin,
  })

  useEffect(() => {
    const saved = documentSettings?.documents?.find((setting) => setting.key === 'required')?.value
    if (Array.isArray(saved)) setRequiredDocuments(normalizeDocumentRequirements(saved))
  }, [documentSettings])

  const groups = useMemo(() => {
    if (!data) return []
    return GROUP_ORDER.map((key) => ({ key, items: data[key] ?? [] })).filter((g) => g.items.length > 0)
  }, [data])

  const payrollDiscountSettings = useMemo(
    () =>
      (data?.payroll ?? [])
        .filter((s) => s.key.startsWith('discounts.'))
        .sort((a, b) => a.key.localeCompare(b.key)),
    [data],
  )

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
  const addDiscountRule = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.put('settings/bulk', { group: 'payroll', values: { [key]: value } }),
    onSuccess: () => {
      toast.success('Regra de desconto adicionada')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao adicionar regra de desconto')),
  })
  const saveRequiredDocuments = useMutation({
    mutationFn: () => api.put('settings/bulk', {
      group: 'documents',
      values: { required: requiredDocuments },
    }),
    onSuccess: () => {
      toast.success('Documentos obrigatórios guardados')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Erro ao guardar documentos obrigatórios')),
  })

  if (!isAdmin) {
    return <ErrorState message="Não tem permissão para ver as configurações." onRetry={() => {}} />
  }

  const update = (field: string, value: ScalarValue | string) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    const groupKey = field.split('.')[0]
    setDirtyGroups((prev) => new Set(prev).add(groupKey))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title', { defaultValue: 'Configurações' })}
        description="Configure a empresa, os horários e as regras do sistema."
      />

      {/* Super-Admin Banner */}
      {isSuperAdmin && (
        <SuperAdminTenantBanner />
      )}

      {/* Master Tabs */}
      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="h-4 w-4" />
            Geral
          </TabsTrigger>
          <TabsTrigger value="discounts" className="gap-2">
            <Wallet className="h-4 w-4" />
            Descontos
          </TabsTrigger>
          <TabsTrigger value="salary-components" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Componentes Salariais
          </TabsTrigger>
          <TabsTrigger value="tax-rules" className="gap-2">
            <Scale className="h-4 w-4" />
            Regras Fiscais &amp; INSS
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileCheck className="h-4 w-4" />
            Documentos de admissão
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

        {/* ── Tab: Descontos ── */}
        <TabsContent value="discounts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Descontos do salário</CardTitle>
              <CardDescription>
                Configure os valores aplicados para faltas, atrasos e folgas por contexto de desconto.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {payrollDiscountSettings.map((setting) => {
                  const config = DISCOUNT_SETTINGS.find((item) => item.key === setting.key)
                  const fieldName = `${setting.group}.${setting.key}`

                  return (
                    <div key={setting.key} className="rounded-lg border border-border p-4 bg-muted/20">
                      <div className="mb-3 space-y-1">
                        <p className="text-sm font-medium">{config?.label ?? humanize(setting.key)}</p>
                        <p className="text-xs text-muted-foreground">
                          {config?.description ?? 'Valor aplicado quando existe um desconto associado a este contexto.'}
                        </p>
                      </div>

                      <SettingField
                        setting={setting}
                        value={edits[fieldName]}
                        onChange={(value) => update(fieldName, value)}
                      />
                    </div>
                  )
                })}
              {DISCOUNT_SETTINGS.filter((rule) => !payrollDiscountSettings.some((setting) => setting.key === rule.key)).map((rule) => (
                <div key={rule.key} className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{rule.label}</p>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={addDiscountRule.isPending}
                    onClick={() => addDiscountRule.mutate({
                      key: rule.key,
                      value: rule.key === 'discounts.lateness_free_occurrences_per_week' ? 1 : 0,
                    })}
                  >
                    {addDiscountRule.isPending && addDiscountRule.variables?.key === rule.key
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Plus className="h-4 w-4" />}
                    Adicionar
                  </Button>
                </div>
              ))}
            </CardContent>
            <CardFooter className="justify-end border-t px-6 py-4">
              <Button
                onClick={() => save.mutate('payroll')}
                disabled={save.isPending || !dirtyGroups.has('payroll')}
              >
                {save.isPending && save.variables === 'payroll' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Tab: Componentes Salariais ── */}
        <TabsContent value="salary-components" className="mt-6">
          <SalaryComponentRegulationsPage
            embeddedTenantId={selectedTenantId}
          />
        </TabsContent>

        {/* ── Tab: Regras Fiscais & INSS ── */}
        <TabsContent value="tax-rules" className="mt-6">
          <PayrollTaxRulesPage
            embeddedTenantId={selectedTenantId}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Documentos obrigatórios para admissão</CardTitle>
              <CardDescription>
                Selecione os documentos que devem ser anexados ao registar um funcionário. O cadastro será bloqueado enquanto faltar algum.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {REQUIRED_DOCUMENT_PRESETS.map((document) => (
                  <label key={document.type} className="flex items-center gap-3 border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={requiredDocuments.some((required) => required.type === document.type)}
                      onChange={(event) => setRequiredDocuments((current) => event.target.checked
                        ? [...current, document]
                        : current.filter((required) => required.type !== document.type))}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{document.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newDocumentName}
                  onChange={(event) => setNewDocumentName(event.target.value)}
                  placeholder="Outro documento (ex.: certificado profissional)"
                  aria-label="Nome do documento obrigatório personalizado"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const label = newDocumentName.trim()
                    const type = `custom_${label.toLocaleLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
                    if (!label || requiredDocuments.some((document) => document.type === type)) return
                    setRequiredDocuments((current) => [...current, { type, label }])
                    setNewDocumentName('')
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />Adicionar
                </Button>
              </div>

              {requiredDocuments.filter((document) => document.type.startsWith('custom_')).map((document) => (
                <div key={document.type} className="flex items-center justify-between border border-border px-3 py-2 text-sm">
                  <span>{document.label}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequiredDocuments((current) => current.filter((item) => item.type !== document.type))}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </CardContent>
            <CardFooter className="justify-end border-t px-6 py-4">
              <Button onClick={() => saveRequiredDocuments.mutate()} disabled={saveRequiredDocuments.isPending}>
                {saveRequiredDocuments.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar documentos
              </Button>
            </CardFooter>
          </Card>
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

function normalizeDocumentRequirements(values: unknown[]): DocumentRequirement[] {
  return values.flatMap((value) => {
    if (typeof value === 'string') {
      return [{ type: value, label: REQUIRED_DOCUMENT_PRESETS.find((item) => item.type === value)?.label ?? value }]
    }
    if (value && typeof value === 'object' && 'type' in value && 'label' in value) {
      const { type, label } = value as { type: unknown; label: unknown }
      if (typeof type === 'string' && typeof label === 'string') return [{ type, label }]
    }
    return []
  })
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

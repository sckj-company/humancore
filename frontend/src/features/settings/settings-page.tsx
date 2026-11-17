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
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { hasAnyRole, hasPermission, useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { ANGOLA_DOCUMENT_PRESETS } from '@/lib/document-presets'
import { SalaryComponentRegulationsPage } from '@/features/settings/salary-component-regulations-page'
import { PayrollTaxRulesPage } from '@/features/settings/payroll-tax-rules-page'
import type { DocumentRequirement, SettingGroups, SettingItem } from '@/types'

type ScalarValue = string | number | boolean

const SETTING_GROUP_META: { key: string; icon: typeof Building2; titleKey: string }[] = [
  { key: 'company', icon: Building2, titleKey: 'groups.company' },
  { key: 'hr', icon: Clock, titleKey: 'groups.hr' },
  { key: 'payroll', icon: Wallet, titleKey: 'groups.payroll' },
  { key: 'leave', icon: Palmtree, titleKey: 'groups.leave' },
  { key: 'communication', icon: Mail, titleKey: 'groups.communication' },
]
const DISCOUNT_SETTINGS: { key: string; labelKey: string; descriptionKey: string }[] = [
  { key: 'discounts.absence_daily_amount', labelKey: 'discounts.absenceDaily', descriptionKey: 'discounts.absenceDailyDescription' },
  { key: 'discounts.lateness_hourly_amount', labelKey: 'discounts.latenessHourly', descriptionKey: 'discounts.latenessHourlyDescription' },
  { key: 'discounts.lateness_accumulation_amount', labelKey: 'discounts.latenessThresholdAmount', descriptionKey: 'discounts.latenessThresholdAmountDescription' },
  { key: 'discounts.lateness_free_occurrences_per_week', labelKey: 'discounts.freeLateness', descriptionKey: 'discounts.freeLatenessDescription' },
  { key: 'discounts.lateness_weekly_accumulation_minutes', labelKey: 'discounts.weeklyAccumulation', descriptionKey: 'discounts.weeklyAccumulationDescription' },
  { key: 'discounts.dayoff_daily_amount', labelKey: 'discounts.dayOffDaily', descriptionKey: 'discounts.dayOffDailyDescription' },
  { key: 'discounts.default_amount', labelKey: 'discounts.default', descriptionKey: 'discounts.defaultDescription' },
]
const GROUP_ORDER = SETTING_GROUP_META.map((g) => g.key)
const REQUIRED_DOCUMENT_PRESETS: DocumentRequirement[] = ANGOLA_DOCUMENT_PRESETS

// ─── Super-Admin Tenant Banner ─────────────────────────────────────────────────
function SuperAdminTenantBanner() {
  const { t } = useTranslation()
  return (
    <div className="flex items-start gap-3 border border-amber-500/30 bg-amber-500/5 p-4">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-foreground">{t('settingsPage.superAdminTitle')}</p>
        <p className="text-xs text-muted-foreground">
          {t('settingsPage.superAdminDescription')}
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
    || hasPermission(user, 'view_any_setting')
  const queryClient = useQueryClient()

  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') || String(user?.tenant?.id || '')

  // General settings state
  const [edits, setEdits] = useState<Record<string, ScalarValue | string>>({})
  const [dirtyGroups, setDirtyGroups] = useState<Set<string>>(new Set())
  const [requiredDocuments, setRequiredDocuments] = useState<DocumentRequirement[]>([])
  const [newDocumentName, setNewDocumentName] = useState('')
  const [affectedPeriods, setAffectedPeriods] = useState<Array<{ id: number; name: string; status: string; records_count: number }>>([])
  const [globalRemuneration, setGlobalRemuneration] = useState({
    overtimeHourlyRate: '0',
    mealAmount: '0',
    mealPeriod: 'daily' as 'daily' | 'weekly' | 'fixed',
    transportAmount: '0',
    transportPeriod: 'daily' as 'daily' | 'weekly' | 'fixed',
    vacationAmount: '0',
    christmasAmount: '0',
    familyAmount: '0',
    additionalAmount: '0',
    bonusAmount: '0',
  })

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
    return GROUP_ORDER
      .map((key) => ({ key, items: data[key] ?? [] }))
      .filter((group) => group.items.some(isEditable))
  }, [data])

  const payrollDiscountSettings = useMemo(
    () =>
      (data?.payroll ?? [])
        .filter((s) => s.key.startsWith('discounts.') && s.key !== 'discounts.lateness_minute_amount')
        .sort((a, b) => a.key.localeCompare(b.key)),
    [data],
  )

  useEffect(() => {
    if (!data) return
    const next: Record<string, ScalarValue | string> = {}
    Object.values(data).flat().forEach((s) => {
      if (JSON_KEYS.has(s.key)) {
        next[`${s.group}.${s.key}`] = formatJsonValue(s.value)
      } else if (typeof s.value === 'string' || typeof s.value === 'number' || typeof s.value === 'boolean') {
        next[`${s.group}.${s.key}`] = s.value
      }
    })
    setEdits(next)

    const payrollMap = new Map((data.payroll ?? []).map((item) => [item.key, item.value]))
    const strOrZero = (val: unknown) => (val === undefined || val === null || val === '' ? '0' : String(val))
    const validPeriod = (val: unknown, fallback: 'daily' | 'weekly' | 'fixed') =>
      val === 'daily' || val === 'weekly' || val === 'fixed' ? val : fallback

    setGlobalRemuneration({
      overtimeHourlyRate: strOrZero(payrollMap.get('remuneration.overtime_hourly_rate')),
      mealAmount: strOrZero(payrollMap.get('remuneration.meal.amount') ?? payrollMap.get('subsidies.meal.daily')),
      mealPeriod: validPeriod(payrollMap.get('remuneration.meal.period'), 'daily'),
      transportAmount: strOrZero(payrollMap.get('remuneration.transport.amount') ?? payrollMap.get('subsidies.transport.monthly')),
      transportPeriod: validPeriod(payrollMap.get('remuneration.transport.period'), 'daily'),
      vacationAmount: strOrZero(payrollMap.get('remuneration.vacation.amount')),
      christmasAmount: strOrZero(payrollMap.get('remuneration.christmas.amount')),
      familyAmount: strOrZero(payrollMap.get('remuneration.family.amount')),
      additionalAmount: strOrZero(payrollMap.get('remuneration.additional.amount')),
      bonusAmount: strOrZero(payrollMap.get('remuneration.bonus.amount')),
    })
  }, [data])

  const save = useMutation({
    mutationFn: async (groupKey: string) => {
      const groupItems = data?.[groupKey] ?? []
      const values: Record<string, ScalarValue | string> = {}
      groupItems.forEach((s) => {
        const field = `${s.group}.${s.key}`
        values[s.key] = coerce(s, edits[field])
      })
      return api.put<{ affected_periods?: Array<{ id: number; name: string; status: string; records_count: number }> }>('settings/bulk', { group: groupKey, values })
    },
    onSuccess: (res) => {
      toast.success(t('settingsPage.saved'))
      setDirtyGroups(new Set())
      if (res?.affected_periods?.length) {
        setAffectedPeriods(res.affected_periods)
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('settingsPage.saveError'))),
  })
  const addDiscountRule = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.put('settings/bulk', { group: 'payroll', values: { [key]: value } }),
    onSuccess: () => {
      toast.success(t('settingsPage.discountAdded'))
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('settingsPage.discountAddError'))),
  })
  const saveRequiredDocuments = useMutation({
    mutationFn: () => api.put('settings/bulk', {
      group: 'documents',
      values: { required: requiredDocuments },
    }),
    onSuccess: () => {
      toast.success(t('settingsPage.documentsSaved'))
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('settingsPage.documentsSaveError'))),
  })
  const saveGlobalRemuneration = useMutation({
    mutationFn: () => {
      const num = (val: string) => {
        const parsed = Number(val)
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
      }
      return api.put<{ affected_periods?: Array<{ id: number; name: string; status: string; records_count: number }> }>('settings/bulk', {
        group: 'payroll',
        values: {
          'remuneration.overtime_hourly_rate': num(globalRemuneration.overtimeHourlyRate),
          'remuneration.meal.amount': num(globalRemuneration.mealAmount),
          'remuneration.meal.period': globalRemuneration.mealPeriod,
          'subsidies.meal.daily': globalRemuneration.mealPeriod === 'daily' ? num(globalRemuneration.mealAmount) : 0,
          'remuneration.transport.amount': num(globalRemuneration.transportAmount),
          'remuneration.transport.period': globalRemuneration.transportPeriod,
          'remuneration.vacation.amount': num(globalRemuneration.vacationAmount),
          'remuneration.christmas.amount': num(globalRemuneration.christmasAmount),
          'remuneration.family.amount': num(globalRemuneration.familyAmount),
          'remuneration.additional.amount': num(globalRemuneration.additionalAmount),
          'remuneration.bonus.amount': num(globalRemuneration.bonusAmount),
        },
      })
    },
    onSuccess: (res) => {
      toast.success(t('settingsPage.remunerationSaved'))
      if (res?.affected_periods?.length) {
        setAffectedPeriods(res.affected_periods)
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('settingsPage.remunerationSaveError'))),
  })

  const recalculateOpenPeriods = useMutation({
    mutationFn: async (periods: Array<{ id: number }>) => {
      for (const period of periods) {
        await api.post(`payroll/periods/${period.id}/process`)
      }
    },
    onSuccess: () => {
      toast.success(t('settingsPage.openPeriodsRecalculated'))
      setAffectedPeriods([])
      queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
      queryClient.invalidateQueries({ queryKey: ['payroll-period'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('settingsPage.remunerationSaveError'))),
  })

  if (!isAdmin) {
    return <ErrorState message={t('settingsPage.noPermission')} onRetry={() => {}} />
  }

  const update = (field: string, value: ScalarValue | string) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    const groupKey = field.split('.')[0]
    setDirtyGroups((prev) => new Set(prev).add(groupKey))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.title')}
        description={t('settingsPage.description')}
      />

      {/* Super-Admin Banner */}
      {isSuperAdmin && (
        <SuperAdminTenantBanner />
      )}

      {affectedPeriods.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {t('settingsPage.affectedPeriodsNotice', { count: affectedPeriods.length })}
            </p>
            <p className="text-xs text-muted-foreground">
              {affectedPeriods.map((p) => `${p.name} (${p.records_count})`).join(', ')}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => recalculateOpenPeriods.mutate(affectedPeriods)}
            disabled={recalculateOpenPeriods.isPending}
          >
            {recalculateOpenPeriods.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settingsPage.recalculateOpenPeriods')}
          </Button>
        </div>
      )}

      {/* Master Tabs */}
      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-2">
            <Building2 className="h-4 w-4" />
            {t('settingsPage.tabs.general')}
          </TabsTrigger>
          <TabsTrigger value="remuneration" className="gap-2">
            <DollarSign className="h-4 w-4" />
            {t('settingsPage.tabs.remuneration')}
          </TabsTrigger>
          <TabsTrigger value="discounts" className="gap-2">
            <Wallet className="h-4 w-4" />
            {t('settingsPage.tabs.discounts')}
          </TabsTrigger>
          <TabsTrigger value="salary-components" className="gap-2">
            <ListChecks className="h-4 w-4" />
            {t('settingsPage.tabs.salaryComponents')}
          </TabsTrigger>
          <TabsTrigger value="tax-rules" className="gap-2">
            <Scale className="h-4 w-4" />
            {t('settingsPage.tabs.taxRules')}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileCheck className="h-4 w-4" />
            {t('settingsPage.tabs.documents')}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Geral ── */}
        <TabsContent value="general" className="mt-6">
          {isLoading && <LoadingState />}
          {isError && <ErrorState message={t('settingsPage.loadError')} onRetry={refetch} />}
          {!isLoading && !isError && (
            groups.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t('settingsPage.emptyTitle')}</CardTitle>
                  <CardDescription>{t('settingsPage.emptyDescription')}</CardDescription>
                </CardHeader>
              </Card>
            ) : <Tabs defaultValue={groups[0]?.key} orientation="vertical" className="flex flex-col gap-6">
              <TabsList className="flex-wrap h-auto justify-start gap-1 bg-transparent p-0">
                {groups.map(({ key }) => {
                  const groupMeta = SETTING_GROUP_META.find((g) => g.key === key)
                  const Icon = groupMeta?.icon ?? Building2
                  const dirty = dirtyGroups.has(key)
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="gap-2 data-[state=active]:bg-muted data-[state=active]:shadow-none border border-transparent data-[state=active]:border-border"
                    >
                      <Icon className="h-4 w-4" />
                      {groupMeta ? t(`settingsPage.${groupMeta.titleKey}`) : key}
                      {dirty && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
              {groups.map(({ key, items }) => (
                <TabsContent key={key} value={key}>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {SETTING_GROUP_META.find((g) => g.key === key)
                          ? t(`settingsPage.${SETTING_GROUP_META.find((g) => g.key === key)!.titleKey}`)
                          : key}
                      </CardTitle>
                      <CardDescription>{t('settingsPage.groupDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 sm:grid-cols-2">
                      {items
                        .filter((s) => isEditable(s) && !(s.group === 'payroll' && (s.key.startsWith('remuneration.') || s.key.startsWith('subsidies.'))))
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
                        {t('settingsPage.save')}
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        {/* ── Tab: Remuneração Global ── */}
        <TabsContent value="remuneration" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settingsPage.remunerationTitle')}</CardTitle>
              <CardDescription>{t('settingsPage.remunerationDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <Label htmlFor="global-overtime-hourly-rate">{t('settingsPage.remunerationOvertimeHourlyRate')}</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    id="global-overtime-hourly-rate"
                    type="number"
                    min="0"
                    step="0.01"
                    value={globalRemuneration.overtimeHourlyRate}
                    onChange={(e) => setGlobalRemuneration((c) => ({ ...c, overtimeHourlyRate: e.target.value }))}
                  />
                  <p className="self-center text-xs text-muted-foreground">
                    {t('settingsPage.remunerationOvertimeHourlyRateHint')}
                  </p>
                </div>
              </div>

              {(
                [
                  {
                    key: 'meal',
                    title: t('employeeDetail.text.mealAllowance'),
                    amount: globalRemuneration.mealAmount,
                    period: globalRemuneration.mealPeriod,
                    periodEditable: true,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, mealAmount: v })),
                    onPeriod: (v: 'daily' | 'weekly' | 'fixed') => setGlobalRemuneration((c) => ({ ...c, mealPeriod: v })),
                  },
                  {
                    key: 'transport',
                    title: t('employeeDetail.text.transportAllowance'),
                    amount: globalRemuneration.transportAmount,
                    period: globalRemuneration.transportPeriod,
                    periodEditable: true,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, transportAmount: v })),
                    onPeriod: (v: 'daily' | 'weekly' | 'fixed') => setGlobalRemuneration((c) => ({ ...c, transportPeriod: v })),
                  },
                  {
                    key: 'vacation',
                    title: t('employeeDetail.text.vacationAllowance'),
                    amount: globalRemuneration.vacationAmount,
                    period: 'fixed' as const,
                    periodEditable: false,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, vacationAmount: v })),
                    onPeriod: () => undefined,
                  },
                  {
                    key: 'christmas',
                    title: t('employeeDetail.text.christmasAllowance'),
                    amount: globalRemuneration.christmasAmount,
                    period: 'fixed' as const,
                    periodEditable: false,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, christmasAmount: v })),
                    onPeriod: () => undefined,
                  },
                  {
                    key: 'family',
                    title: t('employeeDetail.text.familyAllowance'),
                    amount: globalRemuneration.familyAmount,
                    period: 'fixed' as const,
                    periodEditable: false,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, familyAmount: v })),
                    onPeriod: () => undefined,
                  },
                  {
                    key: 'additional',
                    title: t('employeeDetail.text.additionalAllowance'),
                    amount: globalRemuneration.additionalAmount,
                    period: 'fixed' as const,
                    periodEditable: false,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, additionalAmount: v })),
                    onPeriod: () => undefined,
                  },
                  {
                    key: 'bonus',
                    title: t('employeeDetail.text.bonusAllowance'),
                    amount: globalRemuneration.bonusAmount,
                    period: 'fixed' as const,
                    periodEditable: false,
                    onAmount: (v: string) => setGlobalRemuneration((c) => ({ ...c, bonusAmount: v })),
                    onPeriod: () => undefined,
                  },
                ]
              ).map((item) => (
                <div key={item.key} className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="font-medium">{item.title}</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t('employeeDetail.text.allowanceAmount')}</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.amount}
                        onChange={(e) => item.onAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('employeeDetail.text.allowancePeriod')}</Label>
                      <Select
                        value={item.period}
                        onValueChange={(v) => item.onPeriod(v as 'daily' | 'weekly' | 'fixed')}
                        disabled={!item.periodEditable}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">{t('employeeDetail.text.daily')}</SelectItem>
                          <SelectItem value="weekly">{t('employeeDetail.text.weekly')}</SelectItem>
                          <SelectItem value="fixed">{t('employeeDetail.text.fixedPerPayroll')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
            <CardFooter className="justify-end border-t px-6 py-4">
              <Button onClick={() => saveGlobalRemuneration.mutate()} disabled={saveGlobalRemuneration.isPending}>
                {saveGlobalRemuneration.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('settingsPage.remunerationSave')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ── Tab: Descontos ── */}
        <TabsContent value="discounts" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('settingsPage.discountTitle')}</CardTitle>
              <CardDescription>
                {t('settingsPage.discountDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {payrollDiscountSettings.map((setting) => {
                  const config = DISCOUNT_SETTINGS.find((item) => item.key === setting.key)
                  const fieldName = `${setting.group}.${setting.key}`

                  return (
                    <div key={setting.key} className="rounded-lg border border-border p-4 bg-muted/20">
                      <div className="mb-3 space-y-1">
                        <p className="text-sm font-medium">{config ? t(`settingsPage.${config.labelKey}`) : humanize(setting.key)}</p>
                        <p className="text-xs text-muted-foreground">
                          {config ? t(`settingsPage.${config.descriptionKey}`) : t('settingsPage.discountFallbackDescription')}
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
                    <p className="text-sm font-medium">{t(`settingsPage.${rule.labelKey}`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`settingsPage.${rule.descriptionKey}`)}</p>
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
                    {t('settingsPage.add')}
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
                {t('settingsPage.save')}
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
              <CardTitle>{t('settingsPage.documentTitle')}</CardTitle>
              <CardDescription>
                {t('settingsPage.documentDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRequiredDocuments((current) => {
                    const existingByType = new Map(current.map((d) => [d.type, d]))
                    const presets = REQUIRED_DOCUMENT_PRESETS.map((p) => existingByType.get(p.type) ?? { ...p, required: true })
                    const customDocs = current.filter((d) => !REQUIRED_DOCUMENT_PRESETS.some((p) => p.type === d.type))
                    return [...presets, ...customDocs]
                  })}
                >
                  {t('settingsPage.selectAllDocuments', { defaultValue: 'Selecionar todos' })}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRequiredDocuments([])}
                >
                  {t('settingsPage.clearDocuments', { defaultValue: 'Limpar seleção' })}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {REQUIRED_DOCUMENT_PRESETS.map((document) => {
                  const selectedDoc = requiredDocuments.find((required) => required.type === document.type)
                  const isVisible = !!selectedDoc
                  const isMandatory = selectedDoc ? (selectedDoc.required ?? true) : true
                  return (
                    <div key={document.type} className="flex flex-col justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(event) => setRequiredDocuments((current) => event.target.checked
                            ? [...current, { ...document, required: true }]
                            : current.filter((required) => required.type !== document.type))}
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="font-medium">
                          {t(`settingsPage.documentTypes.${document.type}`)}
                        </span>
                      </label>
                      {isVisible && (
                        <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                          <span className={isMandatory ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                            {isMandatory
                              ? t('settingsPage.documentMandatory', { defaultValue: 'Obrigatório' })
                              : t('settingsPage.documentOptional', { defaultValue: 'Opcional' })}
                          </span>
                          <Switch
                            checked={isMandatory}
                            onCheckedChange={(checked) => setRequiredDocuments((current) =>
                              current.map((item) => item.type === document.type ? { ...item, required: checked } : item),
                            )}
                            aria-label={t('settingsPage.toggleMandatoryAria', {
                              defaultValue: 'Tornar obrigatório',
                            })}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newDocumentName}
                  onChange={(event) => setNewDocumentName(event.target.value)}
                  placeholder={t('settingsPage.customDocumentPlaceholder')}
                  aria-label={t('settingsPage.customDocumentAriaLabel')}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const label = newDocumentName.trim()
                    const type = `custom_${label.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
                    if (!label || requiredDocuments.some((document) => document.type === type)) return
                    setRequiredDocuments((current) => [...current, { type, label, required: true }])
                    setNewDocumentName('')
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />{t('settingsPage.add')}
                </Button>
              </div>

              {requiredDocuments.filter((document) => document.type.startsWith('custom_')).map((document) => {
                const isMandatory = document.required ?? true
                return (
                  <div key={document.type} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{document.label}</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-xs">
                        <span className={isMandatory ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                          {isMandatory
                            ? t('settingsPage.documentMandatory', { defaultValue: 'Obrigatório' })
                            : t('settingsPage.documentOptional', { defaultValue: 'Opcional' })}
                        </span>
                        <Switch
                          checked={isMandatory}
                          onCheckedChange={(checked) => setRequiredDocuments((current) =>
                            current.map((item) => item.type === document.type ? { ...item, required: checked } : item),
                          )}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRequiredDocuments((current) => current.filter((item) => item.type !== document.type))}
                      >
                        {t('settingsPage.remove')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
            <CardFooter className="justify-end border-t px-6 py-4">
              <Button onClick={() => saveRequiredDocuments.mutate()} disabled={saveRequiredDocuments.isPending}>
                {saveRequiredDocuments.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {t('settingsPage.saveDocuments')}
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

function formatJsonValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2) ?? ''
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
          value={String(value ?? '')}
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
      return [{ type: value, label: REQUIRED_DOCUMENT_PRESETS.find((item) => item.type === value)?.label ?? value, required: true }]
    }
    if (value && typeof value === 'object' && 'type' in value && 'label' in value) {
      const { type, label, required } = value as { type: unknown; label: unknown; required?: unknown }
      if (typeof type === 'string' && typeof label === 'string') {
        return [{ type, label, required: typeof required === 'boolean' ? required : true }]
      }
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

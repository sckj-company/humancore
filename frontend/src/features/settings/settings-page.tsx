import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Save, Loader2, Building2, Clock, Wallet, Palmtree, Mail } from 'lucide-react'
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
import type { SettingGroups, SettingItem } from '@/types'

type ScalarValue = string | number | boolean

const GROUP_META: { key: string; icon: typeof Building2; title: string }[] = [
  { key: 'company', icon: Building2, title: 'Empresa' },
  { key: 'hr', icon: Clock, title: 'Recursos Humanos' },
  { key: 'payroll', icon: Wallet, title: 'Folha de Pagamento' },
  { key: 'leave', icon: Palmtree, title: 'Férias e Ausências' },
  { key: 'communication', icon: Mail, title: 'Comunicação' },
]
const GROUP_ORDER = GROUP_META.map((g) => g.key)

export function SettingsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
  const queryClient = useQueryClient()

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

  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState message="Não foi possível carregar as configurações." onRetry={refetch} />

  const update = (field: string, value: ScalarValue | string) => {
    setEdits((prev) => ({ ...prev, [field]: value }))
    const groupKey = field.split('.')[0]
    setDirtyGroups((prev) => new Set(prev).add(groupKey))
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} description="Configure a empresa, os horários e as regras do sistema." />
      <Tabs defaultValue={groups[0]?.key}>
        <TabsList className="flex-wrap">
          {groups.map(({ key }) => {
            const Icon = GROUP_META.find((g) => g.key === key)?.icon ?? Building2
            const dirty = dirtyGroups.has(key)
            return (
              <TabsTrigger key={key} value={key} className="gap-2">
                <Icon className="h-4 w-4" />
                {GROUP_META.find((g) => g.key === key)?.title ?? key}
                {dirty && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {groups.map(({ key, items }) => (
          <TabsContent key={key} value={key} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{GROUP_META.find((g) => g.key === key)?.title ?? key}</CardTitle>
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
    </div>
  )
}

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

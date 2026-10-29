import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EChartsOption } from 'echarts'
import { z } from 'zod'
import {
  Building2,
  Users,
  Globe2,
  Loader2,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Search,
  Power,
  UserRound,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { KpiCard } from '@/components/shared/kpi-card'
import { Chart } from '@/components/charts/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import type { Paginated, SuperAdminDashboard, Tenant } from '@/types'

const statusVariant = { active: 'success', inactive: 'secondary', suspended: 'warning' } as const

const tenantSchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug inválido (minúsculas, números, hífens)'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  tax_id: z.string().optional().or(z.literal('')),
  currency: z.string().length(3).optional().or(z.literal('')),
  locale: z.string().optional().or(z.literal('')),
  timezone: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'suspended']),
})

type TenantForm = z.infer<typeof tenantSchema>

const emptyForm: TenantForm = {
  name: '',
  slug: '',
  email: '',
  tax_id: '',
  currency: 'AOA',
  locale: 'pt',
  timezone: 'Africa/Luanda',
  status: 'active',
}

export function SuperAdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [form, setForm] = useState<TenantForm>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: dash, isLoading, isError, refetch } = useQuery({
    queryKey: ['superadmin', 'dashboard'],
    queryFn: () => api.get<SuperAdminDashboard>('superadmin/dashboard'),
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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['superadmin'] })
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setDialogOpen(true)
  }

  const openEdit = (t: Tenant) => {
    setEditing(t)
    setForm({
      name: t.name,
      slug: t.slug,
      email: t.email ?? '',
      tax_id: t.tax_id ?? '',
      currency: t.currency ?? 'AOA',
      locale: t.locale ?? 'pt',
      timezone: t.timezone ?? 'Africa/Luanda',
      status: t.status,
    })
    setErrors({})
    setDialogOpen(true)
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
    onSuccess: () => {
      toast.success('Estado atualizado')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro')),
  })

  const deleteTenant = useMutation({
    mutationFn: (id: number) => api.delete(`superadmin/tenants/${id}`),
    onSuccess: () => {
      toast.success('Empresa eliminada')
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar empresa')),
  })

  const handleSubmit = () => {
    const parsed = tenantSchema.safeParse(form)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      parsed.error.issues.forEach((i) => {
        errs[i.path[0] as string] = i.message
      })
      setErrors(errs)
      return
    }
    setErrors({})
    saveTenant.mutate(parsed.data)
  }

  if (isLoading) return <LoadingState />

  const trendOption: EChartsOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)', fontSize: 12 },
      padding: [8, 12],
    },
    grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      data: dash?.tenant_trend.map((d) => d.label) ?? [],
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
        data: dash?.tenant_trend.map((d) => d.count) ?? [],
        itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }

  const segmentsOption: EChartsOption = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--popover-foreground)' },
    },
    legend: { bottom: 0, textStyle: { fontSize: 11, color: 'var(--muted-foreground)' } },
    series: [
      {
        name: 'Segmentos',
        type: 'pie',
        radius: ['55%', '78%'],
        center: ['50%', '45%'],
        itemStyle: { borderRadius: 6, borderColor: 'var(--card)', borderWidth: 2 },
        label: {
          show: true,
          position: 'center',
          formatter: () => {
            const total = Object.values(dash?.segments ?? {}).reduce((a, b) => a + b, 0)
            return `{total|${total}}\n{label|Tenants}`
          },
          rich: {
            total: { fontSize: 22, fontWeight: 700, color: 'var(--foreground)' },
            label: { fontSize: 11, color: 'var(--muted-foreground)', padding: [4, 0, 0, 0] },
          },
        },
        data: [
          { name: 'Pequenas (≤10)', value: dash?.segments.small ?? 0 },
          { name: 'Médias (11–50)', value: dash?.segments.medium ?? 0 },
          { name: 'Grandes (>50)', value: dash?.segments.large ?? 0 },
        ],
      },
    ],
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="SUPER ADMIN"
        title="Gestão da Plataforma"
        description="Visão global da plataforma e gestão de empresas (tenants)"
      />

      {isError && <ErrorState message="Erro ao carregar dados da plataforma" onRetry={refetch} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Empresas"
          value={dash?.kpis.total_tenants ?? 0}
          icon={Building2}
          accent="primary"
          sparkline={dash?.tenant_trend.map((d) => d.count)}
        />
        <KpiCard label="Empresas ativas" value={dash?.kpis.active_tenants ?? 0} icon={Globe2} accent="success" />
        <KpiCard label="Empresas suspensas" value={dash?.kpis.suspended_tenants ?? 0} icon={Power} accent="warning" />
        <KpiCard label="Funcionários" value={dash?.kpis.total_employees ?? 0} icon={Users} accent="info" />
        <KpiCard label="Utilizadores" value={dash?.kpis.total_users ?? 0} icon={ShieldCheck} accent="neutral" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução de empresas criadas</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={trendOption} height={260} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Segmentação por dimensão</CardTitle>
          </CardHeader>
          <CardContent>
            <Chart option={segmentsOption} height={260} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Empresas registadas</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova empresa
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Pesquisar por nome, slug ou email..."
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

          {loadingTenants ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Empresa</th>
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
                            <p className="text-xs text-muted-foreground">
                              {t.slug} · {t.email ?? '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={statusVariant[t.status] ?? 'secondary'}>{t.status}</Badge>
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
                          <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: t.id,
                                status: t.status === 'suspended' ? 'active' : 'suspended',
                              })
                            }
                          >
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleteTenant.isPending}
                            onClick={() => {
                              if (window.confirm(`Eliminar a empresa "${t.name}"?`)) deleteTenant.mutate(t.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingTenants && (tenants?.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
            <DialogDescription>
              Configure os dados da empresa no HRMS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Moeda</Label>
                <Input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5">
                <Label>Locale</Label>
                <Input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
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
            {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={saveTenant.isPending}>
                {saveTenant.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
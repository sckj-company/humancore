import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Laptop,
  Smartphone,
  Car,
  ShieldCheck,
  Wrench,
  KeyRound,
  Package,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Search,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  EmployeeAsset,
  EmployeeAssetCategory,
  EmployeeAssetCondition,
  EmployeeAssetsResponse,
  EmployeeAssetStatus,
} from '@/types'

interface EmployeeAssetsTabProps {
  employeeId: number
  employeeName: string
  canManage: boolean
  currency: string
  locale: string
}

const CATEGORY_OPTIONS: Array<{ value: EmployeeAssetCategory; label: string }> = [
  { value: 'computer', label: 'Computador / Portátil' },
  { value: 'phone', label: 'Telemóvel / Tablet' },
  { value: 'vehicle', label: 'Viatura / Motorizada' },
  { value: 'uniform', label: 'Fardamento / EPI' },
  { value: 'tool', label: 'Ferramenta / Equipamento Técnico' },
  { value: 'furniture', label: 'Mobiliário' },
  { value: 'access_card', label: 'Cartão de Acesso / Chaves' },
  { value: 'other', label: 'Outro Activo' },
]

const CONDITION_OPTIONS: Array<{ value: EmployeeAssetCondition; label: string; color: string }> = [
  { value: 'new', label: 'Novo', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  { value: 'good', label: 'Bom estado', color: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  { value: 'fair', label: 'Uso normal / Razoável', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  { value: 'damaged', label: 'Danificado / Avariado', color: 'bg-orange-500/15 text-orange-700 border-orange-500/30' },
  { value: 'lost', label: 'Extraviado / Perdido', color: 'bg-destructive/15 text-destructive border-destructive/30' },
]

const STATUS_OPTIONS: Array<{ value: EmployeeAssetStatus; label: string; color: string }> = [
  { value: 'assigned', label: 'Atribuído / Em posse', color: 'bg-primary/10 text-primary border-primary/30' },
  { value: 'returned', label: 'Devolvido', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  { value: 'damaged_pending', label: 'Danificado (Pendente imputação)', color: 'bg-orange-500/15 text-orange-700 border-orange-500/30' },
  { value: 'lost_unreturned', label: 'Extraviado / Não devolvido', color: 'bg-destructive/15 text-destructive border-destructive/30' },
  { value: 'maintenance', label: 'Em manutenção', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
]

function CategoryIcon({ category }: { category: EmployeeAssetCategory }) {
  switch (category) {
    case 'computer':
      return <Laptop className="h-4 w-4" />
    case 'phone':
      return <Smartphone className="h-4 w-4" />
    case 'vehicle':
      return <Car className="h-4 w-4" />
    case 'uniform':
      return <ShieldCheck className="h-4 w-4" />
    case 'tool':
      return <Wrench className="h-4 w-4" />
    case 'access_card':
      return <KeyRound className="h-4 w-4" />
    default:
      return <Package className="h-4 w-4" />
  }
}

export function EmployeeAssetsTab({
  employeeId,
  employeeName,
  canManage,
  currency,
  locale,
}: EmployeeAssetsTabProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const todayStr = new Date().toISOString().slice(0, 10)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<EmployeeAsset | null>(null)
  const [form, setForm] = useState({
    name: '',
    category: 'computer' as EmployeeAssetCategory,
    asset_code: '',
    serial_number: '',
    brand_model: '',
    condition: 'good' as EmployeeAssetCondition,
    status: 'assigned' as EmployeeAssetStatus,
    estimated_value: '',
    chargeable_amount: '',
    deduct_on_termination: true,
    assigned_at: todayStr,
    expected_return_at: '',
    returned_at: '',
    return_notes: '',
    notes: '',
  })

  const { data, isLoading } = useQuery<EmployeeAssetsResponse>({
    queryKey: ['employee-assets', employeeId],
    queryFn: () => api.get<EmployeeAssetsResponse>(`employees/${employeeId}/assets`),
  })

  const assets = data?.items ?? []
  const summary = data?.summary ?? {
    total_count: 0,
    assigned_count: 0,
    returned_count: 0,
    issue_count: 0,
    total_estimated_value: 0,
    active_assigned_value: 0,
    pending_liability_amount: 0,
  }

  const fmtCurrency = (val: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(val || 0)

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (q) {
        const hay = `${item.name} ${item.asset_code ?? ''} ${item.serial_number ?? ''} ${item.brand_model ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [assets, search, statusFilter])

  const openCreateDialog = () => {
    setEditingAsset(null)
    setForm({
      name: '',
      category: 'computer',
      asset_code: '',
      serial_number: '',
      brand_model: '',
      condition: 'good',
      status: 'assigned',
      estimated_value: '',
      chargeable_amount: '',
      deduct_on_termination: true,
      assigned_at: todayStr,
      expected_return_at: '',
      returned_at: '',
      return_notes: '',
      notes: '',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (asset: EmployeeAsset, markAsReturned = false) => {
    setEditingAsset(asset)
    setForm({
      name: asset.name,
      category: asset.category,
      asset_code: asset.asset_code ?? '',
      serial_number: asset.serial_number ?? '',
      brand_model: asset.brand_model ?? '',
      condition: asset.condition,
      status: markAsReturned ? 'returned' : asset.status,
      estimated_value: String(asset.estimated_value ?? 0),
      chargeable_amount: String(asset.chargeable_amount ?? 0),
      deduct_on_termination: asset.deduct_on_termination,
      assigned_at: asset.assigned_at ?? todayStr,
      expected_return_at: asset.expected_return_at ?? '',
      returned_at: markAsReturned ? (asset.returned_at || todayStr) : (asset.returned_at ?? ''),
      return_notes: asset.return_notes ?? '',
      notes: asset.notes ?? '',
    })
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        asset_code: form.asset_code.trim() || null,
        serial_number: form.serial_number.trim() || null,
        brand_model: form.brand_model.trim() || null,
        condition: form.condition,
        status: form.status,
        estimated_value: Number(form.estimated_value) || 0,
        chargeable_amount: Number(form.chargeable_amount) || 0,
        deduct_on_termination: form.deduct_on_termination,
        assigned_at: form.assigned_at || null,
        expected_return_at: form.expected_return_at || null,
        returned_at: form.returned_at || null,
        return_notes: form.return_notes.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (editingAsset) {
        return api.put(`employees/${employeeId}/assets/${editingAsset.id}`, payload)
      }
      return api.post(`employees/${employeeId}/assets`, payload)
    },
    onSuccess: () => {
      toast.success(
        editingAsset
          ? t('employeeDetail.assets.updated', { defaultValue: 'Activo atualizado com sucesso.' })
          : t('employeeDetail.assets.created', { defaultValue: 'Activo atribuído ao funcionário.' }),
      )
      setDialogOpen(false)
      qc.invalidateQueries({ queryKey: ['employee-assets', employeeId] })
    },
    onError: (e) =>
      toast.error(getApiErrorMessage(e, t('employeeDetail.assets.saveError', { defaultValue: 'Não foi possível guardar o activo.' }))),
  })

  const deleteMutation = useMutation({
    mutationFn: (assetId: number) => api.delete(`employees/${employeeId}/assets/${assetId}`),
    onSuccess: () => {
      toast.success(t('employeeDetail.assets.deleted', { defaultValue: 'Activo removido.' }))
      qc.invalidateQueries({ queryKey: ['employee-assets', employeeId] })
    },
    onError: (e) =>
      toast.error(getApiErrorMessage(e, t('employeeDetail.assets.deleteError', { defaultValue: 'Erro ao eliminar activo.' }))),
  })

  return (
    <div className="mt-6 space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {t('employeeDetail.assets.inPossession', { defaultValue: 'Em Posse do Funcionário' })}
            </p>
            <p className="text-xl font-bold text-foreground">
              {summary.assigned_count}{' '}
              <span className="text-xs font-normal text-muted-foreground">/ {summary.total_count} total</span>
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {t('employeeDetail.assets.returned', { defaultValue: 'Activos Devolvidos' })}
            </p>
            <p className="text-xl font-bold text-foreground">{summary.returned_count}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-orange-500/10 p-2.5 text-orange-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {t('employeeDetail.assets.damagedOrLost', { defaultValue: 'Com Dano ou Extravio' })}
            </p>
            <p className="text-xl font-bold text-foreground">{summary.issue_count}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-rose-500/10 p-2.5 text-rose-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">
              {t('employeeDetail.assets.pendingLiability', { defaultValue: 'Valor Imputável / Em Risco' })}
            </p>
            <p className="text-sm font-bold font-mono truncate text-foreground">
              {fmtCurrency(summary.pending_liability_amount)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t('employeeDetail.assets.deductibleOnTermination', { defaultValue: 'Abatível na rescisão se não devolvido' })}
            </p>
          </div>
        </Card>
      </div>

      {/* Main Assets Table Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Laptop className="h-4 w-4 text-primary" />
                {t('employeeDetail.assets.heading', { defaultValue: 'Controlo de Activos e Equipamentos Atribuídos' })}
              </CardTitle>
              <CardDescription>
                {t('employeeDetail.assets.description', {
                  defaultValue: 'Acompanhe o estado de conservação, devoluções e responsabilidades financeiras sobre equipamentos da empresa.',
                })}
              </CardDescription>
            </div>
            {canManage && (
              <Button size="sm" className="gap-1.5" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                {t('employeeDetail.assets.assignButton', { defaultValue: 'Atribuir Activo' })}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('employeeDetail.assets.searchPlaceholder', {
                  defaultValue: 'Filtrar por nome, código de património ou nº de série...',
                })}
                className="h-9 pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-52">
                <SelectValue placeholder="Estado do activo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              A carregar activos atribuídos...
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
              <div className="rounded-full bg-primary/10 p-4 mb-3 text-primary">
                <Package className="h-8 w-8" />
              </div>
              <p className="text-sm font-semibold">
                {t('employeeDetail.assets.emptyTitle', { defaultValue: 'Nenhum activo registado' })}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {t('employeeDetail.assets.emptyDescription', {
                  defaultValue: 'Registe computadores, telemóveis, viaturas, EPIs ou ferramentas entregues a este funcionário.',
                })}
              </p>
              {canManage && (
                <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={openCreateDialog}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('employeeDetail.assets.assignButton', { defaultValue: 'Atribuir Activo' })}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Activo / Equipamento</th>
                    <th className="px-4 py-3 font-semibold">Código / Nº Série</th>
                    <th className="px-4 py-3 font-semibold">Condição</th>
                    <th className="px-4 py-3 font-semibold">Estado Atual</th>
                    <th className="px-4 py-3 font-semibold text-right">Valor Estimado</th>
                    <th className="px-4 py-3 font-semibold text-right">Imputável / Pendente</th>
                    <th className="px-4 py-3 font-semibold">Datas</th>
                    {canManage && <th className="px-4 py-3 font-semibold text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAssets.map((asset) => {
                    const conditionOpt = CONDITION_OPTIONS.find((c) => c.value === asset.condition)
                    const statusOpt = STATUS_OPTIONS.find((s) => s.value === asset.status)

                    return (
                      <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
                              <CategoryIcon category={asset.category} />
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">{asset.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {asset.category_label}
                                {asset.brand_model ? ` · ${asset.brand_model}` : ''}
                              </p>
                              {asset.notes && (
                                <p className="text-[11px] text-muted-foreground italic mt-0.5 line-clamp-1">
                                  {asset.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <div>{asset.asset_code || '—'}</div>
                          {asset.serial_number && (
                            <div className="text-[11px] text-muted-foreground">S/N: {asset.serial_number}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${conditionOpt?.color ?? ''}`}>
                            {conditionOpt?.label ?? asset.condition_label ?? asset.condition}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="outline" className={`text-xs ${statusOpt?.color ?? ''}`}>
                              {statusOpt?.label ?? asset.status_label ?? asset.status}
                            </Badge>
                            {asset.is_settled && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                Liquidado na rescisão
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {fmtCurrency(asset.estimated_value)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {asset.pending_liability_amount > 0 ? (
                            <span className="font-semibold text-destructive">
                              {fmtCurrency(asset.pending_liability_amount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          <div>Atribuído: <span className="font-mono">{asset.assigned_at ?? '—'}</span></div>
                          {asset.returned_at && (
                            <div className="text-emerald-600">
                              Devolvido: <span className="font-mono">{asset.returned_at}</span>
                            </div>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {asset.status !== 'returned' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs gap-1"
                                  title="Registar devolução do activo"
                                  onClick={() => openEditDialog(asset, true)}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  Devolver
                                </Button>
                              )}
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => openEditDialog(asset, false)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={deleteMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Remover o activo "${asset.name}"?`)) {
                                    deleteMutation.mutate(asset.id)
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Criar / Editar Activo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-[95vw] sm:max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-6 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Laptop className="h-5 w-5 text-primary" />
              {editingAsset ? 'Editar Activo / Estado de Conservação' : 'Atribuir Novo Activo ao Funcionário'}
            </DialogTitle>
            <DialogDescription>
              Funcionário: <strong>{employeeName}</strong>. Os activos não devolvidos ou danificados podem ser abatidos automaticamente na rescisão contratual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Bloco 1: Identificação do Activo */}
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                1. Identificação do Activo e Património
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Label className="text-xs font-semibold">
                    Nome / Descrição do Activo <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Portátil MacBook Pro 14 M3 / Telemóvel Corporativo"
                    className="mt-1.5 bg-background"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Categoria</Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => setForm((p) => ({ ...p, category: v as EmployeeAssetCategory }))}
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Marca / Modelo</Label>
                  <Input
                    value={form.brand_model}
                    onChange={(e) => setForm((p) => ({ ...p, brand_model: e.target.value }))}
                    placeholder="Ex: Dell Latitude 5540"
                    className="mt-1.5 bg-background"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Código de Património</Label>
                  <Input
                    value={form.asset_code}
                    onChange={(e) => setForm((p) => ({ ...p, asset_code: e.target.value }))}
                    placeholder="Ex: PAT-2026-041"
                    className="mt-1.5 bg-background font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <Label className="text-xs font-semibold">Número de Série (S/N)</Label>
                  <Input
                    value={form.serial_number}
                    onChange={(e) => setForm((p) => ({ ...p, serial_number: e.target.value }))}
                    placeholder="Ex: SN-9843120B"
                    className="mt-1.5 bg-background font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Bloco 2: Estado, Conservação e Valores */}
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                2. Estado de Conservação e Valorização
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label className="text-xs font-semibold">Condição Física</Label>
                  <Select
                    value={form.condition}
                    onValueChange={(v) => setForm((p) => ({ ...p, condition: v as EmployeeAssetCondition }))}
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Situação / Posse</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        status: v as EmployeeAssetStatus,
                        returned_at: v === 'returned' && !p.returned_at ? todayStr : p.returned_at,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Valor Estimado ({currency})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.estimated_value}
                    onChange={(e) => setForm((p) => ({ ...p, estimated_value: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1.5 bg-background font-mono"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Valor Imputável ({currency})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.chargeable_amount}
                    onChange={(e) => setForm((p) => ({ ...p, chargeable_amount: e.target.value }))}
                    placeholder="Se 0, usa estimado"
                    className="mt-1.5 bg-background font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Bloco 3: Datas, Devolução e Termo */}
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                3. Datas, Responsabilidade e Observações
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold">Data de Entrega / Atribuição</Label>
                  <Input
                    type="date"
                    value={form.assigned_at}
                    onChange={(e) => setForm((p) => ({ ...p, assigned_at: e.target.value }))}
                    className="mt-1.5 bg-background"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">Data de Devolução (se devolvido)</Label>
                  <Input
                    type="date"
                    value={form.returned_at}
                    onChange={(e) => setForm((p) => ({ ...p, returned_at: e.target.value }))}
                    className="mt-1.5 bg-background"
                  />
                </div>

                <label className="sm:col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Descontar automaticamente em caso de Rescisão sem Devolução</p>
                    <p className="text-xs text-muted-foreground">
                      Se o funcionário rescindir o contrato enquanto o activo estiver em sua posse, danificado ou extraviado, o valor será incluído nas pendências a descontar no acerto final.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.deduct_on_termination}
                    onChange={(e) => setForm((p) => ({ ...p, deduct_on_termination: e.target.checked }))}
                    className="h-4 w-4 shrink-0"
                  />
                </label>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">Observações / Termo de Responsabilidade</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Observações sobre acessórios entregues (carregador, mala), estado inicial ou avarias..."
                    className="mt-1.5 bg-background"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-3.5 gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingAsset ? 'Guardar Alterações' : 'Atribuir Activo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

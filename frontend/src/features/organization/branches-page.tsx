import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Plus, Pencil, Trash2, Search, Building, Phone, Mail, User, Crown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared/page-header'
import {
  type Branch,
  type BranchPayload,
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useEmployeesSummary,
} from './api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'

export function BranchesPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  // Delete target
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null)

  // Form state
  const [formData, setFormData] = useState<BranchPayload>({
    name: '',
    code: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    manager_id: null,
    is_headquarter: false,
    status: 'active',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Hooks
  const { data: branches, isLoading, isError, refetch } = useBranches()
  const { data: employees } = useEmployeesSummary()

  const createMutation = useCreateBranch()
  const updateMutation = useUpdateBranch()
  const deleteMutation = useDeleteBranch()

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingBranch(null)
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      phone: '',
      email: '',
      manager_id: null,
      is_headquarter: false,
      status: 'active',
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Open Edit Dialog
  const handleOpenEdit = (b: Branch) => {
    setEditingBranch(b)
    setFormData({
      name: b.name,
      code: b.code ?? '',
      address: b.address ?? '',
      city: b.city ?? '',
      phone: b.phone ?? '',
      email: b.email ?? '',
      manager_id: b.manager_id ?? null,
      is_headquarter: Boolean(b.is_headquarter),
      status: b.status,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.name.trim()) {
      errors.name = 'O nome da filial é obrigatório.'
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Insira um email válido.'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      if (editingBranch) {
        await updateMutation.mutateAsync({
          id: editingBranch.id,
          data: {
            ...formData,
            code: formData.code?.trim() || null,
            address: formData.address?.trim() || null,
            city: formData.city?.trim() || null,
            phone: formData.phone?.trim() || null,
            email: formData.email?.trim() || null,
          },
        })
        toast.success('Filial atualizada com sucesso!')
      } else {
        await createMutation.mutateAsync({
          ...formData,
          code: formData.code?.trim() || null,
          address: formData.address?.trim() || null,
          city: formData.city?.trim() || null,
          phone: formData.phone?.trim() || null,
          email: formData.email?.trim() || null,
        })
        toast.success('Filial criada com sucesso!')
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao gravar filial.'))
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success('Filial eliminada com sucesso!')
      setDeleteTarget(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao eliminar filial.'))
    }
  }

  // Filter branches
  const filtered = (branches ?? []).filter((b) => {
    const matchesSearch =
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.code && b.code.toLowerCase().includes(search.toLowerCase())) ||
      (b.city && b.city.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.branches', { defaultValue: 'Filiais' })}
        description="Gestão de sedes, filiais e localizações físicas da organização"
        actions={
          <Button onClick={handleOpenCreate} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> Nova Filial
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por nome, código ou cidade..."
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Erro ao carregar filiais" onRetry={refetch} />}

      {branches && filtered.length === 0 && (
        <EmptyState
          title="Nenhuma filial encontrada"
          description={search ? 'Tente ajustar os filtros de pesquisa.' : 'Registe a sede ou primeira filial da empresa.'}
        />
      )}

      {/* Branches Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((b) => {
          const managerName =
            b.manager?.full_name ?? employees?.find((e) => e.id === b.manager_id)?.full_name

          return (
            <Card key={b.id} className="group relative flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Building className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold leading-tight text-foreground">{b.name}</h3>
                        {b.is_headquarter && (
                          <Badge variant="default" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/30 text-[10px] flex items-center gap-1">
                            <Crown className="h-3 w-3" /> Sede
                          </Badge>
                        )}
                      </div>
                      {b.code && (
                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground mt-0.5">
                          {b.code}
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="capitalize shrink-0">
                    {b.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  {(b.city || b.address) && (
                    <div className="flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">
                        {b.city && <strong className="font-medium text-foreground">{b.city}</strong>}
                        {b.city && b.address && ' · '}
                        {b.address}
                      </span>
                    </div>
                  )}

                  {b.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="font-mono">{b.phone}</span>
                    </div>
                  )}

                  {b.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{b.email}</span>
                    </div>
                  )}

                  {managerName && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">Responsável: {managerName}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {b.department_count ?? 0} departamento{(b.department_count ?? 0) !== 1 ? 's' : ''}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEdit(b)}
                      title="Editar filial"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(b)}
                      title="Eliminar filial"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBranch ? 'Editar Filial' : 'Nova Filial'}
            </DialogTitle>
            <DialogDescription>
              {editingBranch
                ? 'Atualize os dados e localização da filial.'
                : 'Registe uma nova sede ou unidade de operação da empresa.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Nome da Filial *</Label>
              <Input
                id="branch-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }))
                }}
                placeholder="Ex: Sede Luanda, Delegação Benguela..."
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-code">Código</Label>
                <Input
                  id="branch-code"
                  value={formData.code ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="Ex: FIL-01, SEDE"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch-status">Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: 'active' | 'inactive') =>
                    setFormData((prev) => ({ ...prev, status: val }))
                  }
                >
                  <SelectTrigger id="branch-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-city">Cidade</Label>
                <Input
                  id="branch-city"
                  value={formData.city ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="Ex: Luanda, Benguela, Lubango..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch-phone">Telefone</Label>
                <Input
                  id="branch-phone"
                  value={formData.phone ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="+244 9..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch-address">Endereço Completo</Label>
              <Input
                id="branch-address"
                value={formData.address ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Rua, Número, Edifício, Bairro..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch-email">Email de Contacto</Label>
                <Input
                  id="branch-email"
                  type="email"
                  value={formData.email ?? ''}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                    if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }))
                  }}
                  placeholder="filial@empresa.co.ao"
                />
                {formErrors.email && (
                  <p className="text-xs text-destructive">{formErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch-manager">Responsável / Gerente</Label>
                <Select
                  value={formData.manager_id ? String(formData.manager_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      manager_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="branch-manager">
                    <SelectValue placeholder="Selecionar gestor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {employees?.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="branch-headquarter" className="text-sm font-medium">Sede Principal da Empresa</Label>
                <p className="text-xs text-muted-foreground">
                  Marque esta opção se esta filial for a sede corporativa principal.
                </p>
              </div>
              <Switch
                id="branch-headquarter"
                checked={formData.is_headquarter}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_headquarter: checked }))
                }
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'A guardar...' : editingBranch ? 'Guardar Alterações' : 'Criar Filial'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Filial</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza de que deseja eliminar a filial{' '}
              <strong className="text-foreground">{deleteTarget?.name}</strong>? Esta
              ação removerá o registo permanentemente da base de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'A eliminar...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

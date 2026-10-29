import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Plus, Pencil, Trash2, MapPin, User, Search, Layers, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  type Department,
  type DepartmentPayload,
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useBranches,
  useEmployeesSummary,
} from './api'
import { getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'

export function DepartmentsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)

  // Delete Alert states
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = useState<Department | null>(null)

  // Form states
  const [formData, setFormData] = useState<DepartmentPayload>({
    name: '',
    code: '',
    branch_id: null,
    parent_id: null,
    manager_id: null,
    cost_center: '',
    description: '',
    status: 'active',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Queries & Mutations
  const { data: departments, isLoading, isError, refetch } = useDepartments()
  const { data: branches } = useBranches()
  const { data: employees } = useEmployeesSummary()

  const createMutation = useCreateDepartment()
  const updateMutation = useUpdateDepartment()
  const deleteMutation = useDeleteDepartment()

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingDepartment(null)
    setFormData({
      name: '',
      code: '',
      branch_id: null,
      parent_id: null,
      manager_id: null,
      cost_center: '',
      description: '',
      status: 'active',
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Open Edit Dialog
  const handleOpenEdit = (dept: Department) => {
    setEditingDepartment(dept)
    setFormData({
      name: dept.name,
      code: dept.code ?? '',
      branch_id: dept.branch_id ?? null,
      parent_id: dept.parent_id ?? null,
      manager_id: dept.manager_id ?? null,
      cost_center: dept.cost_center ?? '',
      description: dept.description ?? '',
      status: dept.status,
    })
    setFormErrors({})
    setIsDialogOpen(true)
  }

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}
    if (!formData.name.trim()) {
      errors.name = 'O nome do departamento é obrigatório.'
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    try {
      if (editingDepartment) {
        await updateMutation.mutateAsync({
          id: editingDepartment.id,
          data: {
            ...formData,
            code: formData.code?.trim() || null,
            cost_center: formData.cost_center?.trim() || null,
            description: formData.description?.trim() || null,
          },
        })
        toast.success('Departamento atualizado com sucesso!')
      } else {
        await createMutation.mutateAsync({
          ...formData,
          code: formData.code?.trim() || null,
          cost_center: formData.cost_center?.trim() || null,
          description: formData.description?.trim() || null,
        })
        toast.success('Departamento criado com sucesso!')
      }
      setIsDialogOpen(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao gravar departamento.'))
    }
  }

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteDepartmentTarget) return
    try {
      await deleteMutation.mutateAsync(deleteDepartmentTarget.id)
      toast.success('Departamento eliminado com sucesso!')
      setDeleteDepartmentTarget(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao eliminar departamento.'))
    }
  }

  // Filter departments
  const filtered = (departments ?? []).filter((d) => {
    const matchesSearch =
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.code && d.code.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter
    const matchesBranch =
      branchFilter === 'all' || (d.branch_id && String(d.branch_id) === branchFilter)
    return matchesSearch && matchesStatus && matchesBranch
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.departments')}
        description="Gestão de departamentos e estrutura interna da organização"
        actions={
          <Button onClick={handleOpenCreate} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> Novo Departamento
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por nome ou código..."
                className="pl-9"
              />
            </div>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as filiais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as filiais</SelectItem>
                {branches?.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
      {isError && <ErrorState message="Erro ao carregar departamentos" onRetry={refetch} />}

      {departments && filtered.length === 0 && (
        <EmptyState
          title="Nenhum departamento encontrado"
          description={search ? 'Tente ajustar os filtros de pesquisa.' : 'Crie o primeiro departamento para começar.'}
        />
      )}

      {/* Department Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => {
          const branchName = branches?.find((b) => b.id === d.branch_id)?.name
          const parentName = departments?.find((p) => p.id === d.parent_id)?.name
          const managerName =
            d.manager?.full_name ?? employees?.find((e) => e.id === d.manager_id)?.full_name

          return (
            <Card key={d.id} className="group relative flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold leading-tight text-foreground">{d.name}</h3>
                      {d.code && (
                        <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-medium text-muted-foreground mt-0.5">
                          {d.code}
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge variant={d.status === 'active' ? 'default' : 'secondary'} className="capitalize shrink-0">
                    {d.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                {d.description && (
                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {d.description}
                  </p>
                )}

                <div className="mt-4 space-y-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                  {branchName && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">{branchName}</span>
                    </div>
                  )}

                  {parentName && (
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">Superior: {parentName}</span>
                    </div>
                  )}

                  {managerName && (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate">Responsável: {managerName}</span>
                    </div>
                  )}

                  {d.cost_center && (
                    <div className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="truncate font-mono">CC: {d.cost_center}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {d.employee_count ?? 0} funcionário{(d.employee_count ?? 0) !== 1 ? 's' : ''}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleOpenEdit(d)}
                      title="Editar departamento"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteDepartmentTarget(d)}
                      title="Eliminar departamento"
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
              {editingDepartment ? 'Editar Departamento' : 'Novo Departamento'}
            </DialogTitle>
            <DialogDescription>
              {editingDepartment
                ? 'Atualize as informações do departamento selecionado.'
                : 'Preencha os detalhes para registar um novo departamento.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Nome do Departamento *</Label>
              <Input
                id="dept-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }))
                }}
                placeholder="Ex: Recursos Humanos, Tecnologia..."
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept-code">Código</Label>
                <Input
                  id="dept-code"
                  value={formData.code ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="Ex: RH, TI, FIN"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-status">Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val: 'active' | 'inactive') =>
                    setFormData((prev) => ({ ...prev, status: val }))
                  }
                >
                  <SelectTrigger id="dept-status">
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
                <Label htmlFor="dept-branch">Filial</Label>
                <Select
                  value={formData.branch_id ? String(formData.branch_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      branch_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-branch">
                    <SelectValue placeholder="Selecionar filial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dept-parent">Departamento Superior</Label>
                <Select
                  value={formData.parent_id ? String(formData.parent_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      parent_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-parent">
                    <SelectValue placeholder="Nenhum (Raiz)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Raiz)</SelectItem>
                    {departments
                      ?.filter((d) => !editingDepartment || d.id !== editingDepartment.id)
                      .map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dept-manager">Responsável / Gestor</Label>
                <Select
                  value={formData.manager_id ? String(formData.manager_id) : 'none'}
                  onValueChange={(val) =>
                    setFormData((prev) => ({
                      ...prev,
                      manager_id: val === 'none' ? null : Number(val),
                    }))
                  }
                >
                  <SelectTrigger id="dept-manager">
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

              <div className="space-y-2">
                <Label htmlFor="dept-cc">Centro de Custo</Label>
                <Input
                  id="dept-cc"
                  value={formData.cost_center ?? ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, cost_center: e.target.value }))
                  }
                  placeholder="Ex: CC-1002"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-desc">Descrição</Label>
              <Textarea
                id="dept-desc"
                value={formData.description ?? ''}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                rows={2}
                placeholder="Breve descrição da função e escopo do departamento..."
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
                {isSaving ? 'A guardar...' : editingDepartment ? 'Guardar Alterações' : 'Criar Departamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog
        open={!!deleteDepartmentTarget}
        onOpenChange={(open) => !open && setDeleteDepartmentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Departamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza de que deseja eliminar o departamento{' '}
              <strong className="text-foreground">
                {deleteDepartmentTarget?.name}
              </strong>
              ? Esta ação removerá o registo permanentemente da base de dados.
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

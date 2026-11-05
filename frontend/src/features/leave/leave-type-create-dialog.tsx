import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LeaveTypeSummary } from '@/types'

const categories = [
  { value: 'vacation', label: 'Férias' },
  { value: 'sick', label: 'Saúde' },
  { value: 'personal', label: 'Pessoal' },
  { value: 'family', label: 'Familiar' },
  { value: 'maternity', label: 'Maternidade' },
  { value: 'paternity', label: 'Paternidade' },
  { value: 'unpaid', label: 'Sem vencimento' },
  { value: 'other', label: 'Outro' },
]

interface LeaveTypeCreateDialogProps {
  onCreated: (type: LeaveTypeSummary) => void
}

export function LeaveTypeCreateDialog({ onCreated }: LeaveTypeCreateDialogProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState('other')
  const [daysPerYear, setDaysPerYear] = useState('')
  const [isPaid, setIsPaid] = useState(true)
  const [requiresDocument, setRequiresDocument] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.post<LeaveTypeSummary>('leave/types', {
      name: name.trim(),
      code: code.trim() || name.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      category,
      days_per_year: daysPerYear ? Number(daysPerYear) : null,
      is_paid: isPaid,
      requires_document: requiresDocument,
    }),
    onSuccess: (type) => {
      toast.success('Tipo de ausência criado')
      queryClient.invalidateQueries({ queryKey: ['leave-types'] })
      onCreated(type)
      setOpen(false)
      setName('')
      setCode('')
      setCategory('other')
      setDaysPerYear('')
      setIsPaid(true)
      setRequiresDocument(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Erro ao criar tipo de ausência')),
  })

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus />Novo tipo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo tipo de ausência</DialogTitle>
            <DialogDescription>Defina a categoria e as condições aplicáveis a este tipo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="leave-type-name">Nome</Label>
              <Input id="leave-type-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={150} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-type-code">Código (opcional)</Label>
              <Input id="leave-type-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-type-days">Dias por ano (opcional)</Label>
              <Input id="leave-type-days" type="number" min={0} max={365} value={daysPerYear} onChange={(event) => setDaysPerYear(event.target.value)} />
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                Remunerado
                <Switch checked={isPaid} onCheckedChange={setIsPaid} />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                Exige documento
                <Switch checked={requiresDocument} onCheckedChange={setRequiresDocument} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'A guardar...' : 'Criar tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
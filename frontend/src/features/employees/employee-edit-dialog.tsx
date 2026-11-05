import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Employee, Paginated } from '@/types'

interface EmployeeEditDialogProps {
  employee: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
}

type EmployeeEditForm = Record<
  | 'first_name'
  | 'last_name'
  | 'employee_code'
  | 'email'
  | 'phone'
  | 'alternative_phone'
  | 'birth_date'
  | 'gender'
  | 'marital_status'
  | 'nationality'
  | 'address'
  | 'city'
  | 'state'
  | 'country'
  | 'postal_code'
  | 'id_document_type'
  | 'id_document_number'
  | 'id_document_expiry'
  | 'tax_id'
  | 'social_security_id'
  | 'status'
  | 'hired_at'
  | 'probation_end'
  | 'department_id'
  | 'position_id'
  | 'manager_id', string
>

const toFormValue = (value?: string | number | null) => value == null ? '' : String(value).slice(0, 10)

export function EmployeeEditDialog({ employee, open, onOpenChange }: EmployeeEditDialogProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EmployeeEditForm>(() => createForm(employee))

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: number; name: string }[]>('departments'),
    enabled: open,
  })
  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.get<{ id: number; title: string; department_id?: number }[]>('positions'),
    enabled: open,
  })
  const { data: employeePage } = useQuery({
    queryKey: ['employees-for-manager'],
    queryFn: () => api.get<Paginated<{ id: number; full_name: string }>>('employees', { per_page: 200 }),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => api.put(`employees/${employee.id}`, {
      ...form,
      email: form.email.trim() || undefined,
      department_id: form.department_id ? Number(form.department_id) : null,
      position_id: form.position_id ? Number(form.position_id) : null,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
    }),
    onSuccess: () => {
      toast.success('Dados do funcionário atualizados')
      queryClient.invalidateQueries({ queryKey: ['employees', String(employee.id)] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees', String(employee.id), 'timeline'] })
      onOpenChange(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Erro ao atualizar funcionário')),
  })

  const update = (key: keyof EmployeeEditForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const selectValue = (key: 'gender' | 'marital_status' | 'status' | 'department_id' | 'position_id' | 'manager_id') =>
    form[key] || 'none'
  const setSelectValue = (key: keyof EmployeeEditForm, value: string) => update(key, value === 'none' ? '' : value)
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setForm(createForm(employee))
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar funcionário</DialogTitle>
          <DialogDescription>Atualize os dados pessoais, contactos e informação organizacional.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-1 pr-1">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Identificação</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Nome próprio" value={form.first_name} onChange={(value) => update('first_name', value)} required />
              <TextField label="Apelido" value={form.last_name} onChange={(value) => update('last_name', value)} required />
              <TextField label="Código" value={form.employee_code} onChange={(value) => update('employee_code', value)} required />
              <TextField label="Email" type="email" value={form.email} onChange={(value) => update('email', value)} />
              <TextField label="Telefone" value={form.phone} onChange={(value) => update('phone', value)} />
              <TextField label="Telefone alternativo" value={form.alternative_phone} onChange={(value) => update('alternative_phone', value)} />
              <TextField label="Nascimento" type="date" value={form.birth_date} onChange={(value) => update('birth_date', value)} />
              <SelectField label="Género" value={selectValue('gender')} onChange={(value) => setSelectValue('gender', value)} options={[
                ['male', 'Masculino'], ['female', 'Feminino'], ['other', 'Outro'],
              ]} />
              <SelectField label="Estado civil" value={selectValue('marital_status')} onChange={(value) => setSelectValue('marital_status', value)} options={[
                ['single', 'Solteiro(a)'], ['married', 'Casado(a)'], ['divorced', 'Divorciado(a)'], ['widowed', 'Viúvo(a)'],
              ]} />
              <TextField label="Nacionalidade" value={form.nationality} onChange={(value) => update('nationality', value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Documentos oficiais</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Tipo de documento" value={form.id_document_type} onChange={(value) => update('id_document_type', value)} />
              <TextField label="Número do documento" value={form.id_document_number} onChange={(value) => update('id_document_number', value)} />
              <TextField label="Validade do documento" type="date" value={form.id_document_expiry} onChange={(value) => update('id_document_expiry', value)} />
              <TextField label="NIF" value={form.tax_id} onChange={(value) => update('tax_id', value)} />
              <TextField label="Número INSS" value={form.social_security_id} onChange={(value) => update('social_security_id', value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Morada</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField label="Endereço" value={form.address} onChange={(value) => update('address', value)} />
              <TextField label="Cidade" value={form.city} onChange={(value) => update('city', value)} />
              <TextField label="Província / Estado" value={form.state} onChange={(value) => update('state', value)} />
              <TextField label="País" value={form.country} onChange={(value) => update('country', value)} />
              <TextField label="Código postal" value={form.postal_code} onChange={(value) => update('postal_code', value)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Vínculo organizacional</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Departamento" value={selectValue('department_id')} onChange={(value) => setSelectValue('department_id', value)} options={departments.map((item) => [String(item.id), item.name])} />
              <SelectField label="Cargo" value={selectValue('position_id')} onChange={(value) => setSelectValue('position_id', value)} options={positions.map((item) => [String(item.id), item.title])} />
              <SelectField label="Gestor" value={selectValue('manager_id')} onChange={(value) => setSelectValue('manager_id', value)} options={(employeePage?.data ?? []).filter((item) => item.id !== employee.id).map((item) => [String(item.id), item.full_name])} />
              <SelectField label="Estado" value={selectValue('status')} onChange={(value) => setSelectValue('status', value)} allowClear={false} options={[
                ['active', 'Ativo'], ['inactive', 'Inativo'], ['suspended', 'Suspenso'], ['terminated', 'Rescindido'],
              ]} />
              <TextField label="Data de admissão" type="date" value={form.hired_at} onChange={(value) => update('hired_at', value)} />
              <TextField label="Fim do período probatório" type="date" value={form.probation_end} onChange={(value) => update('probation_end', value)} />
            </div>
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.first_name.trim() || !form.last_name.trim() || !form.employee_code.trim()}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  required?: boolean
}) {
  const id = `employee-edit-${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allowClear = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[][]
  allowClear?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
        <SelectContent>
          {allowClear && <SelectItem value="none">Não definido</SelectItem>}
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function createForm(employee: Employee): EmployeeEditForm {
  return {
    first_name: employee.first_name ?? '',
    last_name: employee.last_name ?? '',
    employee_code: employee.employee_code ?? '',
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    alternative_phone: employee.alternative_phone ?? '',
    birth_date: toFormValue(employee.birth_date),
    gender: employee.gender ?? '',
    marital_status: employee.marital_status ?? '',
    nationality: employee.nationality ?? '',
    address: employee.address ?? '',
    city: employee.city ?? '',
    state: employee.state ?? '',
    country: employee.country ?? '',
    postal_code: employee.postal_code ?? '',
    id_document_type: employee.id_document_type ?? '',
    id_document_number: employee.id_document_number ?? '',
    id_document_expiry: toFormValue(employee.id_document_expiry),
    tax_id: employee.tax_id ?? '',
    social_security_id: employee.social_security_id ?? '',
    status: employee.status ?? 'active',
    hired_at: toFormValue(employee.hired_at),
    probation_end: toFormValue(employee.probation_end),
    department_id: toFormValue(employee.department_id),
    position_id: toFormValue(employee.position_id),
    manager_id: toFormValue(employee.manager_id),
  }
}
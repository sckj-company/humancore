import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const { t } = useTranslation()
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
      toast.success(t('employeeEdit.updated'))
      queryClient.invalidateQueries({ queryKey: ['employees', String(employee.id)] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees', String(employee.id), 'timeline'] })
      onOpenChange(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeEdit.updateError'))),
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
      <DialogContent className="flex h-[min(90vh,900px)] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="shrink-0 px-6 pt-6">
          <DialogTitle>{t('employeeEdit.title')}</DialogTitle>
          <DialogDescription>{t('employeeEdit.description')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 px-6">
          <div className="space-y-5 py-2">
            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">{t('employeeEdit.identification')}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <TextField label={t('employeeEdit.firstName')} value={form.first_name} onChange={(value) => update('first_name', value)} required />
                <TextField label={t('employeeEdit.lastName')} value={form.last_name} onChange={(value) => update('last_name', value)} required />
                <TextField label={t('employees.code')} value={form.employee_code} onChange={(value) => update('employee_code', value)} required />
                <TextField label={t('common.email')} type="email" value={form.email} onChange={(value) => update('email', value)} />
                <TextField label={t('common.phone')} value={form.phone} onChange={(value) => update('phone', value)} />
                <TextField label={t('employeeEdit.alternativePhone')} value={form.alternative_phone} onChange={(value) => update('alternative_phone', value)} />
                <TextField label={t('employeeEdit.birthDate')} type="date" value={form.birth_date} onChange={(value) => update('birth_date', value)} />
                <SelectField label={t('employeeEdit.gender')} value={selectValue('gender')} onChange={(value) => setSelectValue('gender', value)} options={[
                  ['male', t('employeeEdit.genders.male')], ['female', t('employeeEdit.genders.female')], ['other', t('employeeEdit.genders.other')],
                ]} />
                <SelectField label={t('employeeEdit.maritalStatus')} value={selectValue('marital_status')} onChange={(value) => setSelectValue('marital_status', value)} options={[
                  ['single', t('employeeEdit.maritalStatuses.single')], ['married', t('employeeEdit.maritalStatuses.married')], ['divorced', t('employeeEdit.maritalStatuses.divorced')], ['widowed', t('employeeEdit.maritalStatuses.widowed')],
                ]} />
                <TextField label={t('employeeEdit.nationality')} value={form.nationality} onChange={(value) => update('nationality', value)} />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">{t('employeeEdit.officialDocuments')}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <TextField label={t('employeeEdit.documentType')} value={form.id_document_type} onChange={(value) => update('id_document_type', value)} />
                <TextField label={t('employeeEdit.documentNumber')} value={form.id_document_number} onChange={(value) => update('id_document_number', value)} />
                <TextField label={t('employeeEdit.documentExpiry')} type="date" value={form.id_document_expiry} onChange={(value) => update('id_document_expiry', value)} />
                <TextField label="NIF" value={form.tax_id} onChange={(value) => update('tax_id', value)} />
                <TextField label={t('employeeEdit.socialSecurityNumber')} value={form.social_security_id} onChange={(value) => update('social_security_id', value)} />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">{t('employeeEdit.address')}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <TextField label={t('employeeEdit.streetAddress')} value={form.address} onChange={(value) => update('address', value)} />
                <TextField label={t('employeeEdit.city')} value={form.city} onChange={(value) => update('city', value)} />
                <TextField label={t('employeeEdit.stateProvince')} value={form.state} onChange={(value) => update('state', value)} />
                <TextField label={t('employeeEdit.country')} value={form.country} onChange={(value) => update('country', value)} />
                <TextField label={t('employeeEdit.postalCode')} value={form.postal_code} onChange={(value) => update('postal_code', value)} />
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold">{t('employeeEdit.organization')}</h3>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SelectField label={t('employees.department')} value={selectValue('department_id')} onChange={(value) => setSelectValue('department_id', value)} options={departments.map((item) => [String(item.id), item.name])} />
                <SelectField label={t('employees.position')} value={selectValue('position_id')} onChange={(value) => setSelectValue('position_id', value)} options={positions.map((item) => [String(item.id), item.title])} />
                <SelectField label={t('employeeEdit.manager')} value={selectValue('manager_id')} onChange={(value) => setSelectValue('manager_id', value)} options={(employeePage?.data ?? []).filter((item) => item.id !== employee.id).map((item) => [String(item.id), item.full_name])} />
                <SelectField label={t('common.status')} value={selectValue('status')} onChange={(value) => setSelectValue('status', value)} allowClear={false} options={[
                  ['active', t('common.active')], ['inactive', t('common.inactive')], ['suspended', t('employeeEdit.statuses.suspended')], ['terminated', t('employeeEdit.statuses.terminated')],
                ]} />
                <TextField label={t('employees.hired_at')} type="date" value={form.hired_at} onChange={(value) => update('hired_at', value)} />
                <TextField label={t('employeeEdit.probationEnd')} type="date" value={form.probation_end} onChange={(value) => update('probation_end', value)} />
              </div>
            </section>

          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0 px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>{t('common.cancel')}</Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.first_name.trim() || !form.last_name.trim() || !form.employee_code.trim()}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t('employeeEdit.saveChanges')}
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
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={t('employeeEdit.undefined')} /></SelectTrigger>
        <SelectContent>
          {allowClear && <SelectItem value="none">{t('employeeEdit.undefined')}</SelectItem>}
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
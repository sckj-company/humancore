import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, ErrorState } from '@/components/shared/page-header'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { hasPermission } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'

const schema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'terminated']).default('active'),
  department_id: z.string().optional(),
  position_id: z.string().optional(),
  hired_at: z.string().optional(),
  tax_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function EmployeeCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_employee')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'active', gender: 'male' },
  })

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: number; name: string }[]>('departments'),
    enabled: canCreate,
  })

  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.get<{ id: number; title: string; department_id?: number }[]>('positions'),
    enabled: canCreate,
  })

  if (!canCreate) {
    return <ErrorState message="Não tem permissão para criar funcionários." />
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const payload: Record<string, unknown> = {
        ...values,
        department_id: values.department_id ? Number(values.department_id) : null,
        position_id: values.position_id ? Number(values.position_id) : null,
      }
      await api.post('employees', payload)
      toast.success('Funcionário criado com sucesso')
      navigate('/employees')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao criar funcionário'))
    }
  })

  const selectedDeptId = watch('department_id')
  const filteredPositions = positions?.filter(
    (p) => !selectedDeptId || String(p.department_id) === String(selectedDeptId),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span>{t('employees.title')}</span>
      </div>

      <PageHeader title={t('employees.add')} description="Preencha os dados do novo funcionário" />

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados Pessoais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input {...register('first_name')} />
              {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Apelido *</Label>
              <Input {...register('last_name')} />
              {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input {...register('phone')} />
            </div>
            <div className="space-y-2">
              <Label>Género</Label>
              <Select value={watch('gender')} onValueChange={(v) => setValue('gender', v as FormValues['gender'])}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>NIF</Label>
              <Input {...register('tax_id')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informação Profissional</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select value={selectedDeptId} onValueChange={(v) => setValue('department_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select value={watch('position_id')} onValueChange={(v) => setValue('position_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPositions?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data de Admissão</Label>
              <Input type="date" {...register('hired_at')} />
            </div>
            <div className="space-y-2">
              <Label>Estado *</Label>
              <Select value={watch('status')} onValueChange={(v) => setValue('status', v as FormValues['status'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                  <SelectItem value="terminated">Desligado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link to="/employees">{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.create')}
          </Button>
        </div>
      </form>
    </div>
  )
}

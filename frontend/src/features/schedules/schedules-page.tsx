import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Clock,
  Trash2,
  Edit,
  Loader2,
  Save,
  Users,
  Calendar,
  Moon,
  Sun,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, EmptyState, ErrorState } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import { DataTable } from '@/components/data/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { api, getApiErrorMessage } from '@/lib/api'
import type { Paginated } from '@/types'

interface Shift {
  id: number
  name: string
  code: string | null
  start_time: string
  end_time: string
  break_minutes: number
  work_hours: number
  late_tolerance_minutes: number
  working_days: number[]
  color: string | null
  is_night_shift: boolean
  is_active: boolean
  notes: string | null
  employee_schedules_count?: number
}

interface EmployeeSchedule {
  id: number
  employee_id: number
  shift_id: number
  effective_from: string
  effective_to: string | null
  is_active: boolean
  notes: string | null
  employee?: { id: number; first_name: string; last_name: string; employee_code: string }
  shift?: { id: number; name: string; start_time: string; end_time: string; color: string | null }
}

interface Holiday {
  id: number
  name: string
  date: string
  is_recurring: boolean
  type: string
  description: string | null
}

const shiftSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  code: z.string().optional(),
  start_time: z.string().min(1, 'Hora de início obrigatória'),
  end_time: z.string().min(1, 'Hora de fim obrigatória'),
  break_minutes: z.coerce.number().min(0).max(480),
  work_hours: z.coerce.number().min(0).max(24),
  late_tolerance_minutes: z.coerce.number().min(0).max(120),
  color: z.string().optional(),
  is_night_shift: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
})

type ShiftFormValues = z.infer<typeof shiftSchema>

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function SchedulesPage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="GESTÃO DE TEMPO"
        title="Horários e Turnos"
        description="Configure turnos de trabalho, atribua horários a funcionários e gerencie feriados"
      />
      <Tabs defaultValue="shifts" className="w-full">
        <TabsList>
          <TabsTrigger value="shifts">
            <Clock className="mr-2 h-4 w-4" />
            Turnos
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <Users className="mr-2 h-4 w-4" />
            Atribuições
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <Calendar className="mr-2 h-4 w-4" />
            Feriados
          </TabsTrigger>
        </TabsList>
        <TabsContent value="shifts">
          <ShiftsTab />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentsTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ShiftsTab() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shifts', search],
    queryFn: () => api.get<Paginated<Shift>>('shifts', { per_page: 50, search }),
  })

  const totalShifts = data?.meta?.total ?? 0
  const activeShifts = data?.data?.filter((s) => s.is_active).length ?? 0
  const nightShifts = data?.data?.filter((s) => s.is_night_shift).length ?? 0

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Total de Turnos" value={totalShifts} icon={Clock} accent="primary" />
        <KpiCard label="Turnos Ativos" value={activeShifts} icon={Sun} accent="success" />
        <KpiCard label="Turnos Noturnos" value={nightShifts} icon={Moon} accent="info" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Pesquisar turno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Turno
            </Button>
          </DialogTrigger>
          <ShiftDialog open={open} onOpenChange={setOpen} shift={editing} />
        </Dialog>
      </div>

      {isError && <ErrorState message="Erro ao carregar turnos" onRetry={refetch} />}

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data?.data.length === 0 ? (
        <EmptyState
          title="Sem turnos configurados"
          description="Crie o primeiro turno para começar"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.data.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} onEdit={(s) => { setEditing(s); setOpen(true) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function ShiftCard({ shift, onEdit }: { shift: Shift; onEdit: (s: Shift) => void }) {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`shifts/${shift.id}`),
    onSuccess: () => {
      toast.success('Turno eliminado')
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar')),
  })

  return (
    <Card className="overflow-hidden">
      <div
        className="h-2"
        style={{ background: shift.color || 'var(--primary)' }}
      />
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{shift.name}</h3>
              {shift.is_night_shift && <Moon className="h-3.5 w-3.5 text-info" />}
            </div>
            {shift.code && <p className="text-xs text-muted-foreground">{shift.code}</p>}
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => onEdit(shift)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Horário</span>
            <span className="font-mono font-medium">
              {shift.start_time} – {shift.end_time}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Horas/dia</span>
            <span className="font-mono">{shift.work_hours}h</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pausa</span>
            <span className="font-mono">{shift.break_minutes} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tolerância</span>
            <span className="font-mono">{shift.late_tolerance_minutes} min</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {shift.working_days && shift.working_days.length > 0 ? (
            shift.working_days.map((d) => (
              <Badge key={d} variant="secondary" className="text-[10px]">
                {dayNames[d]}
              </Badge>
            ))
          ) : (
            <Badge variant="secondary" className="text-[10px]">Todos os dias</Badge>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Badge variant={shift.is_active ? 'success' : 'secondary'}>
            {shift.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

function ShiftDialog({ open, onOpenChange, shift }: { open: boolean; onOpenChange: (o: boolean) => void; shift: Shift | null }) {
  const queryClient = useQueryClient()
  const [selectedDays, setSelectedDays] = useState<number[]>([])

  const form = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema) as never,
    defaultValues: shift
      ? {
          name: shift.name,
          code: shift.code ?? '',
          start_time: shift.start_time,
          end_time: shift.end_time,
          break_minutes: shift.break_minutes,
          work_hours: shift.work_hours,
          late_tolerance_minutes: shift.late_tolerance_minutes,
          color: shift.color ?? '',
          is_night_shift: shift.is_night_shift,
          is_active: shift.is_active,
          notes: shift.notes ?? '',
        }
      : {
          name: '',
          code: '',
          start_time: '08:00',
          end_time: '17:00',
          break_minutes: 60,
          work_hours: 8,
          late_tolerance_minutes: 10,
          color: '#3b82f6',
          is_night_shift: false,
          is_active: true,
          notes: '',
        },
  })

  const mutation = useMutation({
    mutationFn: (data: ShiftFormValues) =>
      shift ? api.put(`shifts/${shift.id}`, { ...data, working_days: selectedDays }) : api.post('shifts', { ...data, working_days: selectedDays }),
    onSuccess: () => {
      toast.success(shift ? 'Turno atualizado' : 'Turno criado')
      queryClient.invalidateQueries({ queryKey: ['shifts'] })
      onOpenChange(false)
      form.reset()
      setSelectedDays([])
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao guardar')),
  })

  const onSubmit = (data: ShiftFormValues) => mutation.mutate(data)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{shift ? 'Editar Turno' : 'Novo Turno'}</DialogTitle>
          <DialogDescription>Defina o horário de trabalho padrão do turno</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input {...form.register('name')} placeholder="Ex: Turno da Manhã" />
            </div>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input {...form.register('code')} placeholder="TM" />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de Início *</Label>
              <Input type="time" {...form.register('start_time')} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de Fim *</Label>
              <Input type="time" {...form.register('end_time')} />
            </div>
            <div className="space-y-1.5">
              <Label>Pausa (min)</Label>
              <Input type="number" {...form.register('break_minutes')} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas/dia</Label>
              <Input type="number" step="0.5" {...form.register('work_hours')} />
            </div>
            <div className="space-y-1.5">
              <Label>Tolerância (min)</Label>
              <Input type="number" {...form.register('late_tolerance_minutes')} />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Input type="color" {...form.register('color')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dias de Trabalho</Label>
            <div className="flex flex-wrap gap-2">
              {dayNames.map((day, idx) => (
                <label key={idx} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedDays.includes(idx)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedDays([...selectedDays, idx])
                      else setSelectedDays(selectedDays.filter((d) => d !== idx))
                    }}
                  />
                  <span className="text-sm">{day}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <Switch {...form.register('is_night_shift')} />
              <span className="text-sm">Turno noturno</span>
            </label>
            <label className="flex items-center gap-2">
              <Switch {...form.register('is_active')} />
              <span className="text-sm">Ativo</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentsTab() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employee-schedules', search],
    queryFn: () => api.get<Paginated<EmployeeSchedule>>('employee-schedules', { per_page: 30, search }),
  })

  const { data: shifts } = useQuery({
    queryKey: ['shifts-active'],
    queryFn: () => api.get<Paginated<Shift>>('shifts', { per_page: 100, status: 'active' }),
  })

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get<Paginated<{ id: number; first_name: string; last_name: string; employee_code: string }>>('employees', { per_page: 200 }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`employee-schedules/${id}`),
    onSuccess: () => {
      toast.success('Atribuição removida')
      queryClient.invalidateQueries({ queryKey: ['employee-schedules'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao remover')),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Atribuir Horário
            </Button>
          </DialogTrigger>
          <AssignmentDialog
            open={open}
            onOpenChange={setOpen}
            shifts={shifts?.data ?? []}
            employees={employees?.data ?? []}
          />
        </Dialog>
      </div>

      {isError && <ErrorState message="Erro ao carregar" onRetry={refetch} />}

      <DataTable
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        columns={[
          {
            id: 'employee',
            header: 'Funcionário',
            cell: (r) => (
              <div>
                <p className="font-medium">
                  {r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : `#${r.employee_id}`}
                </p>
                {r.employee && <p className="text-xs text-muted-foreground">{r.employee.employee_code}</p>}
              </div>
            ),
          },
          {
            id: 'shift',
            header: 'Turno',
            cell: (r) => (
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: r.shift?.color || 'var(--primary)' }}
                />
                <span>{r.shift?.name ?? `#${r.shift_id}`}</span>
                {r.shift && (
                  <span className="text-xs text-muted-foreground">
                    ({r.shift.start_time}–{r.shift.end_time})
                  </span>
                )}
              </div>
            ),
          },
          {
            id: 'period',
            header: 'Vigência',
            cell: (r) => (
              <span className="text-sm">
                {r.effective_from} {r.effective_to ? `→ ${r.effective_to}` : '(sem fim)'}
              </span>
            ),
          },
          {
            id: 'status',
            header: 'Estado',
            align: 'right',
            cell: (r) => <Badge variant={r.is_active ? 'success' : 'secondary'}>{r.is_active ? 'Ativo' : 'Inativo'}</Badge>,
          },
          {
            id: 'actions',
            header: 'Ações',
            align: 'right',
            cell: (r) => (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => deleteMutation.mutate(r.id)}
                disabled={deleteMutation.isPending}
                className="text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ),
          },
        ]}
        emptyTitle="Sem atribuições"
        emptyDescription="Atribua turnos aos funcionários"
      />
    </div>
  )
}

function AssignmentDialog({ open, onOpenChange, shifts, employees }: { open: boolean; onOpenChange: (o: boolean) => void; shifts: Shift[]; employees: { id: number; first_name: string; last_name: string; employee_code: string }[] }) {
  const queryClient = useQueryClient()
  const [employeeId, setEmployeeId] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))

  const mutation = useMutation({
    mutationFn: () =>
      api.post('employee-schedules', {
        employee_id: Number(employeeId),
        shift_id: Number(shiftId),
        effective_from: effectiveFrom,
      }),
    onSuccess: () => {
      toast.success('Horário atribuído')
      queryClient.invalidateQueries({ queryKey: ['employee-schedules'] })
      onOpenChange(false)
      setEmployeeId('')
      setShiftId('')
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atribuir')),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Horário</DialogTitle>
          <DialogDescription>Associe um turno a um funcionário</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Funcionário *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.first_name} {e.last_name} ({e.employee_code})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Turno *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time}–{s.end_time})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Vigente a partir de *</Label>
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!employeeId || !shiftId || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Atribuir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HolidaysTab() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())

  const { data, isLoading } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => api.get<Holiday[]>('holidays', { year }),
  })

  const [form, setForm] = useState({
    name: '',
    date: new Date().toISOString().slice(0, 10),
    type: 'national',
    is_recurring: false,
    description: '',
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('holidays', data),
    onSuccess: () => {
      toast.success('Feriado criado')
      queryClient.invalidateQueries({ queryKey: ['holidays'] })
      setOpen(false)
      setForm({ name: '', date: new Date().toISOString().slice(0, 10), type: 'national', is_recurring: false, description: '' })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao criar')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`holidays/${id}`),
    onSuccess: () => {
      toast.success('Feriado removido')
      queryClient.invalidateQueries({ queryKey: ['holidays'] })
    },
  })

  const typeLabels: Record<string, string> = {
    national: 'Nacional',
    regional: 'Regional',
    company: 'Empresa',
    optional: 'Opcional',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear(year - 1)}>
            ← {year - 1}
          </Button>
          <span className="font-semibold">{year}</span>
          <Button variant="outline" size="sm" onClick={() => setYear(year + 1)}>
            {year + 1} →
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo Feriado
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Feriado</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Data *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2">
                <Switch checked={form.is_recurring} onCheckedChange={(c) => setForm({ ...form, is_recurring: c })} />
                <span className="text-sm">Recorrente (anual)</span>
              </label>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : data && data.length === 0 ? (
        <EmptyState title="Sem feriados configurados" description="Adicione feriados para o ano corrente" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((h) => (
            <Card key={h.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="text-xs font-medium uppercase">
                    {new Date(h.date).toLocaleDateString('pt', { month: 'short' })}
                  </span>
                  <span className="text-lg font-bold leading-none">
                    {new Date(h.date).getDate()}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium">{h.name}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {typeLabels[h.type] ?? h.type}
                    </Badge>
                    {h.is_recurring && <Badge variant="outline" className="text-[10px]">Anual</Badge>}
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => deleteMutation.mutate(h.id)} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

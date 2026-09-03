import { useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasAnyRole, hasPermission } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { LeaveRequest, LeaveBalance, LeaveTypeSummary, Paginated } from '@/types'

const statusStyle: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
}

const schema = z.object({
  leave_type_id: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function LeavePage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isAdmin = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])

  const { data: balance } = useQuery({
    queryKey: ['leave-balance'],
    queryFn: () => api.get<LeaveBalance>('leave/balance'),
  })

  const endpoint = isAdmin ? 'leave' : 'leave/my-requests'
  const { data: requests, isLoading, isError, refetch } = useQuery({
    queryKey: ['leave-requests', endpoint],
    queryFn: () => api.get<Paginated<LeaveRequest>>(endpoint, { per_page: 30 }),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('leave.title')}
        description={isAdmin ? 'Gerir pedidos de férias e ausências' : 'Solicite as suas férias e ausências'}
        actions={<LeaveRequestDialog />}
      />
      {balance && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Direito anual" value={balance.annual_entitlement} suffix="dias" />
          <SummaryCard label="Usados" value={balance.days_used} suffix="dias" />
          <SummaryCard label="Restantes" value={balance.days_remaining} suffix="dias" highlight />
          <SummaryCard label="Pendentes" value={balance.days_pending} suffix="dias" />
        </div>
      )}

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Não foi possível carregar os pedidos." onRetry={refetch} />}

      {requests && requests.data.length === 0 && (
        <EmptyState title="Sem pedidos" description="Ainda não existem pedidos de férias para mostrar." />
      )}

      {requests && requests.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    {isAdmin && <th className="px-6 py-3 font-medium">Funcionário</th>}
                    <th className="px-6 py-3 font-medium">Tipo</th>
                    <th className="px-6 py-3 font-medium">Período</th>
                    <th className="px-6 py-3 font-medium text-right">Dias</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                    {isAdmin && <th className="px-6 py-3 font-medium text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {requests.data.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-muted/30">
                      {isAdmin && (
                        <td className="px-6 py-3">
                          <p className="font-medium">{r.employee?.full_name ?? `#${r.employee_id}`}</p>
                          <p className="text-xs text-muted-foreground">{r.employee?.employee_code}</p>
                        </td>
                      )}
                      <td className="px-6 py-3">{r.leave_type?.name ?? `#${r.leave_type_id}`}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatDate(r.start_date, i18n.language)} – {formatDate(r.end_date, i18n.language)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">{r.total_days}</td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[r.status] ?? ''} variant="secondary">
                          {r.status}
                        </Badge>
                      </td>
                      {isAdmin &&
                        (r.status === 'pending' ? (
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <ApproveButton leave={r} />
                              <RejectButton leave={r} />
                            </div>
                          </td>
                        ) : (
                          <td className="px-6 py-3 text-right">
                            {r.status === 'approved' && r.approved_by && (
                              <span className="text-xs text-muted-foreground">{r.approved_by.name}</span>
                            )}
                            {r.status === 'rejected' && r.rejected_reason && (
                              <span className="text-xs text-muted-foreground" title={r.rejected_reason ?? ''}>
                                Rejeitado
                              </span>
                            )}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ApproveButton({ leave }: { leave: LeaveRequest }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.post(`leave/${leave.id}/approve`),
    onSuccess: () => {
      toast.success('Pedido aprovado')
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao aprovar')),
  })

  return (
    <Button variant="ghost" size="icon-sm" title="Aprovar" onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-success" />}
    </Button>
  )
}

function RejectButton({ leave }: { leave: LeaveRequest }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.post(`leave/${leave.id}/reject`, { reason: '' }),
    onSuccess: () => {
      toast.success('Pedido rejeitado')
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao rejeitar')),
  })

  return (
    <Button variant="ghost" size="icon-sm" title="Rejeitar" onClick={() => mutation.mutate()}>
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 text-destructive" />}
    </Button>
  )
}

function LeaveRequestDialog() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const canRequest = hasPermission(user, 'create_leave') || hasAnyRole(user, ['employee'])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) as never })

  const { data: types } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get<LeaveTypeSummary[]>('leave/types'),
    enabled: canRequest && open,
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('leave', {
        leave_type_id: Number(values.leave_type_id),
        start_date: values.start_date,
        end_date: values.end_date,
        reason: values.reason || undefined,
      }),
    onSuccess: () => {
      toast.success('Pedido de férias criado')
      setOpen(false)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao criar pedido')),
  })

  const onSubmit = (values: FormValues) => mutation.mutate(values)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!canRequest}>
          <Plus className="mr-2 h-4 w-4" /> {t('leave.newRequest')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('leave.newRequest')}</DialogTitle>
          <DialogDescription>Solicite férias ou uma ausência justificada.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de ausência</Label>
            <Select value={watch('leave_type_id')} onValueChange={(v) => setValue('leave_type_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {types?.map((tp) => (
                  <SelectItem key={tp.id} value={String(tp.id)}>
                    {tp.name} ({tp.days_per_year ?? 0} dias)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.leave_type_id && <p className="text-xs text-destructive">Selecione o tipo</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" {...register('start_date')} />
              {errors.start_date && <p className="text-xs text-destructive">Obrigatório</p>}
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" {...register('end_date')} />
              {errors.end_date && <p className="text-xs text-destructive">Obrigatório</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea {...register('reason')} placeholder="Opcional" rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({ label, value, suffix, highlight }: { label: string; value: number | string; suffix?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="pt-6">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">
          {value} {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
        </p>
      </CardContent>
    </Card>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Play, CheckCircle2, Lock, Eye, Loader2, Send, Banknote, RotateCcw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
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
import { ProcessPeriodDialog } from '@/features/payroll/process-period-dialog'
import type { PayrollPeriod, Paginated } from '@/types'

const statusStyle: Record<string, string> = {
  open:               'bg-blue-500/10 text-blue-600 border-blue-500/20',
  processing:         'bg-amber-500/10 text-amber-600 border-amber-500/20',
  completed:          'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  failed:             'bg-red-500/10 text-red-600 border-red-500/20',
  pending_validation: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  pending_approval:   'bg-orange-500/10 text-orange-600 border-orange-500/20',
  approved:           'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  paid:               'bg-green-500/10 text-green-600 border-green-500/20',
  closed:             'bg-muted text-muted-foreground border-border',
  cancelled:          'bg-red-500/10 text-red-600 border-red-500/20',
}

const statusLabel: Record<string, string> = {
  open:               'Aberto',
  processing:         'A Processar',
  completed:          'Calculado',
  failed:             'Com Erros',
  pending_validation: 'Pend. Validação',
  pending_approval:   'Pend. Aprovação',
  approved:           'Aprovado',
  paid:               'Pago',
  closed:             'Fechado',
  cancelled:          'Cancelado',
}

const schema = z.object({
  period_type: z.enum(['monthly', 'biweekly', 'weekly']),
  period_start: z.string().min(1),
  period_end: z.string().min(1),
  payment_date: z.string().optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

export function PayrollPeriodsPage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const currencyFormatter = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 })
  const [createOpen, setCreateOpen] = useState(false)
  const [reopenId, setReopenId] = useState<number | null>(null)
  const [processId, setProcessId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [periodTypeFilter, setPeriodTypeFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')

  const queryParams: Record<string, string | number> = { per_page: 30 }
  if (search.trim()) queryParams.search = search.trim()
  if (statusFilter !== 'all') queryParams.status = statusFilter
  if (periodTypeFilter !== 'all') queryParams.period_type = periodTypeFilter
  if (monthFilter) queryParams.month = monthFilter
  if (yearFilter.trim()) queryParams.year = Number(yearFilter)

  const hasFilters = Boolean(
    search.trim() || statusFilter !== 'all' || periodTypeFilter !== 'all' || monthFilter || yearFilter.trim(),
  )

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPeriodTypeFilter('all')
    setMonthFilter('')
    setYearFilter('')
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-periods', queryParams],
    queryFn: () => api.get<Paginated<PayrollPeriod>>('payroll/periods', queryParams),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/approve`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.approved'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao aprovar')),
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/close`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.closed'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao fechar')),
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/submit`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.submitted'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao submeter')),
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/periods/${id}/pay`),
    onSuccess: () => {
      toast.success(t('payroll.feedback.paymentRegistered'))
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar pagamento')),
  })

  const reopenMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`payroll/periods/${id}/reopen`, { reason }),
    onSuccess: () => {
      toast.success(t('payroll.feedback.reopened'))
      setReopenId(null)
      invalidate()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao reabrir')),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('payroll.title')}
        description={`${data?.meta?.total ?? 0} ${t('common.periods').toLowerCase()}`}
        actions={
          <CreatePeriodDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onDone={() => invalidate()}
          />
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('payroll.periodsPage.searchPlaceholder', { defaultValue: 'Pesquisar por nome do período...' })}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-full space-y-1.5 sm:w-44">
            <Label className="text-xs">{t('common.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="open">{t('payroll.periodStatuses.open', { defaultValue: 'Aberto' })}</SelectItem>
                <SelectItem value="processing">{t('payroll.periodStatuses.processing', { defaultValue: 'A Processar' })}</SelectItem>
                <SelectItem value="completed">{t('payroll.periodStatuses.completed', { defaultValue: 'Calculado' })}</SelectItem>
                <SelectItem value="pending_validation">{t('payroll.periodStatuses.pending_validation', { defaultValue: 'Pend. Validação' })}</SelectItem>
                <SelectItem value="pending_approval">{t('payroll.periodStatuses.pending_approval', { defaultValue: 'Pend. Aprovação' })}</SelectItem>
                <SelectItem value="approved">{t('payroll.periodStatuses.approved', { defaultValue: 'Aprovado' })}</SelectItem>
                <SelectItem value="closed">{t('payroll.periodStatuses.closed', { defaultValue: 'Fechado' })}</SelectItem>
                <SelectItem value="paid">{t('payroll.periodStatuses.paid', { defaultValue: 'Pago' })}</SelectItem>
                <SelectItem value="failed">{t('payroll.periodStatuses.failed', { defaultValue: 'Com Erros' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-40">
            <Label className="text-xs">{t('payroll.periodsPage.type')}</Label>
            <Select value={periodTypeFilter} onValueChange={setPeriodTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="monthly">{t('payroll.periodTypes.monthly', { defaultValue: 'Mensal' })}</SelectItem>
                <SelectItem value="biweekly">{t('payroll.periodTypes.biweekly', { defaultValue: 'Quinzenal' })}</SelectItem>
                <SelectItem value="weekly">{t('payroll.periodTypes.weekly', { defaultValue: 'Semanal' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full space-y-1.5 sm:w-36">
            <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
            <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
          </div>
          <div className="w-full space-y-1.5 sm:w-28">
            <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
            <Input
              type="number"
              min={2020}
              max={2100}
              placeholder="2026"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
          </div>
          {hasFilters && (
            <Button type="button" variant="outline" onClick={resetFilters}>
              <X className="mr-1.5 h-4 w-4" />
              {t('employeesPage.clearFilters', { defaultValue: 'Limpar filtros' })}
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Não foi possível carregar os períodos." onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title={t('payroll.periodsPage.emptyTitle')}
          description={hasFilters ? t('payroll.periodsPage.noFilterMatches', { defaultValue: 'Nenhum período encontrado para os filtros aplicados.' }) : t('payroll.periodsPage.emptyDescription')}
          action={hasFilters ? <Button variant="outline" onClick={resetFilters}>{t('employeesPage.clearFilters', { defaultValue: 'Limpar filtros' })}</Button> : undefined}
        />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.period')}</th>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.type')}</th>
                    <th className="px-6 py-3 font-medium">{t('payroll.periodsPage.range')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.status')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.employees')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.grossTotal')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('payroll.periodsPage.netTotal')}</th>
                    <th className="px-6 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.data.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3 font-medium">{p.name}</td>
                      <td className="px-6 py-3 text-muted-foreground">{t(`payroll.periodTypes.${p.period_type}`)}</td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatDate(p.period_start, i18n.language)} – {formatDate(p.period_end, i18n.language)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Badge className={statusStyle[p.status]} variant="outline">
                          {t(`payroll.periodStatuses.${p.status}`, { defaultValue: statusLabel[p.status] ?? p.status })}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right text-muted-foreground">{p.employee_count ?? 0}</td>
                      <td className="px-6 py-3 text-right font-mono">
                        {p.total_gross != null ? currencyFormatter.format(p.total_gross) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono">
                        {p.total_net != null ? currencyFormatter.format(p.total_net) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(p.status === 'open' ||
                            p.status === 'failed' ||
                            p.status === 'processing' ||
                            p.status === 'completed' ||
                            p.status === 'pending_validation') &&
                            hasPermission(user, 'process_payroll') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('payroll.periodsPage.process')}
                              onClick={() => setProcessId(p.id)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(p.status === 'completed' || p.status === 'pending_validation') &&
                            hasPermission(user, 'process_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.submit')}
                                onClick={() => submitMutation.mutate(p.id)}
                                disabled={submitMutation.isPending}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'completed' || p.status === 'pending_approval') &&
                            hasPermission(user, 'approve_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.approve')}
                                onClick={() => approveMutation.mutate(p.id)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'completed' || p.status === 'approved') &&
                            hasPermission(user, 'close_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.close')}
                                onClick={() => closeMutation.mutate(p.id)}
                              >
                                <Lock className="h-4 w-4" />
                              </Button>
                            )}
                          {(p.status === 'approved' || p.status === 'closed') &&
                            hasPermission(user, 'close_payroll') && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title={t('payroll.periodsPage.registerPayment')}
                                onClick={() => payMutation.mutate(p.id)}
                                disabled={payMutation.isPending}
                              >
                                <Banknote className="h-4 w-4" />
                              </Button>
                            )}
                          {p.status === 'closed' && hasPermission(user, 'close_payroll') && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={t('payroll.periodsPage.reopen')}
                              onClick={() => setReopenId(p.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" asChild title={t('payroll.periodsPage.viewDetails')}>
                            <Link to={`/payroll/${p.id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ProcessPeriodDialog
        periodId={processId ?? 0}
        open={processId != null}
        onOpenChange={(open) => { if (!open) setProcessId(null) }}
        onFinished={() => invalidate()}
      />

      <ReopenPeriodDialog
        periodId={reopenId}
        onOpenChange={(open) => { if (!open) setReopenId(null) }}
        onConfirm={(reason) => {
          if (reopenId != null) reopenMutation.mutate({ id: reopenId, reason })
        }}
        isPending={reopenMutation.isPending}
      />
    </div>
  )
}

function ReopenPeriodDialog({
  periodId,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  periodId: number | null
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const open = periodId != null
  const valid = reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payroll.periodsPage.reopenTitle')}</DialogTitle>
          <DialogDescription>
            Esta acção cria uma nova versão do período. O resultado anterior é preservado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
            {t('payroll.detail.dialogs.reopenWarning')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">{t('payroll.periodsPage.reasonRequired')}</Label>
            <Textarea
              id="reopen-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('payroll.periodsPage.reasonPlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('payroll.periodsPage.cancel')}</Button>
          <Button
            disabled={!valid || isPending}
            onClick={() => onConfirm(reason.trim())}
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('payroll.periodsPage.confirmReopen')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreatePeriodDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { period_type: 'monthly' } })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('payroll/periods', {
        ...values,
        payment_date: values.payment_date || undefined,
      }),
    onSuccess: () => {
      toast.success('Período criado')
      onOpenChange(false)
      onDone()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao criar período')),
  })

  const onSubmit = (values: FormValues) => mutation.mutate(values)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> {t('payroll.newPeriod')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('payroll.newPeriod')}</DialogTitle>
          <DialogDescription>{t('payroll.periodsPage.newPeriodDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('payroll.periodsPage.periodType')}</Label>
              <Select
                value={watch('period_type')}
                onValueChange={(v) => setValue('period_type', v as FormValues['period_type'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('payroll.periodsPage.periodType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('payroll.periodTypes.monthly')}</SelectItem>
                  <SelectItem value="biweekly">{t('payroll.periodTypes.biweekly')}</SelectItem>
                  <SelectItem value="weekly">{t('payroll.periodTypes.weekly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('payroll.periodsPage.paymentDate')}</Label>
              <Input type="date" {...register('payment_date')} />
            </div>
            <div className="space-y-2">
              <Label>{t('payroll.periodsPage.start')}</Label>
              <Input type="date" {...register('period_start')} />
              {errors.period_start && <p className="text-xs text-destructive">{errors.period_start.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t('payroll.periodsPage.end')}</Label>
              <Input type="date" {...register('period_end')} />
              {errors.period_end && <p className="text-xs text-destructive">{errors.period_end.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('payroll.periodsPage.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || mutation.isPending}>
              {isSubmitting || mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('payroll.periodsPage.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(date: string, locale: string): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat(locale).format(new Date(date))
}

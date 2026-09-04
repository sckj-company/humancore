import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Star, CheckCircle2, XCircle, Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { PerformanceEvaluation, PerformanceCycle, PerformanceStatus, Paginated } from '@/types'

export function PerformancePage() {
  const { t, i18n: _i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_performance')
  const canUpdate = hasPermission(user, 'update_performance')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const evaluations = useQuery({
    queryKey: ['performance', search, statusFilter],
    queryFn: () =>
      api.get<Paginated<PerformanceEvaluation>>('performance', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        per_page: 30,
      }),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('performance.title')}
        description={t('performance.description')}
        actions={canCreate ? <NewEvaluationDialog onCreated={() => evaluations.refetch()} /> : undefined}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('performance.period')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('performance.statuses.approved') /* reuse label for status */}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="draft">{t('performance.statuses.draft')}</SelectItem>
                <SelectItem value="submitted">{t('performance.statuses.submitted')}</SelectItem>
                <SelectItem value="approved">{t('performance.statuses.approved')}</SelectItem>
                <SelectItem value="rejected">{t('performance.statuses.rejected')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {evaluations.isLoading ? (
        <LoadingState />
      ) : evaluations.isError ? (
        <ErrorState message={t('performance.error')} onRetry={evaluations.refetch} />
      ) : (evaluations.data?.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('performance.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-3 font-medium">{t('performance.period')}</th>
                    <th className="px-4 py-3 font-medium">{t('recruitment.candidate.name') /* employee */}</th>
                    <th className="px-4 py-3 font-medium">{t('performance.cycle')}</th>
                    <th className="px-4 py-3 font-medium">{t('performance.score')}</th>
                    <th className="px-4 py-3 font-medium">{t('performance.statuses.approved') /* status */}</th>
                    <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.data?.data?.map((ev) => (
                    <EvaluationRow key={ev.id} ev={ev} canUpdate={canUpdate} onChange={() => evaluations.refetch()} />
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

function EvaluationRow({ ev, canUpdate, onChange }: { ev: PerformanceEvaluation; canUpdate: boolean; onChange: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  const submit = useMutation({
    mutationFn: () => api.put<PerformanceEvaluation>(`performance/${ev.id}`, { status: 'submitted' }),
    onSuccess: () => { toast.success(t('recruitment.saved')); qc.invalidateQueries({ queryKey: ['performance'] }); onChange() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('performance.error'))),
  })
  const approve = useMutation({
    mutationFn: () => api.post<PerformanceEvaluation>(`performance/${ev.id}/approve`),
    onSuccess: () => { toast.success(t('recruitment.saved')); qc.invalidateQueries({ queryKey: ['performance'] }); onChange() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('performance.error'))),
  })
  const reject = useMutation({
    mutationFn: () => api.post<PerformanceEvaluation>(`performance/${ev.id}/reject`),
    onSuccess: () => { toast.success(t('recruitment.saved')); qc.invalidateQueries({ queryKey: ['performance'] }); onChange() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('performance.error'))),
  })

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-medium">{ev.period}</td>
      <td className="px-4 py-3">{ev.employee?.full_name ?? '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{ev.cycle_label}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 font-medium">
          <Star className="h-3.5 w-3.5 text-warning" />
          {ev.score?.toFixed(2) ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3"><Badge variant={ev.status_variant}>{ev.status_label}</Badge></td>
      <td className="px-4 py-3 text-right">
        {canUpdate && (
          <div className="flex justify-end gap-1">
            {ev.status === 'draft' && (
              <Button size="sm" variant="ghost" onClick={() => submit.mutate()} disabled={submit.isPending}>
                <Send className="mr-1 h-3.5 w-3.5" /> {t('performance.actions.submit')}
              </Button>
            )}
            {ev.status === 'submitted' && (
              <>
                <Button size="sm" variant="ghost" onClick={() => approve.mutate()} disabled={approve.isPending}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {t('performance.actions.approve')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reject.mutate()} disabled={reject.isPending}>
                  <XCircle className="mr-1 h-3.5 w-3.5" /> {t('performance.actions.reject')}
                </Button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function NewEvaluationDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    employee_id: '',
    period: '2026-H1',
    cycle: 'semi_annual' as PerformanceCycle,
    score: '',
    strengths: '',
    improvements: '',
    status: 'draft' as PerformanceStatus,
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<PerformanceEvaluation>('performance', {
        employee_id: Number(form.employee_id),
        period: form.period,
        cycle: form.cycle,
        score: form.score ? Number(form.score) : null,
        strengths: form.strengths || null,
        improvements: form.improvements || null,
        status: form.status,
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setForm({ ...form, employee_id: '', score: '', strengths: '', improvements: '' })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('performance.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('performance.newEvaluation')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('performance.newEvaluation')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee ID *</Label>
            <Input
              type="number"
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('performance.period')}</Label>
              <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('performance.cycle')}</Label>
              <Select value={form.cycle} onValueChange={(v) => setForm({ ...form, cycle: v as PerformanceCycle })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('performance.cycleOptions.monthly')}</SelectItem>
                  <SelectItem value="quarterly">{t('performance.cycleOptions.quarterly')}</SelectItem>
                  <SelectItem value="semi_annual">{t('performance.cycleOptions.semi_annual')}</SelectItem>
                  <SelectItem value="annual">{t('performance.cycleOptions.annual')}</SelectItem>
                  <SelectItem value="probation">{t('performance.cycleOptions.probation')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('performance.score')} (0-5)</Label>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={form.score}
              onChange={(e) => setForm({ ...form, score: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('performance.strengths')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('performance.improvements')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form.improvements}
              onChange={(e) => setForm({ ...form, improvements: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!form.employee_id || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

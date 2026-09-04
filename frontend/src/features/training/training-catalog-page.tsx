import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, GraduationCap, MapPin, Users, Calendar, Clock, UserPlus, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import type { Training, TrainingCategory, TrainingStatus, Paginated } from '@/types'

const currencyFormatter = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 })

export function TrainingCatalogPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_training')
  const canUpdate = hasPermission(user, 'update_training')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const trainings = useQuery({
    queryKey: ['trainings', search, statusFilter, categoryFilter],
    queryFn: () =>
      api.get<Paginated<Training>>('trainings', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        per_page: 30,
      }),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('trainingPage.title')}
        description={t('trainingPage.description')}
        actions={canCreate ? <NewTrainingDialog onCreated={() => trainings.refetch()} /> : undefined}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('trainingPage.training.title')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('trainingPage.training.category')}</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="technical">{t('trainingPage.categoryOptions.technical')}</SelectItem>
                <SelectItem value="soft_skills">{t('trainingPage.categoryOptions.soft_skills')}</SelectItem>
                <SelectItem value="leadership">{t('trainingPage.categoryOptions.leadership')}</SelectItem>
                <SelectItem value="compliance">{t('trainingPage.categoryOptions.compliance')}</SelectItem>
                <SelectItem value="safety">{t('trainingPage.categoryOptions.safety')}</SelectItem>
                <SelectItem value="onboarding">{t('trainingPage.categoryOptions.onboarding')}</SelectItem>
                <SelectItem value="other">{t('trainingPage.categoryOptions.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('trainingPage.training.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                <SelectItem value="planned">{t('trainingPage.statuses.planned')}</SelectItem>
                <SelectItem value="open">{t('trainingPage.statuses.open')}</SelectItem>
                <SelectItem value="in_progress">{t('trainingPage.statuses.in_progress')}</SelectItem>
                <SelectItem value="completed">{t('trainingPage.statuses.completed')}</SelectItem>
                <SelectItem value="cancelled">{t('trainingPage.statuses.cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {trainings.isLoading ? (
        <LoadingState />
      ) : trainings.isError ? (
        <ErrorState message={t('trainingPage.error')} onRetry={trainings.refetch} />
      ) : (trainings.data?.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('trainingPage.empty')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {trainings.data?.data?.map((tr) => (
            <TrainingCard key={tr.id} training={tr} canUpdate={canUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

function TrainingCard({ training, canUpdate }: { training: Training; canUpdate: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')

  const enroll = useMutation({
    mutationFn: () => api.post(`trainings/${training.id}/enroll`, { employee_id: Number(employeeId) }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setEnrollOpen(false)
      setEmployeeId('')
      qc.invalidateQueries({ queryKey: ['trainings'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('trainingPage.error'))),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{training.title}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><GraduationCap className="h-3 w-3" /> {training.category_label}</span>
              {training.provider && <span>· {training.provider}</span>}
              {training.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{training.location}</span>}
            </div>
          </div>
          <Badge variant={training.status_variant}>{training.status_label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {training.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{training.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {training.start_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />{training.start_date}{training.end_date ? ` → ${training.end_date}` : ''}
            </span>
          )}
          {training.duration_hours > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />{training.duration_hours}h
            </span>
          )}
          {training.max_participants != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />{training.enrolled_count}/{training.max_participants}
            </span>
          )}
          {training.cost > 0 && <span>· {currencyFormatter.format(training.cost)} {training.currency}</span>}
        </div>
        {canUpdate && (
          <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                {t('trainingPage.actions.enroll')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{training.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label>Employee ID</Label>
                <Input type="number" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEnrollOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={() => enroll.mutate()} disabled={!employeeId || enroll.isPending}>
                  {enroll.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  )
}

function NewTrainingDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'technical' as TrainingCategory,
    duration_hours: '',
    provider: '',
    location: '',
    cost: '',
    currency: 'AOA',
    max_participants: '',
    start_date: '',
    end_date: '',
    status: 'open' as TrainingStatus,
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<Training>('trainings', {
        title: form.title,
        description: form.description || null,
        category: form.category,
        duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
        provider: form.provider || null,
        location: form.location || null,
        cost: form.cost ? Number(form.cost) : 0,
        currency: form.currency,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setForm({ ...form, title: '', description: '', duration_hours: '', provider: '', location: '' })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('trainingPage.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('trainingPage.newTraining')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('trainingPage.newTraining')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('trainingPage.training.title')} *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.category')}</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as TrainingCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="technical">{t('trainingPage.categoryOptions.technical')}</SelectItem>
                <SelectItem value="soft_skills">{t('trainingPage.categoryOptions.soft_skills')}</SelectItem>
                <SelectItem value="leadership">{t('trainingPage.categoryOptions.leadership')}</SelectItem>
                <SelectItem value="compliance">{t('trainingPage.categoryOptions.compliance')}</SelectItem>
                <SelectItem value="safety">{t('trainingPage.categoryOptions.safety')}</SelectItem>
                <SelectItem value="onboarding">{t('trainingPage.categoryOptions.onboarding')}</SelectItem>
                <SelectItem value="other">{t('trainingPage.categoryOptions.other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TrainingStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">{t('trainingPage.statuses.planned')}</SelectItem>
                <SelectItem value="open">{t('trainingPage.statuses.open')}</SelectItem>
                <SelectItem value="in_progress">{t('trainingPage.statuses.in_progress')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.duration_hours')}</Label>
            <Input type="number" min={0} value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.max_participants')}</Label>
            <Input type="number" min={1} value={form.max_participants} onChange={(e) => setForm({ ...form, max_participants: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.provider')}</Label>
            <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.location')}</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.cost')}</Label>
            <Input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.start_date')}</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('trainingPage.training.end_date')}</Label>
            <Input type="date" value={form.end_date} min={form.start_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('trainingPage.training.description')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

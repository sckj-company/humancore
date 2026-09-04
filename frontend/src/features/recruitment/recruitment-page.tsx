import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Briefcase, Users, MapPin, Calendar, Send, CheckCircle2, XCircle, UserCheck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type {
  JobOpening,
  JobOpeningStatus,
  Candidate,
  CandidateStatus,
  Paginated,
} from '@/types'

const CANDIDATE_PIPELINE: CandidateStatus[] = [
  'applied',
  'screening',
  'interview',
  'test',
  'offer',
  'hired',
]

export function RecruitmentPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_recruitment')
  const canUpdate = hasPermission(user, 'update_recruitment')

  const [tab, setTab] = useState<'jobs' | 'candidates'>('jobs')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const jobs = useQuery({
    queryKey: ['recruitment', 'jobs', search, statusFilter],
    queryFn: () =>
      api.get<Paginated<JobOpening>>('recruitment/jobs', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        per_page: 30,
      }),
  })

  const candidates = useQuery({
    queryKey: ['recruitment', 'candidates', search, statusFilter],
    queryFn: () =>
      api.get<Paginated<Candidate>>('recruitment/candidates', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        per_page: 50,
      }),
    enabled: tab === 'candidates',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('recruitment.title')}
        description={t('recruitment.description')}
        actions={
          canCreate ? (
            tab === 'jobs' ? (
              <NewJobDialog onCreated={() => jobs.refetch()} />
            ) : (
              <NewCandidateDialog jobs={jobs.data?.data ?? []} onCreated={() => candidates.refetch()} />
            )
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('common.search')}</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'jobs' ? t('recruitment.job.title') : t('recruitment.candidate.name')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('recruitment.job.status')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {tab === 'jobs' ? (
                  <>
                    <SelectItem value="draft">{t('recruitment.statuses.draft')}</SelectItem>
                    <SelectItem value="open">{t('recruitment.statuses.open')}</SelectItem>
                    <SelectItem value="on_hold">{t('recruitment.statuses.on_hold')}</SelectItem>
                    <SelectItem value="closed">{t('recruitment.statuses.closed')}</SelectItem>
                  </>
                ) : (
                  CANDIDATE_PIPELINE.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`recruitment.statuses.${s}`)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'jobs' | 'candidates')}>
        <TabsList>
          <TabsTrigger value="jobs">
            <Briefcase className="mr-2 h-3.5 w-3.5" />
            {t('recruitment.tabs.jobs')} ({jobs.data?.meta?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="candidates">
            <Users className="mr-2 h-3.5 w-3.5" />
            {t('recruitment.tabs.candidates')} ({candidates.data?.meta?.total ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-3">
          {jobs.isLoading ? (
            <LoadingState />
          ) : jobs.isError ? (
            <ErrorState message={t('recruitment.error')} onRetry={jobs.refetch} />
          ) : (jobs.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('recruitment.empty')} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {jobs.data?.data?.map((job) => (
                <JobCard key={job.id} job={job} canUpdate={canUpdate} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="candidates" className="space-y-3">
          {candidates.isLoading ? (
            <LoadingState />
          ) : candidates.isError ? (
            <ErrorState message={t('recruitment.error')} onRetry={candidates.refetch} />
          ) : (candidates.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('recruitment.empty')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.name')}</th>
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.email')}</th>
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.phone')}</th>
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.yearsExperience')}</th>
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.status')}</th>
                        <th className="px-4 py-3 font-medium">{t('recruitment.candidate.appliedAt')}</th>
                        <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.data?.data?.map((c) => (
                        <CandidateRow key={c.id} candidate={c} canUpdate={canUpdate} locale={i18n.language} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function JobCard({ job, canUpdate }: { job: JobOpening; canUpdate: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const publish = useMutation({
    mutationFn: () => api.post<JobOpening>(`recruitment/jobs/${job.id}/publish`),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      qc.invalidateQueries({ queryKey: ['recruitment', 'jobs'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitment.error'))),
  })
  const close = useMutation({
    mutationFn: () => api.post<JobOpening>(`recruitment/jobs/${job.id}/close`),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      qc.invalidateQueries({ queryKey: ['recruitment', 'jobs'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitment.error'))),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{job.title}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {job.department && <span>{job.department.name}</span>}
              {job.position && <span>· {job.position.title}</span>}
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {job.location}
                </span>
              )}
            </div>
          </div>
          <Badge variant={job.status_variant}>{job.status_label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {job.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{job.openings_count} {t('recruitment.job.openingsCount').toLowerCase()}</span>
          {job.salary_range && <span>· {job.salary_range}</span>}
          {job.published_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {job.published_at}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {job.candidates_count ?? 0}
          </span>
        </div>
        {canUpdate && (
          <div className="flex gap-2">
            {job.status === 'draft' && (
              <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {t('recruitment.job.actions.publish')}
              </Button>
            )}
            {(job.status === 'open' || job.status === 'on_hold') && (
              <Button size="sm" variant="outline" onClick={() => close.mutate()} disabled={close.isPending}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                {t('recruitment.job.actions.close')}
              </Button>
            )}
            {job.status === 'closed' && (
              <Button size="sm" variant="outline" onClick={() => publish.mutate()} disabled={publish.isPending}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                {t('recruitment.job.actions.reopen')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CandidateRow({
  candidate,
  canUpdate,
  locale: _locale,
}: {
  candidate: Candidate
  canUpdate: boolean
  locale: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [moveOpen, setMoveOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<CandidateStatus>('screening')

  const move = useMutation({
    mutationFn: () => api.post<Candidate>(`recruitment/candidates/${candidate.id}/move`, { status: newStatus }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      qc.invalidateQueries({ queryKey: ['recruitment', 'candidates'] })
      setMoveOpen(false)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitment.error'))),
  })

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-medium">{candidate.full_name}</td>
      <td className="px-4 py-3 text-muted-foreground">{candidate.email}</td>
      <td className="px-4 py-3 text-muted-foreground">{candidate.phone ?? '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{candidate.years_experience ?? '—'}</td>
      <td className="px-4 py-3">
        <Badge variant="secondary">{candidate.status_label}</Badge>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {candidate.applied_at ? new Date(candidate.applied_at).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        {canUpdate && (
          <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost">
                {t('recruitment.candidate.move')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{candidate.full_name}</DialogTitle>
                <DialogDescription>{t('recruitment.candidate.move')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>{t('recruitment.candidate.status')}</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as CandidateStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CandidateRow_STATUSES_LABELS).map(([k]) => (
                      <SelectItem key={k} value={k}>
                        {t(`recruitment.statuses.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMoveOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => move.mutate()} disabled={move.isPending}>
                  {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </td>
    </tr>
  )
}

const CandidateRow_STATUSES_LABELS: Record<string, string> = {
  applied: '',
  screening: '',
  interview: '',
  test: '',
  offer: '',
  hired: '',
  rejected: '',
  withdrawn: '',
}

function NewJobDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '',
    location: '',
    employment_type: 'full_time' as 'full_time' | 'part_time' | 'contract' | 'temporary' | 'internship',
    experience_level: 'mid' as 'intern' | 'junior' | 'mid' | 'senior' | 'lead',
    openings_count: 1,
    salary_min: '',
    salary_max: '',
    description: '',
    status: 'open' as JobOpeningStatus,
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<JobOpening>('recruitment/jobs', {
        title: form.title,
        location: form.location || null,
        employment_type: form.employment_type,
        experience_level: form.experience_level,
        openings_count: form.openings_count,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        description: form.description || null,
        status: form.status,
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setForm({ ...form, title: '', description: '', location: '' })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitment.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('recruitment.newJob')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('recruitment.newJob')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('recruitment.job.title')} *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.location')}</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.openingsCount')}</Label>
            <Input
              type="number"
              min={1}
              value={form.openings_count}
              onChange={(e) => setForm({ ...form, openings_count: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.employmentType')}</Label>
            <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v as typeof form.employment_type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">{t('recruitment.job.employmentType') === 'Tipo de contrato' ? 'Tempo integral' : 'Full time'}</SelectItem>
                <SelectItem value="part_time">Part time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="temporary">Temporary</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.experienceLevel')}</Label>
            <Select value={form.experience_level} onValueChange={(v) => setForm({ ...form, experience_level: v as typeof form.experience_level })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intern">Intern</SelectItem>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.salaryMin')}</Label>
            <Input type="number" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.salaryMax')}</Label>
            <Input type="number" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.job.status')}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as JobOpeningStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t('recruitment.statuses.draft')}</SelectItem>
                <SelectItem value="open">{t('recruitment.statuses.open')}</SelectItem>
                <SelectItem value="on_hold">{t('recruitment.statuses.on_hold')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('recruitment.job.description')}</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
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

function NewCandidateDialog({ jobs, onCreated }: { jobs: JobOpening[]; onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    job_opening_id: jobs[0]?.id ?? 0,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    years_experience: '',
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<Candidate>('recruitment/candidates', {
        job_opening_id: form.job_opening_id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || null,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        status: 'applied',
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setForm({ ...form, first_name: '', last_name: '', email: '', phone: '', years_experience: '' })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitment.error'))),
  })

  const openJobs = useMemo(() => jobs.filter((j) => j.status === 'open' || j.status === 'draft'), [jobs])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserCheck className="mr-2 h-4 w-4" />
          {t('recruitment.newCandidate')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('recruitment.newCandidate')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('recruitment.candidate.addToJob')}</Label>
            <Select
              value={String(form.job_opening_id)}
              onValueChange={(v) => setForm({ ...form, job_opening_id: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {openJobs.length === 0 ? (
                  <SelectItem value="0" disabled>—</SelectItem>
                ) : (
                  openJobs.map((j) => (
                    <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('recruitment.candidate.name')}</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Primeiro" />
            </div>
            <div className="space-y-1.5">
              <Label>&nbsp;</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Último" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('recruitment.candidate.email')} *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('recruitment.candidate.phone')}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('recruitment.candidate.yearsExperience')}</Label>
              <Input type="number" min={0} value={form.years_experience} onChange={(e) => setForm({ ...form, years_experience: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!form.first_name || !form.last_name || !form.email || !form.job_opening_id || create.isPending}
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

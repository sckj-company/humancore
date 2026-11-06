import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Briefcase,
  Users,
  MapPin,
  Calendar,
  Send,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserPlus,
  Loader2,
  ArrowRight,
  Banknote,
  Building2,
  Search,
  MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type {
  JobOpening,
  JobOpeningStatus,
  Candidate,
  Paginated,
} from '@/types'
import { useDepartments, usePositions } from '@/features/organization/api'

export function RecruitmentPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_recruitment')
  const canUpdate = hasPermission(user, 'update_recruitment')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const jobs = useQuery({
    queryKey: ['recruitment', 'jobs', search, statusFilter],
    queryFn: () =>
      api.get<Paginated<JobOpening>>('recruitment/jobs', {
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        per_page: 50,
      }),
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página: Apenas o botão de criação de vaga */}
      <PageHeader
        title={t('recruitmentPage.title')}
        description={t('recruitmentPage.description')}
        actions={
          canCreate ? (
            <NewJobDialog onCreated={() => jobs.refetch()} />
          ) : undefined
        }
      />

      {/* Barra de Filtros e Pesquisa */}
      <Card className="border-border/80">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5 pb-5">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label className="text-xs font-semibold">{t('recruitmentPage.search')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('recruitmentPage.searchJobsPlaceholder')}
                className="pl-9 h-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5 w-full sm:w-[200px]">
            <Label className="text-xs font-semibold">{t('recruitmentPage.jobStatus')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('recruitmentPage.allJobStatuses')}</SelectItem>
                <SelectItem value="open">{t('recruitmentPage.jobStatusOptions.open')}</SelectItem>
                <SelectItem value="draft">{t('recruitmentPage.jobStatusOptions.draft')}</SelectItem>
                <SelectItem value="on_hold">{t('recruitmentPage.jobStatusOptions.onHold')}</SelectItem>
                <SelectItem value="closed">{t('recruitmentPage.jobStatusOptions.closed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Listagem Direta de Vagas (Sem Abas) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            {t('recruitmentPage.publishedJobsHeading', { count: jobs.data?.meta?.total ?? jobs.data?.data?.length ?? 0 })}
          </h2>
        </div>

        {jobs.isLoading ? (
          <LoadingState />
        ) : jobs.isError ? (
          <ErrorState message={t('recruitmentPage.loadJobsError')} onRetry={jobs.refetch} />
        ) : (jobs.data?.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-8 w-8 text-primary" />}
            title={t('recruitmentPage.noJobsTitle')}
            description={t('recruitmentPage.noJobsDescription')}
            action={
              canCreate ? (
                <NewJobDialog onCreated={() => jobs.refetch()} />
              ) : undefined
            }
          />
        ) : (
          <Card className="border-border/80 shadow-xs overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="font-semibold text-xs text-foreground w-[32%]">{t('recruitmentPage.jobAndPosition')}</TableHead>
                  <TableHead className="font-semibold text-xs text-foreground w-[14%]">{t('recruitmentPage.location')}</TableHead>
                  <TableHead className="font-semibold text-xs text-foreground w-[15%]">{t('recruitmentPage.openingsAndCandidates')}</TableHead>
                  <TableHead className="font-semibold text-xs text-foreground w-[14%]">{t('recruitmentPage.compensation')}</TableHead>
                  <TableHead className="font-semibold text-xs text-foreground w-[10%]">{t('recruitmentPage.status')}</TableHead>
                  <TableHead className="font-semibold text-xs text-foreground text-right w-[15%]">{t('recruitmentPage.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data?.data?.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    canUpdate={canUpdate}
                    canCreateCandidate={canCreate}
                    onRefresh={() => jobs.refetch()}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  )
}

function JobRow({
  job,
  canUpdate,
  canCreateCandidate,
  onRefresh,
}: {
  job: JobOpening
  canUpdate: boolean
  canCreateCandidate: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const publish = useMutation({
    mutationFn: () => api.post<JobOpening>(`recruitment/jobs/${job.id}/publish`),
    onSuccess: () => {
      toast.success(t('recruitmentPage.jobReopenedSuccess'))
      onRefresh()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitmentPage.jobReopenError'))),
  })

  const close = useMutation({
    mutationFn: () => api.post<JobOpening>(`recruitment/jobs/${job.id}/close`),
    onSuccess: () => {
      toast.success(t('recruitmentPage.jobClosedSuccess'))
      onRefresh()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitmentPage.jobCloseError'))),
  })

  const isClosed = job.status === 'closed'

  return (
    <TableRow className="hover:bg-muted/30 transition-colors">
      {/* Vaga & Posição */}
      <TableCell className="py-2.5">
        <div className="space-y-1">
          <Link
            to={`/recruitment/${job.id}`}
            className="font-semibold text-foreground hover:text-primary transition-colors text-sm line-clamp-1"
          >
            {job.title}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {job.department && (
              <span className="flex items-center gap-1 font-medium text-foreground/90">
                <Building2 className="h-3 w-3 text-primary shrink-0" />
                {job.department.name}
              </span>
            )}
            {job.position && (
              <span className="text-muted-foreground">• {job.position.title}</span>
            )}
            {job.employment_type_label && (
              <span className="inline-block px-1.5 py-0.2 rounded bg-muted text-[10px] font-medium text-muted-foreground">
                {job.employment_type_label}
              </span>
            )}
          </div>
        </div>
      </TableCell>

      {/* Localização */}
      <TableCell className="py-2.5 text-xs text-muted-foreground">
        {job.location ? (
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{job.location}</span>
          </div>
        ) : (
          <span>{t('recruitmentPage.onSite')}</span>
        )}
      </TableCell>

      {/* Vagas & Candidatos */}
      <TableCell className="py-2.5">
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Briefcase className="h-3 w-3 text-primary shrink-0" />
            <span className="font-semibold text-foreground">
              {job.openings_count === 1
                ? t('recruitmentPage.openingCountOne', { count: job.openings_count })
                : t('recruitmentPage.openingCountMany', { count: job.openings_count })}
            </span>
          </div>
          <div>
            <Link
              to={`/recruitment/${job.id}`}
              className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
            >
              <Users className="h-3 w-3 shrink-0" />
              <span>
                {(job.candidates_count ?? 0) === 1
                  ? t('recruitmentPage.candidateCountOne', { count: job.candidates_count ?? 0 })
                  : t('recruitmentPage.candidateCountMany', { count: job.candidates_count ?? 0 })}
              </span>
            </Link>
          </div>
        </div>
      </TableCell>

      {/* Faixa Salarial */}
      <TableCell className="py-2.5 font-mono text-xs">
        {job.salary_range ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {job.salary_range}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('recruitmentPage.salaryNegotiable')}</span>
        )}
      </TableCell>

      {/* Estado */}
      <TableCell className="py-2.5">
        <Badge variant={job.status_variant} className="font-medium text-[11px] whitespace-nowrap">
          {t(`recruitmentPage.jobStatusOptions.${job.status === 'on_hold' ? 'onHold' : job.status}`, {
            defaultValue: job.status_label,
          })}
        </Badge>
      </TableCell>

      {/* Ações em cada linha */}
      <TableCell className="py-2.5 text-right">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* Se a vaga NÃO estiver fechada, permite adicionar candidatos */}
          {canCreateCandidate && !isClosed ? (
            <AddCandidateToJobDialog job={job} onCreated={onRefresh} />
          ) : isClosed ? (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground font-normal py-0.5 px-1.5 border-dashed whitespace-nowrap">
              {t('recruitmentPage.jobStatusOptions.closed')}
            </Badge>
          ) : null}

          {/* Botão Ver Detalhes e Candidatos */}
          <Button size="icon-sm" variant="outline" className="h-7 w-7 shrink-0" asChild title={t('recruitmentPage.viewCandidatesAndDetails')}>
            <Link to={`/recruitment/${job.id}`}>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>

          {/* Botão de Fechar Vaga / Reabrir Vaga */}
          {canUpdate && (
            !isClosed ? (
              <Button
                size="sm"
                variant="outline"
                className="h-auto min-h-7 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 shrink-0 whitespace-normal text-center"
                onClick={() => close.mutate()}
                disabled={close.isPending}
                title={t('recruitmentPage.closeJob')}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('recruitmentPage.close')}</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-auto min-h-7 px-2 text-xs gap-1 text-emerald-600 hover:bg-emerald-500/10 border-emerald-300 dark:border-emerald-800 shrink-0 whitespace-normal text-center"
                onClick={() => publish.mutate()}
                disabled={publish.isPending}
                title={t('recruitmentPage.reopenJob')}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('recruitmentPage.reopen')}</span>
              </Button>
            )
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function NewJobDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: departments } = useDepartments()
  const { data: positions } = usePositions()

  const [form, setForm] = useState({
    title: '',
    department_id: '',
    position_id: '',
    location: '',
    openings_count: 1,
    employment_type: 'full_time',
    experience_level: 'mid',
    salary_min: '',
    salary_max: '',
    status: 'open' as JobOpeningStatus,
    description: '',
    requirements: '',
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<JobOpening>('recruitment/jobs', {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        position_id: form.position_id ? Number(form.position_id) : null,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
      }),
    onSuccess: () => {
      toast.success(t('recruitmentPage.jobCreatedSuccess'))
      setOpen(false)
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitmentPage.jobCreateError'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 shadow-xs h-auto min-h-9 whitespace-normal text-center">
          <Plus className="h-4 w-4" />
          {t('recruitmentPage.newJob')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5 text-primary" />
            {t('recruitmentPage.createJobTitle')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('recruitmentPage.createJobDescription')}
          </DialogDescription>
        </DialogHeader>

        {/* Corpo do formulário com scroll bem apresentado e organizado */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">{t('recruitmentPage.jobTitle')} *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t('recruitmentPage.jobTitlePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.department')}</Label>
              <Select
                value={form.department_id}
                onValueChange={(v) => setForm({ ...form, department_id: v })}
              >
                <SelectTrigger><SelectValue placeholder={t('recruitmentPage.selectDepartment')} /></SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.associatedPosition')}</Label>
              <Select
                value={form.position_id}
                onValueChange={(v) => setForm({ ...form, position_id: v })}
              >
                <SelectTrigger><SelectValue placeholder={t('recruitmentPage.selectPosition')} /></SelectTrigger>
                <SelectContent>
                  {(positions ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.location')}</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder={t('recruitmentPage.locationPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.numberOfOpenings')}</Label>
              <Input
                type="number"
                min={1}
                value={form.openings_count}
                onChange={(e) => setForm({ ...form, openings_count: Number(e.target.value) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.employmentType')}</Label>
              <Select
                value={form.employment_type}
                onValueChange={(v) => setForm({ ...form, employment_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">{t('recruitmentPage.employmentTypes.fullTime')}</SelectItem>
                  <SelectItem value="part_time">{t('recruitmentPage.employmentTypes.partTime')}</SelectItem>
                  <SelectItem value="contract">{t('recruitmentPage.employmentTypes.contract')}</SelectItem>
                  <SelectItem value="temporary">{t('recruitmentPage.employmentTypes.temporary')}</SelectItem>
                  <SelectItem value="internship">{t('recruitmentPage.employmentTypes.internship')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.experienceLevel')}</Label>
              <Select
                value={form.experience_level}
                onValueChange={(v) => setForm({ ...form, experience_level: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="intern">{t('recruitmentPage.experienceLevels.intern')}</SelectItem>
                  <SelectItem value="junior">{t('recruitmentPage.experienceLevels.junior')}</SelectItem>
                  <SelectItem value="mid">{t('recruitmentPage.experienceLevels.mid')}</SelectItem>
                  <SelectItem value="senior">{t('recruitmentPage.experienceLevels.senior')}</SelectItem>
                  <SelectItem value="lead">{t('recruitmentPage.experienceLevels.lead')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.minimumSalary')} (AOA)</Label>
              <Input
                type="number"
                value={form.salary_min}
                onChange={(e) => setForm({ ...form, salary_min: e.target.value })}
                placeholder={t('recruitmentPage.minimumSalaryPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.maximumSalary')} (AOA)</Label>
              <Input
                type="number"
                value={form.salary_max}
                onChange={(e) => setForm({ ...form, salary_max: e.target.value })}
                placeholder={t('recruitmentPage.maximumSalaryPlaceholder')}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">{t('recruitmentPage.responsibilitiesDescription')}</Label>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('recruitmentPage.responsibilitiesPlaceholder')}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold">{t('recruitmentPage.requirementsAndSkills')}</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                placeholder={t('recruitmentPage.requirementsPlaceholder')}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 px-6 border-t border-border bg-muted/20 shrink-0 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t('recruitmentPage.cancel')}
          </Button>
          <Button size="sm" onClick={() => create.mutate()} disabled={!form.title || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('recruitmentPage.saveJob')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddCandidateToJobDialog({
  job,
  onCreated,
}: {
  job: JobOpening
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    years_experience: '',
    expected_salary: '',
    notes: '',
  })

  const create = useMutation({
    mutationFn: () =>
      api.post<Candidate>('recruitment/candidates', {
        job_opening_id: job.id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || null,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        expected_salary: form.expected_salary ? Number(form.expected_salary) : null,
        notes: form.notes || null,
        status: 'applied',
      }),
    onSuccess: () => {
      toast.success(t('recruitmentPage.candidateAddedToJobSuccess', { jobTitle: job.title }))
      setOpen(false)
      setForm({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        years_experience: '',
        expected_salary: '',
        notes: '',
      })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('recruitmentPage.candidateCreateError'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-auto min-h-7 px-2.5 gap-1 text-xs bg-primary text-primary-foreground shrink-0 shadow-xs whitespace-normal text-center">
          <UserPlus className="h-3.5 w-3.5" />
          <span>{t('recruitmentPage.addCandidateShort')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {t('recruitmentPage.addCandidate')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t('recruitmentPage.addCandidateDescription', { jobTitle: job.title })}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
          className="flex-1 min-h-0 flex flex-col justify-between"
        >
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('recruitmentPage.firstName')} *</Label>
                <Input
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder={t('recruitmentPage.firstNamePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('recruitmentPage.lastName')} *</Label>
                <Input
                  required
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder={t('recruitmentPage.lastNamePlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.email')} *</Label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={t('recruitmentPage.emailPlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.phone')}</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('recruitmentPage.phonePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('recruitmentPage.yearsExperience')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.years_experience}
                  onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
                  placeholder={t('recruitmentPage.yearsExperiencePlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t('recruitmentPage.expectedSalary')} (AOA)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.expected_salary}
                  onChange={(e) => setForm({ ...form, expected_salary: e.target.value })}
                  placeholder={t('recruitmentPage.expectedSalaryPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{t('recruitmentPage.notesOrSummary')}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('recruitmentPage.candidateNotesPlaceholder')}
              />
            </div>
          </div>

          <DialogFooter className="p-4 px-6 border-t border-border bg-muted/20 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={create.isPending}
            >
              {t('recruitmentPage.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!form.first_name || !form.last_name || !form.email || create.isPending}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('recruitmentPage.saveCandidate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

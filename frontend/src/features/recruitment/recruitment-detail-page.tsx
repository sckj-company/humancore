import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Users,
  Calendar,
  Banknote,
  Building2,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Sparkles,
  Star,
  UserCheck,
  Plus,
  Mail,
  Phone,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { api, getApiErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from '@/components/ui/dialog'
import { PageHeader, EmptyState, ErrorState } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import { cn } from '@/lib/utils'
import type { Candidate, CandidateStatus } from '@/types'
import {
  useJobOpening,
  useCandidatesByJob,
  useMoveCandidate,
  useDeleteCandidate,
  useHireCandidate,
  useCreateCandidate,
  type HirePayload,
} from './api'
import { useDepartments } from '@/features/organization/api'

const PIPELINE: { value: CandidateStatus; label: string; color: string; accent: string }[] = [
  { value: 'applied', label: 'Recebidas', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', accent: 'border-slate-500/30' },
  { value: 'screening', label: 'Triagem', color: 'bg-info/10 text-info', accent: 'border-info/30' },
  { value: 'interview', label: 'Entrevistas', color: 'bg-primary/10 text-primary', accent: 'border-primary/30' },
  { value: 'test', label: 'Avaliação', color: 'bg-warning/10 text-warning', accent: 'border-warning/30' },
  { value: 'offer', label: 'Oferta', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', accent: 'border-amber-500/30' },
  { value: 'hired', label: 'Contratados', color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400', accent: 'border-emerald-500/40' },
]

const STATUS_VARIANT: Record<CandidateStatus, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  applied: 'secondary',
  screening: 'info',
  interview: 'info',
  test: 'warning',
  offer: 'warning',
  hired: 'success',
  rejected: 'destructive',
  withdrawn: 'secondary',
}

const CONTRACT_TYPE_OPTIONS = [
  { value: 'permanent', label: 'Efetivo / Tempo Indeterminado' },
  { value: 'fixed_term', label: 'A Termo Certo' },
  { value: 'temporary', label: 'Trabalho Temporário' },
  { value: 'probation', label: 'Período Probatório' },
  { value: 'internship', label: 'Estágio Profissional' },
  { value: 'outsourced', label: 'Prestador de Serviços' },
]

const SALARY_FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'hourly', label: 'Por Hora' },
]

export function RecruitmentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canManage = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])

  const { data: job, isLoading, isError, refetch } = useJobOpening(id)
  const { data: candidates, isLoading: loadingCandidates, refetch: refetchCandidates } = useCandidatesByJob(id)
  const { data: departments } = useDepartments()

  const move = useMoveCandidate()
  const remove = useDeleteCandidate()
  const hire = useHireCandidate()
  const createCandidate = useCreateCandidate()

  // State
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [candidateSearch, setCandidateSearch] = useState('')
  const [hiringCandidate, setHiringCandidate] = useState<Candidate | null>(null)
  const [isNewCandidateOpen, setIsNewCandidateOpen] = useState(false)

  // Form de Novo Candidato para esta vaga
  const [candidateForm, setCandidateForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    years_experience: '',
    expected_salary: '',
    notes: '',
  })

  // Form de Contratação
  const [hireForm, setHireForm] = useState<HirePayload>({
    contract_type: 'permanent',
    base_salary: 0,
    salary_frequency: 'monthly',
    work_hours_per_week: 40,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    department_id: null,
    position_id: null,
    manager_id: null,
    notes: '',
  })

  const list = candidates ?? []

  const filteredList = useMemo(() => {
    if (!candidateSearch.trim()) return list
    const q = candidateSearch.toLowerCase()
    return list.filter(
      (c) =>
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q),
    )
  }, [list, candidateSearch])

  const grouped = useMemo(() => {
    const map: Record<string, Candidate[]> = {}
    PIPELINE.forEach((s) => {
      map[s.value] = filteredList.filter((c) => c.status === s.value)
    })
    map['rejected'] = filteredList.filter((c) => c.status === 'rejected' || c.status === 'withdrawn')
    return map
  }, [filteredList])

  const handleMove = (c: Candidate, status: CandidateStatus) => {
    move.mutate(
      { id: c.id, status },
      {
        onSuccess: () =>
          toast.success(`${c.full_name} → ${PIPELINE.find((p) => p.value === status)?.label ?? status}`),
        onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao mover candidato')),
      },
    )
  }

  const handleDelete = (c: Candidate) => {
    if (!confirm(`Tem a certeza que deseja eliminar o candidato ${c.full_name}?`)) return
    remove.mutate(c.id, {
      onSuccess: () => toast.success('Candidato removido com sucesso'),
      onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar candidato')),
    })
  }

  // Abrir modal de contratação
  const handleOpenHire = (c: Candidate) => {
    setHiringCandidate(c)

    // Mapeamento inteligente de tipo de contrato baseado na vaga
    let mappedContract = 'permanent'
    if (job?.employment_type === 'part_time') mappedContract = 'part_time'
    else if (job?.employment_type === 'contract') mappedContract = 'fixed_term'
    else if (job?.employment_type === 'temporary') mappedContract = 'temporary'
    else if (job?.employment_type === 'internship') mappedContract = 'internship'

    const initialSalary = c.expected_salary ? Number(c.expected_salary) : job?.salary_min ? Number(job.salary_min) : 0

    setHireForm({
      contract_type: mappedContract,
      base_salary: initialSalary,
      salary_frequency: 'monthly',
      work_hours_per_week: 40,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: null,
      department_id: job?.department_id ?? null,
      position_id: job?.position_id ?? null,
      manager_id: null,
      notes: `Contratado via processo seletivo: ${job?.title ?? ''}`,
    })
  }

  const handleSubmitHire = (e: React.FormEvent) => {
    e.preventDefault()
    if (!hiringCandidate) return

    hire.mutate(
      { id: hiringCandidate.id, data: hireForm },
      {
        onSuccess: (res: any) => {
          const emp = res?.employee || res?.data?.employee
          const empId = emp?.id
          const empCode = emp?.employee_code || ''

          toast.success(
            `Candidato ${hiringCandidate.full_name} contratado com sucesso! ${empCode ? `(Funcionário #${empCode})` : ''}`,
          )
          setHiringCandidate(null)
          refetchCandidates()

          // Redireciona diretamente para o detalhe do funcionário com a aba de documentos aberta
          if (empId) {
            navigate(`/employees/${empId}?tab=documents`)
          }
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao contratar candidato')),
      },
    )
  }

  const handleSubmitNewCandidate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!job) return

    createCandidate.mutate(
      {
        job_opening_id: job.id,
        first_name: candidateForm.first_name,
        last_name: candidateForm.last_name,
        email: candidateForm.email,
        phone: candidateForm.phone || undefined,
        years_experience: candidateForm.years_experience ? Number(candidateForm.years_experience) : undefined,
        expected_salary: candidateForm.expected_salary ? Number(candidateForm.expected_salary) : undefined,
        notes: candidateForm.notes || undefined,
        status: 'applied',
      },
      {
        onSuccess: () => {
          toast.success('Candidato registado com sucesso nesta vaga!')
          setIsNewCandidateOpen(false)
          setCandidateForm({
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
            years_experience: '',
            expected_salary: '',
            notes: '',
          })
          refetchCandidates()
        },
        onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar candidato')),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (isError || !job) {
    return <ErrorState message="Vaga não encontrada." onRetry={refetch} />
  }

  const totalCandidates = list.length
  const inProgress = list.filter((c) => !['hired', 'rejected', 'withdrawn'].includes(c.status)).length
  const hired = list.filter((c) => c.status === 'hired').length

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={job.department?.name ? `DEPARTAMENTO DE ${job.department.name.toUpperCase()}` : 'RECRUTAMENTO & SELEÇÃO'}
        title={job.title}
        description={`${job.employment_type_label ?? 'Tempo Integral'} · ${job.location ?? 'Presencial'} · ${job.openings_count} vaga(s) disponível(eis)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && job.status !== 'closed' && (
              <Button size="sm" className="gap-1.5" onClick={() => setIsNewCandidateOpen(true)}>
                <Plus className="h-4 w-4" />
                Adicionar Candidato
              </Button>
            )}
            {job.status === 'closed' && (
              <Badge variant="secondary" className="px-3 py-1.5 text-xs text-muted-foreground border-dashed">
                Vaga Fechada (Candidaturas Encerradas)
              </Badge>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruitment">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Voltar à Lista
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiCard label="Candidatos Registados" value={totalCandidates} icon={Users} accent="primary" />
        <KpiCard label="Em Processo Seletivo" value={inProgress} icon={Clock} accent="info" />
        <KpiCard label="Contratados" value={hired} icon={CheckCircle2} accent="success" />
        <KpiCard label="Vagas Abertas" value={job.openings_count} icon={Briefcase} accent="warning" />
      </div>

      {/* Informações da Vaga (Sem Abas) */}
      <Card className="border-border/80">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Briefcase className="h-3.5 w-3.5 text-primary" />
              {job.employment_type_label ?? 'Tempo Integral'}
            </span>
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              {job.location ?? 'Presencial'}
            </span>
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 font-mono">
              <Banknote className="h-3.5 w-3.5" />
              {job.salary_range ?? 'A combinar'}
            </span>
            {job.department && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {job.department.name}
              </span>
            )}
            {job.experience_level_label && (
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Award className="h-3.5 w-3.5 text-primary" />
                {job.experience_level_label}
              </span>
            )}
            {job.published_at && (
              <span className="flex items-center gap-1.5 text-muted-foreground ml-auto">
                <Calendar className="h-3.5 w-3.5" />
                Publicada em {formatDate(job.published_at, 'pt-PT')}
              </span>
            )}
          </div>

          {(job.description || job.requirements) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border/70 text-xs">
              {job.description && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Descrição</h4>
                  <p className="text-muted-foreground line-clamp-3 whitespace-pre-line leading-relaxed">
                    {job.description}
                  </p>
                </div>
              )}
              {job.requirements && (
                <div>
                  <h4 className="font-semibold text-foreground mb-1">Requisitos</h4>
                  <p className="text-muted-foreground line-clamp-3 whitespace-pre-line leading-relaxed">
                    {job.requirements}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secção de Candidatos (Listagem Direta Sem Abas) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Candidatos da Vaga ({totalCandidates})
          </h2>

          {/* Search + View mode */}
          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Pesquisar candidato..."
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40">
              <Button
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="h-7 w-7"
                onClick={() => setViewMode('kanban')}
                title="Visualização Pipeline (Kanban)"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon-sm"
                className="h-7 w-7"
                onClick={() => setViewMode('list')}
                title="Visualização em Lista"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Candidatos (Pipeline ou Lista) */}
        <div className="space-y-4">
          {loadingCandidates ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8 text-primary" />}
              title="Nenhum candidato registado nesta vaga"
              description="Adicione candidatos para iniciar o processo de triagem, entrevistas e contratação."
              action={
                canManage && job.status !== 'closed' ? (
                  <Button size="sm" className="mt-3 gap-1.5" onClick={() => setIsNewCandidateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Adicionar Primeiro Candidato
                  </Button>
                ) : undefined
              }
            />
          ) : viewMode === 'kanban' ? (
            /* ================= Visão Kanban ================= */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {PIPELINE.map((stage) => {
                  const items = grouped[stage.value] ?? []
                  return (
                    <div
                      key={stage.value}
                      className={cn(
                        'flex min-h-[360px] flex-col rounded-xl border bg-card p-2.5',
                        stage.accent,
                      )}
                    >
                      <div className="mb-2.5 flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', stage.color)}>
                          {stage.label}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">{items.length}</span>
                      </div>

                      <div className="flex-1 space-y-2.5 overflow-y-auto scrollbar-thin pr-0.5">
                        {items.length === 0 ? (
                          <div className="h-24 flex items-center justify-center text-center text-[11px] text-muted-foreground/60 border border-dashed border-border/50 rounded-lg">
                            Vazio
                          </div>
                        ) : (
                          items.map((c) => (
                            <CandidateCard
                              key={c.id}
                              candidate={c}
                              onMove={handleMove}
                              onDelete={handleDelete}
                              onHire={handleOpenHire}
                              canManage={canManage}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Arquivo / Rejeitados */}
              {(grouped.rejected?.length ?? 0) > 0 && (
                <details className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                  <summary className="cursor-pointer text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Arquivo de Candidatos ({grouped.rejected.length}) — Rejeitados ou Desistentes</span>
                    <span className="text-[11px] text-muted-foreground">Clique para expandir</span>
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {grouped.rejected.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-muted text-[10px] font-semibold">
                              {c.first_name[0]}
                              {c.last_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{c.full_name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>
                          </div>
                        </div>
                        <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px] shrink-0">
                          {c.status === 'rejected' ? 'Rejeitado' : 'Desistiu'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            /* ================= Visão Lista ================= */
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                      <tr>
                        <th className="py-3 px-4">Candidato</th>
                        <th className="py-3 px-4">Contacto</th>
                        <th className="py-3 px-4">Experiência</th>
                        <th className="py-3 px-4">Pretensão Salarial</th>
                        <th className="py-3 px-4">Etapa / Estado</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredList.map((c) => {
                        const isHired = c.status === 'hired'
                        return (
                          <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                    {c.first_name[0]}
                                    {c.last_name[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-foreground text-sm">{c.full_name}</p>
                                  <span className="text-[10px] text-muted-foreground">
                                    Inscrito em {formatDate(c.applied_at)}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 space-y-0.5">
                              {c.email && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span>{c.email}</span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  <span>{c.phone}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {c.years_experience != null ? `${c.years_experience} anos` : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono font-medium">
                              {c.expected_salary ? Number(c.expected_salary).toLocaleString() + ' AOA' : '—'}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant={STATUS_VARIANT[c.status]} className="text-[11px] font-medium">
                                {PIPELINE.find((p) => p.value === c.status)?.label ?? c.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isHired ? (
                                  <Button
                                    size="sm"
                                    className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                                    onClick={() => handleOpenHire(c)}
                                  >
                                    <UserCheck className="h-3.5 w-3.5" />
                                    Contratar
                                  </Button>
                                ) : (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs py-0.5">
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    Contratado
                                  </Badge>
                                )}
                                {canManage && (
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(c)}
                                    title="Eliminar candidato"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ================= Modal: Contratar Candidato (Converter em Funcionário) ================= */}
      <Dialog open={!!hiringCandidate} onOpenChange={(open) => !open && setHiringCandidate(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-emerald-600">
              <UserCheck className="h-5 w-5" />
              Contratar Candidato — {hiringCandidate?.full_name}
            </DialogTitle>
            <DialogDescription>
              Ao confirmar a contratação, {hiringCandidate?.full_name} será automaticamente registado como funcionário
              ativo no sistema e vinculado ao contrato configurado abaixo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitHire} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">
                  Tipo de Contrato <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={hireForm.contract_type}
                  onValueChange={(val) => setHireForm((prev) => ({ ...prev, contract_type: val }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  Salário Base (AOA) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={hireForm.base_salary}
                  onChange={(e) => setHireForm((prev) => ({ ...prev, base_salary: Number(e.target.value) }))}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  Periodicidade Salarial <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={hireForm.salary_frequency}
                  onValueChange={(val) => setHireForm((prev) => ({ ...prev, salary_frequency: val }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALARY_FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Carga Horária Semanal</Label>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={hireForm.work_hours_per_week}
                  onChange={(e) => setHireForm((prev) => ({ ...prev, work_hours_per_week: Number(e.target.value) }))}
                  placeholder="Ex: 40"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">
                  Data de Início / Admissão <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={hireForm.start_date}
                  onChange={(e) => setHireForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Data de Término (Opcional)</Label>
                <Input
                  type="date"
                  value={hireForm.end_date ?? ''}
                  onChange={(e) => setHireForm((prev) => ({ ...prev, end_date: e.target.value || null }))}
                  className="mt-1.5"
                />
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold">Departamento Lotação</Label>
                <Select
                  value={hireForm.department_id ? String(hireForm.department_id) : 'default'}
                  onValueChange={(val) => setHireForm((prev) => ({ ...prev, department_id: val === 'default' ? null : Number(val) }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Selecione o departamento..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">
                      {job?.department?.name ? `${job.department.name} (Padrão da Vaga)` : 'Sem departamento específico'}
                    </SelectItem>
                    {(departments ?? []).map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs font-semibold">Observações / Termos Adicionais</Label>
                <Input
                  value={hireForm.notes ?? ''}
                  onChange={(e) => setHireForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notas internas ou cláusulas especiais do contrato"
                  className="mt-1.5"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHiringCandidate(null)}
                disabled={hire.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold"
                disabled={hire.isPending || !hireForm.start_date || hireForm.base_salary < 0}
              >
                {hire.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A Criar Contrato & Funcionário...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    Confirmar Contratação
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= Modal: Adicionar Novo Candidato a esta Vaga ================= */}
      <Dialog open={isNewCandidateOpen} onOpenChange={setIsNewCandidateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Adicionar Candidato à Vaga
            </DialogTitle>
            <DialogDescription>
              Registar um novo candidato concorrente para a vaga <span className="font-semibold text-foreground">{job.title}</span>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitNewCandidate} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">
                  Nome Próprio <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  value={candidateForm.first_name}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  placeholder="Ex: João"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  Apelido <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  value={candidateForm.last_name}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  placeholder="Ex: Silva"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">
                Correio Eletrónico (Email) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                required
                value={candidateForm.email}
                onChange={(e) => setCandidateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="candidato@email.com"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Telefone</Label>
              <Input
                value={candidateForm.phone}
                onChange={(e) => setCandidateForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+244 9..."
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Anos de Experiência</Label>
                <Input
                  type="number"
                  min={0}
                  value={candidateForm.years_experience}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, years_experience: e.target.value }))}
                  placeholder="Ex: 3"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Pretensão Salarial (AOA)</Label>
                <Input
                  type="number"
                  min={0}
                  value={candidateForm.expected_salary}
                  onChange={(e) => setCandidateForm((prev) => ({ ...prev, expected_salary: e.target.value }))}
                  placeholder="Ex: 350000"
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Notas ou Resumo Curricular</Label>
              <Input
                value={candidateForm.notes}
                onChange={(e) => setCandidateForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Perfil do candidato, competências chave"
                className="mt-1.5"
              />
            </div>

            <DialogFooter className="pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewCandidateOpen(false)}
                disabled={createCandidate.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createCandidate.isPending}>
                {createCandidate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    A Registar...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Registar Candidato
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CandidateCardProps {
  candidate: Candidate
  onMove: (c: Candidate, status: CandidateStatus) => void
  onDelete: (c: Candidate) => void
  onHire: (c: Candidate) => void
  canManage: boolean
}

function CandidateCard({ candidate: c, onMove, onDelete, onHire, canManage }: CandidateCardProps) {
  const nextIdx = PIPELINE.findIndex((s) => s.value === c.status) + 1
  const next = nextIdx < PIPELINE.length ? PIPELINE[nextIdx] : null
  const isHired = c.status === 'hired'

  return (
    <div className="group rounded-xl border border-border/80 bg-card p-3 shadow-2xs hover:shadow-sm hover:border-primary/40 transition-all">
      <div className="flex items-start gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-[10px] font-bold text-primary-foreground">
            {c.first_name[0]}
            {c.last_name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-xs font-semibold text-foreground">{c.full_name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{c.email}</p>
          {c.phone && <p className="truncate text-[10px] text-muted-foreground">{c.phone}</p>}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        {c.years_experience != null && (
          <span className="inline-flex items-center gap-1 font-medium bg-muted/60 px-1.5 py-0.5 rounded">
            <Briefcase className="h-3 w-3" />
            {c.years_experience}a exp
          </span>
        )}
        {c.expected_salary && (
          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
            {Number(c.expected_salary).toLocaleString()} AOA
          </span>
        )}
      </div>

      {c.rating != null && (
        <div className="mt-1.5 flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                'h-3 w-3',
                i < c.rating! ? 'fill-warning text-warning' : 'text-muted-foreground/30',
              )}
            />
          ))}
        </div>
      )}

      {/* Botão de Contratar ou Indicador de Contratado */}
      <div className="mt-2.5 pt-2 border-t border-border/60">
        {isHired ? (
          <Badge
            variant="outline"
            className="w-full justify-center bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] py-1 font-semibold gap-1"
          >
            <CheckCircle2 className="h-3 w-3" />
            Contratado
          </Badge>
        ) : (
          canManage && (
            <div className="space-y-1.5">
              <Button
                size="sm"
                className="w-full h-7 px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                onClick={() => onHire(c)}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Contratar Candidato
              </Button>

              <div className="flex items-center gap-1">
                {next && (
                  <button
                    type="button"
                    onClick={() => onMove(c, next.value)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-muted/60 px-1.5 py-1 text-[10px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title={`Mover para ${next.label}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {next.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(c)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Eliminar candidato"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

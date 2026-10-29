import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { getApiErrorMessage } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, EmptyState, ErrorState } from '@/components/shared/page-header'
import { KpiCard } from '@/components/shared/kpi-card'
import { cn } from '@/lib/utils'
import type { Candidate, CandidateStatus } from '@/types'
import {
  useJobOpening,
  useCandidatesByJob,
  useMoveCandidate,
  useDeleteCandidate,
} from './api'

const PIPELINE: { value: CandidateStatus; label: string; color: string; accent: string }[] = [
  { value: 'applied', label: 'Recebidas', color: 'bg-slate-500/10 text-slate-700', accent: 'border-slate-500/30' },
  { value: 'screening', label: 'Triagem', color: 'bg-info/10 text-info', accent: 'border-info/30' },
  { value: 'interview', label: 'Entrevistas', color: 'bg-primary/10 text-primary', accent: 'border-primary/30' },
  { value: 'test', label: 'Avaliação', color: 'bg-warning/10 text-warning', accent: 'border-warning/30' },
  { value: 'offer', label: 'Oferta', color: 'bg-success/10 text-success', accent: 'border-success/30' },
  { value: 'hired', label: 'Contratados', color: 'bg-success text-success-foreground', accent: 'border-success' },
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

export function RecruitmentDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const canManage = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])

  const { data: job, isLoading, isError, refetch } = useJobOpening(id)
  const { data: candidates, isLoading: loadingCandidates } = useCandidatesByJob(id)
  const move = useMoveCandidate()
  const remove = useDeleteCandidate()

  const list = candidates ?? []
  const grouped = useMemo(() => {
    const map: Record<string, Candidate[]> = {}
    PIPELINE.forEach((s) => {
      map[s.value] = list.filter((c) => c.status === s.value)
    })
    map['rejected'] = list.filter((c) => c.status === 'rejected' || c.status === 'withdrawn')
    return map
  }, [list])

  const handleMove = (c: Candidate, status: CandidateStatus) => {
    move.mutate(
      { id: c.id, status },
      {
        onSuccess: () => toast.success(`${c.full_name} → ${PIPELINE.find((p) => p.value === status)?.label ?? status}`),
        onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao mover candidato')),
      },
    )
  }

  const handleDelete = (c: Candidate) => {
    if (!confirm(`Eliminar o candidato ${c.full_name}?`)) return
    remove.mutate(c.id, {
      onSuccess: () => toast.success('Candidato removido'),
      onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar candidato')),
    })
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
        eyebrow={job.department?.name ?? 'RECRUTAMENTO'}
        title={job.title}
        description={`${job.employment_type_label} · ${job.location ?? 'Remoto'} · ${job.openings_count} vaga(s)`}
        actions={
          <Button variant="ghost" asChild>
            <Link to="/recruitment">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <KpiCard label="Candidatos" value={totalCandidates} icon={Users} accent="primary" />
        <KpiCard label="Em curso" value={inProgress} icon={Clock} accent="info" />
        <KpiCard label="Contratados" value={hired} icon={CheckCircle2} accent="success" />
        <KpiCard label="Vagas" value={job.openings_count} icon={Briefcase} accent="warning" />
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="details">Detalhes da vaga</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          {loadingCandidates ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Sem candidatos"
              description="Esta vaga ainda não recebeu candidaturas."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {PIPELINE.map((stage) => {
                const items = grouped[stage.value] ?? []
                return (
                  <div
                    key={stage.value}
                    className={cn(
                      'flex min-h-[280px] flex-col rounded-xl border bg-card p-2',
                      stage.accent,
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/40 px-2.5 py-1.5">
                      <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-semibold', stage.color)}>
                        {stage.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
                      {items.map((c) => (
                        <CandidateCard
                          key={c.id}
                          candidate={c}
                          onMove={handleMove}
                          onDelete={handleDelete}
                          canManage={canManage}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Rejected / Withdrawn */}
          {(grouped.rejected?.length ?? 0) > 0 && (
            <details className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Arquivo ({grouped.rejected.length}) — rejeitados / desistentes
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {grouped.rejected.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-card/60 p-2 text-xs">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-muted text-[10px]">
                        {c.first_name[0]}
                        {c.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.full_name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{c.email}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[c.status]} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </details>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tipo de contrato
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                {job.employment_type_label}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Localização
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {job.location ?? '—'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faixa salarial
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{job.salary_range ?? '—'}</span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Departamento
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {job.department?.name ?? '—'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nível
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <Award className="h-4 w-4 text-muted-foreground" />
                {job.experience_level_label ?? '—'}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Publicada em
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {job.published_at ? formatDate(job.published_at, 'pt-PT') : 'Rascunho'}
              </CardContent>
            </Card>
          </div>

          {job.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Descrição</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {job.description}
                </p>
              </CardContent>
            </Card>
          )}

          {job.requirements && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Requisitos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {job.requirements}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface CandidateCardProps {
  candidate: Candidate
  onMove: (c: Candidate, status: CandidateStatus) => void
  onDelete: (c: Candidate) => void
  canManage: boolean
}

function CandidateCard({ candidate: c, onMove, onDelete, canManage }: CandidateCardProps) {
  const nextIdx = PIPELINE.findIndex((s) => s.value === c.status) + 1
  const next = nextIdx < PIPELINE.length ? PIPELINE[nextIdx] : null

  return (
    <div className="group rounded-lg border border-border/60 bg-card p-2.5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start gap-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-[10px] font-semibold text-primary-foreground">
            {c.first_name[0]}
            {c.last_name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-xs font-semibold">{c.full_name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{c.email}</p>
        </div>
      </div>

      {c.years_experience != null && (
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Briefcase className="h-3 w-3" />
          {c.years_experience} anos
        </div>
      )}

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

      {canManage && (
        <div className="mt-2 flex items-center gap-1">
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
            title="Eliminar"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

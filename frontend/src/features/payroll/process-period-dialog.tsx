import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play, Users, AlertTriangle, CheckCircle2, XCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { PayrollPeriodProgress, ProcessableEmployee } from '@/types'

interface ProcessPeriodDialogProps {
  periodId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onFinished: () => void
}

type Phase = 'select' | 'running' | 'done' | 'error'

export function ProcessPeriodDialog({
  periodId,
  open,
  onOpenChange,
  onFinished,
}: ProcessPeriodDialogProps) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>('select')
  const [manualSelection, setManualSelection] = useState<Set<number> | null>(null)
  const [employeeSearch, setEmployeeSearch] = useState('')

  const { data: employees, isLoading, isError } = useQuery({
    queryKey: ['payroll-processable-employees', periodId],
    queryFn: () => api.get<ProcessableEmployee[]>(`payroll/periods/${periodId}/processable-employees`),
    enabled: open && phase === 'select',
  })

  const eligible = useMemo(
    () => (employees ?? []).filter((e) => e.eligible),
    [employees],
  )

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLocaleLowerCase()
    if (!query) return employees ?? []
    return (employees ?? []).filter((employee) =>
      `${employee.full_name} ${employee.employee_code}`.toLocaleLowerCase().includes(query),
    )
  }, [employees, employeeSearch])

  const selectedIds = useMemo(
    () => manualSelection ?? new Set(eligible.map((e) => e.id)),
    [manualSelection, eligible],
  )

  const progressEnabled = open && (phase === 'running' || phase === 'done')
  const { data: progress } = useQuery({
    queryKey: ['payroll-period-progress', periodId],
    queryFn: () => api.get<PayrollPeriodProgress>(`payroll/periods/${periodId}/progress`),
    enabled: progressEnabled,
    refetchInterval: phase === 'running' ? 400 : false,
  })

  const processMutation = useMutation({
    mutationFn: (employeeIds: number[]) =>
      api.post<{ status: string; processed: number; total: number; progress_message?: string | null }>(
        `payroll/periods/${periodId}/process`,
        { employee_ids: employeeIds },
      ),
    onMutate: () => setPhase('running'),
    onSuccess: (result) => {
      setPhase('done')
      toast.success(
        `Processamento concluído: ${result.processed}/${result.total} funcionário(s)`,
      )
      qc.invalidateQueries({ queryKey: ['payroll-period', String(periodId)] })
      qc.invalidateQueries({ queryKey: ['payroll-period-progress', periodId] })
      qc.invalidateQueries({ queryKey: ['payroll-periods'] })
      qc.invalidateQueries({ queryKey: ['payroll-period-validations', String(periodId)] })
      onFinished()
    },
    onError: (e) => {
      setPhase('error')
      toast.error(getApiErrorMessage(e, 'Erro ao processar'))
    },
  })

  const toggle = (id: number) => {
    setManualSelection((prev) => {
      const base = prev ?? new Set(eligible.map((e) => e.id))
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setManualSelection(new Set(eligible.map((e) => e.id)))
  }

  const selectNone = () => {
    setManualSelection(new Set())
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && phase === 'running') return
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setPhase('select')
      setManualSelection(null)
      setEmployeeSearch('')
      processMutation.reset()
    }
  }

  const total = progress?.progress_total ?? processMutation.data?.total ?? eligible.length
  const done = progress?.progress_done ?? 0
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : phase === 'done' ? 100 : 0
  const message = progress?.progress_message ?? (phase === 'running' ? 'A processar…' : undefined)
  const finalStatus = progress?.status ?? processMutation.data?.status

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Processar folha salarial
          </DialogTitle>
          <DialogDescription>
            {phase === 'select' && 'Seleccione os funcionários que farão parte deste processamento.'}
            {phase === 'running' && 'A processar o período — acompanhe o progresso abaixo.'}
            {phase === 'done' && 'Processamento concluído.'}
            {phase === 'error' && 'O processamento falhou.'}
          </DialogDescription>
        </DialogHeader>

        {phase === 'select' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {isLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> A carregar funcionários…
              </div>
            )}
            {isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Não foi possível carregar a lista de funcionários.
              </div>
            )}
            {!isLoading && !isError && eligible.length === 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                Nenhum funcionário elegível para processamento.
              </div>
            )}
            {eligible.length > 0 && (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Pesquisar por nome ou código..."
                    aria-label="Pesquisar funcionários"
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedIds.size}</span> de{' '}
                    {eligible.length} seleccionado(s)
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                      Todos
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={selectNone}>
                      Nenhum
                    </Button>
                  </div>
                </div>
                <ScrollArea className="min-h-32 flex-1 rounded-lg border border-border">
                  <ul className="divide-y divide-border">
                    {filteredEmployees.map((emp) => (
                      <li key={emp.id} className="flex min-h-16 items-center gap-3 px-3 py-2.5">
                        <Checkbox
                          checked={selectedIds.has(emp.id)}
                          disabled={!emp.eligible}
                          onCheckedChange={() => toggle(emp.id)}
                          aria-label={`Seleccionar ${emp.full_name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            disabled={!emp.eligible}
                            aria-pressed={selectedIds.has(emp.id)}
                            onClick={() => toggle(emp.id)}
                            className="block max-w-full truncate text-left text-sm font-medium hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {emp.full_name}
                          </button>
                          <p className="truncate text-xs text-muted-foreground">{emp.employee_code}</p>
                          {emp.position && (
                            <p className="truncate text-xs text-muted-foreground">{emp.position}</p>
                          )}
                        </div>
                        {emp.is_contract_expired ? (
                          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                            Contrato Expirado
                          </Badge>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {emp.base_salary != null
                              ? new Intl.NumberFormat('pt-AO').format(Number(emp.base_salary))
                              : '—'}
                          </span>
                        )}
                      </li>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Nenhum funcionário encontrado.
                      </li>
                    )}
                  </ul>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {(phase === 'running' || phase === 'done' || phase === 'error') && (
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {phase === 'running' ? 'Progresso' : phase === 'done' ? 'Concluído' : 'Falhou'}
                </span>
                <span className="font-mono font-medium">
                  {phase === 'running' ? `${done}/${total}` : `${percent}%`}
                </span>
              </div>
              <Progress value={percent} className="h-2.5" />
              <p className="text-xs text-muted-foreground">{message ?? '—'}</p>
            </div>

            {phase === 'running' && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                A processar — não feche esta janela.
              </div>
            )}

            {phase === 'done' && finalStatus && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  finalStatus === 'completed'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                    : finalStatus === 'pending_validation'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                }`}
              >
                {finalStatus === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : finalStatus === 'failed' ? (
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-medium">
                    {finalStatus === 'completed' && 'Período calculado com sucesso.'}
                    {finalStatus === 'pending_validation' &&
                      'Processado com avisos — reveja as validações.'}
                    {finalStatus === 'failed' && 'Processamento terminou com erros impeditivos.'}
                    {!['completed', 'pending_validation', 'failed'].includes(finalStatus) &&
                      `Estado final: ${finalStatus}`}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {processMutation.data?.processed ?? done} de {processMutation.data?.total ?? total} processado(s)
                  </p>
                </div>
              </div>
            )}

            {phase === 'error' && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Verifique os registos e tente novamente.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="shrink-0">
          {phase === 'select' && (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => processMutation.mutate(Array.from(selectedIds))}
                disabled={selectedIds.size === 0 || processMutation.isPending}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Processar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="outline" disabled>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> A processar…
            </Button>
          )}
          {(phase === 'done' || phase === 'error') && (
            <>
              {phase === 'error' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPhase('select')
                    processMutation.reset()
                  }}
                >
                  Tentar novamente
                </Button>
              )}
              <Button type="button" onClick={() => handleClose(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

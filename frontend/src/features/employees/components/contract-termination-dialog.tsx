import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Scale,
  Calculator,
  AlertTriangle,
  FileDown,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  Wallet,
  Package,
  CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ContractTerminationPreview, EmployeeContract } from '@/types'

interface ContractTerminationDialogProps {
  contract: EmployeeContract | null
  employeeId: number
  employeeName: string
  currency: string
  locale: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TERMINATION_TYPES = [
  {
    code: 'mutual_agreement',
    label: 'Acordo Mútuo entre as Partes',
    defaultNotice: 0,
    grantsSeverance: true,
  },
  {
    code: 'employer_economic_redundancy',
    label: 'Extinção do Posto / Causas Objetivas ou Económicas (Empregador)',
    defaultNotice: 30,
    grantsSeverance: true,
  },
  {
    code: 'employer_just_cause_disciplinary',
    label: 'Despedimento Disciplinar por Justa Causa (Imputável ao Trabalhador)',
    defaultNotice: 0,
    grantsSeverance: false,
  },
  {
    code: 'employee_just_cause',
    label: 'Rescisão pelo Trabalhador com Justa Causa (Imputável ao Empregador)',
    defaultNotice: 0,
    grantsSeverance: true,
  },
  {
    code: 'employee_resignation',
    label: 'Demissão / Rescisão por Iniciativa do Trabalhador (Sem Justa Causa)',
    defaultNotice: 30,
    grantsSeverance: false,
  },
  {
    code: 'contract_expiry',
    label: 'Caducidade / Termo do Contrato por Tempo Determinado',
    defaultNotice: 15,
    grantsSeverance: true,
  },
  {
    code: 'probation_termination',
    label: 'Rescisão durante o Período Experimental',
    defaultNotice: 0,
    grantsSeverance: false,
  },
]

export function ContractTerminationDialog({
  contract,
  employeeId,
  employeeName,
  currency,
  locale,
  open,
  onOpenChange,
}: ContractTerminationDialogProps) {
  const qc = useQueryClient()
  const todayStr = new Date().toISOString().slice(0, 10)

  const [terminationType, setTerminationType] = useState('mutual_agreement')
  const [terminationDate, setTerminationDate] = useState(todayStr)
  const [terminationReason, setTerminationReason] = useState('')
  const [workedDaysInMonth, setWorkedDaysInMonth] = useState('')
  const [monthsWorkedInYear, setMonthsWorkedInYear] = useState('')
  const [unusedVacationDays, setUnusedVacationDays] = useState('')
  const [noticeDaysRequired, setNoticeDaysRequired] = useState('0')
  const [noticeDaysServed, setNoticeDaysServed] = useState('0')
  const [unjustifiedAbsenceDays, setUnjustifiedAbsenceDays] = useState('')
  const [customSeveranceAmount, setCustomSeveranceAmount] = useState('')

  const [includeVacationSubsidy, setIncludeVacationSubsidy] = useState(true)
  const [includeChristmasSubsidy, setIncludeChristmasSubsidy] = useState(true)
  const [includeSeverance, setIncludeSeverance] = useState(true)
  const [applyTaxes, setApplyTaxes] = useState(true)
  const [discountPendingDeductions, setDiscountPendingDeductions] = useState(true)
  const [discountUnreturnedAssets, setDiscountUnreturnedAssets] = useState(true)
  const [discountAttendancePendencies, setDiscountAttendancePendencies] = useState(true)

  const [extraEarnings, setExtraEarnings] = useState<Array<{ name: string; amount: string }>>([])
  const [extraDeductions, setExtraDeductions] = useState<Array<{ name: string; amount: string }>>([])
  const [preview, setPreview] = useState<ContractTerminationPreview | null>(null)
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

  const fmtCurrency = (val?: number | null) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(val ?? 0)

  const buildPayload = () => ({
    termination_type: terminationType,
    termination_date: terminationDate,
    termination_reason: terminationReason,
    worked_days_in_month: workedDaysInMonth !== '' ? Number(workedDaysInMonth) : undefined,
    months_worked_in_year: monthsWorkedInYear !== '' ? Number(monthsWorkedInYear) : undefined,
    unused_vacation_days: unusedVacationDays !== '' ? Number(unusedVacationDays) : undefined,
    notice_days_required: noticeDaysRequired !== '' ? Number(noticeDaysRequired) : 0,
    notice_days_served: noticeDaysServed !== '' ? Number(noticeDaysServed) : 0,
    unjustified_absence_days: unjustifiedAbsenceDays !== '' ? Number(unjustifiedAbsenceDays) : undefined,
    custom_severance_amount: customSeveranceAmount !== '' ? Number(customSeveranceAmount) : undefined,
    include_vacation_subsidy: includeVacationSubsidy,
    include_christmas_subsidy: includeChristmasSubsidy,
    include_severance: includeSeverance,
    apply_taxes: applyTaxes,
    discount_pending_deductions: discountPendingDeductions,
    discount_unreturned_assets: discountUnreturnedAssets,
    discount_attendance_pendencies: discountAttendancePendencies,
    extra_earnings: extraEarnings
      .filter((i) => i.name.trim() !== '' && Number(i.amount) > 0)
      .map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })),
    extra_deductions: extraDeductions
      .filter((i) => i.name.trim() !== '' && Number(i.amount) > 0)
      .map((i) => ({ name: i.name.trim(), amount: Number(i.amount) })),
  })

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!contract) throw new Error('Contrato inválido')
      return api.post<ContractTerminationPreview>(
        `contracts/${contract.id}/termination-preview`,
        buildPayload(),
      )
    },
    onSuccess: (res) => {
      setPreview(res)
      if (workedDaysInMonth === '') setWorkedDaysInMonth(String(res.parameters.worked_days_in_month))
      if (monthsWorkedInYear === '') setMonthsWorkedInYear(String(res.parameters.months_worked_in_year))
      if (unusedVacationDays === '') setUnusedVacationDays(String(res.parameters.unused_vacation_days))
      if (unjustifiedAbsenceDays === '') setUnjustifiedAbsenceDays(String(res.parameters.unjustified_absence_days))
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao calcular simulação de rescisão.')),
  })

  useEffect(() => {
    if (open && contract) {
      previewMutation.mutate()
    }
  }, [
    open,
    contract?.id,
    terminationType,
    terminationDate,
    includeVacationSubsidy,
    includeChristmasSubsidy,
    includeSeverance,
    applyTaxes,
    discountPendingDeductions,
    discountUnreturnedAssets,
    discountAttendancePendencies,
  ])

  const handleTerminationTypeChange = (nextType: string) => {
    setTerminationType(nextType)
    const meta = TERMINATION_TYPES.find((t) => t.code === nextType)
    if (meta) {
      setNoticeDaysRequired(String(meta.defaultNotice))
      setNoticeDaysServed(String(meta.defaultNotice))
      setIncludeSeverance(meta.grantsSeverance)
    }
  }

  const terminateMutation = useMutation({
    mutationFn: () => {
      if (!contract) throw new Error('Contrato inválido')
      if (!terminationReason.trim()) {
        throw new Error('Informe o motivo detalhado da rescisão contratual.')
      }
      return api.post(`contracts/${contract.id}/terminate`, buildPayload())
    },
    onSuccess: () => {
      toast.success('Contrato rescindido com sucesso e pendências liquidadas.')
      qc.invalidateQueries({ queryKey: ['employees', String(employeeId)] })
      qc.invalidateQueries({ queryKey: ['employee-contracts', String(employeeId)] })
      qc.invalidateQueries({ queryKey: ['employee-assets', employeeId] })
      qc.invalidateQueries({ queryKey: ['employees', String(employeeId), 'timeline'] })
      qc.invalidateQueries({ queryKey: ['deductions'] })
      qc.invalidateQueries({ queryKey: ['payroll-period'] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Não foi possível concluir a rescisão contratual.')),
  })

  const handleDownloadPdf = async () => {
    if (!contract) return
    setIsDownloadingPdf(true)
    try {
      await api.downloadFile(
        `contracts/${contract.id}/termination.pdf`,
        `termo-rescisao-${employeeName.replace(/\s+/g, '_')}.pdf`,
        {
          termination_type: terminationType,
          termination_date: terminationDate,
          termination_reason: terminationReason || 'Simulação de rescisão contratual',
        },
      )
      toast.success('Termo de Rescisão PDF gerado com sucesso.')
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'Erro ao descarregar o Termo de Rescisão PDF.'))
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] max-h-[94vh] w-[96vw] max-w-[96vw] sm:max-w-[96vw] xl:max-w-7xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border bg-muted/20 px-6 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Scale className="h-5 w-5 text-destructive" />
              Rescisão de Contrato de Trabalho & Cálculo Legal de Quitação
            </DialogTitle>
            {preview && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">
                  Salário Base: {fmtCurrency(preview.base_salary)}
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  Antiguidade: {preview.tenure.years} anos ({preview.tenure.months} meses)
                </Badge>
              </div>
            )}
          </div>
          <DialogDescription>
            Trabalhador: <strong>{employeeName}</strong>. O sistema calcula todos os direitos legais (LGT Angola) e abate automaticamente adiantamentos, parcelas pendentes, faltas e activos não devolvidos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          {/* 1. Enquadramento e Motivo */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="lg:col-span-2">
              <Label className="text-xs font-semibold">
                Modalidade Legal da Rescisão (LGT Angola) <span className="text-destructive">*</span>
              </Label>
              <Select value={terminationType} onValueChange={handleTerminationTypeChange}>
                <SelectTrigger className="mt-1.5 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERMINATION_TYPES.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-1">
              <Label className="text-xs font-semibold">
                Data Efetiva da Cessação <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={terminationDate}
                onChange={(e) => {
                  setTerminationDate(e.target.value)
                  setWorkedDaysInMonth('')
                  setMonthsWorkedInYear('')
                }}
                className="mt-1.5 bg-background"
              />
            </div>

            <div className="lg:col-span-1">
              <Label className="text-xs font-semibold">Antiguidade Apurada</Label>
              <div className="mt-1.5 h-9 rounded-md border border-border bg-background px-3 flex items-center justify-between text-xs font-mono">
                <span>{preview?.tenure.years ?? 0} ano(s)</span>
                <span className="text-muted-foreground">{preview?.tenure.days ?? 0} dias</span>
              </div>
            </div>

            <div className="lg:col-span-4">
              <Label className="text-xs font-semibold">
                Motivo e Fundamentação Legal da Rescisão <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                value={terminationReason}
                onChange={(e) => setTerminationReason(e.target.value)}
                placeholder="Descreva o motivo detalhado da rescisão contratual (obrigatório para o Termo de Rescisão e registo histórico)..."
                className="mt-1.5 bg-background"
              />
            </div>
          </div>

          {/* 2. Parâmetros de Cálculo e Opções Legais */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            <div className="xl:col-span-7 space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  Parâmetros de Antiguidade, Férias e Aviso Prévio
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                >
                  {previewMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Calculator className="h-3.5 w-3.5" />
                  )}
                  Atualizar Cálculo
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Dias trabalhados no mês</Label>
                  <Input
                    type="number"
                    min="0"
                    max="31"
                    step="0.5"
                    value={workedDaysInMonth}
                    onChange={(e) => setWorkedDaysInMonth(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Meses trab. no ano atual</Label>
                  <Input
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={monthsWorkedInYear}
                    onChange={(e) => setMonthsWorkedInYear(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Férias vencidas (dias úteis)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    step="0.5"
                    value={unusedVacationDays}
                    onChange={(e) => setUnusedVacationDays(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Aviso prévio exigido (dias)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="180"
                    value={noticeDaysRequired}
                    onChange={(e) => setNoticeDaysRequired(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Aviso prévio cumprido (dias)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="180"
                    value={noticeDaysServed}
                    onChange={(e) => setNoticeDaysServed(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Faltas injustificadas no mês</Label>
                  <Input
                    type="number"
                    min="0"
                    max="31"
                    step="0.5"
                    value={unjustifiedAbsenceDays}
                    onChange={(e) => setUnjustifiedAbsenceDays(e.target.value)}
                    onBlur={() => previewMutation.mutate()}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">
                  Indemnização por Antiguidade Customizada ({currency}) — deixe em branco para cálculo automático LGT
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customSeveranceAmount}
                  onChange={(e) => setCustomSeveranceAmount(e.target.value)}
                  onBlur={() => previewMutation.mutate()}
                  placeholder="Cálculo automático segundo LGT Angola"
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>

              {/* Rubricas Extra */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700">Outros Créditos / Proveitos</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setExtraEarnings((p) => [...p, { name: '', amount: '' }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {extraEarnings.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <Input
                        placeholder="Descrição"
                        value={item.name}
                        onChange={(e) =>
                          setExtraEarnings((p) => p.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                        }
                        onBlur={() => previewMutation.mutate()}
                        className="h-7 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Valor"
                        value={item.amount}
                        onChange={(e) =>
                          setExtraEarnings((p) => p.map((it, i) => (i === idx ? { ...it, amount: e.target.value } : it)))
                        }
                        onBlur={() => previewMutation.mutate()}
                        className="h-7 w-28 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          setExtraEarnings((p) => p.filter((_, i) => i !== idx))
                          setTimeout(() => previewMutation.mutate(), 50)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-destructive">Outros Descontos Manuais</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => setExtraDeductions((p) => [...p, { name: '', amount: '' }])}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {extraDeductions.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <Input
                        placeholder="Descrição"
                        value={item.name}
                        onChange={(e) =>
                          setExtraDeductions((p) => p.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                        }
                        onBlur={() => previewMutation.mutate()}
                        className="h-7 text-xs"
                      />
                      <Input
                        type="number"
                        placeholder="Valor"
                        value={item.amount}
                        onChange={(e) =>
                          setExtraDeductions((p) => p.map((it, i) => (i === idx ? { ...it, amount: e.target.value } : it)))
                        }
                        onBlur={() => previewMutation.mutate()}
                        className="h-7 w-28 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          setExtraDeductions((p) => p.filter((_, i) => i !== idx))
                          setTimeout(() => previewMutation.mutate(), 50)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Switches de Nuances Legais e Desconto de Pendências */}
            <div className="xl:col-span-5 space-y-2.5 rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">Regras Legais & Compensação de Pendências</p>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs cursor-pointer">
                <span>Incluir Subsídio de Férias Proporcional (50%)</span>
                <input
                  type="checkbox"
                  checked={includeVacationSubsidy}
                  onChange={(e) => setIncludeVacationSubsidy(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs cursor-pointer">
                <span>Incluir Subsídio de Natal Proporcional (50%)</span>
                <input
                  type="checkbox"
                  checked={includeChristmasSubsidy}
                  onChange={(e) => setIncludeChristmasSubsidy(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs cursor-pointer">
                <span>Incluir Indemnização / Compensação por Antiguidade</span>
                <input
                  type="checkbox"
                  checked={includeSeverance}
                  onChange={(e) => setIncludeSeverance(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs cursor-pointer">
                <span>Calcular Retenção Legal de INSS (3%) e IRT</span>
                <input
                  type="checkbox"
                  checked={applyTaxes}
                  onChange={(e) => setApplyTaxes(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium cursor-pointer">
                <span>Descontar todos os Adiantamentos e Empréstimos Pendentes</span>
                <input
                  type="checkbox"
                  checked={discountPendingDeductions}
                  onChange={(e) => setDiscountPendingDeductions(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-medium cursor-pointer">
                <span>Descontar Activos Não Devolvidos ou Danificados</span>
                <input
                  type="checkbox"
                  checked={discountUnreturnedAssets}
                  onChange={(e) => setDiscountUnreturnedAssets(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs cursor-pointer">
                <span>Descontar Faltas Injustificadas do Mês</span>
                <input
                  type="checkbox"
                  checked={discountAttendancePendencies}
                  onChange={(e) => setDiscountAttendancePendencies(e.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            </div>
          </div>

          {/* 3. Alerta Informativo de Adiantamentos e Activos Pendentes Detetados */}
          {preview && (preview.pending_advances_and_deductions.length > 0 || preview.pending_assets.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {preview.pending_advances_and_deductions.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4" />
                      Adiantamentos & Parcelas Pendentes Detetados ({preview.pending_advances_and_deductions.length})
                    </p>
                    <Badge variant="outline" className="font-mono text-xs border-amber-500/40 text-amber-900 dark:text-amber-200">
                      {fmtCurrency(preview.totals.pending_advances_total)}
                    </Badge>
                  </div>
                  <ul className="divide-y divide-amber-500/20 text-xs">
                    {preview.pending_advances_and_deductions.map((adv) => (
                      <li key={adv.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold">{adv.type_label}: {adv.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {adv.total_installments > 0
                              ? `${adv.pending_installments} de ${adv.total_installments} parcelas por liquidar (Pago: ${fmtCurrency(adv.paid_amount)} / Total: ${fmtCurrency(adv.total_amount)})`
                              : `Saldo pendente integral`}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-destructive shrink-0">
                          - {fmtCurrency(adv.remaining_balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.pending_assets.length > 0 && (
                <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-orange-900 dark:text-orange-200 flex items-center gap-1.5">
                      <Package className="h-4 w-4" />
                      Activos / Equipamentos Pendentes ({preview.pending_assets.length})
                    </p>
                    <Badge variant="outline" className="font-mono text-xs border-orange-500/40 text-orange-900 dark:text-orange-200">
                      {fmtCurrency(preview.totals.pending_assets_total)}
                    </Badge>
                  </div>
                  <ul className="divide-y divide-orange-500/20 text-xs">
                    {preview.pending_assets.map((asset) => (
                      <li key={asset.id} className="py-1.5 flex items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold">{asset.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {asset.status_label} · Condição: {asset.condition_label}
                            {asset.serial_number ? ` · S/N: ${asset.serial_number}` : ''}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-destructive shrink-0">
                          - {fmtCurrency(asset.liability_amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 4. Demonstrativo Detalhado: Proveitos vs Descontos */}
          {preview && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Proveitos */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-emerald-500/10 border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
                    Proveitos e Direitos Legais (Créditos)
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-700">
                    {fmtCurrency(preview.totals.gross_settlement)}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {preview.earnings_breakdown.map((item) => (
                      <tr key={item.code} className="hover:bg-muted/30">
                        <td className="px-3.5 py-2">{item.name}</td>
                        <td className="px-3.5 py-2 text-right font-mono font-medium">
                          {fmtCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Descontos */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-destructive/10 border-b border-border px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-destructive">
                    Descontos, Adiantamentos e Pendências (Débitos)
                  </span>
                  <span className="font-mono text-sm font-bold text-destructive">
                    - {fmtCurrency(preview.totals.total_deductions)}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {preview.deductions_breakdown.length === 0 ? (
                      <tr>
                        <td className="px-3.5 py-6 text-center text-muted-foreground">
                          Nenhum desconto ou pendência a abater.
                        </td>
                      </tr>
                    ) : (
                      preview.deductions_breakdown.map((ded) => (
                        <tr key={ded.code} className="hover:bg-muted/30">
                          <td className="px-3.5 py-2">{ded.name}</td>
                          <td className="px-3.5 py-2 text-right font-mono font-medium text-destructive">
                            - {fmtCurrency(ded.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. Resumo Final e Notas Legais */}
          {preview && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/15 p-2.5 text-primary">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs uppercase font-bold tracking-wide text-muted-foreground">
                      Valor Líquido Final a Pagar na Rescisão
                    </p>
                    <p className="text-2xl font-bold font-mono text-foreground">
                      {fmtCurrency(preview.totals.net_settlement)}
                    </p>
                  </div>
                </div>

                {preview.totals.remaining_employee_debt > 0 && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-xs text-destructive">
                    <p className="font-bold flex items-center gap-1">
                      <AlertTriangle className="h-4 w-4" />
                      Saldo Devedor Remanescente do Funcionário:
                    </p>
                    <p className="font-mono text-sm font-bold mt-0.5">
                      {fmtCurrency(preview.totals.remaining_employee_debt)}
                    </p>
                  </div>
                )}
              </div>

              {preview.legal_notes.length > 0 && (
                <div className="border-t border-primary/20 pt-3">
                  <p className="text-xs font-semibold mb-1.5">Enquadramento e Nuances Legais Aplicadas:</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {preview.legal_notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-muted/20 px-6 py-3.5 flex-wrap justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
          >
            {isDownloadingPdf ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="mr-1.5 h-4 w-4" />
            )}
            Termo de Rescisão e Quitação (PDF)
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={terminateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={terminateMutation.isPending || !terminationReason.trim()}
              onClick={() => {
                if (
                  window.confirm(
                    `Confirmar a rescisão definitiva do contrato de ${employeeName} com valor líquido final de ${fmtCurrency(preview?.totals.net_settlement)}?`,
                  )
                ) {
                  terminateMutation.mutate()
                }
              }}
            >
              {terminateMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Scale className="mr-1.5 h-4 w-4" />
              )}
              Confirmar Rescisão e Liquidar Pendências
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

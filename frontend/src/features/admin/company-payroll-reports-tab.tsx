import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type {
  CompanyDossierInspectResponse,
  CompanyDossierSection,
  CompanyPayrollOverviewItem,
  CompanyPayrollOverviewResponse,
  CompanyPayrollReportPeriodicity,
  Tenant,
} from '@/types'

const MONTHS = [
  { value: 1, pt: 'Janeiro', en: 'January', zh: '1月' },
  { value: 2, pt: 'Fevereiro', en: 'February', zh: '2月' },
  { value: 3, pt: 'Março', en: 'March', zh: '3月' },
  { value: 4, pt: 'Abril', en: 'April', zh: '4月' },
  { value: 5, pt: 'Maio', en: 'May', zh: '5月' },
  { value: 6, pt: 'Junho', en: 'June', zh: '6月' },
  { value: 7, pt: 'Julho', en: 'July', zh: '7月' },
  { value: 8, pt: 'Agosto', en: 'August', zh: '8月' },
  { value: 9, pt: 'Setembro', en: 'September', zh: '9月' },
  { value: 10, pt: 'Outubro', en: 'October', zh: '10月' },
  { value: 11, pt: 'Novembro', en: 'November', zh: '11月' },
  { value: 12, pt: 'Dezembro', en: 'December', zh: '12月' },
] as const

const DOSSIER_SECTION_OPTIONS: Array<{
  id: CompanyDossierSection
  labelKey: string
  defaultLabel: string
}> = [
  { id: 'payroll_sheet', labelKey: 'companyReports.sections.payroll_sheet', defaultLabel: 'Folha de Salário' },
  { id: 'payslips', labelKey: 'companyReports.sections.payslips', defaultLabel: 'Recibos (espelhados de cada funcionário)' },
  { id: 'inss_map', labelKey: 'companyReports.sections.inss_map', defaultLabel: 'Mapa de INSS' },
  { id: 'irt_map', labelKey: 'companyReports.sections.irt_map', defaultLabel: 'Mapa de IRT' },
  { id: 'inss_payment_proof', labelKey: 'companyReports.sections.inss_payment_proof', defaultLabel: 'Comprovativo de Pagamento de INSS' },
  { id: 'attendance', labelKey: 'companyReports.sections.attendance', defaultLabel: 'Assiduidade' },
]

function localizedMonthName(monthNum: number, lang: string): string {
  const m = MONTHS.find((item) => item.value === monthNum) ?? MONTHS[0]
  if (lang.startsWith('en')) return m.en
  if (lang.startsWith('zh')) return m.zh
  return m.pt
}

function BoolBadge({ ok, trueText, falseText }: { ok: boolean; trueText: string; falseText: string }) {
  return (
    <Badge variant={ok ? 'success' : 'destructive'} className="text-[10px] font-medium">
      {ok ? trueText : falseText}
    </Badge>
  )
}

export function CompanyDossierModal({
  tenants,
  initialTenantId,
  initialYear,
  initialMonth,
  open,
  onOpenChange,
}: {
  tenants: Tenant[]
  initialTenantId?: number | null
  initialYear?: number
  initialMonth?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const now = new Date()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {t('companyReports.dossierTitle', { defaultValue: 'Resumo Completo da Empresa (Dossiê PDF)' })}
          </DialogTitle>
          <DialogDescription>
            {t('companyReports.dossierDescription', {
              defaultValue: 'Selecione os documentos a incluir no PDF completo. A impressão só é permitida se o comprovativo do INSS tiver sido enviado no relatório da folha.',
            })}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <CompanyDossierModalBody
            key={`${initialTenantId ?? 'none'}-${initialYear ?? now.getFullYear()}-${initialMonth ?? now.getMonth() + 1}`}
            tenants={tenants}
            defaultTenantId={initialTenantId ?? tenants[0]?.id ?? null}
            defaultYear={initialYear ?? now.getFullYear()}
            defaultMonth={initialMonth ?? now.getMonth() + 1}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CompanyDossierModalBody({
  tenants,
  defaultTenantId,
  defaultYear,
  defaultMonth,
  onClose,
}: {
  tenants: Tenant[]
  defaultTenantId: number | null
  defaultYear: number
  defaultMonth: number
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const [tenantId, setTenantId] = useState<number | null>(defaultTenantId)
  const [year, setYear] = useState<number>(defaultYear)
  const [month, setMonth] = useState<number>(defaultMonth)
  const [periodId, setPeriodId] = useState<number | ''>('')
  const [sections, setSections] = useState<CompanyDossierSection[]>(DOSSIER_SECTION_OPTIONS.map((s) => s.id))
  const [lang, setLang] = useState<'bilingual' | 'pt'>('bilingual')
  const [busy, setBusy] = useState(false)

  const inspectQuery = useQuery({
    queryKey: ['superadmin', 'company-dossier-inspect', tenantId, year, month, periodId],
    queryFn: () =>
      api.get<CompanyDossierInspectResponse>(`superadmin/payroll-reports/tenants/${tenantId}/inspect`, {
        year,
        month,
        ...(periodId ? { period_id: periodId } : {}),
      }),
    enabled: tenantId != null,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const toggleSection = (sec: CompanyDossierSection) => {
    setSections((prev) =>
      prev.includes(sec) ? prev.filter((item) => item !== sec) : [...prev, sec],
    )
  }

  const handleDownloadStandaloneMap = async (mapType: 'inss' | 'irt') => {
    if (tenantId == null || !inspectQuery.data?.period) return
    setBusy(true)
    try {
      await api.downloadFile(
        `superadmin/payroll-reports/tenants/${tenantId}/${mapType}-map.pdf`,
        `mapa-${mapType}-${inspectQuery.data.tenant.slug}-${year}-${String(month).padStart(2, '0')}.pdf`,
        {
          year,
          month,
          lang,
          ...(periodId ? { period_id: Number(periodId) } : { period_id: inspectQuery.data.period.id }),
        },
      )
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          mapType === 'inss'
            ? t('payroll.detail.inssMapError', { defaultValue: 'Não foi possível gerar o mapa de INSS.' })
            : t('payroll.detail.irtMapError', { defaultValue: 'Não foi possível gerar o mapa de IRT.' }),
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const handlePrintOrDownload = async (disposition: 'inline' | 'attachment') => {
    if (tenantId == null || !inspectQuery.data?.can_print) return
    if (sections.length === 0) {
      toast.error(t('companyReports.selectAtLeastOneSection', { defaultValue: 'Selecione pelo menos uma secção para o PDF.' }))
      return
    }

    const previewTab = disposition === 'inline' ? window.open('', '_blank') : null
    if (previewTab) {
      previewTab.document.write('<p style="font-family:sans-serif;padding:24px;">A gerar dossiê completo em PDF...</p>')
    }

    setBusy(true)
    try {
      const payload = {
        year,
        month,
        period_id: periodId ? Number(periodId) : inspectQuery.data.period?.id ?? undefined,
        sections,
        lang,
        disposition,
      }

      if (disposition === 'inline') {
        const blob = await api.fetchBlobPost(
          `superadmin/payroll-reports/tenants/${tenantId}/dossier.pdf`,
          payload,
        )
        const blobUrl = URL.createObjectURL(blob)
        if (previewTab && !previewTab.closed) {
          previewTab.location.href = blobUrl
        } else {
          window.open(blobUrl, '_blank')
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
      } else {
        await api.downloadFilePost(
          `superadmin/payroll-reports/tenants/${tenantId}/dossier.pdf`,
          payload,
          `resumo-completo-${inspectQuery.data.tenant.slug}-${year}-${String(month).padStart(2, '0')}.pdf`,
        )
      }
      toast.success(t('common.success'))
    } catch (error) {
      if (previewTab && !previewTab.closed) previewTab.close()
      toast.error(getApiErrorMessage(error, t('companyReports.dossierError', { defaultValue: 'Erro ao gerar PDF completo da empresa.' })))
    } finally {
      setBusy(false)
    }
  }

  const inspect = inspectQuery.data

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1 sm:col-span-3">
          <Label className="text-xs">{t('superAdminPage.companyLabel', { defaultValue: 'Empresa' })}</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
            value={tenantId ?? ''}
            onChange={(e) => {
              setTenantId(Number(e.target.value))
              setPeriodId('')
            }}
          >
            {tenants.map((tnt) => (
              <option key={tnt.id} value={tnt.id}>
                {tnt.name}{tnt.tax_id ? ` — NIF ${tnt.tax_id}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
          <Input
            type="number"
            min={2000}
            max={2100}
            className="h-9 text-xs"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value) || new Date().getFullYear())
              setPeriodId('')
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
            value={month}
            onChange={(e) => {
              setMonth(Number(e.target.value))
              setPeriodId('')
            }}
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {localizedMonthName(m.value, i18n.language)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('companyReports.pdfLanguage', { defaultValue: 'Idioma do PDF' })}</Label>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
            value={lang}
            onChange={(e) => setLang(e.target.value as 'bilingual' | 'pt')}
          >
            <option value="bilingual">{t('pdfLanguage.bilingual', { defaultValue: 'Bilingue (PT + 中文)' })}</option>
            <option value="pt">{t('pdfLanguage.portuguese', { defaultValue: 'Português (PT)' })}</option>
          </select>
        </div>

        {inspect && inspect.available_periods.length > 0 && (
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">{t('companyReports.specificPeriodOptional', { defaultValue: 'Folha salarial específica (opcional)' })}</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">{t('companyReports.autoMatchMonth', { defaultValue: 'Detetar automaticamente pelo mês selecionado' })}</option>
              {inspect.available_periods.map((ap) => (
                <option key={ap.id} value={ap.id}>
                  {ap.name} ({ap.period_start} → {ap.period_end}) — {ap.has_inss_payment_proof ? (ap.inss_paid ? 'INSS Pago ✓' : 'INSS c/ Comprov. (Não Pago)') : 'Sem Comprovativo INSS'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Estado de verificação INSS & bloqueio */}
      {inspectQuery.isFetching ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('companyReports.checkingCompliance', { defaultValue: 'A verificar estado da folha e comprovativo INSS...' })}
        </div>
      ) : inspect ? (
        <div
          className={`space-y-2 rounded-md border p-3 text-xs ${
            inspect.can_print
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : 'border-destructive/40 bg-destructive/10'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold">
              {inspect.can_print ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              {inspect.period
                ? `${inspect.period.name} (${inspect.period.employees_count} func.)`
                : t('companyReports.noPeriodFound', { defaultValue: 'Sem folha encontrada no período' })}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={inspect.has_inss_payment_proof ? 'success' : 'destructive'}>
                {inspect.has_inss_payment_proof
                  ? t('companyReports.proofAttached', { defaultValue: 'Comprovativo INSS: Enviado' })
                  : t('companyReports.proofMissing', { defaultValue: 'Comprovativo INSS: Ausente' })}
              </Badge>
              {inspect.has_inss_payment_proof && (
                <Badge variant={inspect.inss_paid ? 'success' : 'warning'}>
                  {inspect.inss_paid
                    ? t('payrollReport.paid', { defaultValue: 'INSS: Pago' })
                    : t('payrollReport.notPaid', { defaultValue: 'INSS: Não Pago' })}
                </Badge>
              )}
            </div>
          </div>

          {!inspect.can_print && inspect.blocking_reason && (
            <p className="text-destructive font-medium">{inspect.blocking_reason}</p>
          )}
        </div>
      ) : null}

      {/* Secções a incluir */}
      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold">
            {t('companyReports.sectionsTitle', { defaultValue: 'Conteúdo a incluir no Resumo Completo PDF' })}
          </Label>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() =>
              setSections((prev) =>
                prev.length === DOSSIER_SECTION_OPTIONS.length ? [] : DOSSIER_SECTION_OPTIONS.map((s) => s.id),
              )
            }
          >
            {sections.length === DOSSIER_SECTION_OPTIONS.length
              ? t('superAdminPage.clearCompanies', { defaultValue: 'Limpar' })
              : t('superAdminPage.selectAllCompanies', { defaultValue: 'Selecionar todas' })}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {DOSSIER_SECTION_OPTIONS.map((opt) => {
            const checked = sections.includes(opt.id)
            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-2 text-xs transition-colors ${
                  checked ? 'border-primary/50 bg-primary/10 font-medium' : 'border-border/60 hover:bg-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={checked}
                  onChange={() => toggleSection(opt.id)}
                />
                <span>{t(opt.labelKey, { defaultValue: opt.defaultLabel })}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Download separado dos Mapas INSS e IRT (independente de comprovativo) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t('companyReports.standaloneMapsLabel', { defaultValue: 'Mapas individuais (PDF)' })}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!inspect?.period || (inspect.period.employees_count ?? 0) === 0 || busy}
            onClick={() => void handleDownloadStandaloneMap('inss')}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            {t('payroll.detail.downloadInssMap', { defaultValue: 'Mapa INSS (PDF)' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!inspect?.period || (inspect.period.employees_count ?? 0) === 0 || busy}
            onClick={() => void handleDownloadStandaloneMap('irt')}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            {t('payroll.detail.downloadIrtMap', { defaultValue: 'Mapa IRT (PDF)' })}
          </Button>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel', { defaultValue: 'Cancelar' })}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!inspect?.can_print || sections.length === 0 || busy}
            onClick={() => void handlePrintOrDownload('inline')}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
            {t('companyReports.printDossier', { defaultValue: 'Imprimir PDF Completo' })}
          </Button>
          <Button
            type="button"
            disabled={!inspect?.can_print || sections.length === 0 || busy}
            onClick={() => void handlePrintOrDownload('attachment')}
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            {t('companyReports.downloadDossier', { defaultValue: 'Baixar PDF Completo' })}
          </Button>
        </div>
      </DialogFooter>
    </div>
  )
}

export function CompanyPayrollReportsTab({ tenants }: { tenants: Tenant[] }) {
  const { t, i18n } = useTranslation()
  const now = new Date()
  const numFmt = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }), [i18n.language])

  const [periodicity, setPeriodicity] = useState<CompanyPayrollReportPeriodicity>('monthly')
  const [year, setYear] = useState<number>(now.getFullYear())
  const [month, setMonth] = useState<number>(now.getMonth() + 1)
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1)
  const [semester, setSemester] = useState<number>(now.getMonth() < 6 ? 1 : 2)
  const [lang, setLang] = useState<'bilingual' | 'pt'>('bilingual')
  const [companySearch, setCompanySearch] = useState('')
  const [selectedTenantIds, setSelectedTenantIds] = useState<number[]>([])

  const [dossierTargetId, setDossierTargetId] = useState<number | null>(null)
  const [bulkZipDialogOpen, setBulkZipDialogOpen] = useState(false)
  const [bulkSections, setBulkSections] = useState<CompanyDossierSection[]>(DOSSIER_SECTION_OPTIONS.map((s) => s.id))
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const filteredTenants = useMemo(() => {
    const q = companySearch.trim().toLocaleLowerCase()
    if (!q) return tenants
    return tenants.filter((tnt) => `${tnt.name} ${tnt.tax_id ?? ''}`.toLocaleLowerCase().includes(q))
  }, [tenants, companySearch])

  const overviewParams = useMemo(() => {
    const base: Record<string, unknown> = {
      periodicity,
      year,
    }
    if (periodicity === 'monthly') base.month = month
    if (periodicity === 'quarterly') base.quarter = quarter
    if (periodicity === 'semiannual') base.semester = semester
    if (selectedTenantIds.length > 0) base.tenant_ids = selectedTenantIds.join(',')
    return base
  }, [periodicity, year, month, quarter, semester, selectedTenantIds])

  const overviewQuery = useQuery({
    queryKey: ['superadmin', 'payroll-reports-overview', overviewParams],
    queryFn: () => api.get<CompanyPayrollOverviewResponse>('superadmin/payroll-reports/overview', overviewParams),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const toggleCompany = (id: number) => {
    setSelectedTenantIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleGeneralSummary = async (disposition: 'inline' | 'attachment') => {
    const previewTab = disposition === 'inline' ? window.open('', '_blank') : null
    if (previewTab) {
      previewTab.document.write('<p style="font-family:sans-serif;padding:24px;">A gerar resumo geral em PDF...</p>')
    }
    setBusyAction(`general-${disposition}`)
    try {
      const payload = {
        periodicity,
        year,
        month: periodicity === 'monthly' ? month : undefined,
        quarter: periodicity === 'quarterly' ? quarter : undefined,
        semester: periodicity === 'semiannual' ? semester : undefined,
        tenant_ids: selectedTenantIds.length > 0 ? selectedTenantIds : undefined,
        lang,
        disposition,
      }
      if (disposition === 'inline') {
        const blob = await api.fetchBlobPost('superadmin/payroll-reports/general-summary.pdf', payload)
        const blobUrl = URL.createObjectURL(blob)
        if (previewTab && !previewTab.closed) previewTab.location.href = blobUrl
        else window.open(blobUrl, '_blank')
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
      } else {
        await api.downloadFilePost(
          'superadmin/payroll-reports/general-summary.pdf',
          payload,
          `resumo-geral-empresas-${overviewQuery.data?.range.code ?? year}.pdf`,
        )
      }
      toast.success(t('common.success'))
    } catch (error) {
      if (previewTab && !previewTab.closed) previewTab.close()
      toast.error(getApiErrorMessage(error, t('companyReports.summaryError', { defaultValue: 'Erro ao gerar resumo geral.' })))
    } finally {
      setBusyAction(null)
    }
  }

  const handleBulkZipDownload = async () => {
    if (bulkSections.length === 0) {
      toast.error(t('companyReports.selectAtLeastOneSection', { defaultValue: 'Selecione pelo menos uma secção para incluir.' }))
      return
    }
    setBusyAction('bulk-zip')
    try {
      await api.downloadFilePost(
        'superadmin/payroll-reports/bulk-singular.zip',
        {
          tenant_ids: selectedTenantIds.length > 0 ? selectedTenantIds : undefined,
          year,
          month,
          sections: bulkSections,
          lang,
        },
        `relatorios-empresas-${year}-${String(month).padStart(2, '0')}.zip`,
      )
      setBulkZipDialogOpen(false)
      toast.success(t('companyReports.bulkZipSuccess', { defaultValue: 'Pacote ZIP de relatórios gerado com sucesso.' }))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('companyReports.bulkZipError', { defaultValue: 'Erro ao gerar pacote ZIP de relatórios.' })))
    } finally {
      setBusyAction(null)
    }
  }

  const handleRowTaxMap = async (c: CompanyPayrollOverviewItem, mapType: 'inss' | 'irt') => {
    setBusyAction(`row-${mapType}-${c.tenant_id}`)
    try {
      await api.downloadFile(
        `superadmin/payroll-reports/tenants/${c.tenant_id}/${mapType}-map.pdf`,
        `mapa-${mapType}-${c.slug}-${year}-${String(month).padStart(2, '0')}.pdf`,
        {
          year,
          month,
          lang,
          ...(c.latest_period_id ? { period_id: c.latest_period_id } : {}),
        },
      )
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(
        getApiErrorMessage(
          error,
          mapType === 'inss'
            ? t('payroll.detail.inssMapError', { defaultValue: 'Não foi possível gerar o mapa de INSS.' })
            : t('payroll.detail.irtMapError', { defaultValue: 'Não foi possível gerar o mapa de IRT.' }),
        ),
      )
    } finally {
      setBusyAction(null)
    }
  }

  const overview = overviewQuery.data
  const companies = overview?.companies ?? []
  const readyCount = companies.filter((c) => c.ready_for_dossier).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                {t('companyReports.tabTitle', { defaultValue: 'Relatórios Gerais, Dossiês por Empresa & Estados INSS' })}
              </CardTitle>
              <CardDescription>
                {t('companyReports.tabDescription', {
                  defaultValue: 'Consulte o estado de envio/pagamento de todas as empresas ou selecione empresas específicas. Gere o PDF de Resumo Geral (mensal, trimestral, semestral ou anual) ou baixe dossiês completos singulares em massa.',
                })}
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {selectedTenantIds.length === 0
                ? t('companyReports.scopeAll', { count: tenants.length, defaultValue: `Todas (${tenants.length})` })
                : selectedTenantIds.length === 1
                  ? t('companyReports.scopeSingle', { defaultValue: '1 empresa (Singular)' })
                  : t('companyReports.scopeSelected', { count: selectedTenantIds.length, defaultValue: `${selectedTenantIds.length} selecionadas` })}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filtros de Periodicidade */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs">{t('companyReports.periodicity', { defaultValue: 'Periodicidade' })}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                value={periodicity}
                onChange={(e) => setPeriodicity(e.target.value as CompanyPayrollReportPeriodicity)}
              >
                <option value="monthly">{t('companyReports.periodicities.monthly', { defaultValue: 'Mensal' })}</option>
                <option value="quarterly">{t('companyReports.periodicities.quarterly', { defaultValue: 'Trimestral' })}</option>
                <option value="semiannual">{t('companyReports.periodicities.semiannual', { defaultValue: 'Semestral' })}</option>
                <option value="annual">{t('companyReports.periodicities.annual', { defaultValue: 'Anual' })}</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
              <Input
                type="number"
                min={2000}
                max={2100}
                className="h-9 text-xs"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
              />
            </div>

            {periodicity === 'monthly' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {localizedMonthName(m.value, i18n.language)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {periodicity === 'quarterly' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('companyReports.quarter', { defaultValue: 'Trimestre' })}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  value={quarter}
                  onChange={(e) => setQuarter(Number(e.target.value))}
                >
                  <option value={1}>1º Trimestre (Jan – Mar)</option>
                  <option value={2}>2º Trimestre (Abr – Jun)</option>
                  <option value={3}>3º Trimestre (Jul – Set)</option>
                  <option value={4}>4º Trimestre (Out – Dez)</option>
                </select>
              </div>
            )}

            {periodicity === 'semiannual' && (
              <div className="space-y-1">
                <Label className="text-xs">{t('companyReports.semester', { defaultValue: 'Semestre' })}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                >
                  <option value={1}>1º Semestre (Jan – Jun)</option>
                  <option value={2}>2º Semestre (Jul – Dez)</option>
                </select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">{t('companyReports.pdfLanguage', { defaultValue: 'Idioma PDF' })}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                value={lang}
                onChange={(e) => setLang(e.target.value as 'bilingual' | 'pt')}
              >
                <option value="bilingual">{t('pdfLanguage.bilingual', { defaultValue: 'Bilingue (PT + 中文)' })}</option>
                <option value="pt">{t('pdfLanguage.portuguese', { defaultValue: 'Português (PT)' })}</option>
              </select>
            </div>
          </div>

          {/* Seleção rápida de empresas */}
          <div className="space-y-2 rounded-md border bg-muted/15 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder={t('superAdminPage.searchCompanies', { defaultValue: 'Pesquisar empresas por nome ou NIF...' })}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setSelectedTenantIds(filteredTenants.map((item) => item.id))}
              >
                {t('superAdminPage.selectAllCompanies', { defaultValue: 'Selecionar todas' })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                disabled={selectedTenantIds.length === 0}
                onClick={() => setSelectedTenantIds([])}
              >
                {t('companyReports.useAllScope', { defaultValue: 'Limpar seleção (Todas)' })}
              </Button>
            </div>

            <div className="grid max-h-44 gap-2 overflow-y-auto rounded border border-border/60 bg-background p-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTenants.map((tnt) => {
                const checked = selectedTenantIds.includes(tnt.id)
                return (
                  <label
                    key={tnt.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                      checked ? 'border-primary/50 bg-primary/10' : 'border-border/60 hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      checked={checked}
                      onChange={() => toggleCompany(tnt.id)}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-xs font-medium leading-tight">{tnt.name}</p>
                      <p className="truncate font-mono text-[11px] leading-tight text-muted-foreground">
                        NIF: {tnt.tax_id?.trim() || '—'}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs text-muted-foreground">
              {overview ? (
                <span>
                  {overview.range.label} · {overview.range.start_date} → {overview.range.end_date}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyAction !== null || tenants.length === 0}
                onClick={() => void handleGeneralSummary('inline')}
              >
                {busyAction === 'general-inline' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Printer className="mr-1.5 h-3.5 w-3.5" />}
                {t('companyReports.printGeneralPdf', { defaultValue: 'Imprimir Resumo Geral PDF' })}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busyAction !== null || tenants.length === 0}
                onClick={() => void handleGeneralSummary('attachment')}
              >
                {busyAction === 'general-attachment' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                {t('companyReports.downloadGeneralPdf', { defaultValue: 'Baixar Resumo Geral PDF' })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyAction !== null || tenants.length === 0}
                onClick={() => setBulkZipDialogOpen(true)}
              >
                <Archive className="mr-1.5 h-3.5 w-3.5" />
                {t('companyReports.bulkSingularZipBtn', {
                  defaultValue: `Baixar Singulares em Massa (${localizedMonthName(month, i18n.language)})`,
                })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Consolidados */}
      {overview && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('companyReports.kpiApproved', { defaultValue: 'Empresas c/ Folha Aprovada' })}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {overview.totals.companies_with_approved_payroll} / {overview.totals.companies_total}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('companyReports.kpiInssPaid', { defaultValue: 'INSS Pago / Comprovativos' })}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {overview.totals.inss_paid_periods_count} / {overview.totals.inss_proof_attached_count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('companyReports.kpiTotalInssIrt', { defaultValue: 'Total INSS + IRT' })}</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {numFmt.format(overview.totals.total_inss + overview.totals.total_irt)} AOA
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t('companyReports.kpiTotalNet', { defaultValue: 'Total Salário Líquido' })}</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">
                {numFmt.format(overview.totals.total_net)} AOA
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela de Empresas e Estados */}
      <Card>
        <CardContent className="p-0">
          {overviewQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">{t('superAdminPage.companyLabel', { defaultValue: 'Empresa' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('companyReports.colPeriods', { defaultValue: 'Folhas' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.inss_guide', { defaultValue: 'Guia INSS' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.inss_proof', { defaultValue: 'Comp. INSS' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.inss_paid', { defaultValue: 'INSS Pago' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.payslips', { defaultValue: 'Recibos' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.sheet', { defaultValue: 'Folha' })}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t('payrollReport.short.summary', { defaultValue: 'Resumo' })}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('payroll.periodsPage.netTotal', { defaultValue: 'Líquido' })}</th>
                    <th className="px-3 py-2.5 text-right font-medium">{t('common.actions', { defaultValue: 'Ações' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map((c: CompanyPayrollOverviewItem) => (
                    <tr key={c.tenant_id} className="hover:bg-muted/30">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div>
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              NIF: {c.tax_id || '—'} · {c.employees_count} func.
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center tabular-nums">{c.periods_count}</td>
                      {!c.has_approved_payroll ? (
                        <td colSpan={6} className="px-3 py-2.5 text-center text-muted-foreground">
                          {t('companyReports.noApprovedInPeriod', { defaultValue: 'Sem folha aprovada neste período' })}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.inss_guide_sent} trueText="Sim" falseText="Não" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.inss_payment_proof_sent} trueText="Sim" falseText="Não" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.inss_paid} trueText="Pago" falseText="Não" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.payslips_summary_sent} trueText="Sim" falseText="Não" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.payroll_sheet_sent} trueText="Sim" falseText="Não" />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <BoolBadge ok={c.compliance.is_summary_complete} trueText="Concluído" falseText="Pendente" />
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono font-medium">
                        {numFmt.format(c.total_net)} {c.currency}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {periodicity === 'monthly' && c.has_approved_payroll && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={busyAction !== null}
                                onClick={() => void handleRowTaxMap(c, 'inss')}
                              >
                                {busyAction === `row-inss-${c.tenant_id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'INSS'
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                disabled={busyAction !== null}
                                onClick={() => void handleRowTaxMap(c, 'irt')}
                              >
                                {busyAction === `row-irt-${c.tenant_id}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'IRT'
                                )}
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDossierTargetId(c.tenant_id)}
                          >
                            <FileText className="mr-1 h-3 w-3" />
                            {t('companyReports.dossierShort', { defaultValue: 'Dossiê PDF' })}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                        {t('superAdminPage.noCompaniesFound', { defaultValue: 'Nenhuma empresa encontrada.' })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Dossiê Completo de Empresa */}
      <CompanyDossierModal
        tenants={tenants}
        initialTenantId={dossierTargetId}
        initialYear={year}
        initialMonth={month}
        open={dossierTargetId != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDossierTargetId(null)
        }}
      />

      {/* Modal: Baixar Relatórios Singulares em Massa (.ZIP) */}
      <Dialog open={bulkZipDialogOpen} onOpenChange={setBulkZipDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-primary" />
              {t('companyReports.bulkZipTitle', { defaultValue: 'Baixar Relatórios Singulares em Massa (ZIP)' })}
            </DialogTitle>
            <DialogDescription>
              {t('companyReports.bulkZipDescription', {
                defaultValue: 'Gera um arquivo .ZIP com um PDF completo individual para cada empresa selecionada no mês indicado (apenas empresas com folha aprovada e comprovativo do INSS anexado).',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('payroll.periodsPage.year', { defaultValue: 'Ano' })}</Label>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-9 text-xs"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('schedules.month', { defaultValue: 'Mês' })}</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {localizedMonthName(m.value, i18n.language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {readyCount < companies.length && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t('companyReports.bulkZipWarning', {
                    ready: readyCount,
                    total: companies.length,
                    defaultValue: `${readyCount} de ${companies.length} empresa(s) possuem comprovativo do INSS pronto no período exibido. Empresas sem comprovativo serão listadas no índice do ZIP.`,
                  })}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {t('companyReports.sectionsTitle', { defaultValue: 'Conteúdo a incluir em cada PDF' })}
              </Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {DOSSIER_SECTION_OPTIONS.map((opt) => {
                  const checked = bulkSections.includes(opt.id)
                  return (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs ${
                        checked ? 'border-primary/50 bg-primary/10 font-medium' : 'border-border/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        onChange={() =>
                          setBulkSections((prev) =>
                            prev.includes(opt.id) ? prev.filter((item) => item !== opt.id) : [...prev, opt.id],
                          )
                        }
                      />
                      <span>{t(opt.labelKey, { defaultValue: opt.defaultLabel })}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkZipDialogOpen(false)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button
              type="button"
              disabled={busyAction === 'bulk-zip' || bulkSections.length === 0}
              onClick={() => void handleBulkZipDownload()}
            >
              {busyAction === 'bulk-zip' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              {t('companyReports.generateZipButton', { defaultValue: 'Gerar e Baixar ZIP' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

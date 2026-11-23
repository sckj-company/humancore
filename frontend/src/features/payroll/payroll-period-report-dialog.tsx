import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  Circle,
  Download,
  Eye,
  FileCheck2,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { compressImageIfNeeded } from '@/lib/file-upload'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type {
  PayrollPeriodReport,
  PayrollPeriodReportDocument,
  PayrollPeriodReportDocumentType,
} from '@/types'

type SystemAttachableType = 'payroll_sheet' | 'payslips_summary_pdf' | 'attendance_report'

interface StandardDocDefinition {
  type: Exclude<PayrollPeriodReportDocumentType, 'other'>
  labelKey: string
  defaultLabel: string
  mandatory?: boolean
  systemAttachType?: SystemAttachableType
}

const STANDARD_DOC_DEFINITIONS: StandardDocDefinition[] = [
  {
    type: 'inss_guide',
    labelKey: 'payrollReport.types.inss_guide',
    defaultLabel: 'Guia de Pagamento INSS',
    mandatory: true,
  },
  {
    type: 'inss_payment_proof',
    labelKey: 'payrollReport.types.inss_payment_proof',
    defaultLabel: 'Comprovativo de Pagamento do INSS',
    mandatory: true,
  },
  {
    type: 'payslips_summary_pdf',
    labelKey: 'payrollReport.types.payslips_summary_pdf',
    defaultLabel: 'PDF Resumo de Todos os Recibos',
    mandatory: true,
    systemAttachType: 'payslips_summary_pdf',
  },
  {
    type: 'payroll_sheet',
    labelKey: 'payrollReport.types.payroll_sheet',
    defaultLabel: 'Folha de Salário',
    mandatory: true,
    systemAttachType: 'payroll_sheet',
  },
  {
    type: 'irt_guide',
    labelKey: 'payrollReport.types.irt_guide',
    defaultLabel: 'Guia IRT',
  },
  {
    type: 'irt_payment_proof',
    labelKey: 'payrollReport.types.irt_payment_proof',
    defaultLabel: 'Comprovativo de Pagamento IRT',
  },
  {
    type: 'bank_transfer_proof',
    labelKey: 'payrollReport.types.bank_transfer_proof',
    defaultLabel: 'Comprovativo de Transferência Bancária',
  },
  {
    type: 'attendance_report',
    labelKey: 'payrollReport.types.attendance_report',
    defaultLabel: 'Relatório de Assiduidade',
    systemAttachType: 'attendance_report',
  },
]

interface OtherDraftRow {
  uid: string
  title: string
  is_sent: boolean
  is_paid: boolean
  file: File | null
}

function boolToSelect(v: boolean): '1' | '0' {
  return v ? '1' : '0'
}

export function PayrollPeriodReportDialog({
  periodId,
  periodName,
  open,
  onOpenChange,
  onSaved,
}: {
  periodId: number | null
  periodName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()

  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['payroll-period-report', periodId],
    queryFn: () => api.get<PayrollPeriodReport>(`payroll/periods/${periodId}/report`),
    enabled: open && periodId != null,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            {t('payrollReport.dialogTitle', { defaultValue: 'Relatório de Conformidade & Documentos da Folha' })}
            {periodName ? ` — ${periodName}` : ''}
          </DialogTitle>
          <DialogDescription>
            {t('payrollReport.dialogDescription', {
              defaultValue: 'Registe os documentos obrigatórios, anexe comprovativos e informe para cada item se foi enviado e/ou pago.',
            })}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data || periodId == null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PayrollPeriodReportDialogBody
            key={`${periodId}-${dataUpdatedAt}`}
            periodId={periodId}
            initialReport={data}
            onRefetch={() => {
              void refetch()
              onSaved?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PayrollPeriodReportDialogBody({
  periodId,
  initialReport,
  onRefetch,
}: {
  periodId: number
  initialReport: PayrollPeriodReport
  onRefetch: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()

  const docsByType = (() => {
    const map = new Map<PayrollPeriodReportDocumentType, PayrollPeriodReportDocument[]>()
    for (const doc of initialReport.documents) {
      const list = map.get(doc.document_type) ?? []
      list.push(doc)
      map.set(doc.document_type, list)
    }
    return map
  })()

  const latestOf = (type: PayrollPeriodReportDocumentType): PayrollPeriodReportDocument | null => {
    const list = docsByType.get(type)
    return list && list.length > 0 ? list[list.length - 1] : null
  }

  const [title, setTitle] = useState(initialReport.title ?? '')
  const [notes, setNotes] = useState(initialReport.notes ?? '')
  const [isSummaryComplete, setIsSummaryComplete] = useState(initialReport.is_summary_complete)

  const [rowStates, setRowStates] = useState<Record<string, { is_sent: boolean; is_paid: boolean }>>(() => ({
    inss_guide: {
      is_sent: initialReport.inss_guide_sent || Boolean(latestOf('inss_guide')?.is_sent),
      is_paid: Boolean(latestOf('inss_guide')?.is_paid),
    },
    inss_payment_proof: {
      is_sent: initialReport.inss_payment_proof_sent || Boolean(latestOf('inss_payment_proof')?.is_sent),
      is_paid: initialReport.inss_paid || Boolean(latestOf('inss_payment_proof')?.is_paid),
    },
    payslips_summary_pdf: {
      is_sent: initialReport.payslips_summary_sent || Boolean(latestOf('payslips_summary_pdf')?.is_sent),
      is_paid: Boolean(latestOf('payslips_summary_pdf')?.is_paid),
    },
    payroll_sheet: {
      is_sent: initialReport.payroll_sheet_sent || Boolean(latestOf('payroll_sheet')?.is_sent),
      is_paid: Boolean(latestOf('payroll_sheet')?.is_paid),
    },
    irt_guide: {
      is_sent: Boolean(latestOf('irt_guide')?.is_sent),
      is_paid: Boolean(latestOf('irt_guide')?.is_paid),
    },
    irt_payment_proof: {
      is_sent: Boolean(latestOf('irt_payment_proof')?.is_sent),
      is_paid: Boolean(latestOf('irt_payment_proof')?.is_paid),
    },
    bank_transfer_proof: {
      is_sent: Boolean(latestOf('bank_transfer_proof')?.is_sent),
      is_paid: Boolean(latestOf('bank_transfer_proof')?.is_paid),
    },
    attendance_report: {
      is_sent: Boolean(latestOf('attendance_report')?.is_sent),
      is_paid: Boolean(latestOf('attendance_report')?.is_paid),
    },
  }))

  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>({})
  const [otherDrafts, setOtherDrafts] = useState<OtherDraftRow[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['payroll-period-report', periodId] })
    qc.invalidateQueries({ queryKey: ['payroll-period', String(periodId)] })
    qc.invalidateQueries({ queryKey: ['payroll-periods'] })
    qc.invalidateQueries({ queryKey: ['superadmin'] })
    onRefetch()
  }

  const saveReportMutation = useMutation({
    mutationFn: () =>
      api.put<PayrollPeriodReport>(`payroll/periods/${periodId}/report`, {
        title: title.trim() || null,
        notes: notes.trim() || null,
        inss_guide_sent: rowStates.inss_guide?.is_sent ?? false,
        inss_payment_proof_sent: rowStates.inss_payment_proof?.is_sent ?? false,
        inss_paid: rowStates.inss_payment_proof?.is_paid ?? false,
        payslips_summary_sent: rowStates.payslips_summary_pdf?.is_sent ?? false,
        payroll_sheet_sent: rowStates.payroll_sheet?.is_sent ?? false,
        is_summary_complete: isSummaryComplete,
      }),
    onSuccess: () => {
      toast.success(t('payrollReport.savedSuccess', { defaultValue: 'Estados do relatório guardados com sucesso.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollReport.saveError', { defaultValue: 'Erro ao guardar relatório.' }))),
  })

  const uploadStandardMutation = useMutation({
    mutationFn: async (def: StandardDocDefinition) => {
      const file = pendingFiles[def.type]
      if (!file) {
        throw new Error(t('payrollReport.fileRequired', { defaultValue: 'Selecione um ficheiro.' }))
      }
      const processed = await compressImageIfNeeded(file)
      const state = rowStates[def.type] ?? { is_sent: false, is_paid: false }
      const fd = new FormData()
      fd.append('document_type', def.type)
      fd.append('title', t(def.labelKey, { defaultValue: def.defaultLabel }))
      fd.append('is_sent', state.is_sent ? '1' : '0')
      fd.append('is_paid', state.is_paid ? '1' : '0')
      fd.append('file', processed)
      setBusyKey(`upload-${def.type}`)
      return api.upload(`payroll/periods/${periodId}/report/documents`, fd)
    },
    onSuccess: (_res, def) => {
      setPendingFiles((prev) => ({ ...prev, [def.type]: null }))
      toast.success(t('payrollReport.docUploaded', { defaultValue: 'Documento anexado ao relatório.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollReport.docUploadError', { defaultValue: 'Erro ao subir documento.' }))),
    onSettled: () => setBusyKey(null),
  })

  const uploadOtherDraftMutation = useMutation({
    mutationFn: async (draft: OtherDraftRow) => {
      if (!draft.file) {
        throw new Error(t('payrollReport.fileRequired', { defaultValue: 'Selecione um ficheiro.' }))
      }
      const processed = await compressImageIfNeeded(draft.file)
      const fd = new FormData()
      fd.append('document_type', 'other')
      fd.append('title', draft.title.trim() || t('payrollReport.types.other', { defaultValue: 'Outro Documento' }))
      fd.append('is_sent', draft.is_sent ? '1' : '0')
      fd.append('is_paid', draft.is_paid ? '1' : '0')
      fd.append('file', processed)
      setBusyKey(`other-${draft.uid}`)
      return api.upload(`payroll/periods/${periodId}/report/documents`, fd)
    },
    onSuccess: (_res, draft) => {
      setOtherDrafts((prev) => prev.filter((item) => item.uid !== draft.uid))
      toast.success(t('payrollReport.docUploaded', { defaultValue: 'Documento anexado ao relatório.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollReport.docUploadError', { defaultValue: 'Erro ao subir documento.' }))),
    onSettled: () => setBusyKey(null),
  })

  const attachSystemMutation = useMutation({
    mutationFn: async ({ docType, isSent, isPaid }: { docType: SystemAttachableType; isSent: boolean; isPaid: boolean }) => {
      setBusyKey(`sys-${docType}`)
      return api.post(`payroll/periods/${periodId}/report/documents/attach-system`, {
        document_type: docType,
        is_sent: isSent,
        is_paid: isPaid,
      })
    },
    onSuccess: () => {
      toast.success(t('payrollReport.systemAttached', { defaultValue: 'PDF do sistema gerado e anexado ao relatório.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollReport.docUploadError', { defaultValue: 'Erro ao anexar PDF do sistema.' }))),
    onSettled: () => setBusyKey(null),
  })

  const updateDocMutation = useMutation({
    mutationFn: ({ docId, patch }: { docId: number; patch: Partial<Pick<PayrollPeriodReportDocument, 'is_paid' | 'is_sent'>> }) =>
      api.patch(`payroll/periods/${periodId}/report/documents/${docId}`, patch),
    onSuccess: () => {
      toast.success(t('payrollReport.docUpdated', { defaultValue: 'Estado do documento atualizado.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('common.error'))),
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`payroll/periods/${periodId}/report/documents/${docId}`),
    onSuccess: () => {
      toast.success(t('payrollReport.docDeleted', { defaultValue: 'Documento removido do relatório.' }))
      invalidateAll()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('common.error'))),
  })

  const handleViewDocument = async (doc: PayrollPeriodReportDocument) => {
    const previewTab = window.open('', '_blank')
    if (previewTab) {
      previewTab.document.write('<p style="font-family:sans-serif;padding:24px;">A abrir documento...</p>')
    }
    try {
      const blob = await api.fetchBlob(`payroll/periods/${periodId}/report/documents/${doc.id}/download`, { inline: 1 })
      const blobUrl = URL.createObjectURL(blob)
      if (previewTab && !previewTab.closed) {
        previewTab.location.href = blobUrl
      } else {
        window.open(blobUrl, '_blank')
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (error) {
      if (previewTab && !previewTab.closed) previewTab.close()
      toast.error(getApiErrorMessage(error, t('payrollReport.viewError', { defaultValue: 'Não foi possível visualizar o documento.' })))
    }
  }

  const handleDownloadTaxMap = async (mapType: 'inss' | 'irt') => {
    setBusyKey(`map-${mapType}`)
    try {
      await api.downloadFile(
        `payroll/periods/${periodId}/${mapType}-map.pdf`,
        `mapa-${mapType}-periodo-${periodId}.pdf`,
      )
      toast.success(t('common.success'))
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('payrollReport.mapDownloadError', { defaultValue: 'Não foi possível gerar o mapa solicitado.' })))
    } finally {
      setBusyKey(null)
    }
  }

  const handleStandardFlagChange = (
    type: string,
    attachedDoc: PayrollPeriodReportDocument | null,
    field: 'is_sent' | 'is_paid',
    value: boolean,
  ) => {
    setRowStates((prev) => ({
      ...prev,
      [type]: {
        is_sent: prev[type]?.is_sent ?? false,
        is_paid: prev[type]?.is_paid ?? false,
        [field]: value,
      },
    }))
    if (attachedDoc) {
      updateDocMutation.mutate({ docId: attachedDoc.id, patch: { [field]: value } })
    }
  }

  const handleAddOtherRow = () => {
    setOtherDrafts((prev) => [
      ...prev,
      {
        uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: '',
        is_sent: false,
        is_paid: false,
        file: null,
      },
    ])
  }

  const otherDocuments = docsByType.get('other') ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t('payrollReport.mandatoryChecklistDesc', {
            defaultValue: 'Anexe ou gere diretamente em cada item, defina Enviado/Pago nos seletores e guarde a situação final.',
          })}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busyKey !== null}
            onClick={() => void handleDownloadTaxMap('inss')}
          >
            {busyKey === 'map-inss' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            {t('payroll.detail.downloadInssMap', { defaultValue: 'Mapa INSS (PDF)' })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={busyKey !== null}
            onClick={() => void handleDownloadTaxMap('irt')}
          >
            {busyKey === 'map-irt' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
            {t('payroll.detail.downloadIrtMap', { defaultValue: 'Mapa IRT (PDF)' })}
          </Button>
          <Badge variant={isSummaryComplete ? 'success' : 'warning'}>
            {isSummaryComplete
              ? t('payrollReport.summaryComplete', { defaultValue: 'Resumo: Concluído' })
              : t('payrollReport.summaryPending', { defaultValue: 'Resumo: Pendente' })}
          </Badge>
        </div>
      </div>

      {/* Lista Unificada de Tipos Padrão + Upload/Visualizar Inline */}
      <div className="space-y-2.5">
        {STANDARD_DOC_DEFINITIONS.map((def, idx) => {
          const doc = latestOf(def.type)
          const extraCount = (docsByType.get(def.type)?.length ?? 0) - 1
          const state = rowStates[def.type] ?? { is_sent: false, is_paid: false }
          const selectedFile = pendingFiles[def.type] ?? null
          const isRowUploading = busyKey === `upload-${def.type}`
          const isRowSystem = busyKey === `sys-${def.systemAttachType}`

          return (
            <div
              key={def.type}
              className={`space-y-2.5 rounded-lg border p-3 transition-colors ${
                doc ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {doc ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold text-foreground">
                    {idx + 1}. {t(def.labelKey, { defaultValue: def.defaultLabel })}
                  </span>
                  {def.mandatory && (
                    <Badge variant={doc ? 'success' : 'destructive'} className="text-[10px]">
                      {t('payrollReport.mandatoryBadge', { defaultValue: 'Obrigatório' })}
                    </Badge>
                  )}
                  <Badge variant={doc ? 'secondary' : 'outline'} className="text-[10px]">
                    {doc
                      ? t('payrollReport.attached', { defaultValue: 'Anexado' })
                      : t('payrollReport.notAttached', { defaultValue: 'Por anexar' })}
                  </Badge>
                  {extraCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{extraCount}
                    </Badge>
                  )}
                </div>

                {/* Selects de Estado inline: Enviado & Pago */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`${def.defaultLabel} — ${t('payrollReport.sentStateLabel', { defaultValue: 'Estado de envio' })}`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={boolToSelect(doc ? doc.is_sent : state.is_sent)}
                    disabled={updateDocMutation.isPending}
                    onChange={(e) => handleStandardFlagChange(def.type, doc, 'is_sent', e.target.value === '1')}
                  >
                    <option value="0">{t('payrollReport.notSent', { defaultValue: 'Não enviado' })}</option>
                    <option value="1">{t('payrollReport.sent', { defaultValue: 'Enviado' })}</option>
                  </select>

                  <select
                    aria-label={`${def.defaultLabel} — ${t('payrollReport.docPaidState', { defaultValue: 'Já foi pago?' })}`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={boolToSelect(doc ? doc.is_paid : state.is_paid)}
                    disabled={updateDocMutation.isPending}
                    onChange={(e) => handleStandardFlagChange(def.type, doc, 'is_paid', e.target.value === '1')}
                  >
                    <option value="0">{t('payrollReport.notPaid', { defaultValue: 'Não pago' })}</option>
                    <option value="1">{t('payrollReport.paid', { defaultValue: 'Pago' })}</option>
                  </select>
                </div>
              </div>

              {doc ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{doc.file_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {doc.created_at ? new Date(doc.created_at).toLocaleString(i18n.language) : ''}
                      {doc.notes ? ` · ${doc.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => void handleViewDocument(doc)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t('payrollReport.viewDocument', { defaultValue: 'Visualizar' })}
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className="h-7 w-7"
                      title={t('common.download', { defaultValue: 'Transferir' })}
                      onClick={() =>
                        void api.downloadFile(
                          `payroll/periods/${periodId}/report/documents/${doc.id}/download`,
                          doc.file_name,
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title={t('common.delete', { defaultValue: 'Eliminar' })}
                      disabled={deleteDocMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t('payrollReport.confirmDeleteDoc', { defaultValue: 'Remover este documento do relatório?' }))) {
                          deleteDocMutation.mutate(doc.id)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                    className="h-8 min-w-[200px] flex-1 text-xs"
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setPendingFiles((prev) => ({ ...prev, [def.type]: e.target.files?.[0] ?? null }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!selectedFile || busyKey !== null}
                    onClick={() => uploadStandardMutation.mutate(def)}
                  >
                    {isRowUploading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t('payrollReport.uploadNow', { defaultValue: 'Enviar' })}
                  </Button>
                  {def.systemAttachType && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={busyKey !== null}
                      onClick={() =>
                        attachSystemMutation.mutate({
                          docType: def.systemAttachType!,
                          isSent: state.is_sent,
                          isPaid: state.is_paid,
                        })
                      }
                    >
                      {isRowSystem ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      )}
                      {t('payrollReport.attachFromSystem', { defaultValue: 'Anexar do sistema' })}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Documentos "Outros" já guardados */}
        {otherDocuments.map((doc) => (
          <div key={doc.id} className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="truncate text-xs font-semibold text-foreground">{doc.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t('payrollReport.types.other', { defaultValue: 'Outro' })}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`${doc.title} — ${t('payrollReport.sentStateLabel', { defaultValue: 'Envio' })}`}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={boolToSelect(doc.is_sent)}
                  disabled={updateDocMutation.isPending}
                  onChange={(e) => updateDocMutation.mutate({ docId: doc.id, patch: { is_sent: e.target.value === '1' } })}
                >
                  <option value="0">{t('payrollReport.notSent', { defaultValue: 'Não enviado' })}</option>
                  <option value="1">{t('payrollReport.sent', { defaultValue: 'Enviado' })}</option>
                </select>
                <select
                  aria-label={`${doc.title} — ${t('payrollReport.docPaidState', { defaultValue: 'Pagamento' })}`}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={boolToSelect(doc.is_paid)}
                  disabled={updateDocMutation.isPending}
                  onChange={(e) => updateDocMutation.mutate({ docId: doc.id, patch: { is_paid: e.target.value === '1' } })}
                >
                  <option value="0">{t('payrollReport.notPaid', { defaultValue: 'Não pago' })}</option>
                  <option value="1">{t('payrollReport.paid', { defaultValue: 'Pago' })}</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 text-xs">
              <p className="min-w-0 flex-1 truncate font-medium text-foreground">{doc.file_name}</p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => void handleViewDocument(doc)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {t('payrollReport.viewDocument', { defaultValue: 'Visualizar' })}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  className="h-7 w-7"
                  title={t('common.download', { defaultValue: 'Transferir' })}
                  onClick={() =>
                    void api.downloadFile(
                      `payroll/periods/${periodId}/report/documents/${doc.id}/download`,
                      doc.file_name,
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title={t('common.delete', { defaultValue: 'Eliminar' })}
                  disabled={deleteDocMutation.isPending}
                  onClick={() => {
                    if (window.confirm(t('payrollReport.confirmDeleteDoc', { defaultValue: 'Remover este documento do relatório?' }))) {
                      deleteDocMutation.mutate(doc.id)
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* Novos rascunhos de "Outros" adicionados ao clicar em "+ Adicionar outro documento" */}
        {otherDrafts.map((draft) => {
          const isBusy = busyKey === `other-${draft.uid}`
          return (
            <div key={draft.uid} className="space-y-2.5 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                  value={draft.title}
                  placeholder={t('payrollReport.otherTitlePlaceholder', { defaultValue: 'Nome do documento extra (ex: Seguro / Declaração)...' })}
                  className="h-8 min-w-[220px] flex-1 bg-background text-xs"
                  onChange={(e) =>
                    setOtherDrafts((prev) =>
                      prev.map((item) => (item.uid === draft.uid ? { ...item, title: e.target.value } : item)),
                    )
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={boolToSelect(draft.is_sent)}
                    onChange={(e) =>
                      setOtherDrafts((prev) =>
                        prev.map((item) => (item.uid === draft.uid ? { ...item, is_sent: e.target.value === '1' } : item)),
                      )
                    }
                  >
                    <option value="0">{t('payrollReport.notSent', { defaultValue: 'Não enviado' })}</option>
                    <option value="1">{t('payrollReport.sent', { defaultValue: 'Enviado' })}</option>
                  </select>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={boolToSelect(draft.is_paid)}
                    onChange={(e) =>
                      setOtherDrafts((prev) =>
                        prev.map((item) => (item.uid === draft.uid ? { ...item, is_paid: e.target.value === '1' } : item)),
                      )
                    }
                  >
                    <option value="0">{t('payrollReport.notPaid', { defaultValue: 'Não pago' })}</option>
                    <option value="1">{t('payrollReport.paid', { defaultValue: 'Pago' })}</option>
                  </select>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-8 w-8"
                    title={t('common.cancel', { defaultValue: 'Cancelar' })}
                    onClick={() => setOtherDrafts((prev) => prev.filter((item) => item.uid !== draft.uid))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                  className="h-8 min-w-[200px] flex-1 bg-background text-xs"
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setOtherDrafts((prev) =>
                      prev.map((item) =>
                        item.uid === draft.uid ? { ...item, file: e.target.files?.[0] ?? null } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!draft.file || busyKey !== null}
                  onClick={() => uploadOtherDraftMutation.mutate(draft)}
                >
                  {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                  {t('payrollReport.uploadNow', { defaultValue: 'Enviar' })}
                </Button>
              </div>
            </div>
          )
        })}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full border-dashed text-xs"
          onClick={handleAddOtherRow}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t('payrollReport.addOtherDocument', { defaultValue: 'Adicionar outros documentos' })}
        </Button>
      </div>

      {/* Situação Geral do Resumo & Guardar */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              {t('payrollReport.summarySituationLabel', { defaultValue: 'Situação do resumo (concluído?)' })}
            </Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs font-medium"
              value={boolToSelect(isSummaryComplete)}
              onChange={(e) => setIsSummaryComplete(e.target.value === '1')}
            >
              <option value="0">{t('payrollReport.booleanNoPending', { defaultValue: 'Não — Pendente / Incompleto' })}</option>
              <option value="1">{t('payrollReport.booleanYesComplete', { defaultValue: 'Sim — Concluído / Verificado' })}</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">
              {t('payrollReport.reportTitleLabel', { defaultValue: 'Título / Referência do relatório (opcional)' })}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('payrollReport.reportTitlePlaceholder', { defaultValue: 'Ex: Fecho mensal INSS/IRT' })}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">{t('common.notes', { defaultValue: 'Observações' })}</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('payrollReport.notesPlaceholder', { defaultValue: 'Notas sobre envio das guias ou pagamento...' })}
              className="text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={saveReportMutation.isPending}
            onClick={() => saveReportMutation.mutate()}
          >
            {saveReportMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t('payrollReport.saveStatesButton', { defaultValue: 'Guardar estados do relatório' })}
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  FileWarning,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { compressImageIfNeeded, MAX_MULTIPART_SAFE_BYTES, readFileAsDataUrl } from '@/lib/file-upload'
import {
  PdfLanguageDialog,
  usePdfLanguagePrompt,
  type PdfLanguage,
} from '@/components/shared/pdf-language-dialog'
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
import { Textarea } from '@/components/ui/textarea'
import type { EmployeeEducation } from '@/types'

interface EducationFormState {
  title: string
  occurred_on: string
  reason: string
  sanction_warning: string
  document: File | null
  signed_document: File | null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EmployeeEducationTab({
  employeeId = null,
  employeeName = null,
  canManage,
}: {
  employeeId?: number | null
  employeeName?: string | null
  canManage: boolean
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const locale = i18n.language || 'pt-PT'
  const pdfPrompt = usePdfLanguagePrompt()

  const isGeneral = employeeId == null
  const basePath = isGeneral ? 'educations' : `employees/${employeeId}/educations`
  const queryKey = isGeneral ? ['general-educations'] : ['employee-educations', employeeId]

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmployeeEducation | null>(null)
  const [form, setForm] = useState<EducationFormState>({
    title: '',
    occurred_on: todayIso(),
    reason: '',
    sanction_warning: '',
    document: null,
    signed_document: null,
  })
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  const [uploadingSignedId, setUploadingSignedId] = useState<number | null>(null)
  const signedInputRef = useRef<HTMLInputElement>(null)
  const signedTargetIdRef = useRef<number | null>(null)

  const { data: educations = [], isLoading } = useQuery<EmployeeEducation[]>({
    queryKey,
    queryFn: () => api.get<EmployeeEducation[]>(basePath),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey })
  }

  const openCreate = () => {
    setEditing(null)
    setForm({
      title: '',
      occurred_on: todayIso(),
      reason: '',
      sanction_warning: '',
      document: null,
      signed_document: null,
    })
    setIsDialogOpen(true)
  }

  const openEdit = (item: EmployeeEducation) => {
    setEditing(item)
    setForm({
      title: item.title ?? '',
      occurred_on: item.occurred_on ?? todayIso(),
      reason: item.reason,
      sanction_warning: item.sanction_warning ?? '',
      document: null,
      signed_document: null,
    })
    setIsDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.reason.trim()) {
        throw new Error(
          t('employeeEducation.reasonRequired', {
            defaultValue: 'Preencha os motivos da educação.',
          }),
        )
      }

      if (editing) {
        if (form.document) {
          const file = await compressImageIfNeeded(form.document)
          const fd = new FormData()
          fd.append('_method', 'PUT')
          fd.append('title', form.title)
          fd.append('occurred_on', form.occurred_on)
          fd.append('reason', form.reason)
          if (form.sanction_warning) fd.append('sanction_warning', form.sanction_warning)
          fd.append('document', file)
          return api.upload(`${basePath}/${editing.id}`, fd)
        }
        return api.put(`${basePath}/${editing.id}`, {
          title: form.title || null,
          occurred_on: form.occurred_on || null,
          reason: form.reason,
          sanction_warning: form.sanction_warning || null,
        })
      }

      const fd = new FormData()
      if (form.title) fd.append('title', form.title)
      if (form.occurred_on) fd.append('occurred_on', form.occurred_on)
      fd.append('reason', form.reason)
      if (form.sanction_warning) fd.append('sanction_warning', form.sanction_warning)
      if (form.document) {
        fd.append('document', await compressImageIfNeeded(form.document))
      }
      if (form.signed_document) {
        fd.append('signed_document', await compressImageIfNeeded(form.signed_document))
      }
      return api.upload(basePath, fd)
    },
    onSuccess: () => {
      toast.success(
        editing
          ? t('employeeEducation.updated', { defaultValue: 'Registo de educação atualizado.' })
          : t('employeeEducation.created', { defaultValue: 'Registo de educação guardado com sucesso.' }),
      )
      setIsDialogOpen(false)
      setEditing(null)
      invalidate()
    },
    onError: (e) =>
      toast.error(
        getApiErrorMessage(
          e,
          t('employeeEducation.saveError', { defaultValue: 'Não foi possível guardar o registo de educação.' }),
        ),
      ),
  })

  const deleteMutation = useMutation({
    mutationFn: (educationId: number) => api.delete(`${basePath}/${educationId}`),
    onSuccess: () => {
      toast.success(t('employeeEducation.deleted', { defaultValue: 'Registo de educação eliminado.' }))
      invalidate()
    },
    onError: (e) =>
      toast.error(
        getApiErrorMessage(
          e,
          t('employeeEducation.deleteError', { defaultValue: 'Não foi possível eliminar o registo.' }),
        ),
      ),
  })

  const uploadSignedMutation = useMutation({
    mutationFn: async ({ educationId, rawFile }: { educationId: number; rawFile: File }) => {
      setUploadingSignedId(educationId)
      const file = await compressImageIfNeeded(rawFile)

      if (file.size <= MAX_MULTIPART_SAFE_BYTES) {
        try {
          const fd = new FormData()
          fd.append('document', file)
          return await api.upload(`${basePath}/${educationId}/signed-document`, fd)
        } catch (err) {
          if (file.size > 5 * 1024 * 1024) throw err
        }
      }

      const dataUrl = await readFileAsDataUrl(file)
      return api.post(`${basePath}/${educationId}/signed-document`, {
        document_base64: dataUrl,
        document_name: file.name,
        document_mime: file.type,
      })
    },
    onSuccess: () => {
      toast.success(
        t('employeeEducation.signedUploaded', {
          defaultValue: 'Comprovativo assinado carregado com sucesso.',
        }),
      )
      invalidate()
    },
    onError: (e) =>
      toast.error(
        getApiErrorMessage(
          e,
          t('employeeEducation.signedUploadError', {
            defaultValue: 'Erro ao carregar o comprovativo assinado.',
          }),
        ),
      ),
    onSettled: () => setUploadingSignedId(null),
  })

  const handleDownloadPdf = (education: EmployeeEducation) => {
    pdfPrompt.requestPdf(async (lang: PdfLanguage) => {
      const key = `pdf-${education.id}`
      setDownloadingKey(key)
      try {
        const filename = isGeneral
          ? `educacao-geral-${education.id}.pdf`
          : `educacao-${employeeId}-${education.id}.pdf`
        await api.downloadFile(`${basePath}/${education.id}/receipt.pdf`, filename, { lang })
      } catch (e) {
        toast.error(
          getApiErrorMessage(
            e,
            t('employeeEducation.pdfError', { defaultValue: 'Erro ao gerar comprovativo PDF.' }),
          ),
        )
      } finally {
        setDownloadingKey(null)
      }
    })
  }

  const handleDownloadDoc = async (education: EmployeeEducation, kind: 'attachment' | 'signed') => {
    const key = `${kind}-${education.id}`
    setDownloadingKey(key)
    try {
      const fallbackName =
        kind === 'signed'
          ? education.signed_document_name || `educacao-assinada-${education.id}`
          : education.document_name || `educacao-anexo-${education.id}`
      await api.downloadFile(`${basePath}/${education.id}/documents/${kind}`, fallbackName)
    } catch (e) {
      toast.error(
        getApiErrorMessage(
          e,
          t('employeeEducation.downloadError', { defaultValue: 'Erro ao descarregar o documento.' }),
        ),
      )
    } finally {
      setDownloadingKey(null)
    }
  }

  const formatDate = (d?: string | null) => {
    if (!d) return '—'
    const raw = String(d).split('T')[0]
    const [y, m, day] = raw.split('-').map(Number)
    if (!isNaN(y) && !isNaN(m) && !isNaN(day)) {
      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(y, m - 1, day))
    }
    return d
  }

  return (
    <div className="space-y-4">
      <input
        ref={signedInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          const targetId = signedTargetIdRef.current
          e.target.value = ''
          if (file && targetId != null) {
            uploadSignedMutation.mutate({ educationId: targetId, rawFile: file })
          }
        }}
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-amber-600" />
                {isGeneral
                  ? t('employeeEducation.generalTitle', {
                      defaultValue: 'Educação Geral (Todos os Funcionários)',
                    })
                  : t('employeeEducation.title', { defaultValue: 'Educação / Avisos de Ocorrência' })}
                {educations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {educations.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isGeneral
                  ? t('employeeEducation.generalDescription', {
                      defaultValue:
                        'Emita termos de educação geral sem indicar um funcionário específico, para serem assinados por todos e carregados no sistema.',
                    })
                  : t('employeeEducation.description', {
                      defaultValue:
                        'Registe situações ocorridas com aviso de eventual sanção em caso de reincidência, emita o comprovativo para assinatura de todos e carregue o documento assinado.',
                    })}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isGeneral && (
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <Link to="/educations">
                    <Users className="h-4 w-4" />
                    {t('employeeEducation.generalLink', { defaultValue: 'Educação Geral' })}
                  </Link>
                </Button>
              )}
              {canManage && (
                <Button size="sm" className="gap-1.5" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  {isGeneral
                    ? t('employeeEducation.newGeneralAction', { defaultValue: 'Nova Educação Geral' })
                    : t('employeeEducation.newAction', { defaultValue: 'Nova Educação' })}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t('common.loading', { defaultValue: 'A carregar…' })}
            </div>
          ) : educations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
              <div className="rounded-full bg-amber-500/10 p-4 mb-3">
                <FileWarning className="h-8 w-8 text-amber-600" />
              </div>
              <p className="text-sm font-semibold">
                {t('employeeEducation.emptyTitle', { defaultValue: 'Sem registos de educação' })}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md">
                {isGeneral
                  ? t('employeeEducation.generalEmptyDescription', {
                      defaultValue:
                        'Quando precisar de emitir um aviso geral para toda a equipa assinar sem identificar um funcionário específico, crie aqui e gere o comprovativo PDF.',
                    })
                  : t('employeeEducation.emptyDescription', {
                      defaultValue:
                        'Quando ocorrer uma situação que exija aviso formal e assinatura dos intervenientes, registe aqui os motivos e emita o comprovativo.',
                    })}
              </p>
              {canManage && (
                <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5" />
                  {isGeneral
                    ? t('employeeEducation.newGeneralAction', { defaultValue: 'Nova Educação Geral' })
                    : t('employeeEducation.newAction', { defaultValue: 'Nova Educação' })}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {educations.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {item.title ||
                            (isGeneral
                              ? t('employeeEducation.defaultGeneralRecordTitle', {
                                  id: item.id,
                                  defaultValue: `Educação Geral #${item.id}`,
                                })
                              : t('employeeEducation.defaultRecordTitle', {
                                  id: item.id,
                                  defaultValue: `Registo de Educação #${item.id}`,
                                }))}
                        </span>
                        {isGeneral && (
                          <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                            {t('employeeEducation.generalBadge', { defaultValue: 'Geral · Todos' })}
                          </Badge>
                        )}
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {formatDate(item.occurred_on)}
                        </Badge>
                        {item.has_signed_document ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1 text-[11px]"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            {t('employeeEducation.signedBadge', { defaultValue: 'Assinado carregado' })}
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 text-[11px]"
                          >
                            <Clock className="h-3 w-3" />
                            {t('employeeEducation.pendingSignatureBadge', {
                              defaultValue: 'Aguarda assinatura',
                            })}
                          </Badge>
                        )}
                      </div>
                      {item.creator?.name && (
                        <p className="text-xs text-muted-foreground">
                          {t('employeeEducation.createdBy', {
                            name: item.creator.name,
                            defaultValue: `Registado por ${item.creator.name}`,
                          })}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        disabled={downloadingKey === `pdf-${item.id}`}
                        onClick={() => handleDownloadPdf(item)}
                      >
                        {downloadingKey === `pdf-${item.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileDown className="h-3.5 w-3.5" />
                        )}
                        {t('employeeEducation.downloadPdf', { defaultValue: 'Comprovativo PDF' })}
                      </Button>

                      {canManage && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          disabled={uploadingSignedId === item.id}
                          onClick={() => {
                            signedTargetIdRef.current = item.id
                            signedInputRef.current?.click()
                          }}
                        >
                          {uploadingSignedId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {item.has_signed_document
                            ? t('employeeEducation.replaceSigned', { defaultValue: 'Substituir Assinado' })
                            : t('employeeEducation.uploadSigned', { defaultValue: 'Enviar Assinado' })}
                        </Button>
                      )}

                      {item.has_signed_document && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-8 gap-1.5 text-xs text-emerald-700 hover:text-emerald-800"
                          disabled={downloadingKey === `signed-${item.id}`}
                          onClick={() => handleDownloadDoc(item, 'signed')}
                        >
                          {downloadingKey === `signed-${item.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {t('employeeEducation.downloadSigned', { defaultValue: 'Baixar Assinado' })}
                        </Button>
                      )}

                      {item.has_document && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1.5 text-xs"
                          disabled={downloadingKey === `attachment-${item.id}`}
                          onClick={() => handleDownloadDoc(item, 'attachment')}
                        >
                          {downloadingKey === `attachment-${item.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          {t('employeeEducation.downloadAttachment', { defaultValue: 'Anexo' })}
                        </Button>
                      )}

                      {canManage && (
                        <>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t('common.edit', { defaultValue: 'Editar' })}
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="hover:text-destructive"
                            aria-label={t('common.delete', { defaultValue: 'Eliminar' })}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('employeeEducation.confirmDelete', {
                                    defaultValue: 'Tem a certeza que pretende eliminar este registo de educação?',
                                  }),
                                )
                              ) {
                                deleteMutation.mutate(item.id)
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/40 border border-border/60 p-3 space-y-2 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                        {t('employeeEducation.reasonsLabel', { defaultValue: 'Motivos / Situação Ocorrida' })}
                      </p>
                      <p className="whitespace-pre-wrap text-foreground">{item.reason}</p>
                    </div>
                    {item.sanction_warning && (
                      <div className="pt-2 border-t border-border/60">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">
                          {t('employeeEducation.sanctionWarningLabel', {
                            defaultValue: 'Aviso de Sanção Específico',
                          })}
                        </p>
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                          {item.sanction_warning}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('employeeEducation.editTitle', { defaultValue: 'Editar Educação' })
                : isGeneral
                  ? t('employeeEducation.newGeneralAction', { defaultValue: 'Nova Educação Geral' })
                  : t('employeeEducation.createTitle', { defaultValue: 'Nova Educação' })}
            </DialogTitle>
            <DialogDescription>
              {isGeneral
                ? t('employeeEducation.generalDialogDescription', {
                    defaultValue:
                      'Registe os motivos e o aviso geral aplicável a todos os colaboradores. Depois poderá baixar o comprovativo para assinatura de todos e carregar o documento assinado.',
                  })
                : t('employeeEducation.dialogDescription', {
                    name: employeeName ?? '',
                    defaultValue: `Registe os motivos e aviso para ${employeeName ?? ''}. Depois poderá baixar o comprovativo para assinatura de todos e carregar o documento assinado.`,
                  })}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4 py-1"
            onSubmit={(e) => {
              e.preventDefault()
              saveMutation.mutate()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edu-title">
                  {t('employeeEducation.subjectLabel', { defaultValue: 'Assunto (opcional)' })}
                </Label>
                <Input
                  id="edu-title"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t('employeeEducation.subjectPlaceholder', {
                    defaultValue: 'Ex: Incumprimento de norma interna',
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edu-date">
                  {t('employeeEducation.dateLabel', { defaultValue: 'Data da Ocorrência' })}
                </Label>
                <Input
                  id="edu-date"
                  type="date"
                  value={form.occurred_on}
                  onChange={(e) => setForm((p) => ({ ...p, occurred_on: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edu-reason">
                {t('employeeEducation.reasonsLabel', { defaultValue: 'Motivos / Situação Ocorrida' })} *
              </Label>
              <Textarea
                id="edu-reason"
                rows={4}
                required
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder={t('employeeEducation.reasonsPlaceholder', {
                  defaultValue: 'Descreva detalhadamente a situação ocorrida e os respetivos motivos...',
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edu-sanction">
                {t('employeeEducation.sanctionWarningLabel', {
                  defaultValue: 'Aviso de Sanção Específico (opcional)',
                })}
              </Label>
              <Textarea
                id="edu-sanction"
                rows={2}
                value={form.sanction_warning}
                onChange={(e) => setForm((p) => ({ ...p, sanction_warning: e.target.value }))}
                placeholder={t('employeeEducation.sanctionPlaceholder', {
                  defaultValue:
                    'Opcional: detalhe a sanção prevista em caso de reincidência (o aviso padrão já consta no PDF).',
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edu-doc">
                {t('employeeEducation.attachmentLabel', {
                  defaultValue: 'Documento Anexo / Evidência (opcional)',
                })}
              </Label>
              <Input
                id="edu-doc"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setForm((p) => ({ ...p, document: e.target.files?.[0] ?? null }))}
              />
            </div>

            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="edu-signed">
                  {t('employeeEducation.signedFileLabel', {
                    defaultValue: 'Documento Já Assinado (opcional)',
                  })}
                </Label>
                <Input
                  id="edu-signed"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, signed_document: e.target.files?.[0] ?? null }))
                  }
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t('common.cancel', { defaultValue: 'Cancelar' })}
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !form.reason.trim()}>
                {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t('common.save', { defaultValue: 'Guardar' })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PdfLanguageDialog
        open={pdfPrompt.open}
        onOpenChange={pdfPrompt.onOpenChange}
        onSelect={pdfPrompt.handleSelect}
      />
    </div>
  )
}

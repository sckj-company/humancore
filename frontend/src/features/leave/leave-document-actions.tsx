import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileDown, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { cloudinaryAttachmentUrl } from '@/lib/cloudinary'
import { compressImageIfNeeded, MAX_MULTIPART_SAFE_BYTES, readFileAsDataUrl } from '@/lib/file-upload'
import {
  PdfLanguageDialog,
  usePdfLanguagePrompt,
  type PdfLanguage,
} from '@/components/shared/pdf-language-dialog'
import { Button } from '@/components/ui/button'

interface LeaveDocumentActionsProps {
  leave: {
    id: number
    employee_id: number
    has_justification_document?: boolean
    has_signed_document?: boolean
    justification_document_url?: string | null
    signed_document_url?: string | null
  }
}

export function LeaveDocumentActions({ leave }: LeaveDocumentActionsProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const signedInput = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState<'receipt' | 'signed' | 'justification' | null>(null)
  const pdfPrompt = usePdfLanguagePrompt()

  const uploadMutation = useMutation({
    mutationFn: async (rawFile: File) => {
      const file = await compressImageIfNeeded(rawFile)

      if (file.size <= MAX_MULTIPART_SAFE_BYTES) {
        try {
          const formData = new FormData()
          formData.append('document', file)
          return await api.upload(`leave/${leave.id}/documents/signed`, formData)
        } catch (err) {
          if (file.size > 5 * 1024 * 1024) {
            throw err
          }
        }
      }

      const dataUrl = await readFileAsDataUrl(file)
      return api.post(`leave/${leave.id}/documents/signed`, {
        document_base64: dataUrl,
        document_name: file.name,
        document_mime: file.type,
      })
    },
    onSuccess: () => {
      toast.success(
        t('leave.signedDocumentUploaded', {
          defaultValue: 'Comprovativo assinado carregado com sucesso.',
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      queryClient.invalidateQueries({ queryKey: ['leaves'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('leave.documentUploadError'))),
  })

  const handleDownloadReceipt = () => {
    pdfPrompt.requestPdf(async (lang: PdfLanguage) => {
      setDownloading('receipt')
      try {
        await api.downloadFile(
          `leave/${leave.id}/receipt.pdf`,
          `comprovativo-ausencia-${leave.id}.pdf`,
          { lang },
        )
      } catch (error) {
        toast.error(
          getApiErrorMessage(
            error,
            t('leave.receiptDownloadError', { defaultValue: 'Erro ao gerar comprovativo PDF.' }),
          ),
        )
      } finally {
        setDownloading(null)
      }
    })
  }

  const downloadStored = async (kind: 'justification' | 'signed') => {
    setDownloading(kind)
    try {
      await api.downloadFile(`leave/${leave.id}/documents/${kind}`, `ausencia-${leave.id}-${kind}`)
    } catch (error) {
      const url = kind === 'justification' ? leave.justification_document_url : leave.signed_document_url
      if (url?.startsWith('http')) {
        window.open(cloudinaryAttachmentUrl(url, `ausencia-${leave.id}-${kind}`), '_blank', 'noopener,noreferrer')
        return
      }
      toast.error(getApiErrorMessage(error, t('leave.documentDownloadError')))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        ref={signedInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) uploadMutation.mutate(file)
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        title={t('leave.downloadReceipt', { defaultValue: 'Baixar comprovativo para assinar' })}
        disabled={downloading === 'receipt'}
        onClick={handleDownloadReceipt}
      >
        {downloading === 'receipt' ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="mr-1 h-3.5 w-3.5" />
        )}
        {t('leave.receiptShort', { defaultValue: 'Comprovativo PDF' })}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        title={t('leave.uploadSignedDocument')}
        disabled={uploadMutation.isPending}
        onClick={() => signedInput.current?.click()}
      >
        {uploadMutation.isPending ? (
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1 h-3.5 w-3.5" />
        )}
        {leave.has_signed_document
          ? t('leave.replaceSignedShort', { defaultValue: 'Substituir Assinado' })
          : t('leave.uploadSignedShort', { defaultValue: 'Enviar Assinado' })}
      </Button>

      {leave.has_signed_document && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800"
          title={t('leave.downloadSignedDocument')}
          disabled={downloading === 'signed'}
          onClick={() => void downloadStored('signed')}
        >
          {downloading === 'signed' ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
          )}
          {t('leave.downloadSignedShort', { defaultValue: 'Baixar Assinado' })}
        </Button>
      )}

      {leave.has_justification_document && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          title={t('leave.downloadJustification')}
          disabled={downloading === 'justification'}
          onClick={() => void downloadStored('justification')}
        >
          {downloading === 'justification' ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1 h-3.5 w-3.5" />
          )}
          {t('leave.justification')}
        </Button>
      )}

      <PdfLanguageDialog
        open={pdfPrompt.open}
        onOpenChange={pdfPrompt.onOpenChange}
        onSelect={pdfPrompt.handleSelect}
      />
    </div>
  )
}

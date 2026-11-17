import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileDown, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api, getApiErrorMessage } from '@/lib/api'
import { cloudinaryAttachmentUrl } from '@/lib/cloudinary'
import type { Deduction } from '@/types'

const MAX_MULTIPART_SAFE_BYTES = 1_800_000

async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= MAX_MULTIPART_SAFE_BYTES) {
    return file
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const maxDim = 1600
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file)
            return
          }
          const cleanName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], cleanName, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.84,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function DeductionDocumentActions({
  deduction,
  canUpload = true,
  compact = false,
}: {
  deduction: Deduction
  canUpload?: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [downloading, setDownloading] = useState<'receipt' | 'signed' | null>(null)

  const upload = useMutation({
    mutationFn: async (rawFile: File) => {
      const file = await compressImageIfNeeded(rawFile)

      if (file.size <= MAX_MULTIPART_SAFE_BYTES) {
        try {
          const formData = new FormData()
          formData.append('document', file)
          return await api.upload(`deductions/${deduction.id}/signed-document`, formData)
        } catch (err) {
          // If server rejects multipart upload (e.g. strict PHP temp/ini limits), fall through to base64 JSON upload
          if (file.size > 5 * 1024 * 1024) {
            throw err
          }
        }
      }

      const dataUrl = await readAsDataUrl(file)
      return api.post(`deductions/${deduction.id}/signed-document`, {
        document_base64: dataUrl,
        document_name: file.name,
        document_mime: file.type,
      })
    },
    onSuccess: () => {
      toast.success(t('deductionsPage.signedDocumentUploaded', { defaultValue: 'Comprovativo assinado carregado com sucesso.' }))
      qc.invalidateQueries({ queryKey: ['deductions'] })
      qc.invalidateQueries({ queryKey: ['deductions', 'employee', deduction.employee_id] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('deductionsPage.signedDocumentError', { defaultValue: 'Erro ao carregar comprovativo assinado.' }))),
  })

  const handleDownloadReceipt = async () => {
    setDownloading('receipt')
    try {
      await api.downloadFile(`deductions/${deduction.id}/receipt.pdf`, `comprovativo-${deduction.deduction_type}-${deduction.id}.pdf`)
    } catch (e) {
      toast.error(getApiErrorMessage(e, t('deductionsPage.receiptDownloadError', { defaultValue: 'Erro ao baixar comprovativo.' })))
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadSigned = async () => {
    setDownloading('signed')
    try {
      await api.downloadFile(`deductions/${deduction.id}/signed-document`, `comprovativo-assinado-${deduction.id}`)
    } catch (e) {
      if (deduction.signed_document_url?.startsWith('http')) {
        window.open(
          cloudinaryAttachmentUrl(deduction.signed_document_url, `comprovativo-assinado-${deduction.id}`),
          '_blank',
          'noopener,noreferrer',
        )
        return
      }
      toast.error(getApiErrorMessage(e, t('deductionsPage.signedDownloadError', { defaultValue: 'Erro ao baixar documento assinado.' })))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) upload.mutate(file)
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={compact ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'}
        disabled={downloading === 'receipt'}
        onClick={handleDownloadReceipt}
        title={t('deductionsPage.downloadReceipt', { defaultValue: 'Baixar comprovativo para assinar' })}
      >
        {downloading === 'receipt' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileDown className="mr-1 h-3.5 w-3.5" />}
        {t('deductionsPage.receiptShort', { defaultValue: 'Comprovativo PDF' })}
      </Button>

      {canUpload && !deduction.has_signed_document && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'}
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
          title={t('deductionsPage.uploadSigned', { defaultValue: 'Carregar comprovativo assinado' })}
        >
          {upload.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
          {t('deductionsPage.uploadSignedShort', { defaultValue: 'Enviar Assinado' })}
        </Button>
      )}

      {deduction.has_signed_document && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={`${compact ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs'} text-emerald-700 hover:text-emerald-800`}
          disabled={downloading === 'signed'}
          onClick={handleDownloadSigned}
          title={t('deductionsPage.viewSigned', { defaultValue: 'Baixar comprovativo assinado' })}
        >
          {downloading === 'signed' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
          {t('deductionsPage.downloadSignedShort', { defaultValue: 'Baixar Assinado' })}
        </Button>
      )}
    </div>
  )
}

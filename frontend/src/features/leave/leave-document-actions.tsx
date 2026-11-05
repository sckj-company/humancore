import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { cloudinaryAttachmentUrl } from '@/lib/cloudinary'
import { Button } from '@/components/ui/button'

type DocumentKind = 'justification' | 'signed'

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
  const queryClient = useQueryClient()
  const justificationInput = useRef<HTMLInputElement>(null)
  const signedInput = useRef<HTMLInputElement>(null)
  const [uploadingKind, setUploadingKind] = useState<DocumentKind | null>(null)

  const uploadMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: DocumentKind; file: File }) => {
      const formData = new FormData()
      formData.append('document', file)
      return api.upload(`leave/${leave.id}/documents/${kind}`, formData)
    },
    onSuccess: () => {
      toast.success('Documento carregado')
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] })
      queryClient.invalidateQueries({ queryKey: ['leaves'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Erro ao carregar documento')),
    onSettled: () => setUploadingKind(null),
  })

  const download = async (kind: DocumentKind) => {
    const url = kind === 'justification' ? leave.justification_document_url : leave.signed_document_url
    if (url?.startsWith('http')) {
      window.open(cloudinaryAttachmentUrl(url, `ausencia-${leave.id}-${kind}`), '_blank', 'noopener,noreferrer')
      return
    }

    try {
      await api.downloadFile(`leave/${leave.id}/documents/${kind}`, `ausencia-${leave.id}-${kind}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Erro ao descarregar documento'))
    }
  }

  const chooseFile = (kind: DocumentKind) => {
    setUploadingKind(kind)
    if (kind === 'justification') justificationInput.current?.click()
    else signedInput.current?.click()
  }

  const uploadFile = (kind: DocumentKind, file?: File) => {
    if (file) uploadMutation.mutate({ kind, file })
    else setUploadingKind(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        ref={justificationInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(event) => {
          uploadFile('justification', event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={signedInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(event) => {
          uploadFile('signed', event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      {leave.has_justification_document ? (
        <Button type="button" variant="outline" size="sm" title="Descarregar justificativo" onClick={() => void download('justification')}>
          <Download />Justificativo
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" title="Carregar justificativo" disabled={uploadMutation.isPending} onClick={() => chooseFile('justification')}>
          {uploadMutation.isPending && uploadingKind === 'justification' ? <Loader2 className="animate-spin" /> : <Upload />}
          Justificativo
        </Button>
      )}
      {leave.has_signed_document ? (
        <Button type="button" variant="outline" size="sm" title="Descarregar documento assinado" onClick={() => void download('signed')}>
          <Download />Assinado
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" title="Carregar documento assinado" disabled={uploadMutation.isPending} onClick={() => chooseFile('signed')}>
          {uploadMutation.isPending && uploadingKind === 'signed' ? <Loader2 className="animate-spin" /> : <Upload />}
          Assinado
        </Button>
      )}
    </div>
  )
}
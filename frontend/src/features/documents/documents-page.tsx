import { useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileText, Upload, Download, Trash2, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage, type ApiResponse } from '@/lib/api'
import { cloudinaryAttachmentUrl } from '@/lib/cloudinary'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { EmployeeDocument, EmployeeSummary, Paginated } from '@/types'

const DOC_TYPES = ['id_card_front', 'id_card_back', 'id', 'contract', 'certification', 'medical', 'tax', 'bank', 'education', 'other']

export function DocumentsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isHr = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])

  const params: Record<string, string | number> = { per_page: 50 }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['documents', params],
    queryFn: () => api.get<Paginated<EmployeeDocument>>('documents', params),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('documents.title')}
        description={t('documents.description')}
        actions={isHr ? <UploadDialog refetch={refetch} /> : undefined}
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState message={t('documents.loadError')} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState
          title={t('documents.emptyTitle')}
          description={t('documents.emptyDescription')}
          action={
            isHr ? (
              <UploadDialog refetch={refetch}>
                <Button><Upload className="mr-2 h-4 w-4" /> {t('documents.upload')}</Button>
              </UploadDialog>
            ) : undefined
          }
        />
      )}

      {data && data.data.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3 font-medium">{t('documents.document')}</th>
                    {isHr && <th className="px-6 py-3 font-medium">{t('documents.employee')}</th>}
                    <th className="px-6 py-3 font-medium">{t('documents.type')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('documents.size')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('documents.expiry')}</th>
                    <th className="px-6 py-3 font-medium text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {data.data.map((d) => (
                    <tr key={d.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{d.name}</p>
                            {d.is_confidential && (
                              <Badge variant="secondary" className="mt-0.5">{t('documents.confidential')}</Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      {isHr && (
                        <td className="px-6 py-3">
                          <p className="font-medium">{d.employee?.full_name ?? `#${d.employee_id}`}</p>
                          <p className="text-xs text-muted-foreground">{d.employee?.employee_code}</p>
                        </td>
                      )}
                      <td className="px-6 py-3 text-muted-foreground">{t(`documents.types.${d.document_type}`, { defaultValue: d.document_type })}</td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">{d.size_label ?? '—'}</td>
                      <td className="px-6 py-3 text-right">
                        {d.is_expired ? (
                          <Badge className="bg-destructive/10 text-destructive" variant="secondary">{t('documents.expired')}</Badge>
                        ) : d.is_expiring ? (
                          <Badge className="bg-warning/10 text-warning" variant="secondary">{d.expiry_date}</Badge>
                        ) : d.expiry_date ? (
                          <span className="text-xs text-muted-foreground">{d.expiry_date}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <DownloadButton doc={d} />
                          {isHr && <DeleteButton doc={d} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DownloadButton({ doc }: { doc: EmployeeDocument }) {
  const { t } = useTranslation()
  const downloadMutation = useMutation({
    mutationFn: () => api.downloadFile(`documents/${doc.id}/download`, doc.original_name ?? doc.name),
    onError: (e) => toast.error(getApiErrorMessage(e, t('documents.downloadError'))),
  })
  const handleDownload = () => {
    if (doc.file_url?.includes('res.cloudinary.com')) {
      window.open(cloudinaryAttachmentUrl(doc.file_url, doc.original_name ?? doc.name), '_blank', 'noopener,noreferrer')
      return
    }
    downloadMutation.mutate()
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={t('documents.download')}
      onClick={handleDownload}
    >
      {downloadMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4 text-primary" />
      )}
    </Button>
  )
}

function DeleteButton({ doc }: { doc: EmployeeDocument }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.delete(`documents/${doc.id}`),
    onSuccess: () => {
      toast.success(t('documents.deleted'))
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('documents.deleteError'))),
  })

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={t('common.delete')}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
    </Button>
  )
}

function UploadDialog({
  refetch,
  children,
}: {
  refetch?: () => void
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [name, setName] = useState('')
  const [docType, setDocType] = useState('certification')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isConfidential, setIsConfidential] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get<Paginated<EmployeeSummary>>('employees', { per_page: 200 }),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('employee_id', employeeId)
      form.append('name', name)
      form.append('document_type', docType)
      if (expiryDate) form.append('expiry_date', expiryDate)
      if (notes) form.append('notes', notes)
      form.append('is_confidential', String(isConfidential))
      if (file) form.append('file', file)
      return api.upload<ApiResponse<EmployeeDocument>>('documents', form, setProgress)
    },
    onSuccess: () => {
      toast.success(t('documents.uploaded'))
      setOpen(false)
      reset()
      refetch?.()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('documents.uploadError'))),
  })

  const reset = () => {
    setEmployeeId('')
    setName('')
    setDocType('certification')
    setExpiryDate('')
    setNotes('')
    setIsConfidential(false)
    setFile(null)
    setProgress(0)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    if (e.target.files?.[0] && !name) {
      setName(e.target.files[0].name.replace(/\.[^.]+$/, ''))
    }
  }

  const submit = () => {
    if (!file) {
      toast.warning(t('documents.selectFile'))
      return
    }
    if (!employeeId) {
      toast.warning(t('documents.selectEmployee'))
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button>
          <Upload className="mr-2 h-4 w-4" /> {t('documents.upload')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('documents.upload')}</DialogTitle>
          <DialogDescription>{t('documents.uploadDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('documents.employee')}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder={t('documents.selectEmployee')} />
              </SelectTrigger>
              <SelectContent>
                {employees?.data.map((emp) => (
                  <SelectItem key={emp.id} value={String(emp.id)}>
                    {emp.full_name} ({emp.employee_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('documents.documentName')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('documents.documentNameExample')} />
            </div>
            <div className="space-y-2">
              <Label>{t('documents.type')}</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt}>{t(`documents.types.${dt}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('documents.file')}</Label>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-center transition-colors hover:bg-muted/30">
              <Paperclip className="h-6 w-6 text-muted-foreground" />
              {file ? (
                <span className="text-sm font-medium">{file.name}</span>
              ) : (
                <span className="text-sm text-muted-foreground">{t('documents.chooseFileDescription')}</span>
              )}
              <input type="file" className="hidden" onChange={onFileChange} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('documents.expiry')}</Label>
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={isConfidential}
                  onChange={(e) => setIsConfidential(e.target.checked)}
                />
                {t('documents.confidential')}
              </label>
            </div>
          </div>
          {notes && (
            <div className="space-y-2">
              <Label>{t('common.notes')}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          )}
          {mutation.isPending && <Progress value={progress} className="w-full" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {t('documents.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

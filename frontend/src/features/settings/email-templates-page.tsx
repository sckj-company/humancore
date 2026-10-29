import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Mail, Plus, Pencil, Trash2, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, EmptyState, ErrorState, LoadingState } from '@/components/shared/page-header'
import type { EmailTemplate, EmailTemplateEvent } from '@/types'
import {
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  useEmailTemplates,
  usePreviewEmailTemplate,
  useUpdateEmailTemplate,
} from './api'

const EVENT_OPTIONS: { value: EmailTemplateEvent | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'emailTemplates.events.all' },
  { value: 'employee_created', labelKey: 'emailTemplates.events.employee_created' },
  { value: 'leave_approved', labelKey: 'emailTemplates.events.leave_approved' },
  { value: 'payslip_available', labelKey: 'emailTemplates.events.payslip_available' },
  { value: 'contract_expiring', labelKey: 'emailTemplates.events.contract_expiring' },
  { value: 'custom', labelKey: 'emailTemplates.events.custom' },
]

interface TemplateFormState {
  name: string
  code: string
  event: string
  subject: string
  body: string
  is_active: boolean
}

const emptyForm: TemplateFormState = {
  name: '',
  code: '',
  event: 'custom',
  subject: '',
  body: '',
  is_active: true,
}

export function EmailTemplatesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user, 'create_email-template') : false

  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null)
  const [previewTarget, setPreviewTarget] = useState<EmailTemplate | null>(null)

  const { data, isLoading, isError, refetch } = useEmailTemplates({
    search: search || undefined,
    event: eventFilter === 'all' ? undefined : (eventFilter as EmailTemplateEvent),
  })

  const deleteMutation = useDeleteEmailTemplate()
  const previewMutation = usePreviewEmailTemplate()

  const rows = data?.data ?? []

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('common.success'))
        setDeleteTarget(null)
      },
      onError: (e) => toast.error(t('emailTemplates.error')),
    })
  }

  const openPreview = (template: EmailTemplate) => {
    setPreviewTarget(template)
    previewMutation.mutate({ id: template.id })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('emailTemplates.eyebrow')}
        title={t('emailTemplates.title')}
        description={t('emailTemplates.description')}
        actions={
          canManage ? (
            <Button onClick={() => setEditTarget(null)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('emailTemplates.newTemplate')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder={t('emailTemplates.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {EVENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {isError && <ErrorState message={t('emailTemplates.error')} onRetry={refetch} />}
      {isLoading && <LoadingState />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState
          icon={<Mail className="h-6 w-6 text-muted-foreground" />}
          title={t('emailTemplates.empty')}
          description={t('emailTemplates.emptyDescription')}
          action={
            canManage ? (
              <Button onClick={() => setEditTarget(null)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('emailTemplates.newTemplate')}
              </Button>
            ) : undefined
          }
        />
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{t('emailTemplates.name')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('emailTemplates.code')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('emailTemplates.event')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('emailTemplates.subject')}</th>
                <th className="px-4 py-3 text-left font-medium">{t('emailTemplates.status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tpl) => (
                <tr key={tpl.id} className="border-t transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{tpl.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{tpl.code}</td>
                  <td className="px-4 py-3">{tpl.event_label || '—'}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{tpl.subject}</td>
                  <td className="px-4 py-3">
                    {tpl.is_active ? (
                      <Badge variant="success">{t('emailTemplates.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('emailTemplates.inactive')}</Badge>
                    )}
                    {tpl.is_system && (
                      <Badge variant="info" className="ml-1">
                        {t('emailTemplates.system')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('emailTemplates.preview')} onClick={() => openPreview(tpl)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage && !tpl.is_system && (
                        <>
                          <Button variant="ghost" size="icon" title={t('common.edit')} onClick={() => setEditTarget(tpl)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={t('common.delete')} onClick={() => setDeleteTarget(tpl)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TemplateFormDialog
        editing={editTarget !== null ? undefined : editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('emailTemplates.deleteConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTarget} onOpenChange={(open) => !open && setPreviewTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              {t('emailTemplates.preview')}
            </DialogTitle>
          </DialogHeader>
          {previewMutation.isPending ? (
            <p className="text-sm text-muted-foreground">…</p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>{t('emailTemplates.subject')}</Label>
                <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm">{previewMutation.data?.subject ?? '—'}</p>
              </div>
              <div>
                <Label>{t('emailTemplates.body')}</Label>
                <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-sans text-sm">
                  {previewMutation.data?.body ?? '—'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateFormDialog({
  editing,
  open,
  onOpenChange,
}: {
  editing?: EmailTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState<TemplateFormState>(emptyForm)

  const createMutation = useCreateEmailTemplate()
  const updateMutation = useUpdateEmailTemplate()

  const handleOpen = (next: boolean) => {
    if (next && editing) {
      setForm({
        name: editing.name,
        code: editing.code,
        event: editing.event ?? 'custom',
        subject: editing.subject,
        body: editing.body,
        is_active: editing.is_active,
      })
    } else if (next) {
      setForm(emptyForm)
    }
    onOpenChange(next)
  }

  const save = () => {
    const payload: Partial<EmailTemplate> = {
      name: form.name,
      code: form.code,
      event: form.event as EmailTemplateEvent,
      subject: form.subject,
      body: form.body,
      is_active: form.is_active,
    }
    if (editing) {
      const { code: _code, ...rest } = payload
      updateMutation.mutate(
        { id: editing.id, data: rest },
        {
          onSuccess: () => {
            toast.success(t('common.success'))
            qc.invalidateQueries({ queryKey: ['email-templates'] })
            onOpenChange(false)
          },
          onError: () => toast.error(t('emailTemplates.error')),
        },
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('common.success'))
          qc.invalidateQueries({ queryKey: ['email-templates'] })
          onOpenChange(false)
        },
        onError: () => toast.error(t('emailTemplates.error')),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            {editing ? t('emailTemplates.editTemplate') : t('emailTemplates.newTemplate')}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('emailTemplates.name')}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('emailTemplates.code')}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })}
                disabled={!!editing}
                placeholder="welcome_email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('emailTemplates.event')}</Label>
            <select
              value={form.event}
              onChange={(e) => setForm({ ...form, event: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {EVENT_OPTIONS.filter((o) => o.value !== 'all').map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('emailTemplates.subject')}</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('emailTemplates.body')}</Label>
            <Textarea rows={8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              {'{{employee_name}}'} · {'{{company_name}}'} · {'{{period_name}}'} · {'{{amount}}'} · {'{{link}}'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>{t('emailTemplates.active')}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={save}
            disabled={createMutation.isPending || updateMutation.isPending || !form.name || !form.code || !form.subject || !form.body}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

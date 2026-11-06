import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Filter,
  Eye,
  Activity,
  Plus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader, ErrorState } from '@/components/shared/page-header'
import { DataTable } from '@/components/data/data-table'
import { api } from '@/lib/api'
import type { Paginated } from '@/types'

interface AuditLog {
  id: number
  user: { id: number; name: string; email: string } | null
  event: string
  auditable_type: string
  auditable_id: number
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

const eventVariant: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
  created: 'success',
  updated: 'warning',
  deleted: 'destructive',
  restored: 'info',
  login: 'info',
  logout: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  processed: 'info',
  closed: 'secondary',
}

const eventIcons: Record<string, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  login: LogIn,
  logout: LogOut,
  approved: Activity,
  rejected: Activity,
}

export function AuditPage() {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [event, setEvent] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selected, setSelected] = useState<AuditLog | null>(null)

  const params: Record<string, string | number> = { per_page: 30 }
  if (event !== 'all') params.event = event
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  if (search) params.auditable_type = search

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audits', params],
    queryFn: () => api.get<Paginated<AuditLog>>('audits', params),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('audit.eyebrow')}
        title={t('audit.title')}
        description={t('audit.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            {t('audit.filters')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>{t('audit.resource')}</Label>
              <Input
                placeholder={t('audit.resourcePlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('audit.event')}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              >
                <option value="all">{t('common.all')}</option>
                <option value="created">{t('audit.events.created')}</option>
                <option value="updated">{t('audit.events.updated')}</option>
                <option value="deleted">{t('audit.events.deleted')}</option>
                <option value="login">{t('audit.events.login')}</option>
                <option value="logout">{t('audit.events.logout')}</option>
                <option value="approved">{t('audit.events.approved')}</option>
                <option value="rejected">{t('audit.events.rejected')}</option>
                <option value="processed">{t('audit.events.processed')}</option>
                <option value="closed">{t('audit.events.closed')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.from')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.to')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isError && <ErrorState message={t('audit.loadError')} onRetry={refetch} />}

      <DataTable
        data={data?.data ?? []}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        columns={[
          {
            id: 'user',
            header: t('audit.user'),
            cell: (r) => (
              <div>
                <p className="font-medium">{r.user?.name ?? t('audit.system')}</p>
                {r.user && <p className="text-xs text-muted-foreground">{r.user.email}</p>}
              </div>
            ),
          },
          {
            id: 'event',
            header: t('audit.event'),
            cell: (r) => {
              const Icon = eventIcons[r.event] ?? Settings
              return (
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant={eventVariant[r.event] ?? 'secondary'}>{t(`audit.events.${r.event}`, { defaultValue: r.event })}</Badge>
                </div>
              )
            },
          },
          {
            id: 'resource',
            header: t('audit.resource'),
            cell: (r) => (
              <span className="font-mono text-xs">
                {r.auditable_type}#{r.auditable_id}
              </span>
            ),
          },
          {
            id: 'ip',
            header: 'IP',
            cell: (r) => <span className="font-mono text-xs">{r.ip_address ?? '—'}</span>,
          },
          {
            id: 'date',
            header: t('common.date'),
            cell: (r) => (
              <span className="text-sm text-muted-foreground">
                {new Date(r.created_at).toLocaleString(i18n.language)}
              </span>
            ),
          },
          {
            id: 'actions',
            header: t('common.actions'),
            align: 'right',
            cell: (r) => (
              <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                {t('common.details')}
              </Button>
            ),
          },
        ]}
        emptyTitle={t('audit.emptyTitle')}
        emptyDescription={t('audit.emptyDescription')}
      />

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('audit.detailsTitle')}</DialogTitle>
            <DialogDescription>
              {selected?.user?.name ?? t('audit.system')} • {t(`audit.events.${selected?.event}`, { defaultValue: selected?.event })} • {selected?.auditable_type}#{selected?.auditable_id}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">{t('audit.dateTime')}</Label>
                  <p className="text-sm">{new Date(selected.created_at).toLocaleString(i18n.language)}</p>
                </div>
                <div>
                  <Label className="text-xs">IP</Label>
                  <p className="font-mono text-sm">{selected.ip_address ?? '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">{t('audit.userAgent')}</Label>
                  <p className="text-xs text-muted-foreground break-all">{selected.user_agent ?? '—'}</p>
                </div>
              </div>

              {selected.old_values && (
                <div>
                  <Label className="text-xs text-destructive">{t('audit.oldValues')}</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-destructive/5 p-3 text-xs">
                    {JSON.stringify(selected.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selected.new_values && (
                <div>
                  <Label className="text-xs text-success">{t('audit.newValues')}</Label>
                  <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-success/5 p-3 text-xs">
                    {JSON.stringify(selected.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

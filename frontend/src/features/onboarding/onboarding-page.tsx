import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, ListChecks, ClipboardList, UserPlus, CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PageHeader, LoadingState, EmptyState, ErrorState } from '@/components/shared/page-header'
import type { OnboardingTemplate, OnboardingTask, Paginated } from '@/types'

export function OnboardingPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canCreate = hasPermission(user, 'create_training')
  const canUpdate = hasPermission(user, 'update_training')

  const [tab, setTab] = useState<'templates' | 'tasks'>('templates')

  const templates = useQuery({
    queryKey: ['onboarding', 'templates'],
    queryFn: () => api.get<Paginated<OnboardingTemplate>>('onboarding/templates', { per_page: 30 }),
  })

  const tasks = useQuery({
    queryKey: ['onboarding', 'tasks'],
    queryFn: () => api.get<Paginated<OnboardingTask>>('onboarding/tasks', { per_page: 50 }),
    enabled: tab === 'tasks',
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('onboarding.title')}
        description={t('onboarding.description')}
        actions={
          canCreate ? (
            tab === 'templates' ? (
              <NewTemplateDialog onCreated={() => templates.refetch()} />
            ) : (
              <NewTaskDialog onCreated={() => tasks.refetch()} />
            )
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'templates' | 'tasks')}>
        <TabsList>
          <TabsTrigger value="templates">
            <ListChecks className="mr-2 h-3.5 w-3.5" /> {t('onboarding.tabs.templates')} ({templates.data?.meta?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ClipboardList className="mr-2 h-3.5 w-3.5" /> {t('onboarding.tabs.tasks')} ({tasks.data?.meta?.total ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-3">
          {templates.isLoading ? (
            <LoadingState />
          ) : templates.isError ? (
            <ErrorState message={t('onboarding.error')} onRetry={templates.refetch} />
          ) : (templates.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('onboarding.empty')} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.data?.data?.map((tpl) => (
                <TemplateCard key={tpl.id} template={tpl} canUpdate={canUpdate} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-3">
          {tasks.isLoading ? (
            <LoadingState />
          ) : tasks.isError ? (
            <ErrorState message={t('onboarding.error')} onRetry={tasks.refetch} />
          ) : (tasks.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('onboarding.empty')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                        <th className="px-4 py-3 font-medium">{t('onboarding.task.title')}</th>
                        <th className="px-4 py-3 font-medium">{t('onboarding.task.employee')}</th>
                        <th className="px-4 py-3 font-medium">{t('onboarding.task.due_days')}</th>
                        <th className="px-4 py-3 font-medium">{t('onboarding.task.status')}</th>
                        <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.data?.data?.map((tk) => (
                        <TaskRow key={tk.id} task={tk} canUpdate={canUpdate} onChange={() => tasks.refetch()} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TemplateCard({ template, canUpdate }: { template: OnboardingTemplate; canUpdate: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [assignOpen, setAssignOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')

  const remove = useMutation({
    mutationFn: () => api.delete(`onboarding/templates/${template.id}`),
    onSuccess: () => {
      toast.success(t('recruitment.deleted'))
      qc.invalidateQueries({ queryKey: ['onboarding', 'templates'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('onboarding.error'))),
  })

  const assign = useMutation({
    mutationFn: () => api.post<{ assigned: number }>(`onboarding/templates/${template.id}/assign`, { employee_id: Number(employeeId) }),
    onSuccess: (data) => {
      toast.success(`${t('recruitment.saved')}: ${data.assigned ?? 0}`)
      setAssignOpen(false)
      setEmployeeId('')
      qc.invalidateQueries({ queryKey: ['onboarding', 'tasks'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('onboarding.error'))),
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{template.name}</CardTitle>
            {template.description && (
              <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
            )}
          </div>
          <Badge variant={template.is_active ? 'success' : 'secondary'}>
            {template.is_active ? t('onboarding.template.is_active') : '—'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {template.tasks_count ?? template.tasks?.length ?? 0} {t('onboarding.template.tasks').toLowerCase()}
        </div>
        {canUpdate && (
          <div className="flex gap-2">
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  {t('onboarding.task.assignTo')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{template.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label>{t('onboarding.task.employee')} ID</Label>
                  <Input type="number" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAssignOpen(false)}>{t('common.cancel')}</Button>
                  <Button onClick={() => assign.mutate()} disabled={!employeeId || assign.isPending}>
                    {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common.save')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskRow({ task, canUpdate, onChange }: { task: OnboardingTask; canUpdate: boolean; onChange: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const complete = useMutation({
    mutationFn: () => api.post(`onboarding/tasks/${task.id}/complete`),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      qc.invalidateQueries({ queryKey: ['onboarding', 'tasks'] })
      onChange()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('onboarding.error'))),
  })

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-medium">{task.title}</td>
      <td className="px-4 py-3 text-muted-foreground">{task.employee?.full_name ?? '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{task.due_days}d</td>
      <td className="px-4 py-3"><Badge variant={task.status_variant}>{task.status_label}</Badge></td>
      <td className="px-4 py-3 text-right">
        {canUpdate && task.status !== 'completed' && (
          <Button size="sm" variant="ghost" onClick={() => complete.mutate()} disabled={complete.isPending}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {t('onboarding.task.complete')}
          </Button>
        )}
      </td>
    </tr>
  )
}

function NewTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState<{ title: string; due_days: number }[]>([
    { title: '', due_days: 7 },
  ])

  const create = useMutation({
    mutationFn: () =>
      api.post('onboarding/templates', {
        name,
        description: description || null,
        is_active: true,
        tasks: tasks.filter((t) => t.title.trim()).map((tk, i) => ({ ...tk, sort_order: i })),
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setName('')
      setDescription('')
      setTasks([{ title: '', due_days: 7 }])
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('onboarding.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('onboarding.newTemplate')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('onboarding.newTemplate')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('onboarding.template.name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('onboarding.template.description')}</Label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('onboarding.template.tasks')}</Label>
              <Button size="sm" variant="outline" onClick={() => setTasks([...tasks, { title: '', due_days: 7 }])}>
                <Plus className="h-3 w-3" /> {t('onboarding.template.addTask')}
              </Button>
            </div>
            {tasks.map((tk, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={tk.title}
                  onChange={(e) => setTasks(tasks.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                  placeholder={t('onboarding.task.title')}
                />
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={tk.due_days}
                  onChange={(e) => setTasks(tasks.map((x, i) => (i === idx ? { ...x, due_days: Number(e.target.value) } : x)))}
                />
                {tasks.length > 1 && (
                  <Button size="icon" variant="ghost" onClick={() => setTasks(tasks.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewTaskDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', employee_id: '', due_days: '7' })

  const create = useMutation({
    mutationFn: () =>
      api.post('onboarding/tasks', {
        title: form.title,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        due_days: Number(form.due_days) || 7,
      }),
    onSuccess: () => {
      toast.success(t('recruitment.saved'))
      setOpen(false)
      setForm({ title: '', employee_id: '', due_days: '7' })
      onCreated()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('onboarding.error'))),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('onboarding.newTask')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('onboarding.newTask')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('onboarding.task.title')} *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('onboarding.task.employee')} ID</Label>
              <Input type="number" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('onboarding.task.due_days')}</Label>
              <Input type="number" min={0} value={form.due_days} onChange={(e) => setForm({ ...form, due_days: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => create.mutate()} disabled={!form.title || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

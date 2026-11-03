import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Ban, Check, CircleAlert, Download, FileCheck2, ListPlus, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableAction } from '@/components/data/data-table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader, ErrorState, LoadingState } from '@/components/shared/page-header'
import type {
  SalaryComponentRegulation,
  SalaryComponentRegulationStatus,
  SalaryComponentSummary,
  SalaryIncidence,
} from '@/types'

interface RegulationIndex {
  components: SalaryComponentSummary[]
  regulations: SalaryComponentRegulation[]
}

interface RegulationRow {
  id: string
  component: SalaryComponentSummary
  regulation: SalaryComponentRegulation | null
}

interface RegulationForm {
  regime_code: string
  effective_from: string
  effective_to: string
  employee_inss_applicable: string
  employer_inss_applicable: string
  irt_applicable: string
  legal_reference: string
}

interface SalaryComponentForm {
  name: string
  code: string
  type: string
  calculation_type: string
}

const emptyForm = (): RegulationForm => ({
  regime_code: 'standard',
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: '',
  employee_inss_applicable: 'unknown',
  employer_inss_applicable: 'unknown',
  irt_applicable: 'unknown',
  legal_reference: '',
})

const emptyComponentForm = (): SalaryComponentForm => ({
  name: '',
  code: '',
  type: 'earning',
  calculation_type: 'fixed',
})

const applicabilityOptions = ['unknown', 'yes', 'no'] as const

function encodeIncidence(value: string): SalaryIncidence {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function incidenceFormValue(value: string): string {
  const incidence = encodeIncidence(value)
  return incidence === null ? '' : incidence ? '1' : '0'
}

function decodeIncidence(value: SalaryIncidence): string {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return 'unknown'
}

function statusVariant(status: SalaryComponentRegulationStatus | 'unconfigured'): 'default' | 'secondary' | 'warning' | 'destructive' {
  if (status === 'active') return 'default'
  if (status === 'validated') return 'warning'
  if (status === 'revoked') return 'destructive'
  return 'secondary'
}

export function SalaryComponentRegulationsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.user)
  const canView = hasPermission(user, 'view_any_salary-component')
  const canCreate = hasPermission(user, 'create_salary-component')
  const canUpdate = hasPermission(user, 'update_salary-component')
  const canConfigure = hasPermission(user, 'configure_salary-component')
  const canDeleteDraft = hasPermission(user, 'delete_salary-component') || canConfigure
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedComponent, setSelectedComponent] = useState<SalaryComponentSummary | null>(null)
  const [editingRegulation, setEditingRegulation] = useState<SalaryComponentRegulation | null>(null)
  const [form, setForm] = useState<RegulationForm>(emptyForm)
  const [legalDocument, setLegalDocument] = useState<File | null>(null)
  const [componentDialogOpen, setComponentDialogOpen] = useState(false)
  const [componentForm, setComponentForm] = useState<SalaryComponentForm>(emptyComponentForm)

  const query = useQuery({
    queryKey: ['payroll', 'salary-component-regulations'],
    queryFn: () => api.get<RegulationIndex>('payroll/salary-component-regulations'),
    enabled: canView,
  })

  const rows = useMemo<RegulationRow[]>(() => {
    if (!query.data) return []

    return query.data.components.flatMap<RegulationRow>((component) => {
      const componentRules = query.data.regulations.filter((rule) => rule.salary_component_id === component.id)
      if (componentRules.length === 0) {
        return [{ id: `component-${component.id}`, component, regulation: null }]
      }
      return componentRules.map((regulation) => ({
        id: `regulation-${regulation.id}`,
        component,
        regulation,
      }))
    })
  }, [query.data])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = {
        effective_from: form.effective_from,
        effective_to: form.effective_to,
        employee_inss_applicable: incidenceFormValue(form.employee_inss_applicable),
        employer_inss_applicable: incidenceFormValue(form.employer_inss_applicable),
        irt_applicable: incidenceFormValue(form.irt_applicable),
        legal_reference: form.legal_reference,
      }

      const formData = new FormData()
      Object.entries(payload).forEach(([key, value]) => formData.append(key, value))
      if (legalDocument) formData.append('legal_document', legalDocument)

      if (editingRegulation) {
        formData.append('_method', 'PUT')
        return api.upload<SalaryComponentRegulation>(`payroll/salary-component-regulations/${editingRegulation.id}`, formData)
      }

      formData.append('salary_component_id', String(selectedComponent?.id ?? ''))
      formData.append('country_code', 'AO')
      formData.append('regime_code', form.regime_code)
      return api.upload<SalaryComponentRegulation>('payroll/salary-component-regulations', formData)
    },
    onSuccess: () => {
      toast.success(t(editingRegulation ? 'salaryRegulations.updated' : 'salaryRegulations.created'))
      setDialogOpen(false)
      setLegalDocument(null)
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

  const initializeAngola = useMutation({
    mutationFn: () => api.post<{ components_created: number; draft_regulations_created: number }>(
      'payroll/salary-component-regulations/initialize-angola',
    ),
    onSuccess: (result) => {
      toast.success(t('salaryRegulations.initialized', result))
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

  const createComponent = useMutation({
    mutationFn: () => api.post<SalaryComponentSummary>('payroll/salary-components', componentForm),
    onSuccess: () => {
      toast.success(t('salaryRegulations.componentCreated'))
      setComponentDialogOpen(false)
      setComponentForm(emptyComponentForm())
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

  const removeDraft = useMutation({
    mutationFn: (id: number) => api.delete(`payroll/salary-component-regulations/${id}`),
    onSuccess: () => {
      toast.success(t('salaryRegulations.deleted'))
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

  const revokeRule = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`payroll/salary-component-regulations/${id}/revoke`, { reason }),
    onSuccess: () => {
      toast.success(t('salaryRegulations.revoked'))
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

            {canCreate && (
              <Button
                variant="outline"
                onClick={() => initializeAngola.mutate()}
                disabled={initializeAngola.isPending}
              >
                <ListPlus className="mr-2 h-4 w-4" />
                {t('salaryRegulations.initializeAngola')}
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" onClick={() => setComponentDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('salaryRegulations.addComponent')}
              </Button>
            )}
  const action = useMutation({
    mutationFn: ({ id, operation }: { id: number; operation: 'validate' | 'activate' }) =>
      api.post<SalaryComponentRegulation>(`payroll/salary-component-regulations/${id}/${operation}`),
    onSuccess: (_result, variables) => {
      toast.success(t(`salaryRegulations.${variables.operation === 'validate' ? 'validated' : 'activated'}`))
      queryClient.invalidateQueries({ queryKey: ['payroll', 'salary-component-regulations'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('salaryRegulations.formError'))),
  })

  const openNew = (component: SalaryComponentSummary) => {
    setSelectedComponent(component)
    setEditingRegulation(null)
    setForm(emptyForm())
    setLegalDocument(null)
    setDialogOpen(true)
  }

  const openDraft = (row: RegulationRow) => {
    if (!row.regulation) return
    setSelectedComponent(row.component)
    setEditingRegulation(row.regulation)
    setForm({
      regime_code: row.regulation.regime_code,
      effective_from: row.regulation.effective_from,
      effective_to: row.regulation.effective_to ?? '',
      employee_inss_applicable: decodeIncidence(row.regulation.employee_inss_applicable),
      employer_inss_applicable: decodeIncidence(row.regulation.employer_inss_applicable),
      irt_applicable: decodeIncidence(row.regulation.irt_applicable),
      legal_reference: row.regulation.legal_reference ?? '',
    })
    setLegalDocument(null)
    setDialogOpen(true)
  }

  const actions: DataTableAction<RegulationRow>[] = [
    ...(canCreate
      ? [{
          label: t('salaryRegulations.newRule'),
          icon: <Plus className="h-4 w-4" />,
          onClick: (row: RegulationRow) => openNew(row.component),
        }]
      : []),
    ...(canUpdate
      ? [{
          label: t('salaryRegulations.editDraft'),
          icon: <FileCheck2 className="h-4 w-4" />,
          hidden: (row: RegulationRow) => row.regulation?.status !== 'draft',
          onClick: openDraft,
        }]
      : []),
    ...(canConfigure
      ? [
          {
            label: t('salaryRegulations.validate'),
            icon: <ShieldCheck className="h-4 w-4" />,
            hidden: (row: RegulationRow) => row.regulation?.status !== 'draft',
            onClick: (row: RegulationRow) => row.regulation && action.mutate({ id: row.regulation.id, operation: 'validate' }),
          },
          {
            label: t('salaryRegulations.activate'),
            icon: <Check className="h-4 w-4" />,
            hidden: (row: RegulationRow) => row.regulation?.status !== 'validated',
            onClick: (row: RegulationRow) => {
              if (row.regulation && window.confirm(t('salaryRegulations.activateConfirm'))) {
                action.mutate({ id: row.regulation.id, operation: 'activate' })
              }
            },
          },
        ]
      : []),
    ...(canDeleteDraft
      ? [{
          label: t('salaryRegulations.deleteDraft'),
          icon: <Trash2 className="h-4 w-4" />,
          destructive: true,
          hidden: (row: RegulationRow) => row.regulation?.status !== 'draft',
          onClick: (row: RegulationRow) => {
            if (row.regulation && window.confirm(t('salaryRegulations.deleteDraftConfirm'))) {
              removeDraft.mutate(row.regulation.id)
            }
          },
        }]
      : []),
    ...(canConfigure
      ? [{
          label: t('salaryRegulations.revoke'),
          icon: <Ban className="h-4 w-4" />,
          destructive: true,
          hidden: (row: RegulationRow) => !['active', 'validated'].includes(row.regulation?.status ?? ''),
          onClick: (row: RegulationRow) => {
            if (!row.regulation) return
            const reason = window.prompt(t('salaryRegulations.revokeReason'))
            if (reason?.trim()) revokeRule.mutate({ id: row.regulation.id, reason: reason.trim() })
          },
        }]
      : []),
  ]

  if (!canView) {
    return <ErrorState message={t('salaryRegulations.noPermission')} onRetry={() => {}} />
  }

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <ErrorState message={t('salaryRegulations.error')} onRetry={query.refetch} />

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('settings.title')}
        title={t('salaryRegulations.title')}
        description={t('salaryRegulations.description')}
        actions={(
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button variant="outline" onClick={() => initializeAngola.mutate()} disabled={initializeAngola.isPending}>
                <ListPlus className="mr-2 h-4 w-4" />{t('salaryRegulations.initializeAngola')}
              </Button>
            )}
            {canCreate && (
              <Button variant="outline" onClick={() => setComponentDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />{t('salaryRegulations.addComponent')}
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/settings"><ArrowLeft className="mr-2 h-4 w-4" />{t('common.back')}</Link>
            </Button>
          </div>
        )}
      />


      <SalaryComponentDialog
        open={componentDialogOpen}
        form={componentForm}
        saving={createComponent.isPending}
        onOpenChange={setComponentDialogOpen}
        onChange={setComponentForm}
        onSave={() => createComponent.mutate()}
      />
      <div className="flex items-start gap-3 border-l-4 border-warning bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p>{t('salaryRegulations.legalNotice')}</p>
      </div>

      <DataTable
        data={rows}
        isLoading={query.isLoading}
        rowKey={(row) => row.id}
        emptyTitle={t('salaryRegulations.empty')}
        emptyDescription={t('salaryRegulations.emptyDescription')}
        actions={actions.length > 0 ? actions : undefined}
        columns={[
          {
            id: 'component',
            header: t('salaryRegulations.component'),
            accessor: (row) => row.component.name,
            sortable: true,
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{row.component.name}</p>
                <p className="text-xs text-muted-foreground">{row.component.code} · {row.component.type}</p>
              </div>
            ),
          },
          {
            id: 'version',
            header: t('salaryRegulations.version'),
            accessor: (row) => row.regulation?.version ?? 0,
            sortable: true,
            cell: (row) => row.regulation ? `v${row.regulation.version} · ${row.regulation.regime_code}` : '—',
          },
          {
            id: 'status',
            header: t('salaryRegulations.status'),
            cell: (row) => {
              const status = row.regulation?.status ?? 'unconfigured'
              return (
                <div className="space-y-1">
                  <Badge variant={statusVariant(status)}>{t(`salaryRegulations.statuses.${status}`)}</Badge>
                  {status === 'revoked' && row.regulation?.revocation_reason && (
                    <p className="max-w-[200px] text-xs text-muted-foreground" title={row.regulation.revocation_reason}>
                      {row.regulation.revocation_reason}
                    </p>
                  )}
                </div>
              )
            },
          },
          {
            id: 'incidences',
            header: t('salaryRegulations.incidences'),
            cell: (row) => row.regulation ? (
              <div className="space-y-1 text-xs">
                <IncidenceValue label={t('salaryRegulations.employeeInss')} value={row.regulation.employee_inss_applicable} />
                <IncidenceValue label={t('salaryRegulations.employerInss')} value={row.regulation.employer_inss_applicable} />
                <IncidenceValue label={t('salaryRegulations.irt')} value={row.regulation.irt_applicable} />
              </div>
            ) : <span className="text-muted-foreground">—</span>,
          },
          {
            id: 'period',
            header: t('salaryRegulations.period'),
            accessor: (row) => row.regulation?.effective_from ?? '',
            sortable: true,
            cell: (row) => row.regulation ? (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {row.regulation.effective_from} – {row.regulation.effective_to ?? '∞'}
              </span>
            ) : '—',
          },
          {
            id: 'source',
            header: t('salaryRegulations.legalBasis'),
            cell: (row) => row.regulation ? (
              <div className="max-w-[240px]">
                {row.regulation.legal_document_name ? (
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1 text-left text-primary hover:underline"
                    onClick={() => api.downloadFile(
                      `payroll/salary-component-regulations/${row.regulation!.id}/document`,
                      row.regulation!.legal_document_name ?? undefined,
                    ).catch((error: unknown) => toast.error(getApiErrorMessage(error, t('salaryRegulations.documentDownloadError'))))}
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-sm">{row.regulation.legal_document_name}</span>
                  </button>
                ) : <p className="text-sm text-muted-foreground">{t('salaryRegulations.noDocument')}</p>}
                <p className="truncate text-xs text-muted-foreground">{row.regulation.legal_reference || ''}</p>
              </div>
            ) : '—',
          },
        ]}
      />

      <RegulationDialog
        open={dialogOpen}
        component={selectedComponent}
        editing={editingRegulation !== null}
        form={form}
        legalDocument={legalDocument}
        saving={save.isPending}
        onOpenChange={setDialogOpen}
        onChange={setForm}
        onFileChange={setLegalDocument}
        onSave={() => save.mutate()}
      />
    </div>
  )
}

function IncidenceValue({ label, value }: { label: string; value: SalaryIncidence }) {
  const { t } = useTranslation()
  const text = value === null ? 'unknown' : value ? 'yes' : 'no'

  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className={value === null ? 'text-warning' : 'text-foreground'}>
        {t(`salaryRegulations.applicability.${text}`)}
      </span>
    </div>
  )
}

function RegulationDialog({
  open,
  component,
  editing,
  form,
  legalDocument,
  saving,
  onOpenChange,
  onChange,
  onFileChange,
  onSave,
}: {
  open: boolean
  component: SalaryComponentSummary | null
  editing: boolean
  form: RegulationForm
  legalDocument: File | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChange: (form: RegulationForm) => void
  onFileChange: (file: File | null) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const setField = <K extends keyof RegulationForm>(key: K, value: RegulationForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t('salaryRegulations.editDraft') : t('salaryRegulations.newRule')}</DialogTitle>
          {component && <p className="text-sm text-muted-foreground">{component.name} · {component.code}</p>}
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="regime-code">{t('salaryRegulations.regime')}</Label>
            <Input id="regime-code" value={form.regime_code} disabled={editing} onChange={(event) => setField('regime_code', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('salaryRegulations.countryCode')}</Label>
            <Input value="AO" disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effective-from">{t('salaryRegulations.effectiveFrom')} *</Label>
            <Input id="effective-from" type="date" value={form.effective_from} onChange={(event) => setField('effective_from', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effective-to">{t('salaryRegulations.effectiveTo')}</Label>
            <Input id="effective-to" type="date" min={form.effective_from} value={form.effective_to} onChange={(event) => setField('effective_to', event.target.value)} />
          </div>
          <ApplicabilityField label={t('salaryRegulations.employeeInss')} value={form.employee_inss_applicable} onChange={(value) => setField('employee_inss_applicable', value)} />
          <ApplicabilityField label={t('salaryRegulations.employerInss')} value={form.employer_inss_applicable} onChange={(value) => setField('employer_inss_applicable', value)} />
          <ApplicabilityField label={t('salaryRegulations.irt')} value={form.irt_applicable} onChange={(value) => setField('irt_applicable', value)} />
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legal-document">{t('salaryRegulations.source')}</Label>
            <Input
              id="legal-document"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">{legalDocument?.name ?? t('salaryRegulations.documentOptional')}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="legal-reference">{t('salaryRegulations.reference')}</Label>
            <Input id="legal-reference" value={form.legal_reference} onChange={(event) => setField('legal_reference', event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={onSave} disabled={!form.effective_from || saving || !component}>
            {saving ? <Save className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
            {t('salaryRegulations.saveDraft')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SalaryComponentDialog({
  open,
  form,
  saving,
  onOpenChange,
  onChange,
  onSave,
}: {
  open: boolean
  form: SalaryComponentForm
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChange: (form: SalaryComponentForm) => void
  onSave: () => void
}) {
  const { t } = useTranslation()
  const setField = <K extends keyof SalaryComponentForm>(key: K, value: SalaryComponentForm[K]) => {
    onChange({ ...form, [key]: value })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('salaryRegulations.addComponent')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="component-name">{t('salaryRegulations.componentName')} *</Label>
            <Input id="component-name" value={form.name} onChange={(event) => setField('name', event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="component-code">{t('salaryRegulations.componentCode')} *</Label>
            <Input id="component-code" value={form.code} onChange={(event) => setField('code', event.target.value.toLowerCase().replace(/\s+/g, '_'))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('salaryRegulations.componentType')}</Label>
            <Select value={form.type} onValueChange={(value) => setField('type', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['earning', 'benefit', 'deduction', 'tax', 'contribution'].map((value) => (
                  <SelectItem key={value} value={value}>{t(`salaryRegulations.componentTypes.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('salaryRegulations.calculationType')}</Label>
            <Select value={form.calculation_type} onValueChange={(value) => setField('calculation_type', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['fixed', 'percentage', 'formula', 'hours'].map((value) => (
                  <SelectItem key={value} value={value}>{t(`salaryRegulations.calculationTypes.${value}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={onSave} disabled={!form.name || !form.code || saving}>
            {saving ? <Save className="mr-2 h-4 w-4 animate-pulse" /> : <Save className="mr-2 h-4 w-4" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApplicabilityField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {applicabilityOptions.map((option) => (
            <SelectItem key={option} value={option}>{t(`salaryRegulations.applicability.${option}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
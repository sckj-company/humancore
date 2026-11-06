import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Percent,
  CheckCircle2,
  Ban,
  Plus,
  Loader2,
  Download,
  Building2,
  Calendar,
  Layers,
  Trash2,
  Scale,
  FileCheck2,
  Info,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { cloudinaryAttachmentUrl } from '@/lib/cloudinary'
import { useAuthStore, hasPermission, hasAnyRole } from '@/stores/auth-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import type { PayrollInssRule, PayrollIrtTable, PayrollIrtBracket } from '@/types'

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  validated: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  revoked: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
}

export interface PayrollTaxRulesPageProps {
  embeddedTenantId?: string
}

export function PayrollTaxRulesPage({
  embeddedTenantId,
}: PayrollTaxRulesPageProps = {}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'pt-PT'
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.roles?.includes('super-admin') ?? false
  const canConfigure = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager']) || hasPermission(user, 'process_payroll')
  const qc = useQueryClient()

  const effectiveTenantId = embeddedTenantId || localStorage.getItem('hrms_selected_tenant') || String(user?.tenant?.id || '')

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'inss'

  // Modais INSS
  const [isInssCreateOpen, setIsInssCreateOpen] = useState(false)
  const [inssForm, setInssForm] = useState({
    country_code: 'AO',
    regime_code: 'standard',
    employee_rate: '3.00',
    employer_rate: '8.00',
    max_base: '',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    legal_source: '',
    legal_reference: '',
  })

  // Modais IRT
  const [isIrtCreateOpen, setIsIrtCreateOpen] = useState(false)
  const [irtForm, setIrtForm] = useState<{
    country_code: string
    regime_code: string
    effective_from: string
    effective_to: string
    legal_source: string
    legal_reference: string
    brackets: PayrollIrtBracket[]
  }>({
    country_code: 'AO',
    regime_code: 'standard',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    legal_source: '',
    legal_reference: '',
    brackets: [
      { lower_bound: 0, upper_bound: 100000, rate: 0, fixed_amount: 0 },
      { lower_bound: 100000, upper_bound: 200000, rate: 7, fixed_amount: 0 },
      { lower_bound: 200000, upper_bound: 500000, rate: 11, fixed_amount: 7000 },
      { lower_bound: 500000, upper_bound: 1000000, rate: 15, fixed_amount: 40000 },
      { lower_bound: 1000000, upper_bound: null, rate: 19, fixed_amount: 115000 },
    ],
  })

  // Modal de Revogação
  const [revokeTarget, setRevokeTarget] = useState<{ type: 'inss' | 'irt'; id: number } | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [showRevoked, setShowRevoked] = useState(false)

  // Queries
  const {
    data: inssRules,
    isLoading: inssLoading,
    isError: inssError,
    refetch: refetchInss,
  } = useQuery<PayrollInssRule[]>({
    queryKey: ['payroll-inss-rules', effectiveTenantId],
    queryFn: () => api.get<PayrollInssRule[]>(
      'payroll/inss-rules',
      effectiveTenantId ? { tenant_id: effectiveTenantId } : undefined
    ),
  })

  const {
    data: irtTables,
    isLoading: irtLoading,
    isError: irtError,
    refetch: refetchIrt,
  } = useQuery<PayrollIrtTable[]>({
    queryKey: ['payroll-irt-tables', effectiveTenantId],
    queryFn: () => api.get<PayrollIrtTable[]>(
      'payroll/irt-tables',
      effectiveTenantId ? { tenant_id: effectiveTenantId } : undefined
    ),
  })

  // Mutations INSS
  const createInssMutation = useMutation({
    mutationFn: (data: any) => api.post('payroll/inss-rules', {
      ...data,
      ...(effectiveTenantId ? { tenant_id: effectiveTenantId } : {}),
    }),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.inssCreated'))
      setIsInssCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.inssCreateError'))),
  })

  const validateInssMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/inss-rules/${id}/validate`),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.inssValidated'))
      qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.inssValidateError'))),
  })

  const activateInssMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/inss-rules/${id}/activate`),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.inssActivated'))
      qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.inssActivateError'))),
  })

  // Mutations IRT
  const createIrtMutation = useMutation({
    mutationFn: (data: any) => api.post('payroll/irt-tables', {
      ...data,
      ...(effectiveTenantId ? { tenant_id: effectiveTenantId } : {}),
    }),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.irtCreated'))
      setIsIrtCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.irtCreateError'))),
  })

  const validateIrtMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/irt-tables/${id}/validate`),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.irtValidated'))
      qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.irtValidateError'))),
  })

  const activateIrtMutation = useMutation({
    mutationFn: (id: number) => api.post(`payroll/irt-tables/${id}/activate`),
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.irtActivated'))
      qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.irtActivateError'))),
  })

  // Mutation Revogação Comum
  const revokeMutation = useMutation({
    mutationFn: () => {
      if (!revokeTarget) throw new Error(t('payrollTaxRulesPage.invalidTarget'))
      const path = revokeTarget.type === 'inss' ? `payroll/inss-rules` : `payroll/irt-tables`
      return api.post(`${path}/${revokeTarget.id}/revoke`, {
        reason: revokeReason,
        ...(effectiveTenantId ? { tenant_id: effectiveTenantId } : {}),
      })
    },
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.revoked'))
      setRevokeTarget(null)
      setRevokeReason('')
      qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
      qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.revokeError'))),
  })

  // Mutation Eliminar Definitivamente (rascunhos ou revogados)
  const deleteMutation = useMutation({
    mutationFn: ({ type, id }: { type: 'inss' | 'irt'; id: number }) => {
      const path = type === 'inss' ? 'payroll/inss-rules' : 'payroll/irt-tables'
      return api.delete(`${path}/${id}${effectiveTenantId ? `?tenant_id=${effectiveTenantId}` : ''}`)
    },
    onSuccess: () => {
      toast.success(t('payrollTaxRulesPage.deleted'))
      qc.invalidateQueries({ queryKey: ['payroll-inss-rules'] })
      qc.invalidateQueries({ queryKey: ['payroll-irt-tables'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('payrollTaxRulesPage.deleteError'))),
  })

  const formatDate = (d?: string | null) => {
    if (!d) return '—'
    try {
      return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))
    } catch {
      return d
    }
  }

  const activeInss = inssRules?.find((r) => r.status === 'active')
  const activeIrt = irtTables?.find((r) => r.status === 'active')
  const inssRevokedCount = inssRules?.filter((r) => r.status === 'revoked').length ?? 0
  const irtRevokedCount = irtTables?.filter((t) => t.status === 'revoked').length ?? 0
  const displayedInssRules = inssRules?.filter((r) => showRevoked || r.status !== 'revoked') ?? []
  const displayedIrtTables = irtTables?.filter((t) => showRevoked || t.status !== 'revoked') ?? []

  return (
    <div className="space-y-6">
      {/* Breadcrumb - Padrão EmployeeDetailPage */}
      {!embeddedTenantId && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to="/settings" aria-label={t('payrollTaxRulesPage.back')}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Link to="/settings" className="hover:text-foreground transition-colors">
              {t('settings.title')}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-semibold">{t('payrollTaxRulesPage.breadcrumbTitle')}</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t('payrollTaxRulesPage.back')}
            </Link>
          </Button>
        </div>
      )}

      {/* Hero Header Card - Padrão EmployeeDetailPage */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 text-center sm:text-left">
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                  <Scale className="h-10 w-10 text-primary" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('payrollTaxRulesPage.title')}</h1>
                  <Badge variant="outline" className="font-mono text-xs">
                    {t('payrollTaxRulesPage.angola')}
                  </Badge>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    {t('payrollTaxRulesPage.generalRegime')}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t('payrollTaxRulesPage.description')}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1">
                    <ShieldCheck className="h-3 w-3 text-primary" />
                    {t('payrollTaxRulesPage.legalValidationNotice')}
                  </span>
                  <Link
                    to="/settings/payroll-components"
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-primary hover:bg-primary/10 transition-colors font-medium"
                  >
                    <FileCheck2 className="h-3 w-3" />
                    {t('payrollTaxRulesPage.manageComponentIncidences')}
                  </Link>
                </div>
              </div>
            </div>

            {canConfigure && (
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 shrink-0">
                {activeTab === 'inss' ? (
                  <Button size="sm" className="gap-1.5" onClick={() => setIsInssCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> {t('payrollTaxRulesPage.newInssVersion')}
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5" onClick={() => setIsIrtCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> {t('payrollTaxRulesPage.newIrtTable')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Bar - Padrão EmployeeDetailPage */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Percent className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('payrollTaxRulesPage.employeeInssActive')}</p>
            <p className="text-sm font-semibold truncate text-foreground">
              {activeInss ? `${activeInss.employee_rate}%` : t('payrollTaxRulesPage.notConfigured')}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('payrollTaxRulesPage.employerInssActive')}</p>
            <p className="text-sm font-semibold truncate text-foreground">
              {activeInss ? `${activeInss.employer_rate}%` : t('payrollTaxRulesPage.notConfigured')}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-600">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('payrollTaxRulesPage.activeIrtTable')}</p>
            <p className="text-sm font-semibold truncate text-foreground">
              {activeIrt
                ? t('payrollTaxRulesPage.activeIrtSummary', { version: activeIrt.version, count: activeIrt.brackets?.length ?? 0 })
                : t('payrollTaxRulesPage.notConfigured')}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('payrollTaxRulesPage.activePeriod')}</p>
            <p className="text-sm font-semibold truncate text-foreground">
              {activeInss ? t('payrollTaxRulesPage.since', { date: formatDate(activeInss.effective_from) }) : '—'}
            </p>
          </div>
        </Card>
      </div>

      {/* Tabs - Padrão EmployeeDetailPage */}
      <Tabs
        value={activeTab}
        onValueChange={(tab) => setSearchParams({ tab }, { replace: true })}
        className="w-full"
      >
        <TabsList className="w-full flex-wrap justify-start h-auto gap-1 p-1.5 bg-muted/60 border border-border/60 rounded-lg">
          <TabsTrigger value="inss" className="gap-1.5 px-3 py-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('payrollTaxRulesPage.inssTab')}
            {(inssRules ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 font-semibold">
                {inssRules!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="irt" className="gap-1.5 px-3 py-1.5 text-xs">
            <Layers className="h-3.5 w-3.5" />
            {t('payrollTaxRulesPage.irtTab')}
            {(irtTables ?? []).length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1 font-semibold">
                {irtTables!.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab Content: INSS */}
        <TabsContent value="inss" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {t('payrollTaxRulesPage.inssHistoryTitle')}
                </CardTitle>
                <CardDescription>
                  {t('payrollTaxRulesPage.inssHistoryDescription')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {inssRevokedCount > 0 && (
                  <Button
                    size="sm"
                    variant={showRevoked ? 'secondary' : 'outline'}
                    className="gap-1.5 text-xs"
                    onClick={() => setShowRevoked(!showRevoked)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {showRevoked
                      ? t('payrollTaxRulesPage.hideRevoked')
                      : t('payrollTaxRulesPage.viewRevoked', { count: inssRevokedCount })}
                  </Button>
                )}
                {canConfigure && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setIsInssCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.newVersion')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {inssLoading && <LoadingState />}
              {inssError && <ErrorState message={t('payrollTaxRulesPage.inssLoadError')} onRetry={refetchInss} />}
              {displayedInssRules.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {inssRules && inssRules.length > 0 && !showRevoked
                    ? t('payrollTaxRulesPage.allInssRevoked')
                    : t('payrollTaxRulesPage.noInssRules')}
                </div>
              )}
              {displayedInssRules.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.version')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.regime')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.employeeRate')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.employerRate')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.period')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.status')}</th>
                        <th className="px-4 py-3 font-medium">{t('payrollTaxRulesPage.validation')}</th>
                        <th className="px-4 py-3 text-right font-medium">{t('payrollTaxRulesPage.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {displayedInssRules.map((rule) => (
                        <tr key={rule.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-4 py-3 font-semibold">v{rule.version}</td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{rule.regime_code}</td>
                          <td className="px-4 py-3 font-mono text-primary font-medium">{rule.employee_rate}%</td>
                          <td className="px-4 py-3 font-mono text-emerald-600 font-medium">{rule.employer_rate}%</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatDate(rule.effective_from)}{' '}
                            {rule.status === 'revoked'
                              ? `(${t('payrollTaxRulesPage.revokedStatus')})`
                              : rule.effective_to
                              ? t('payrollTaxRulesPage.until', { date: formatDate(rule.effective_to) })
                              : `(${t('payrollTaxRulesPage.current')})`}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`font-medium ${statusColors[rule.status] ?? ''}`}>
                              {t(`payrollTaxRulesPage.statuses.${rule.status}`, { defaultValue: rule.status })}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {rule.validated_by ? (
                              <span>
                                {rule.validated_by.name} ({formatDate(rule.validated_at)})
                              </span>
                            ) : (
                              t('payrollTaxRulesPage.pending')
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {rule.legal_document_url && (rule.legal_document_url.includes('res.cloudinary.com') ? (
                                <Button variant="ghost" size="icon-sm" asChild title={t('payrollTaxRulesPage.downloadLegalDocument')}>
                                  <a href={cloudinaryAttachmentUrl(rule.legal_document_url, rule.legal_document_name)} target="_blank" rel="noreferrer">
                                    <Download className="h-4 w-4" />
                                  </a>
                                </Button>
                              ) : (
                                <Button type="button" variant="ghost" size="icon-sm" title={t('payrollTaxRulesPage.downloadLegalDocument')} onClick={() => void api.downloadFile(`payroll/inss-rules/${rule.id}/document`, rule.legal_document_name ?? undefined)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              ))}
                              {rule.status === 'draft' && canConfigure && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                                  onClick={() => validateInssMutation.mutate(rule.id)}
                                  disabled={validateInssMutation.isPending}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.validate')}
                                </Button>
                              )}
                              {rule.status === 'validated' && canConfigure && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs gap-1 text-emerald-600 hover:bg-emerald-50"
                                  onClick={() => activateInssMutation.mutate(rule.id)}
                                  disabled={activateInssMutation.isPending}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.activate')}
                                </Button>
                              )}
                              {(rule.status === 'active' || rule.status === 'validated') && canConfigure && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
                                  onClick={() => setRevokeTarget({ type: 'inss', id: rule.id })}
                                >
                                  <Ban className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.revoke')}
                                </Button>
                              )}
                              {rule.status === 'revoked' && canConfigure && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
                                  title={t('payrollTaxRulesPage.deleteRevokedInssTitle')}
                                  onClick={() => {
                                    if (confirm(t('payrollTaxRulesPage.deleteRevokedInssConfirm'))) {
                                      deleteMutation.mutate({ type: 'inss', id: rule.id })
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.delete')}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content: IRT */}
        <TabsContent value="irt" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Histórico de Tabelas de IRT (Imposto sobre Rendimento do Trabalho)
                </CardTitle>
                <CardDescription>
                  Escalões progressivos, limites inferior/superior, parcelas fixas e taxas oficiais
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {irtRevokedCount > 0 && (
                  <Button
                    size="sm"
                    variant={showRevoked ? 'secondary' : 'outline'}
                    className="gap-1.5 text-xs"
                    onClick={() => setShowRevoked(!showRevoked)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {showRevoked
                      ? t('payrollTaxRulesPage.hideRevoked')
                      : t('payrollTaxRulesPage.viewRevoked', { count: irtRevokedCount })}
                  </Button>
                )}
                {canConfigure && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setIsIrtCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.newIrtTable')}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {irtLoading && <LoadingState />}
              {irtError && <ErrorState message={t('payrollTaxRulesPage.irtLoadError')} onRetry={refetchIrt} />}
              {displayedIrtTables.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {irtTables && irtTables.length > 0 && !showRevoked
                    ? t('payrollTaxRulesPage.allIrtRevoked')
                    : t('payrollTaxRulesPage.noIrtTables')}
                </div>
              )}
              {displayedIrtTables.length > 0 && (
                <div className="space-y-6">
                  {displayedIrtTables.map((table) => (
                    <div key={table.id} className="rounded-xl border border-border p-5 space-y-4 bg-muted/10">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-base text-foreground">
                            {t('payrollTaxRulesPage.irtTableVersion', { version: table.version })}
                          </span>
                          <Badge variant="outline" className={`font-medium ${statusColors[table.status] ?? ''}`}>
                            {t(`payrollTaxRulesPage.statuses.${table.status}`, { defaultValue: table.status })}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t('payrollTaxRulesPage.period')}: {formatDate(table.effective_from)}{' '}
                            {table.status === 'revoked'
                              ? `(${t('payrollTaxRulesPage.revokedStatus')})`
                              : table.effective_to
                              ? t('payrollTaxRulesPage.until', { date: formatDate(table.effective_to) })
                              : `(${t('payrollTaxRulesPage.current')})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {table.status === 'draft' && canConfigure && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                              onClick={() => validateIrtMutation.mutate(table.id)}
                              disabled={validateIrtMutation.isPending}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.validate')}
                            </Button>
                          )}
                          {table.status === 'validated' && canConfigure && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => activateIrtMutation.mutate(table.id)}
                              disabled={activateIrtMutation.isPending}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.activate')}
                            </Button>
                          )}
                          {(table.status === 'active' || table.status === 'validated') && canConfigure && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
                              onClick={() => setRevokeTarget({ type: 'irt', id: table.id })}
                            >
                              <Ban className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.revoke')}
                            </Button>
                          )}
                          {table.status === 'revoked' && canConfigure && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
                              title={t('payrollTaxRulesPage.deleteRevokedIrtTitle')}
                              onClick={() => {
                                if (confirm(t('payrollTaxRulesPage.deleteRevokedIrtConfirm'))) {
                                  deleteMutation.mutate({ type: 'irt', id: table.id })
                                }
                              }}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.delete')}
                            </Button>
                          )}
                        </div>
                      </div>

                      {table.legal_reference && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{t('payrollTaxRulesPage.legalBasis')}:</span> {table.legal_reference}
                        </p>
                      )}
                      {table.legal_document_url?.includes('res.cloudinary.com') ? (
                        <a
                          href={cloudinaryAttachmentUrl(table.legal_document_url, table.legal_document_name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Download className="h-4 w-4" />{table.legal_document_name ?? t('payrollTaxRulesPage.downloadLegalDocument')}
                        </a>
                      ) : table.legal_document_url ? (
                        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => void api.downloadFile(`payroll/irt-tables/${table.id}/document`, table.legal_document_name ?? undefined)}>
                          <Download className="h-4 w-4" />{table.legal_document_name ?? t('payrollTaxRulesPage.downloadLegalDocument')}
                        </Button>
                      ) : null}

                      <div className="overflow-x-auto rounded-lg border border-border bg-card">
                        <table className="w-full text-xs">
                          <thead className="border-b border-border bg-muted/40 uppercase text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-left">{t('payrollTaxRulesPage.bracket')}</th>
                              <th className="px-3 py-2 text-right">{t('payrollTaxRulesPage.lowerBound')}</th>
                              <th className="px-3 py-2 text-right">{t('payrollTaxRulesPage.upperBound')}</th>
                              <th className="px-3 py-2 text-right">{t('payrollTaxRulesPage.rate')}</th>
                              <th className="px-3 py-2 text-right">{t('payrollTaxRulesPage.fixedAmount')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {table.brackets?.map((b, idx) => (
                              <tr key={idx} className="hover:bg-muted/30">
                                <td className="px-3 py-2 font-medium">{t('payrollTaxRulesPage.bracketNumber', { number: idx + 1 })}</td>
                                <td className="px-3 py-2 text-right font-mono">{b.lower_bound.toLocaleString()} Kz</td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {b.upper_bound !== null ? `${b.upper_bound.toLocaleString()} Kz` : t('payrollTaxRulesPage.infinite')}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-primary">{b.rate}%</td>
                                <td className="px-3 py-2 text-right font-mono">{b.fixed_amount.toLocaleString()} Kz</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Criar Regra INSS */}
      <Dialog open={isInssCreateOpen} onOpenChange={setIsInssCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('payrollTaxRulesPage.newInssRuleTitle')}</DialogTitle>
            <DialogDescription>
              {t('payrollTaxRulesPage.newInssRuleDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('payrollTaxRulesPage.employeeRateWithUnit')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={inssForm.employee_rate}
                  onChange={(e) => setInssForm({ ...inssForm, employee_rate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('payrollTaxRulesPage.employerRateWithUnit')}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={inssForm.employer_rate}
                  onChange={(e) => setInssForm({ ...inssForm, employer_rate: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('payrollTaxRulesPage.effectiveFrom')}</Label>
                <Input
                  type="date"
                  value={inssForm.effective_from}
                  onChange={(e) => setInssForm({ ...inssForm, effective_from: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('payrollTaxRulesPage.effectiveToOptional')}</Label>
                <Input
                  type="date"
                  value={inssForm.effective_to}
                  onChange={(e) => setInssForm({ ...inssForm, effective_to: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('payrollTaxRulesPage.legalReference')}</Label>
              <Input
                placeholder={t('payrollTaxRulesPage.inssLegalPlaceholder')}
                value={inssForm.legal_reference}
                onChange={(e) => setInssForm({ ...inssForm, legal_reference: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInssCreateOpen(false)}>
              {t('payrollTaxRulesPage.cancel')}
            </Button>
            <Button
              disabled={createInssMutation.isPending}
              onClick={() => {
                createInssMutation.mutate({
                  country_code: inssForm.country_code,
                  regime_code: inssForm.regime_code,
                  employee_rate: parseFloat(inssForm.employee_rate),
                  employer_rate: parseFloat(inssForm.employer_rate),
                  effective_from: inssForm.effective_from,
                  effective_to: inssForm.effective_to || undefined,
                  legal_reference: inssForm.legal_reference || undefined,
                })
              }}
            >
              {createInssMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('payrollTaxRulesPage.createDraft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Criar Tabela IRT */}
      <Dialog open={isIrtCreateOpen} onOpenChange={setIsIrtCreateOpen}>
        <DialogContent className="max-w-4xl xl:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              {t('payrollTaxRulesPage.newIrtTableTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('payrollTaxRulesPage.newIrtTableDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Dados Gerais de Vigência */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">{t('payrollTaxRulesPage.effectiveFromRequired')}</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={irtForm.effective_from}
                  onChange={(e) => setIrtForm({ ...irtForm, effective_from: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">{t('payrollTaxRulesPage.effectiveToOptional')}</Label>
                <Input
                  type="date"
                  className="h-9"
                  placeholder={t('payrollTaxRulesPage.leaveBlankIfOpenEnded')}
                  value={irtForm.effective_to}
                  onChange={(e) => setIrtForm({ ...irtForm, effective_to: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">{t('payrollTaxRulesPage.legalReference')}</Label>
                <Input
                  className="h-9"
                  placeholder={t('payrollTaxRulesPage.irtLegalPlaceholder')}
                  value={irtForm.legal_reference}
                  onChange={(e) => setIrtForm({ ...irtForm, legal_reference: e.target.value })}
                />
              </div>
            </div>

            {/* Tabela de Escalões */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-bold text-foreground">{t('payrollTaxRulesPage.bracketDefinition')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('payrollTaxRulesPage.bracketDescription')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                  onClick={() => {
                    const last = irtForm.brackets[irtForm.brackets.length - 1]
                    const nextMin = last ? (last.upper_bound ?? last.lower_bound + 100000) : 0
                    setIrtForm({
                      ...irtForm,
                      brackets: [
                        ...irtForm.brackets,
                        { lower_bound: nextMin, upper_bound: null, rate: 0, fixed_amount: 0 },
                      ],
                    })
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> {t('payrollTaxRulesPage.addBracket')}
                </Button>
              </div>

              {/* Tabela de inputs com cabeçalhos explícitos */}
              <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left w-24">{t('payrollTaxRulesPage.bracket')}</th>
                      <th className="px-4 py-3 text-left">{t('payrollTaxRulesPage.lowerBoundWithUnit')}</th>
                      <th className="px-4 py-3 text-left">{t('payrollTaxRulesPage.upperBoundWithUnit')}</th>
                      <th className="px-4 py-3 text-left w-36">{t('payrollTaxRulesPage.marginalRate')}</th>
                      <th className="px-4 py-3 text-left w-44">{t('payrollTaxRulesPage.fixedAmountWithUnit')}</th>
                      <th className="px-3 py-3 text-center w-12">{t('payrollTaxRulesPage.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {irtForm.brackets.map((b, idx) => (
                      <tr key={idx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 font-semibold text-xs text-muted-foreground">
                          <Badge variant="secondary" className="font-mono text-xs font-semibold">
                            #{idx + 1}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="0"
                            className="h-9 font-mono text-sm bg-background"
                            value={b.lower_bound}
                            onChange={(e) => {
                              const updated = [...irtForm.brackets]
                              updated[idx].lower_bound = parseFloat(e.target.value) || 0
                              setIrtForm({ ...irtForm, brackets: updated })
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder={t('payrollTaxRulesPage.leaveBlankIfUnlimited')}
                            className="h-9 font-mono text-sm bg-background placeholder:text-muted-foreground/60"
                            value={b.upper_bound ?? ''}
                            onChange={(e) => {
                              const updated = [...irtForm.brackets]
                              updated[idx].upper_bound = e.target.value ? parseFloat(e.target.value) : null
                              setIrtForm({ ...irtForm, brackets: updated })
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              placeholder="0"
                              className="h-9 font-mono text-sm bg-background pr-8 text-right font-medium"
                              value={b.rate}
                              onChange={(e) => {
                                const updated = [...irtForm.brackets]
                                updated[idx].rate = parseFloat(e.target.value) || 0
                                setIrtForm({ ...irtForm, brackets: updated })
                              }}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">
                              %
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <Input
                              type="number"
                              min="0"
                              step="500"
                              placeholder="0"
                              className="h-9 font-mono text-sm bg-background pr-9 text-right"
                              value={b.fixed_amount}
                              onChange={(e) => {
                                const updated = [...irtForm.brackets]
                                updated[idx].fixed_amount = parseFloat(e.target.value) || 0
                                setIrtForm({ ...irtForm, brackets: updated })
                              }}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground pointer-events-none">
                              Kz
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {irtForm.brackets.length > 1 ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title={t('payrollTaxRulesPage.removeBracket')}
                              onClick={() => {
                                setIrtForm({
                                  ...irtForm,
                                  brackets: irtForm.brackets.filter((_, i) => i !== idx),
                                })
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Dica de Orientação de Cálculo */}
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">{t('payrollTaxRulesPage.officialIrtCalculation')}</p>
                  <p className="text-muted-foreground dark:text-blue-300">
                    <span className="font-mono font-medium">{t('payrollTaxRulesPage.irtFormula')}</span>.
                    {' '}{t('payrollTaxRulesPage.lastBracketHelp')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsIrtCreateOpen(false)}>
              {t('payrollTaxRulesPage.cancel')}
            </Button>
            <Button
              disabled={createIrtMutation.isPending}
              onClick={() => {
                createIrtMutation.mutate({
                  country_code: irtForm.country_code,
                  regime_code: irtForm.regime_code,
                  effective_from: irtForm.effective_from,
                  effective_to: irtForm.effective_to || undefined,
                  legal_reference: irtForm.legal_reference || undefined,
                  brackets: irtForm.brackets,
                })
              }}
            >
              {createIrtMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('payrollTaxRulesPage.createIrtTable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Revogação */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payrollTaxRulesPage.confirmRevocationTitle')}</DialogTitle>
            <DialogDescription>
              {t('payrollTaxRulesPage.confirmRevocationDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{t('payrollTaxRulesPage.revocationReasonRequired')}</Label>
            <Input
              placeholder={t('payrollTaxRulesPage.revocationReasonPlaceholder')}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              {t('payrollTaxRulesPage.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!revokeReason.trim() || revokeMutation.isPending}
              onClick={() => revokeMutation.mutate()}
            >
              {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('payrollTaxRulesPage.revokeRule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building2, CheckCircle2, CreditCard, Download, Loader2, ShieldAlert, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { SubscriptionInvoice, TenantEntitlements } from '@/types'

interface CompanyInvoicesResponse {
  billed_to_manager: boolean
  manager_tenant?: { id: number; name: string; slug: string } | null
  invoices: SubscriptionInvoice[]
}

export function BillingPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [payingInvoice, setPayingInvoice] = useState<SubscriptionInvoice | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [referenceCode, setReferenceCode] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)

  const { data: entitlements, isLoading: loadingSub } = useQuery({
    queryKey: ['company', 'subscription'],
    queryFn: () => api.get<TenantEntitlements>('company/subscription'),
  })

  const { data: invoicesData, isLoading: loadingInv } = useQuery({
    queryKey: ['company', 'billing', 'invoices'],
    queryFn: () => api.get<CompanyInvoicesResponse>('company/billing/invoices'),
  })

  const submitProofMutation = useMutation({
    mutationFn: () => {
      if (!payingInvoice) throw new Error('Invalid invoice')
      const fd = new FormData()
      fd.append('payment_method', paymentMethod)
      fd.append('amount', String(payingInvoice.total_amount))
      if (referenceCode.trim()) fd.append('reference_code', referenceCode.trim())
      if (paymentDate) fd.append('payment_date', paymentDate)
      if (notes.trim()) fd.append('notes', notes.trim())
      if (proofFile) fd.append('proof_file', proofFile)
      return api.upload(`company/billing/invoices/${payingInvoice.id}/payments`, fd)
    },
    onSuccess: () => {
      toast.success(t('saas.billing.toastProofSent'))
      setPayingInvoice(null)
      setReferenceCode('')
      setNotes('')
      setProofFile(null)
      qc.invalidateQueries({ queryKey: ['company', 'billing'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.billing.toastProofError'))),
  })

  const quotaRows = entitlements
    ? [
        { label: t('saas.billing.quotaEmployees'), used: entitlements.usage.employees, max: entitlements.limits.max_employees },
        { label: t('saas.billing.quotaUsers'), used: entitlements.usage.users, max: entitlements.limits.max_users },
        { label: t('saas.billing.quotaBranches'), used: entitlements.usage.branches, max: entitlements.limits.max_branches },
        { label: t('saas.billing.quotaDepartments'), used: entitlements.usage.departments, max: entitlements.limits.max_departments },
        { label: t('saas.billing.quotaStorage'), used: entitlements.usage.storage_mb, max: entitlements.limits.max_storage_mb },
        ...(entitlements.agency?.can_manage_other_tenants
          ? [
              {
                label: t('saas.billing.quotaManagedTenants'),
                used: entitlements.usage.managed_tenants,
                max: entitlements.agency.max_managed_tenants,
              },
            ]
          : []),
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader title={t('saas.billing.title')} description={t('saas.billing.description')} />

      {loadingSub ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entitlements ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>{t('saas.billing.currentSubscription')}</span>
                <Badge variant={entitlements.is_operational ? 'default' : 'destructive'}>
                  {t(`saas.statuses.${entitlements.status}`, { defaultValue: entitlements.status })}
                </Badge>
              </CardTitle>
              <CardDescription>
                {entitlements.plan?.name ?? t('saas.billing.noPlanAssigned')}
                {entitlements.inherited_from_manager && entitlements.manager_tenant
                  ? ` ${t('saas.billing.viaManager', { name: entitlements.manager_tenant.name })}`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {entitlements.plan && (
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-xl font-bold">
                    {Number(entitlements.plan.base_price).toLocaleString(i18n.language)} {entitlements.plan.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('saas.billing.cycleMeta', {
                      cycle: t(`saas.cycles.${entitlements.plan.billing_cycle}`, {
                        defaultValue: entitlements.plan.billing_cycle,
                      }),
                    })}
                  </p>
                </div>
              )}
              {entitlements.subscription?.ends_at && (
                <p className="text-xs text-muted-foreground">
                  {t('saas.billing.validUntil', {
                    date: new Date(entitlements.subscription.ends_at).toLocaleDateString(i18n.language),
                  })}
                </p>
              )}
              {!entitlements.is_operational && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{t('saas.billing.notOperationalWarning')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('saas.billing.quotaTitle')}</CardTitle>
              <CardDescription>
                {entitlements.quota_scope === 'pooled_under_manager' && entitlements.agency?.can_manage_other_tenants
                  ? t('saas.billing.quotaDescPooled')
                  : t('saas.billing.quotaDescSingle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {quotaRows.map((row) => {
                const maxNum = row.max === null || row.max === undefined || row.max === '' ? null : Number(row.max)
                const pct = maxNum && maxNum > 0 ? Math.min(100, Math.round((Number(row.used) / maxNum) * 100)) : 0
                return (
                  <div key={row.label} className="space-y-1.5 rounded-md border p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{row.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {row.used} / {maxNum === null ? '∞' : maxNum}
                      </span>
                    </div>
                    {maxNum !== null && <Progress value={pct} className="h-2" />}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Faturas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" />
            {t('saas.billing.invoicesTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingInv ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoicesData?.billed_to_manager ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">{t('saas.billing.centralizedTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('saas.billing.centralizedDesc', { name: invoicesData.manager_tenant?.name ?? '' })}
                </p>
              </div>
            </div>
          ) : !invoicesData?.invoices?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('saas.billing.noInvoices')}</p>
          ) : (
            <div className="space-y-3">
              {invoicesData.invoices.map((inv) => {
                const latestPayment = inv.payments?.[0]
                return (
                  <div key={inv.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {inv.invoice_number} — {inv.plan?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('saas.billing.invoicePeriod', {
                            start: inv.period_start,
                            end: inv.period_end ? t('saas.billing.invoicePeriodEnd', { date: inv.period_end }) : '',
                            due: inv.due_date,
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold tabular-nums">
                          {Number(inv.total_amount).toLocaleString(i18n.language)} {inv.currency}
                        </span>
                        <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'overdue' ? 'destructive' : 'secondary'}>
                          {t(`saas.statuses.${inv.status}`, { defaultValue: inv.status })}
                        </Badge>
                        {inv.status !== 'paid' && inv.status !== 'void' && (
                          <Button size="sm" onClick={() => setPayingInvoice(inv)}>
                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                            {t('saas.billing.sendProof')}
                          </Button>
                        )}
                      </div>
                    </div>

                    {latestPayment && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-muted/40 px-3 py-2 text-xs">
                        <span>
                          {t('saas.billing.latestPayment', {
                            status: t(`saas.statuses.${latestPayment.status}`, { defaultValue: latestPayment.status }),
                            method: t(`saas.paymentMethods.${latestPayment.payment_method}`, { defaultValue: latestPayment.payment_method }),
                            ref: latestPayment.reference_code ? ` • ${latestPayment.reference_code}` : '',
                          })}
                          {latestPayment.rejection_reason
                            ? t('saas.billing.rejectionPrefix', { reason: latestPayment.rejection_reason })
                            : ''}
                        </span>
                        {latestPayment.proof_file_path && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() =>
                              api.downloadFile(
                                `company/billing/payments/${latestPayment.id}/proof`,
                                latestPayment.proof_original_name ?? `comprovativo-${latestPayment.id}`,
                              )
                            }
                          >
                            <Download className="mr-1 h-3 w-3" />
                            {t('saas.billing.viewProof')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Submeter Comprovativo */}
      <Dialog open={Boolean(payingInvoice)} onOpenChange={(o) => !o && setPayingInvoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('saas.billing.submitProofTitle', { number: payingInvoice?.invoice_number ?? '' })}</DialogTitle>
            <DialogDescription>
              {t('saas.billing.totalDue', {
                amount: Number(payingInvoice?.total_amount ?? 0).toLocaleString(i18n.language),
                currency: payingInvoice?.currency ?? 'AOA',
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('saas.billing.paymentMethodLabel')}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="bank_transfer">{t('saas.paymentMethods.bank_transfer')}</option>
                <option value="multicaixa_reference">{t('saas.paymentMethods.multicaixa_reference')}</option>
                <option value="cash">{t('saas.paymentMethods.cash')}</option>
                <option value="other">{t('saas.paymentMethods.other')}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t('saas.billing.referenceLabel')}</Label>
              <Input value={referenceCode} onChange={(e) => setReferenceCode(e.target.value)} placeholder={t('saas.billing.referencePlaceholder')} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.billing.paymentDateLabel')}</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.billing.proofFileLabel')}</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.platformBilling.notesLabel')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('saas.common.optional')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPayingInvoice(null)}>
                {t('saas.common.cancel')}
              </Button>
              <Button disabled={submitProofMutation.isPending} onClick={() => submitProofMutation.mutate()}>
                {submitProofMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                {t('saas.billing.submitProofButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

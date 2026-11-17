import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, FileText, Loader2, Play, Plus, Receipt, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KpiCard } from '@/components/shared/kpi-card'
import type { Paginated, SubscriptionInvoice, SubscriptionPayment, Tenant } from '@/types'

interface InvoicesPayload {
  summary: {
    open_total: number
    under_review_count: number
    paid_this_month: number
    pending_payments_count: number
  }
  invoices: Paginated<SubscriptionInvoice>
}

export function PlatformBillingTab() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [invoiceStatus, setInvoiceStatus] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [targetTenantId, setTargetTenantId] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [rejectingPayment, setRejectingPayment] = useState<SubscriptionPayment | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data: billingData, isLoading } = useQuery({
    queryKey: ['superadmin', 'billing', 'invoices', invoiceStatus],
    queryFn: () =>
      api.get<InvoicesPayload>('superadmin/billing/invoices', {
        status: invoiceStatus || undefined,
      }),
  })

  const { data: pendingPaymentsPage } = useQuery({
    queryKey: ['superadmin', 'billing', 'payments', 'pending'],
    queryFn: () => api.get<Paginated<SubscriptionPayment>>('superadmin/billing/payments', { status: 'pending' }),
  })

  const { data: tenantsPage } = useQuery({
    queryKey: ['superadmin', 'tenants-for-billing'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 500 }),
    enabled: generateOpen,
  })

  const generateMutation = useMutation({
    mutationFn: () => api.post(`superadmin/tenants/${targetTenantId}/invoices`, { notes: invoiceNotes || null }),
    onSuccess: () => {
      toast.success(t('saas.platformBilling.toastInvoiceGenerated'))
      setGenerateOpen(false)
      setTargetTenantId('')
      setInvoiceNotes('')
      qc.invalidateQueries({ queryKey: ['superadmin', 'billing'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.platformBilling.toastInvoiceError'))),
  })

  const approveMutation = useMutation({
    mutationFn: (paymentId: number) => api.post(`superadmin/billing/payments/${paymentId}/approve`),
    onSuccess: () => {
      toast.success(t('saas.platformBilling.toastApproved'))
      qc.invalidateQueries({ queryKey: ['superadmin', 'billing'] })
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.platformBilling.toastApproveError'))),
  })

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!rejectingPayment) throw new Error('Invalid payment')
      return api.post(`superadmin/billing/payments/${rejectingPayment.id}/reject`, { reason: rejectReason })
    },
    onSuccess: () => {
      toast.success(t('saas.platformBilling.toastRejected'))
      setRejectingPayment(null)
      setRejectReason('')
      qc.invalidateQueries({ queryKey: ['superadmin', 'billing'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.platformBilling.toastRejectError'))),
  })

  const lifecycleMutation = useMutation({
    mutationFn: () => api.post<{ grace_entered: number; suspended: number }>('superadmin/billing/process-lifecycle'),
    onSuccess: (res) => {
      toast.success(
        t('saas.platformBilling.toastLifecycle', {
          grace: res.grace_entered,
          suspended: res.suspended,
        }),
      )
      qc.invalidateQueries({ queryKey: ['superadmin', 'tenants'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.platformBilling.toastLifecycleError'))),
  })

  const summary = billingData?.summary
  const invoices = billingData?.invoices?.data ?? []
  const pendingPayments = pendingPaymentsPage?.data ?? []
  const billableTenants = (tenantsPage?.data ?? []).filter((tn) => !tn.managed_by && tn.subscription)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('saas.platformBilling.kpiOpen')}
          value={`${Number(summary?.open_total ?? 0).toLocaleString(i18n.language)} AOA`}
          icon={Receipt}
        />
        <KpiCard
          label={t('saas.platformBilling.kpiPendingProofs')}
          value={summary?.pending_payments_count ?? 0}
          icon={FileText}
        />
        <KpiCard
          label={t('saas.platformBilling.kpiPaidMonth')}
          value={`${Number(summary?.paid_this_month ?? 0).toLocaleString(i18n.language)} AOA`}
          icon={CheckCircle2}
        />
        <KpiCard
          label={t('saas.platformBilling.kpiUnderReview')}
          value={summary?.under_review_count ?? 0}
          icon={FileText}
        />
      </div>

      {/* Fila de comprovativos pendentes */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{t('saas.platformBilling.pendingProofsTitle')}</CardTitle>
            <CardDescription>{t('saas.platformBilling.pendingProofsDesc')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => lifecycleMutation.mutate()} disabled={lifecycleMutation.isPending}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {t('saas.platformBilling.processLifecycle')}
          </Button>
        </CardHeader>
        <CardContent>
          {pendingPayments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('saas.platformBilling.noPendingProofs')}</p>
          ) : (
            <div className="space-y-2">
              {pendingPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-0.5 text-sm">
                    <p className="font-semibold">
                      {payment.tenant?.name} • {payment.invoice?.invoice_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number(payment.amount).toLocaleString(i18n.language)} {payment.currency} •{' '}
                      {t(`saas.paymentMethods.${payment.payment_method}`, { defaultValue: payment.payment_method })}
                      {payment.reference_code ? ` • ${payment.reference_code}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {payment.proof_file_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          api.downloadFile(
                            `superadmin/billing/payments/${payment.id}/proof`,
                            payment.proof_original_name ?? `comprovativo-${payment.id}`,
                          )
                        }
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        {t('saas.platformBilling.proofButton')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(payment.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                      {t('saas.platformBilling.approveButton')}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setRejectingPayment(payment)
                        setRejectReason('')
                      }}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" />
                      {t('saas.platformBilling.rejectButton')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Faturas */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">{t('saas.platformBilling.invoicesTitle')}</CardTitle>
            <CardDescription>{t('saas.platformBilling.invoicesDesc')}</CardDescription>
          </div>
          <div className="flex gap-2">
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={invoiceStatus}
              onChange={(e) => setInvoiceStatus(e.target.value)}
            >
              <option value="">{t('saas.common.allStatuses')}</option>
              <option value="open">{t('saas.statuses.open')}</option>
              <option value="under_review">{t('saas.statuses.under_review')}</option>
              <option value="paid">{t('saas.statuses.paid')}</option>
              <option value="overdue">{t('saas.statuses.overdue')}</option>
            </select>
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('saas.platformBilling.generateInvoice')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('saas.platformBilling.noInvoices')}</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-semibold">
                      {inv.invoice_number} — {inv.tenant?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('saas.platformBilling.planDueMeta', { plan: inv.plan?.name ?? '—', due: inv.due_date })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {Number(inv.total_amount).toLocaleString(i18n.language)} {inv.currency}
                    </span>
                    <Badge variant={inv.status === 'paid' ? 'default' : inv.status === 'overdue' ? 'destructive' : 'secondary'}>
                      {t(`saas.statuses.${inv.status}`, { defaultValue: inv.status })}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Gerar Fatura */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('saas.platformBilling.generateTitle')}</DialogTitle>
            <DialogDescription>{t('saas.platformBilling.generateDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('saas.platformBilling.companyLabel')}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={targetTenantId}
                onChange={(e) => setTargetTenantId(e.target.value)}
              >
                <option value="">{t('saas.platformBilling.selectCompany')}</option>
                {billableTenants.map((tn) => (
                  <option key={tn.id} value={tn.id}>
                    {tn.name} ({tn.subscription?.plan_name})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('saas.platformBilling.notesLabel')}</Label>
              <Input value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} placeholder={t('saas.common.optional')} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setGenerateOpen(false)}>
                {t('saas.common.cancel')}
              </Button>
              <Button disabled={!targetTenantId || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                {t('saas.platformBilling.generateInvoice')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rejeitar Comprovativo */}
      <Dialog open={Boolean(rejectingPayment)} onOpenChange={(o) => !o && setRejectingPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('saas.platformBilling.rejectTitle')}</DialogTitle>
            <DialogDescription>{t('saas.platformBilling.rejectDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('saas.platformBilling.rejectPlaceholder')}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectingPayment(null)}>
                {t('saas.common.cancel')}
              </Button>
              <Button variant="destructive" disabled={!rejectReason.trim() || rejectMutation.isPending} onClick={() => rejectMutation.mutate()}>
                {t('saas.platformBilling.confirmReject')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

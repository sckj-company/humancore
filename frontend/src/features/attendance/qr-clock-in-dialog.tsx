import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QrCode, RefreshCw, Loader2, Clock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useIssueQrCode } from './api'
import { cn } from '@/lib/utils'

interface QrClockInDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function QrClockInDialog({ open, onOpenChange, onSuccess }: QrClockInDialogProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const [lastIssuedAt, setLastIssuedAt] = useState<number | null>(null)

  const issue = useIssueQrCode()

  useEffect(() => {
    if (!open) return
    issue.mutate(undefined, {
      onSuccess: () => setLastIssuedAt(Date.now()),
      onError: (e) => toast.error((e as Error).message ?? 'Erro ao gerar QR Code'),
    })
  }, [open])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const expiresAt = issue.data ? new Date(issue.data.expires_at).getTime() : null
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0
  const remainingSec = Math.ceil(remainingMs / 1000)
  const progress = expiresAt
    ? Math.max(
        0,
        Math.min(
          1,
          1 - (expiresAt - now) / ((issue.data?.ttl_seconds ?? 30) * 1000),
        ),
      )
    : 0

  const isExpiring = remainingSec > 0 && remainingSec <= 5
  const isExpired = remainingSec === 0

  useEffect(() => {
    if (isExpired && issue.data) {
      issue.reset()
      setLastIssuedAt(null)
    }
  }, [isExpired, issue.data])

  const handleRefresh = () => {
    issue.mutate(undefined, {
      onSuccess: () => setLastIssuedAt(Date.now()),
      onError: (e) => toast.error((e as Error).message ?? 'Erro ao regenerar QR Code'),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <QrCode className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">
            {t('attendance.qr.title', { defaultValue: 'QR Code de registo' })}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('attendance.qr.description', {
              defaultValue:
                'Apresente este código no terminal de presença. O código expira em segundos.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* QR */}
          <div className="relative mx-auto flex h-72 w-72 items-center justify-center rounded-2xl border border-border bg-white p-4 shadow-sm">
            {issue.isPending || !issue.data ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-xs">A gerar código…</p>
              </div>
            ) : (
              <div
                aria-label="QR Code"
                className="h-full w-full"
                dangerouslySetInnerHTML={{ __html: issue.data.qr_svg }}
              />
            )}

            {isExpiring && (
              <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-warning/60 animate-pulse" />
            )}
          </div>

          {/* Countdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t('attendance.qr.expiresIn', { defaultValue: 'Expira em' })}
              </span>
              <span
                className={cn(
                  'font-mono font-semibold tabular-nums',
                  isExpiring ? 'text-warning' : 'text-foreground',
                  isExpired && 'text-destructive',
                )}
              >
                {remainingSec > 0 ? `${remainingSec}s` : 'Expirado'}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  isExpiring ? 'bg-warning' : 'bg-primary',
                  isExpired && 'bg-destructive',
                )}
                style={{ width: `${Math.max(0, (1 - progress) * 100)}%` }}
              />
            </div>
          </div>

          {/* Action */}
          {issue.data && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                <span>Hash único · uso único</span>
              </div>
              <Badge variant={issue.data.action === 'clock_in' ? 'success' : 'info'} className="text-[10px]">
                {issue.data.action === 'clock_in' ? 'Entrada' : 'Saída'}
              </Badge>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleRefresh}
            disabled={issue.isPending}
          >
            {issue.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('attendance.qr.refresh', { defaultValue: 'Gerar novo código' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

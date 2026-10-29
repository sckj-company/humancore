import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Inbox } from 'lucide-react'
import { type ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  eyebrow?: string
  className?: string
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function LoadingState({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {icon ?? <Inbox className="h-6 w-6 text-muted-foreground" />}
        </div>
        <h3 className="text-base font-medium">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-destructive">Erro</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Tentar novamente
          </button>
        )}
      </CardContent>
    </Card>
  )
}

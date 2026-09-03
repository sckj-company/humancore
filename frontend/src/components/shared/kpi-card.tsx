import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number; direction: 'up' | 'down' | 'flat' }
  currency?: string
  accent?: 'primary' | 'success' | 'warning' | 'info' | 'destructive'
  className?: string
}

const accentMap = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  destructive: 'bg-destructive/10 text-destructive',
}

export function KpiCard({ label, value, icon: Icon, trend, currency, accent = 'primary', className }: KpiCardProps) {
  const { i18n } = useTranslation()
  const formatted = typeof value === 'number'
    ? new Intl.NumberFormat(i18n.language, {
        style: currency ? 'currency' : 'decimal',
        currency: currency,
        minimumFractionDigits: currency ? 0 : 0,
        maximumFractionDigits: 2,
      }).format(value)
    : value

  const trendColor = trend?.direction === 'down' ? 'text-destructive' : trend?.direction === 'up' ? 'text-success' : 'text-muted-foreground'
  const TrendIcon = trend?.direction === 'down' ? TrendingDown : TrendingUp

  return (
    <Card className={cn('overflow-hidden border-border/50', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{formatted}</p>
            {trend && (
              <p className={cn('flex items-center gap-1 text-xs', trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {trend.value}%
              </p>
            )}
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', accentMap[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

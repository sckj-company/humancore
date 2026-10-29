import { useState } from 'react'
import { Building2, ChevronsUpDown, Check, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'

interface TenantBadgeProps {
  className?: string
}

export function TenantBadge({ className }: TenantBadgeProps) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const currentTenant = user?.tenant
  if (!currentTenant) return null

  const tenants = [
    {
      id: currentTenant.id,
      name: currentTenant.name,
      slug: currentTenant.slug,
      logo_path: currentTenant.logo_path,
    },
  ]

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()),
  )

  const initials = (name: string) =>
    name
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? '')
      .join('')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-2 rounded-full border-border/70 bg-background/60 px-2.5 pr-2 font-medium shadow-none transition-all',
            'hover:bg-accent/60 hover:shadow-sm',
            className,
          )}
          aria-label={t('tenant.current', { defaultValue: 'Empresa atual' })}
        >
          <Avatar className="h-6 w-6 ring-1 ring-border">
            <AvatarImage src={currentTenant.logo_path ?? undefined} alt={currentTenant.name} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-[9px] font-semibold text-primary-foreground">
              {initials(currentTenant.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-xs font-medium tracking-tight md:inline-flex max-w-[140px] truncate">
            {currentTenant.name}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-80 p-0">
        <div className="space-y-2 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('tenant.current', { defaultValue: 'Empresa atual' })}
              </p>
              <p className="truncate text-xs font-medium text-foreground">{currentTenant.name}</p>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tenant.search', { defaultValue: 'Pesquisar empresa...' })}
              className="h-8 pl-8 pr-3 text-xs"
            />
          </div>
        </div>
        <Separator />
        <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">Sem resultados</p>
            </div>
          ) : (
            filtered.map((tenant) => {
              const isCurrent = tenant.id === currentTenant.id
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setQuery('')
                  }}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
                    isCurrent
                      ? 'bg-accent/60'
                      : 'hover:bg-accent/40',
                  )}
                >
                  <Avatar className="h-7 w-7 ring-1 ring-border">
                    <AvatarImage src={tenant.logo_path ?? undefined} alt={tenant.name} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-[10px] font-semibold text-primary-foreground">
                      {initials(tenant.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{tenant.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{tenant.slug}</p>
                  </div>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              )
            })
          )}
        </div>
        <Separator />
        <div className="p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => setOpen(false)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('tenant.new', { defaultValue: 'Nova empresa' })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

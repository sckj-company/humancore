import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, ChevronsUpDown, Check, Plus, Search } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

interface TenantOption {
  id: number
  name: string
  slug: string
  status?: string
  logo_path?: string
  is_headquarter?: boolean
}

interface TenantSwitcherProps {
  tenants: TenantOption[]
  currentId?: number
  onSelect?: (tenant: TenantOption) => void
  collapsed?: boolean
}

function TenantBadge({ name, logo }: { name: string; logo?: string }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-sidebar-border"
      />
    )
  }
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30">
      {initials || <Building2 className="h-4 w-4" />}
    </div>
  )
}

export function TenantSwitcher({ tenants, currentId, onSelect, collapsed }: TenantSwitcherProps) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const active = tenants.find((tnt) => tnt.id === (currentId ?? user?.tenant?.id)) ?? tenants[0]
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  if (!active) return null

  const filtered = tenants.filter((tnt) =>
    tnt.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2 text-left transition-all',
            'hover:border-sidebar-primary/40 hover:bg-sidebar-accent',
            collapsed && 'justify-center',
          )}
          aria-label="Selecionar empresa"
        >
          <TenantBadge name={active.name} logo={active.logo_path} />
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">
                    {active.name}
                  </p>
                  {active.is_headquarter && (
                    <span className="rounded bg-warning/20 px-1 text-[9px] font-bold uppercase text-warning">
                      HQ
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
                  {t('tenant.current', { defaultValue: 'Empresa atual' })}
                </p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40 transition-transform group-hover:text-sidebar-foreground/70" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-72 p-0"
      >
        <div className="space-y-1 p-2">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('tenant.switch', { defaultValue: 'Trocar empresa' })}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tenant.search', { defaultValue: 'Pesquisar empresa...' })}
              className="h-8 pl-5 text-xs"
            />
          </div>
        </div>
        <Separator />
        <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {t('common.no_data')}
            </p>
          )}
          {filtered.map((tnt) => {
            const selected = tnt.id === active.id
            return (
              <button
                key={tnt.id}
                type="button"
                onClick={() => {
                  onSelect?.(tnt)
                  setOpen(false)
                  setQuery('')
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
                  'hover:bg-accent',
                  selected && 'bg-accent',
                )}
              >
                <TenantBadge name={tnt.name} logo={tnt.logo_path} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="truncate text-sm font-medium">{tnt.name}</p>
                    {tnt.is_headquarter && (
                      <span className="rounded bg-warning/20 px-1 text-[9px] font-bold uppercase text-warning">
                        HQ
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {tnt.slug}
                  </p>
                </div>
                {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
        <Separator />
        <div className="p-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('tenant.new', { defaultValue: 'Nova empresa' })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
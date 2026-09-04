import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Users,
  CalendarCheck,
  CalendarDays,
  Wallet,
  FileText,
  BarChart3,
  Building2,
  Settings,
  LayoutDashboard,
  Loader2,
  CornerDownLeft,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useUiStore } from '@/stores/ui-store'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import type { Paginated, EmployeeSummary } from '@/types'

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const moduleLinks = [
  { titleKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, roles: [] as string[] },
  { titleKey: 'nav.employees', href: '/employees', icon: Users, roles: [] as string[] },
  { titleKey: 'nav.attendance', href: '/attendance', icon: CalendarCheck, roles: [] as string[] },
  { titleKey: 'nav.leave', href: '/leave', icon: CalendarDays, roles: [] as string[] },
  { titleKey: 'nav.payroll', href: '/payroll', icon: Wallet, roles: ['admin', 'hr-manager'] },
  { titleKey: 'nav.documents', href: '/documents', icon: FileText, roles: [] as string[] },
  { titleKey: 'nav.reports', href: '/reports', icon: BarChart3, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.organization', href: '/organization', icon: Building2, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.settings', href: '/settings', icon: Settings, roles: ['admin', 'super-admin'] },
]

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [internalOpen, setInternalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const user = useAuthStore((s) => s.user)
  const setPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)

  // Open from global store (Header trigger)
  useEffect(() => {
    if (controlledOpen === undefined) return
    setPaletteOpen(controlledOpen)
  }, [controlledOpen, setPaletteOpen])

  // Listen for global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (controlledOpen === undefined) setInternalOpen((v) => !v)
        else onOpenChange?.(!controlledOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controlledOpen, onOpenChange])

  const debounced = useDebounced(query, 200)

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['cmd', 'search', debounced],
    queryFn: () => api.get<{ results: { group: string; icon: string; items: any[] }[]; total: number }>('search', { q: debounced, limit: 6 }),
    enabled: debounced.length >= 2,
  })

  const employeeResults = searchResults
    ? { data: searchResults.results.find((r) => r.group === 'Funcionários')?.items ?? [] }
    : null

  const visibleModules = useMemo(
    () =>
      moduleLinks.filter(
        (m) => m.roles.length === 0 || hasAnyRole(user, m.roles),
      ),
    [user],
  )

  const handleSelect = (href: string) => {
    setOpen(false)
    setQuery('')
    navigate(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t('command.placeholder', {
          defaultValue: 'Pesquisar no HRMS — funcionários, módulos, ações...',
        })}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="scrollbar-thin">
        <CommandEmpty>
          {isFetching ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.loading')}
            </span>
          ) : (
            t('command.empty', { defaultValue: 'Nenhum resultado encontrado.' })
          )}
        </CommandEmpty>

        {employeeResults && employeeResults.data.length > 0 && (
          <CommandGroup heading={t('nav.employees')} className="!pb-1">
            {employeeResults.data.map((e) => (
              <CommandItem
                key={e.id}
                value={`employee-${e.id}-${e.full_name}`}
                onSelect={() => handleSelect(`/employees/${e.id}`)}
                className="flex items-center gap-3"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={e.photo_path ?? undefined} alt={e.full_name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                    {e.full_name
                      .split(' ')
                      .slice(0, 2)
                      .map((n: string) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col overflow-hidden">
                  <span className="truncate text-sm">{e.full_name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {e.position ?? '—'} · {e.department ?? '—'}
                  </span>
                </div>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {e.employee_code}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {employeeResults && employeeResults.data.length > 0 && <CommandSeparator />}

        <CommandGroup heading={t('command.modules', { defaultValue: 'Módulos' })}>
          {visibleModules.map((m) => {
            const Icon = m.icon
            return (
              <CommandItem
                key={m.href}
                value={`module-${m.titleKey}`}
                onSelect={() => handleSelect(m.href)}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span>{t(m.titleKey)}</span>
                <CornerDownLeft className="ml-auto h-3 w-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px]">
            ↑↓
          </kbd>
          <span>{t('command.navigate', { defaultValue: 'Navegar' })}</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px]">
            ↵
          </kbd>
          <span>{t('command.select', { defaultValue: 'Selecionar' })}</span>
        </div>
        <span className="flex items-center gap-1">
          <Search className="h-3 w-3" />
          {t('app.name')}
        </span>
      </div>
    </CommandDialog>
  )
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
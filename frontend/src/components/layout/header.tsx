import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { isPlatformAdmin, useAuthStore } from '@/stores/auth-store'
import { Building2, Check, ChevronsUpDown, CornerUpLeft, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { NotificationBell } from '@/components/layout/notification-bell'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

interface AccessibleTenantOption {
  id: number
  name: string
  slug: string
  tax_id?: string | null
  status?: string
  logo_path?: string | null
  is_managed?: boolean
}

export function Header() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = isPlatformAdmin(user)
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') ?? String(user?.tenant?.id ?? '')

  useEffect(() => {
    if (!companyDialogOpen) {
      setCompanySearch('')
      setDebouncedSearch('')
      return
    }
    const trimmed = companySearch.trim()
    if (!trimmed) {
      setDebouncedSearch('')
      return
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(trimmed)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [companySearch, companyDialogOpen])

  const { data: switcherTenants, isFetching: isSearchingTenants } = useQuery({
    queryKey: ['companies', 'accessible', debouncedSearch],
    queryFn: () =>
      api.get<AccessibleTenantOption[]>('companies/accessible', {
        search: debouncedSearch || undefined,
        status: 'active',
      }),
    enabled: companyDialogOpen,
    placeholderData: keepPreviousData,
  })

  const initialTenants: AccessibleTenantOption[] = user?.accessible_tenants?.length
    ? user.accessible_tenants
    : (user?.tenant ? [user.tenant] : [])
  const modalTenants = switcherTenants ?? initialTenants.filter((tenant) => !tenant.status || tenant.status === 'active')
  const canSwitchCompany = isSuperAdmin || initialTenants.length > 1

  const activeTenant =
    switcherTenants?.find((tenant) => String(tenant.id) === selectedTenantId)
    ?? initialTenants.find((tenant) => String(tenant.id) === selectedTenantId)
    ?? user?.tenant
  const isOperatingInManaged = Boolean(
    user?.home_tenant_id && activeTenant?.id && Number(user.home_tenant_id) !== Number(activeTenant.id),
  )

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {canSwitchCompany ? (
          <Button
            variant="ghost"
            className="min-w-0 justify-start gap-2 px-2 text-left"
            onClick={() => setCompanyDialogOpen(true)}
          >
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
                <span className="truncate">{activeTenant?.name ?? t('tenant.select', { defaultValue: 'Selecionar empresa' })}</span>
                {isOperatingInManaged && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {t('tenant.managedBadge')}
                  </Badge>
                )}
              </span>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                {t('tenant.current', { defaultValue: 'Empresa ativa' })}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        ) : (
          <div className="flex min-w-0 items-center gap-2 px-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-foreground">
              {activeTenant?.name ?? t('tenant.label', { defaultValue: 'Empresa' })}
            </span>
          </div>
        )}
        {isOperatingInManaged && user?.home_tenant_id && (
          <Button
            variant="outline"
            size="sm"
            className="hidden h-7 gap-1 text-xs md:inline-flex"
            onClick={() => {
              localStorage.setItem('hrms_selected_tenant', String(user.home_tenant_id))
              window.location.reload()
            }}
          >
            <CornerUpLeft className="h-3 w-3" />
            {t('tenant.backToManager')}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <NotificationBell />
      </div>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="flex h-[75vh] max-h-[85vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('tenant.select', { defaultValue: 'Selecionar empresa' })}</DialogTitle>
            <DialogDescription className="flex items-center justify-between gap-2">
              <span>{t('tenant.selectDescription', { defaultValue: 'Escolha a empresa ativa para gerir.' })}</span>
              <span className="shrink-0 text-xs font-medium tabular-nums">
                {t('tenant.activeCount', { count: modalTenants.length, defaultValue: '{{count}} empresas ativas' })}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={companySearch}
              onChange={(event) => setCompanySearch(event.target.value)}
              placeholder={t('tenant.searchByNameOrNif', { defaultValue: 'Pesquisar por nome ou NIF...' })}
              aria-label={t('tenant.searchByNameOrNif', { defaultValue: 'Pesquisar por nome ou NIF...' })}
              className="pl-9 pr-9"
            />
            {isSearchingTenants && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isSuperAdmin && !user?.home_tenant_id && (
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('hrms_selected_tenant')
                  setCompanyDialogOpen(false)
                  window.location.reload()
                }}
                className="flex w-full items-center gap-3 border-b border-border px-2 py-3 text-left hover:bg-accent"
              >
                <Building2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t('tenant.globalView', { defaultValue: 'Visão global da plataforma' })}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t('tenant.globalViewDescription', { defaultValue: 'Dados genéricos sem empresa selecionada' })}</span>
                </span>
                {!selectedTenantId && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )}
            {modalTenants.length ? modalTenants.map((tenant) => {
              const isSelected = String(tenant.id) === selectedTenantId
              return (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => {
                    localStorage.setItem('hrms_selected_tenant', String(tenant.id))
                    setCompanyDialogOpen(false)
                    window.location.reload()
                  }}
                  className="flex w-full items-center gap-3 border-b border-border px-2 py-3 text-left hover:bg-accent"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{tenant.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      NIF: <span className="font-mono">{tenant.tax_id || '—'}</span>
                    </span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            }) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.no_data')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}

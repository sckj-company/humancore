import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth-store'
import { Building2, Check, ChevronsUpDown, Globe, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import i18n from '@/lib/i18n'
import { NotificationBell } from '@/components/layout/notification-bell'
import type { Paginated, Tenant } from '@/types'

export function Header() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.roles?.includes('super-admin') ?? false
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [companySearch, setCompanySearch] = useState('')
  const selectedTenantId = localStorage.getItem('hrms_selected_tenant') ?? String(user?.tenant?.id ?? '')
  const { data: tenantPage } = useQuery({
    queryKey: ['superadmin', 'tenant-switcher'],
    queryFn: () => api.get<Paginated<Tenant>>('superadmin/tenants', { per_page: 1000 }),
    enabled: isSuperAdmin,
  })

  useEffect(() => {
    if (!isSuperAdmin || selectedTenantId || !tenantPage?.data?.length) return
    const defaultTenant = tenantPage.data.find((tenant) => tenant.status === 'active') ?? tenantPage.data[0]
    localStorage.setItem('hrms_selected_tenant', String(defaultTenant.id))
    window.location.reload()
  }, [isSuperAdmin, selectedTenantId, tenantPage])

  const activeTenant = isSuperAdmin
    ? tenantPage?.data?.find((tenant) => String(tenant.id) === selectedTenantId) ?? user?.tenant
    : user?.tenant
  const filteredTenants = (tenantPage?.data ?? []).filter((tenant) =>
    `${tenant.name} ${tenant.slug}`.toLocaleLowerCase().includes(companySearch.trim().toLocaleLowerCase()),
  )

  const switchLang = (lng: 'pt' | 'en' | 'zh') => {
    localStorage.setItem('hrms_bilingual', 'false')
    document.documentElement.classList.remove('bilingual')
    void i18n.changeLanguage(lng)
    localStorage.setItem('hrms_locale', lng)
  }

  const switchToBilingual = () => {
    localStorage.setItem('hrms_bilingual', 'true')
    localStorage.setItem('hrms_locale', 'pt')
    document.documentElement.classList.add('bilingual')
    void i18n.changeLanguage('pt')
  }

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-3 md:px-6">
      {isSuperAdmin ? (
        <Button
          variant="ghost"
          className="min-w-0 justify-start gap-2 px-2 text-left"
          onClick={() => setCompanyDialogOpen(true)}
        >
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {activeTenant?.name ?? 'Selecionar empresa'}
            </span>
            <span className="hidden text-[10px] text-muted-foreground sm:block">Empresa ativa</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      ) : (
        <div className="flex min-w-0 items-center gap-2 px-2">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">
            {activeTenant?.name ?? 'Empresa'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => switchLang('pt')}>Português</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchLang('en')}>English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchLang('zh')}>中文</DropdownMenuItem>
            <DropdownMenuItem onClick={switchToBilingual}>Português + 中文</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <NotificationBell />
      </div>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar empresa</DialogTitle>
            <DialogDescription>Escolha a empresa activa para gerir.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={companySearch}
              onChange={(event) => setCompanySearch(event.target.value)}
              placeholder="Pesquisar empresa..."
              aria-label="Pesquisar empresas"
              className="pl-9"
            />
          </div>
          <div className="max-h-[55vh] overflow-y-auto">
            {filteredTenants.length ? filteredTenants.map((tenant) => {
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
                    <span className="block truncate text-xs text-muted-foreground">{tenant.slug}</span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            }) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}

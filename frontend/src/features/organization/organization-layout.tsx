import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Briefcase, MapPin } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const subPages = [
  { href: '/organization', labelKey: 'organizationPage.departments.title', icon: Building2 },
  { href: '/organization/positions', labelKey: 'organizationPage.positions.title', icon: Briefcase },
  { href: '/organization/branches', labelKey: 'organizationPage.branches.title', icon: MapPin },
]

export function OrganizationLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  const activeTab =
    subPages.find((page) =>
      page.href === '/organization'
        ? location.pathname === '/organization' || location.pathname === '/organization/'
        : location.pathname.startsWith(page.href),
    )?.href ?? '/organization'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.organization')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('organizationPage.layout.description')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => navigate(value)} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {subPages.map((p) => (
            <TabsTrigger key={p.href} value={p.href} className="gap-2 px-4 py-2">
              <p.icon className="h-4 w-4 shrink-0" />
              <span>{t(p.labelKey)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0">
          <Outlet />
        </div>
      </Tabs>
    </div>
  )
}

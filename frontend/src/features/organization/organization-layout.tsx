import { useTranslation } from 'react-i18next'
import { Outlet, NavLink } from 'react-router-dom'
import { Building2, Briefcase, MapPin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const subPages = [
  { href: '/organization', labelKey: 'organizationPage.departments.title', icon: Building2, exact: true },
  { href: '/organization/positions', labelKey: 'organizationPage.positions.title', icon: Briefcase },
  { href: '/organization/branches', labelKey: 'organizationPage.branches.title', icon: MapPin },
]

export function OrganizationLayout() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.organization')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('organizationPage.layout.description')}</p>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card>
          <CardContent className="p-2">
            <nav className="flex flex-wrap gap-1 lg:flex-col">
              {subPages.map((p) => (
                <NavLink
                  key={p.href}
                  to={p.href}
                  end={p.exact}
                  className={({ isActive }) =>
                    cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors lg:flex-none',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )
                  }
                >
                  <p.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 whitespace-normal break-words">{t(p.labelKey)}</span>
                </NavLink>
              ))}
            </nav>
          </CardContent>
        </Card>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

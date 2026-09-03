import { useTranslation } from 'react-i18next'
import { Outlet, NavLink } from 'react-router-dom'
import { Building2, Briefcase, MapPin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const subPages = [
  { href: '/organization', label: 'Departamentos', icon: Building2, exact: true },
  { href: '/organization/positions', label: 'Cargos', icon: Briefcase },
  { href: '/organization/branches', label: 'Filiais', icon: MapPin },
]

export function OrganizationLayout() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.organization')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Estrutura da empresa</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <Card>
          <CardContent className="p-2">
            {subPages.map((p) => (
              <NavLink
                key={p.href}
                to={p.href}
                end={p.exact}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <p.icon className="h-4 w-4" />
                {p.label}
              </NavLink>
            ))}
          </CardContent>
        </Card>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

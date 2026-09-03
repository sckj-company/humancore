import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarCheck,
  CalendarDays,
  Wallet,
  FileText,
  UserPlus,
  TrendingUp,
  GraduationCap,
  BarChart3,
  Settings,
  ChevronLeft,
} from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'

interface NavItem {
  titleKey: string
  href: string
  icon: typeof LayoutDashboard
  roles?: string[]
}

const items: NavItem[] = [
  { titleKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { titleKey: 'nav.organization', href: '/organization', icon: Building2, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.employees', href: '/employees', icon: Users },
  { titleKey: 'nav.attendance', href: '/attendance', icon: CalendarCheck },
  { titleKey: 'nav.leave', href: '/leave', icon: CalendarDays },
  { titleKey: 'nav.payroll', href: '/payroll', icon: Wallet, roles: ['admin', 'hr-manager'] },
  { titleKey: 'nav.documents', href: '/documents', icon: FileText },
  { titleKey: 'nav.recruitment', href: '/recruitment', icon: UserPlus, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.performance', href: '/performance', icon: TrendingUp, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.training', href: '/training', icon: GraduationCap, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.reports', href: '/reports', icon: BarChart3, roles: ['admin', 'hr-manager', 'manager'] },
  { titleKey: 'nav.settings', href: '/settings', icon: Settings, roles: ['admin', 'super-admin'] },
]

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const user = useAuthStore((s) => s.user)

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16',
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <span className="text-sm font-bold">H</span>
            </div>
            <div>
              <div className="text-sm font-semibold">{t('app.name')}</div>
              <div className="text-xs text-sidebar-foreground/60">HRMS</div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', !sidebarOpen && 'rotate-180')} />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {items.map((item) => {
          if (item.roles && !hasAnyRole(user, item.roles)) return null
          const active = location.pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {sidebarOpen && <span>{t(item.titleKey)}</span>}
            </Link>
          )
        })}
      </nav>

      {sidebarOpen && (
        <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/60">
          v0.1.0
        </div>
      )}
    </aside>
  )
}

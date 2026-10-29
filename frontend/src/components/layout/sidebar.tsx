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
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Briefcase,
  Clock,
  Activity,
  HelpCircle,
  User,
  ShieldCheck,
  Mail,
} from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { useAuthStore, hasAnyRole } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  titleKey: string
  href: string
  icon: typeof LayoutDashboard
  roles?: string[]
}

interface NavSection {
  titleKey?: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    items: [
      { titleKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'nav.section_people',
    items: [
      { titleKey: 'nav.employees', href: '/employees', icon: Users },
      { titleKey: 'nav.organization', href: '/organization', icon: Building2, roles: ['admin', 'hr-manager', 'manager'] },
      { titleKey: 'nav.recruitment', href: '/recruitment', icon: UserPlus, roles: ['admin', 'hr-manager', 'manager'] },
    ],
  },
  {
    titleKey: 'nav.section_time',
    items: [
      { titleKey: 'nav.attendance', href: '/attendance', icon: CalendarCheck },
      { titleKey: 'nav.leave', href: '/leave', icon: CalendarDays },
      { titleKey: 'nav.schedules', href: '/schedules', icon: Clock, roles: ['admin', 'hr-manager', 'manager'] },
    ],
  },
  {
    titleKey: 'nav.section_management',
    items: [
      { titleKey: 'nav.payroll', href: '/payroll', icon: Wallet, roles: ['admin', 'hr-manager'] },
      { titleKey: 'nav.documents', href: '/documents', icon: FileText },
      { titleKey: 'nav.performance', href: '/performance', icon: TrendingUp, roles: ['admin', 'hr-manager', 'manager'] },
      { titleKey: 'nav.training', href: '/training', icon: GraduationCap, roles: ['admin', 'hr-manager', 'manager'] },
      { titleKey: 'nav.trainings', href: '/trainings', icon: GraduationCap, roles: ['admin', 'hr-manager'] },
    ],
  },
  {
    titleKey: 'nav.section_analytics',
    items: [
      { titleKey: 'nav.reports', href: '/reports', icon: BarChart3, roles: ['admin', 'hr-manager', 'manager'] },
      { titleKey: 'nav.audits', href: '/audits', icon: Activity, roles: ['admin', 'super-admin', 'hr-manager'] },
      { titleKey: 'nav.emailTemplates', href: '/email-templates', icon: Mail, roles: ['admin', 'super-admin'] },
    ],
  },
]

const footerItems: NavItem[] = [
  { titleKey: 'nav.settings', href: '/settings', icon: Settings, roles: ['admin', 'super-admin'] },
  { titleKey: 'nav.help', href: '/help', icon: HelpCircle },
  { titleKey: 'nav.profile', href: '/profile', icon: User },
]

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { t } = useTranslation()
  const location = useLocation()
  const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
  const Icon = item.icon

  const link = (
    <Link
      to={item.href}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/30'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        collapsed && 'justify-center px-2',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-transform',
          active && 'scale-110',
          !active && 'group-hover:scale-105',
        )}
      />
      {!collapsed && <span className="truncate">{t(item.titleKey)}</span>}
      {active && !collapsed && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary-foreground shadow-sm" />
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {t(item.titleKey)}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

export function Sidebar() {
  const { t } = useTranslation()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const user = useAuthStore((s) => s.user)

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'relative flex h-screen flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-16',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30">
            <Briefcase className="h-5 w-5 text-primary-foreground" />
            <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-sidebar-background" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight truncate">{t('app.name')}</span>
                <Sparkles className="h-3 w-3 shrink-0 text-warning" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50 truncate">
                {t('app.tagline_short', { defaultValue: 'Enterprise' })}
              </span>
            </div>
          )}
        </div>

        {/* Navigation & all items housed inside sidebar scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
          <nav className="space-y-5">
            {sections.map((section, idx) => {
              const visibleItems = section.items.filter(
                (item) => !item.roles || hasAnyRole(user, item.roles),
              )
              if (visibleItems.length === 0) return null

              return (
                <div key={idx} className="space-y-1">
                  {section.titleKey && sidebarOpen && (
                    <h3 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                      {t(section.titleKey)}
                    </h3>
                  )}
                  {sidebarOpen && idx > 0 && visibleItems.length > 0 && (
                    <Separator className="my-2 bg-sidebar-border/50" />
                  )}
                  {visibleItems.map((item) => (
                    <NavLink key={item.href} item={item} collapsed={!sidebarOpen} />
                  ))}
                </div>
              )
            })}
          </nav>

          {/* Separator before footer items */}
          <div className="my-4 border-t border-sidebar-border/50" />

          {/* Footer items housed inside the scroll */}
          <div className="space-y-1">
            {footerItems
              .filter((item) => !item.roles || hasAnyRole(user, item.roles))
              .map((item) => (
                <NavLink key={item.href} item={item} collapsed={!sidebarOpen} />
              ))}
          </div>

          {sidebarOpen && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-sidebar-accent/40 px-3 py-2">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" />
              <span className="text-[10px] font-medium text-sidebar-foreground/70 truncate">
                {t('app.system_status', { defaultValue: 'Sistema operacional' })}
              </span>
              <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-success" />
            </div>
          )}
        </div>

        {/* Collapse Toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          className={cn(
            'absolute -right-3 top-20 z-50 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-foreground/70 shadow-md',
            'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? (
            <ChevronsLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronsRight className="h-3.5 w-3.5" />
          )}
        </Button>
      </aside>
    </TooltipProvider>
  )
}
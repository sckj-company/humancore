import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Building2,
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
  Globe2,
  Shield,
  CalendarCheck,
  Gift,
  CircleDollarSign,
  LogOut,
  UserRound,
} from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { hasAnyRole, hasPermission, isPlatformAdmin, useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'

interface NavItem {
  titleKey: string
  href: string
  icon: typeof LayoutDashboard
  roles?: string[]
  permission?: string
}

interface NavSection {
  titleKey?: string
  items: NavItem[]
}

// Menus exclusivos do super-admin (plataforma)
const superAdminSections: NavSection[] = [
  {
    items: [
      { titleKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'view_any_tenant' },
    ],
  },
  {
    titleKey: 'nav.section_platform',
    items: [
      { titleKey: 'nav.tenants', href: '/admin/tenants', icon: Globe2, permission: 'view_any_tenant' },
      { titleKey: 'nav.audits', href: '/audits', icon: Activity, permission: 'view_any_audit' },
    ],
  },
]

const superAdminFooterItems: NavItem[] = [
  { titleKey: 'nav.settings', href: '/settings', icon: Settings, permission: 'view_any_setting' },
]

// Menus normais dos utilizadores de tenant
const sections: NavSection[] = [
  {
    items: [
      { titleKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'view_any_employee' },
    ],
  },
  {
    titleKey: 'nav.section_people',
    items: [
      { titleKey: 'nav.employees', href: '/employees', icon: Users, permission: 'view_any_employee' },
      { titleKey: 'nav.organization', href: '/organization', icon: Building2, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_department' },
      { titleKey: 'nav.recruitment', href: '/recruitment', icon: UserPlus, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_recruitment' },
    ],
  },
  {
    titleKey: 'nav.section_time',
    items: [
      { titleKey: 'nav.attendance', href: '/attendance', icon: CalendarCheck, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_attendance' },
      { titleKey: 'nav.schedules', href: '/schedules', icon: Clock, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_attendance' },
    ],
  },
  {
    titleKey: 'nav.section_management',
    items: [
      { titleKey: 'nav.payroll', href: '/payroll', icon: Wallet, roles: ['admin', 'hr-manager'], permission: 'view_any_payroll' },
      { titleKey: 'nav.salaryComponents', href: '/settings/payroll-components', icon: CircleDollarSign, roles: ['admin', 'hr-manager'], permission: 'view_any_salary-component' },
      { titleKey: 'nav.documents', href: '/documents', icon: FileText, permission: 'view_any_document' },
      { titleKey: 'nav.performance', href: '/performance', icon: TrendingUp, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_performance' },
      { titleKey: 'nav.training', href: '/training', icon: GraduationCap, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_training' },
      { titleKey: 'nav.trainings', href: '/trainings', icon: GraduationCap, roles: ['admin', 'hr-manager'], permission: 'view_any_training' },
      { titleKey: 'nav.benefits', href: '/benefits', icon: Gift, roles: ['admin', 'hr-manager'], permission: 'view_any_benefit' },
      { titleKey: 'nav.deductions', href: '/deductions', icon: CircleDollarSign, roles: ['admin', 'hr-manager'], permission: 'view_any_deduction' },
    ],
  },
  {
    titleKey: 'nav.section_analytics',
    items: [
      { titleKey: 'nav.reports', href: '/reports', icon: BarChart3, roles: ['admin', 'hr-manager', 'manager'], permission: 'view_any_report' },
      { titleKey: 'nav.audits', href: '/audits', icon: Activity, roles: ['admin', 'hr-manager'], permission: 'view_any_audit' },
      { titleKey: 'nav.emailTemplates', href: '/email-templates', icon: Mail, roles: ['admin'], permission: 'view_any_email-template' },
    ],
  },
]

const footerItems: NavItem[] = [
  { titleKey: 'nav.settings', href: '/settings', icon: Settings, roles: ['admin'], permission: 'view_any_setting' },
  { titleKey: 'nav.help', href: '/help', icon: HelpCircle },
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
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()
  const isSuperAdmin = user?.roles?.includes('super-admin') ?? false
  const hasPlatformRole = isPlatformAdmin(user)
  const enforceAssignedPermissions = hasPlatformRole && !isSuperAdmin

  const logout = async () => {
    try {
      await api.post('auth/logout')
    } catch {}
    clear()
    toast.success(t('auth.logged_out'))
    navigate('/login')
  }

  const activeSections = hasPlatformRole
    ? [superAdminSections[0], ...sections.slice(1), superAdminSections[1]]
    : sections
  const activeFooterItems = hasPlatformRole ? superAdminFooterItems : footerItems

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
          {/* Badge de super-admin */}
          {hasPlatformRole && sidebarOpen && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Super Admin
              </span>
            </div>
          )}
          {hasPlatformRole && !sidebarOpen && (
            <div className="mb-4 flex justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
          )}
          <nav className="space-y-5">
            {activeSections.map((section, idx) => {
              const visibleItems = section.items.filter(
                (item) => (isSuperAdmin || enforceAssignedPermissions || !item.roles || hasAnyRole(user, item.roles))
                  && (!enforceAssignedPermissions || !item.permission || hasPermission(user, item.permission)),
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
            {activeFooterItems
              .filter((item) => isSuperAdmin || enforceAssignedPermissions || !item.roles || hasAnyRole(user, item.roles))
              .filter((item) => !enforceAssignedPermissions || !item.permission || hasPermission(user, item.permission))
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

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu do utilizador"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-sidebar-accent',
                  !sidebarOpen && 'justify-center',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user?.employee?.photo_path ?? undefined} alt={user?.name} />
                  <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                    {user?.name?.split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') ?? '?'}
                  </AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user?.name}</span>
                    <span className="block truncate text-xs text-sidebar-foreground/60">{user?.email}</span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align={sidebarOpen ? 'start' : 'end'} className="w-56">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile')}>
                <UserRound className="mr-2 h-4 w-4" />{t('nav.profile')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />{t('auth.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
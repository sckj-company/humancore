import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Home } from 'lucide-react'

interface BreadcrumbProps {
  pathname: string
}

const segments: Record<string, string> = {
  dashboard: 'nav.dashboard',
  employees: 'nav.employees',
  organization: 'nav.organization',
  attendance: 'nav.attendance',
  leave: 'nav.leave',
  payroll: 'nav.payroll',
  documents: 'nav.documents',
  recruitment: 'nav.recruitment',
  performance: 'nav.performance',
  training: 'nav.training',
  reports: 'nav.reports',
  settings: 'nav.settings',
  profile: 'nav.profile',
  departments: 'nav.departments',
  positions: 'nav.positions',
  branches: 'nav.branches',
  new: 'employees.add',
}

export function PageBreadcrumb({ pathname }: BreadcrumbProps) {
  const { t } = useTranslation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const crumbs: { label: string; href: string }[] = []
  let acc = ''

  parts.forEach((seg, idx) => {
    acc += '/' + seg
    const isId = /^\d+$/.test(seg)
    if (isId && idx > 0) {
      crumbs.push({ label: `#${seg}`, href: acc })
      return
    }
    const key = segments[seg]
    const label = key ? t(key, { defaultValue: seg }) : seg
    crumbs.push({ label, href: acc })
  })

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        to="/dashboard"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
      >
        <Home className="h-3 w-3" />
        <span className="sr-only">{t('nav.dashboard')}</span>
      </Link>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1
        return (
          <span key={`${crumb.href}-${idx}`} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 opacity-50" />
            {isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.href}
                className="rounded-md px-1.5 py-1 transition-colors hover:bg-muted hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
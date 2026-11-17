import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { EmployeeEducationTab } from '@/features/employees/components/employee-education-tab'
import { hasAnyRole, hasPermission, useAuthStore } from '@/stores/auth-store'

export function GeneralEducationsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canManage =
    hasAnyRole(user, ['super-admin', 'admin', 'hr-manager'])
    || hasPermission(user, 'update_employee')
    || hasPermission(user, 'create_employee')

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('employeeEducation.generalPageTitle', { defaultValue: 'Educação Geral' })}
        description={t('employeeEducation.generalPageDescription', {
          defaultValue:
            'Termos de educação e aviso geral sem funcionário específico, para serem assinados por toda a equipa.',
        })}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/employees">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {t('employeesPage.title')}
            </Link>
          </Button>
        }
      />

      <EmployeeEducationTab canManage={canManage} />
    </div>
  )
}

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/components/layout/protected-route'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2 } from 'lucide-react'

const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })))
const HrDashboardPage = lazy(() => import('@/features/dashboard/hr-dashboard-page').then((m) => ({ default: m.HrDashboardPage })))
const ManagerDashboardPage = lazy(() => import('@/features/dashboard/manager-dashboard-page').then((m) => ({ default: m.ManagerDashboardPage })))
const EmployeeDashboardPage = lazy(() => import('@/features/dashboard/employee-dashboard-page').then((m) => ({ default: m.EmployeeDashboardPage })))
const SuperAdminDashboardPage = lazy(() => import('@/features/dashboard/super-admin-dashboard-page').then((m) => ({ default: m.SuperAdminDashboardPage })))
const EmployeesPage = lazy(() => import('@/features/employees/employees-page').then((m) => ({ default: m.EmployeesPage })))
const EmployeeDetailPage = lazy(() => import('@/features/employees/employee-detail-page').then((m) => ({ default: m.EmployeeDetailPage })))
const EmployeeCreatePage = lazy(() => import('@/features/employees/employee-create-page').then((m) => ({ default: m.EmployeeCreatePage })))
const OrganizationLayout = lazy(() => import('@/features/organization/organization-layout').then((m) => ({ default: m.OrganizationLayout })))
const DepartmentsPage = lazy(() => import('@/features/organization/departments-page').then((m) => ({ default: m.DepartmentsPage })))
const PositionsPage = lazy(() => import('@/features/organization/positions-page').then((m) => ({ default: m.PositionsPage })))
const BranchesPage = lazy(() => import('@/features/organization/branches-page').then((m) => ({ default: m.BranchesPage })))
const PayrollPeriodsPage = lazy(() => import('@/features/payroll/payroll-periods-page').then((m) => ({ default: m.PayrollPeriodsPage })))
const PayrollPeriodDetailPage = lazy(() => import('@/features/payroll/payroll-period-detail-page').then((m) => ({ default: m.PayrollPeriodDetailPage })))
const PayslipsPage = lazy(() => import('@/features/payslips/payslips-page').then((m) => ({ default: m.PayslipsPage })))
const AttendancePage = lazy(() => import('@/features/attendance/attendance-page').then((m) => ({ default: m.AttendancePage })))
const LeavePage = lazy(() => import('@/features/leave/leave-page').then((m) => ({ default: m.LeavePage })))
const SchedulesPage = lazy(() => import('@/features/schedules/schedules-page').then((m) => ({ default: m.SchedulesPage })))
const SettingsPage = lazy(() => import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })))
const EmailTemplatesPage = lazy(() => import('@/features/settings/email-templates-page').then((m) => ({ default: m.EmailTemplatesPage })))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page').then((m) => ({ default: m.DocumentsPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/notifications-page').then((m) => ({ default: m.NotificationsPage })))
const AuditPage = lazy(() => import('@/features/audit/audit-page').then((m) => ({ default: m.AuditPage })))
const ProfilePage = lazy(() => import('@/features/profile/profile-page').then((m) => ({ default: m.ProfilePage })))
const ReportsPage = lazy(() => import('@/features/reports/reports-page').then((m) => ({ default: m.ReportsPage })))
const RecruitmentPage = lazy(() => import('@/features/recruitment/recruitment-page').then((m) => ({ default: m.RecruitmentPage })))
const RecruitmentDetailPage = lazy(() => import('@/features/recruitment/recruitment-detail-page').then((m) => ({ default: m.RecruitmentDetailPage })))
const PerformancePage = lazy(() => import('@/features/performance/performance-page').then((m) => ({ default: m.PerformancePage })))
const OnboardingPage = lazy(() => import('@/features/onboarding/onboarding-page').then((m) => ({ default: m.OnboardingPage })))
const TrainingCatalogPage = lazy(() => import('@/features/training/training-catalog-page').then((m) => ({ default: m.TrainingCatalogPage })))
const BenefitsPage = lazy(() => import('@/features/benefits/benefits-page').then((m) => ({ default: m.BenefitsPage })))
const DeductionsPage = lazy(() => import('@/features/deductions/deductions-page').then((m) => ({ default: m.DeductionsPage })))
const PlaceholderPage = lazy(() => import('@/features/shared/placeholder-page').then((m) => ({ default: m.PlaceholderPage })))
const SuperAdminPage = lazy(() => import('@/features/admin/super-admin-page').then((m) => ({ default: m.SuperAdminPage })))

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center p-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function DashboardRouter() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.roles?.includes('super-admin')
  return (
    <Routes>
      <Route path="superadmin" element={<SuperAdminDashboardPage />} />
      <Route path="hr" element={<HrDashboardPage />} />
      <Route path="manager" element={<ManagerDashboardPage />} />
      <Route path="employee" element={<EmployeeDashboardPage />} />
      <Route index element={isSuperAdmin ? <SuperAdminDashboardPage /> : <HrDashboardPage />} />
    </Routes>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard/*" element={<DashboardRouter />} />

          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/employees/new" element={<EmployeeCreatePage />} />
          <Route path="/employees/:id" element={<EmployeeDetailPage />} />

          <Route path="/organization" element={<OrganizationLayout />}>
            <Route index element={<DepartmentsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="branches" element={<BranchesPage />} />
          </Route>

          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leave" element={<LeavePage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/payroll" element={<PayrollPeriodsPage />} />
          <Route path="/payroll/:id" element={<PayrollPeriodDetailPage />} />
          <Route path="/my-payslips" element={<PayslipsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/audits" element={<AuditPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/recruitment" element={<RecruitmentPage />} />
          <Route path="/recruitment/:id" element={<RecruitmentDetailPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/training" element={<OnboardingPage />} />
          <Route path="/trainings" element={<TrainingCatalogPage />} />
          <Route path="/benefits" element={<BenefitsPage />} />
          <Route path="/deductions" element={<DeductionsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/email-templates" element={<EmailTemplatesPage />} />
          <Route path="/admin/tenants" element={<SuperAdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/app-layout'
import { ProtectedRoute } from '@/components/layout/protected-route'
import { Loader2 } from 'lucide-react'

const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })))
const HrDashboardPage = lazy(() => import('@/features/dashboard/hr-dashboard-page').then((m) => ({ default: m.HrDashboardPage })))
const ManagerDashboardPage = lazy(() => import('@/features/dashboard/manager-dashboard-page').then((m) => ({ default: m.ManagerDashboardPage })))
const EmployeeDashboardPage = lazy(() => import('@/features/dashboard/employee-dashboard-page').then((m) => ({ default: m.EmployeeDashboardPage })))
const EmployeesPage = lazy(() => import('@/features/employees/employees-page').then((m) => ({ default: m.EmployeesPage })))
const EmployeeDetailPage = lazy(() => import('@/features/employees/employee-detail-page').then((m) => ({ default: m.EmployeeDetailPage })))
const EmployeeCreatePage = lazy(() => import('@/features/employees/employee-create-page').then((m) => ({ default: m.EmployeeCreatePage })))
const OrganizationLayout = lazy(() => import('@/features/organization/organization-layout').then((m) => ({ default: m.OrganizationLayout })))
const DepartmentsPage = lazy(() => import('@/features/organization/departments-page').then((m) => ({ default: m.DepartmentsPage })))
const PositionsPage = lazy(() => import('@/features/organization/positions-page').then((m) => ({ default: m.PositionsPage })))
const PayrollPeriodsPage = lazy(() => import('@/features/payroll/payroll-periods-page').then((m) => ({ default: m.PayrollPeriodsPage })))
const PayrollPeriodDetailPage = lazy(() => import('@/features/payroll/payroll-period-detail-page').then((m) => ({ default: m.PayrollPeriodDetailPage })))
const AttendancePage = lazy(() => import('@/features/attendance/attendance-page').then((m) => ({ default: m.AttendancePage })))
const LeavePage = lazy(() => import('@/features/leave/leave-page').then((m) => ({ default: m.LeavePage })))
const SettingsPage = lazy(() => import('@/features/settings/settings-page').then((m) => ({ default: m.SettingsPage })))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page').then((m) => ({ default: m.DocumentsPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/notifications-page').then((m) => ({ default: m.NotificationsPage })))
const PlaceholderPage = lazy(() => import('@/features/shared/placeholder-page').then((m) => ({ default: m.PlaceholderPage })))

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center p-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function DashboardRouter() {
  return (
    <Routes>
      <Route path="hr" element={<HrDashboardPage />} />
      <Route path="manager" element={<ManagerDashboardPage />} />
      <Route path="employee" element={<EmployeeDashboardPage />} />
      <Route index element={<HrDashboardPage />} />
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
            <Route path="branches" element={<PlaceholderPage title="Filiais" />} />
          </Route>

          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leave" element={<LeavePage />} />
          <Route path="/payroll" element={<PayrollPeriodsPage />} />
          <Route path="/payroll/:id" element={<PayrollPeriodDetailPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/recruitment" element={<PlaceholderPage title="Recrutamento" />} />
          <Route path="/performance" element={<PlaceholderPage title="Desempenho" />} />
          <Route path="/training" element={<PlaceholderPage title="Formação" />} />
          <Route path="/reports" element={<PlaceholderPage title="Relatórios" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

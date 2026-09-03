export interface User {
  id: number
  name: string
  email: string
  locale: string
  timezone: string
  is_active: boolean
  roles: string[]
  permissions: string[]
  employee?: EmployeeSummary | null
  tenant?: Tenant | null
}

export interface Tenant {
  id: number
  name: string
  slug: string
  email?: string
  phone?: string
  tax_id?: string
  logo_path?: string
  currency: string
  locale: string
  timezone: string
  status: 'active' | 'inactive' | 'suspended'
}

export interface EmployeeSummary {
  id: number
  employee_code: string
  full_name: string
  email?: string
  photo_path?: string
  position?: string
  department?: string
  status: EmployeeStatus
  hired_at?: string
  active_contract?: { id: number; base_salary: number; contract_type: ContractType }
}

export type EmployeeStatus = 'active' | 'inactive' | 'suspended' | 'terminated'
export type ContractType =
  | 'permanent'
  | 'fixed_term'
  | 'temporary'
  | 'probation'
  | 'internship'
  | 'outsourced'

export interface Employee {
  id: number
  tenant_id: number
  user_id?: number
  employee_code: string
  first_name: string
  last_name: string
  full_name: string
  email?: string
  phone?: string
  alternative_phone?: string
  birth_date?: string
  gender?: 'male' | 'female' | 'other'
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed'
  nationality?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  id_document_type?: string
  id_document_number?: string
  id_document_expiry?: string
  tax_id?: string
  social_security_id?: string
  photo_path?: string
  status: EmployeeStatus
  hired_at?: string
  probation_end?: string
  termination_at?: string
  termination_reason?: string
  department_id?: number
  position_id?: number
  manager_id?: number
  department?: Department
  position?: Position
  manager?: EmployeeSummary
  active_contract?: EmployeeContract
  created_at: string
  updated_at: string
}

export interface Department {
  id: number
  tenant_id: number
  branch_id?: number
  name: string
  code?: string
  parent_id?: number
  manager_id?: number
  cost_center?: string
  description?: string
  status: 'active' | 'inactive'
  children?: Department[]
  employee_count?: number
}

export interface Position {
  id: number
  tenant_id: number
  department_id?: number
  title: string
  code?: string
  description?: string
  requirements?: string
  salary_min?: number
  salary_max?: number
  is_management: boolean
}

export interface Branch {
  id: number
  tenant_id: number
  name: string
  code?: string
  address?: string
  city?: string
  phone?: string
  email?: string
  manager_id?: number
  is_headquarter: boolean
  status: 'active' | 'inactive'
}

export interface EmployeeContract {
  id: number
  employee_id: number
  tenant_id: number
  contract_type: ContractType
  position_id?: number
  department_id?: number
  manager_id?: number
  base_salary: number
  salary_frequency: 'monthly' | 'biweekly' | 'weekly' | 'hourly'
  work_hours_per_week?: number
  start_date: string
  end_date?: string
  is_active: boolean
  signed_at?: string
  document_path?: string
  notes?: string
  position?: Position
  department?: Department
}

export interface Paginated<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type PayrollPeriodStatus = 'open' | 'processing' | 'completed' | 'closed' | 'cancelled'

export interface PayrollPeriod {
  id: number
  tenant_id: number
  name: string
  period_type: 'monthly' | 'biweekly' | 'weekly'
  period_start: string
  period_end: string
  payment_date?: string
  status: PayrollPeriodStatus
  processed_at?: string
  closed_at?: string
  employee_count?: number
  total_gross?: number
  total_net?: number
  records?: PayrollRecord[]
}

export type PayrollRecordStatus = 'calculated' | 'approved' | 'paid' | 'rejected'

export interface PayrollBreakdownItem {
  code: string
  name: string
  type: 'earning' | 'deduction' | 'tax' | 'benefit'
  priority: number
  amount: number
}

export interface PayrollRecord {
  id: number
  employee_id: number
  payroll_period_id: number
  base_salary: number
  gross_salary: number
  total_earnings: number
  total_deductions: number
  total_taxes: number
  net_salary: number
  work_days: number
  absent_days: number
  overtime_hours: number
  overtime_amount: number
  status: PayrollRecordStatus
  approved_at?: string
  paid_at?: string
  details?: {
    breakdown?: PayrollBreakdownItem[]
    work_days?: number
    absent_days?: number
    late_minutes?: number
    overtime_hours?: number
  }
  employee?: EmployeeSummary
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday' | 'vacation' | 'sick' | 'justified'

export interface AttendanceRecord {
  id: number
  employee_id: number
  date: string
  clock_in?: string | null
  clock_out?: string | null
  break_start?: string | null
  break_end?: string | null
  total_worked?: number | null
  status: AttendanceStatus
  late_minutes: number
  overtime_minutes?: number
  notes?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'>
}

export interface LeaveBalance {
  annual_entitlement: number
  days_used: number
  days_remaining: number
  days_pending: number
}

export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveTypeSummary {
  id: number
  name: string
  code: string
  days_per_year?: number
  is_paid: boolean
  category: string
}

export interface LeaveRequest {
  id: number
  employee_id: number
  leave_type_id: number
  start_date: string
  end_date: string
  total_days: number
  reason?: string | null
  status: LeaveStatus
  approved_at?: string | null
  rejected_reason?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'>
  leave_type?: { id: number; name: string; code: string; is_paid: boolean }
  approved_by?: { id: number; name: string }
}

export interface SettingItem {
  id: number
  tenant_id: number
  group: string
  key: string
  value: string | number | boolean | Array<unknown> | Record<string, unknown> | null
}

export type SettingGroups = Record<string, SettingItem[]>

export interface EmployeeDocument {
  id: number
  employee_id: number
  name: string
  document_type: string
  original_name?: string | null
  mime_type?: string | null
  file_size?: number
  size_label?: string
  expiry_date?: string | null
  is_expiring?: boolean
  is_expired?: boolean
  notes?: string | null
  is_confidential: boolean
  created_at?: string
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'>
}


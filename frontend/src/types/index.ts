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
  stats?: { employees: number; departments: number; users: number } | null
  created_at?: string
  updated_at?: string
}

export interface EmployeeSummary {
  id: number
  employee_code: string
  full_name: string
  email?: string
  phone?: string
  photo_path?: string
  position?: string
  department?: string
  address?: string
  city?: string
  state?: string
  postal_code?: string
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

export interface AppNotification {
  id: string
  data: {
    title?: string
    message?: string
    icon?: string
    action_url?: string
  }
  read_at?: string | null
  created_at?: string
}


// Reports
export interface ReportRange {
  start: string
  end: string
}

export interface HeadcountReport {
  range: ReportRange
  summary: {
    total_employees: number
    active_employees: number
    hired_in_range: number
    terminated_in_range: number
  }
  by_department: { department_id?: number; department: string; total: number }[]
  by_status: Record<string, number>
  trend: { month: string; label: string; count: number }[]
}

export interface TurnoverReport {
  range: ReportRange
  summary: {
    hired: number
    terminated: number
    average_headcount: number
    turnover_rate: number
  }
  monthly: { month: string; label: string; hired: number; terminated: number; turnover_rate: number }[]
  by_reason: { reason: string; total: number }[]
}

export interface PayrollReportTotals {
  total_gross: number
  total_net: number
  total_taxes: number
  total_deductions: number
  total_overtime: number
}

export interface PayrollReport {
  range: ReportRange
  totals: PayrollReportTotals
  rows: {
    period_id: number
    name: string
    period_start: string
    period_end: string
    status: string
    employees: number
    total_gross: number
    total_net: number
    total_taxes: number
    total_deductions: number
    total_overtime: number
    total_absent_days: number
  }[]
  by_department: { department: string; employees: number; total_gross: number; total_net: number }[]
}

export interface AttendanceReport {
  range: ReportRange
  summary: {
    records: number
    total_hours: number
    late_minutes: number
    overtime_minutes: number
    leaves_approved: number
    leaves_pending: number
  }
  by_status: Record<string, number>
  by_department: { department: string; records: number; total_hours: number; late_minutes: number; overtime_minutes: number }[]
}

export type ReportType = 'headcount' | 'turnover' | 'payroll' | 'attendance' | 'absenteeism' | 'cost'

export type JobOpeningStatus = 'draft' | 'open' | 'on_hold' | 'closed' | 'cancelled'

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'temporary'
  | 'internship'

export type ExperienceLevel = 'intern' | 'junior' | 'mid' | 'senior' | 'lead'

export interface JobOpening {
  id: number
  title: string
  slug?: string
  description?: string | null
  requirements?: string | null
  location?: string | null
  employment_type: EmploymentType
  employment_type_label: string
  experience_level?: ExperienceLevel | null
  experience_level_label?: string
  salary_min: number | null
  salary_max: number | null
  salary_range?: string | null
  currency: string
  openings_count: number
  status: JobOpeningStatus
  status_label: string
  status_variant: 'success' | 'secondary' | 'warning' | 'info' | 'destructive'
  published_at?: string | null
  closes_at?: string | null
  closed_at?: string | null
  notes?: string | null
  candidates_count?: number
  department?: { id: number; name: string } | null
  position?: { id: number; title: string } | null
  created_by?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

export type CandidateStatus =
  | 'applied'
  | 'screening'
  | 'interview'
  | 'test'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'

export interface Candidate {
  id: number
  job_opening_id: number
  first_name: string
  last_name: string
  full_name: string
  email: string
  phone?: string | null
  location?: string | null
  source?: string | null
  resume_path?: string | null
  resume_url?: string | null
  cover_letter?: string | null
  linkedin_url?: string | null
  years_experience?: number | null
  status: CandidateStatus
  status_label: string
  expected_salary: number
  rating?: number | null
  notes?: string | null
  applied_at?: string | null
  last_status_at?: string | null
  job_opening?: { id: number; title: string } | null
  created_at?: string
  updated_at?: string
}

export interface QrCodePayload {
  hash: string
  action: 'clock_in' | 'clock_out'
  expires_at: string
  ttl_seconds: number
  qr_svg: string
}

// Performance
export type PerformanceStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type PerformanceCycle = 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'probation'

export interface PerformanceEvaluation {
  id: number
  period: string
  cycle: PerformanceCycle
  cycle_label: string
  period_start?: string | null
  period_end?: string | null
  score: number
  criteria: Record<string, number>
  strengths?: string | null
  improvements?: string | null
  goals?: string | null
  comments?: string | null
  status: PerformanceStatus
  status_label: string
  status_variant: 'success' | 'info' | 'destructive' | 'secondary'
  submitted_at?: string | null
  approved_at?: string | null
  employee?: { id: number; full_name: string; employee_code: string } | null
  evaluator?: { id: number; name: string } | null
  approver?: { id: number; name: string } | null
  created_at?: string
}

// Onboarding
export type OnboardingTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface OnboardingTemplate {
  id: number
  name: string
  description?: string | null
  is_active: boolean
  tasks_count?: number
  creator?: { id: number; name: string } | null
  tasks?: OnboardingTask[]
  created_at?: string
}

export interface OnboardingTask {
  id: number
  template_id?: number | null
  employee_id?: number | null
  assignee_id?: number | null
  title: string
  description?: string | null
  due_days: number
  due_date?: string | null
  sort_order: number
  status: OnboardingTaskStatus
  status_label: string
  status_variant: 'success' | 'info' | 'destructive' | 'secondary'
  completed_at?: string | null
  notes?: string | null
  employee?: { id: number; full_name: string; employee_code: string } | null
  assignee?: { id: number; name: string } | null
  completer?: { id: number; name: string } | null
  created_at?: string
}

// Training
export type TrainingStatus = 'planned' | 'open' | 'in_progress' | 'completed' | 'cancelled'
export type TrainingCategory = 'technical' | 'soft_skills' | 'leadership' | 'compliance' | 'safety' | 'onboarding' | 'other'
export type TrainingAssignmentStatus = 'enrolled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

export interface Training {
  id: number
  title: string
  description?: string | null
  category: TrainingCategory
  category_label: string
  duration_hours: number
  provider?: string | null
  location?: string | null
  cost: number
  currency: string
  max_participants?: number | null
  start_date?: string | null
  end_date?: string | null
  status: TrainingStatus
  status_label: string
  status_variant: 'success' | 'info' | 'destructive' | 'secondary'
  notes?: string | null
  enrolled_count: number
  creator?: { id: number; name: string } | null
  assignments?: TrainingAssignment[]
  created_at?: string
}

export interface TrainingAssignment {
  id: number
  training_id: number
  employee_id: number
  status: TrainingAssignmentStatus
  status_label: string
  status_variant: 'success' | 'info' | 'destructive' | 'secondary'
  enrolled_at?: string | null
  completed_at?: string | null
  score: number
  notes?: string | null
  employee?: { id: number; full_name: string; employee_code: string } | null
  training?: { id: number; title: string } | null
  completer?: { id: number; name: string } | null
  created_at?: string
}

// Benefits & Deductions
export type BenefitType =
  | 'health_insurance'
  | 'transport'
  | 'meal'
  | 'housing'
  | 'vehicle'
  | 'phone'
  | 'education'
  | 'gym'
  | 'other'

export type DeductionType =
  | 'loan'
  | 'advance'
  | 'pension'
  | 'insurance'
  | 'garnishment'
  | 'union_fee'
  | 'other'

export type DeductionStatus = 'active' | 'paused' | 'completed' | 'cancelled'
export type BenefitStatus = 'active' | 'inactive'
export type AmountType = 'fixed' | 'percentage'

export interface Benefit {
  id: number
  employee_id: number
  name: string
  benefit_type: BenefitType
  type_label: string
  amount_type: AmountType
  amount_type_label: string
  amount: number
  percentage?: number | null
  amount_label: string
  is_taxable: boolean
  provider?: string | null
  start_date?: string | null
  end_date?: string | null
  status: BenefitStatus
  status_label: string
  status_variant: 'success' | 'secondary'
  is_current: boolean
  notes?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'> | null
  created_at?: string
  updated_at?: string
}

export interface Deduction {
  id: number
  employee_id: number
  name: string
  deduction_type: DeductionType
  type_label: string
  amount_type: AmountType
  amount_type_label: string
  amount: number
  percentage?: number | null
  amount_label: string
  total_amount?: number | null
  paid_amount: number
  installment_count?: number | null
  installment_amount?: number | null
  is_recurring: boolean
  status: DeductionStatus
  status_label: string
  status_variant: 'success' | 'warning' | 'info' | 'destructive'
  progress_label: string
  approved_by?: number | null
  approved_at?: string | null
  notes?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'> | null
  approver?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

// Schedules & Shifts
export type ShiftWorkingDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Shift {
  id: number
  name: string
  code?: string | null
  start_time: string
  end_time: string
  break_minutes?: number | null
  work_hours: number
  late_tolerance_minutes?: number | null
  working_days?: number[] | null
  color?: string | null
  is_night_shift: boolean
  is_active: boolean
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface EmployeeSchedule {
  id: number
  employee_id: number
  shift_id: number
  effective_from?: string | null
  effective_to?: string | null
  custom_days?: number[] | null
  is_active: boolean
  notes?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'> | null
  shift?: Pick<Shift, 'id' | 'name' | 'code' | 'start_time' | 'end_time' | 'color'> | null
  created_at?: string
}

export interface Holiday {
  id: number
  name: string
  date: string
  is_recurring: boolean
  type?: string | null
  description?: string | null
  created_at?: string
}

// Global search
export interface GlobalSearchResult {
  type: 'employee' | 'department' | 'payroll_record'
  id: number
  title: string
  subtitle?: string
  status?: string
  avatar?: string | null
}

// Email Templates
export type EmailTemplateEvent =
  | 'employee_created'
  | 'employee_terminated'
  | 'leave_requested'
  | 'leave_approved'
  | 'leave_rejected'
  | 'payslip_available'
  | 'payroll_processed'
  | 'contract_expiring'
  | 'document_expiring'
  | 'custom'

export interface EmailTemplate {
  id: number
  name: string
  code: string
  event: EmailTemplateEvent | null
  event_label: string
  subject: string
  body: string
  variables: string[]
  is_active: boolean
  is_system: boolean
  notes?: string | null
  creator?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

// Super Admin
export interface SuperAdminDashboard {
  kpis: {
    total_tenants: number
    active_tenants: number
    suspended_tenants: number
    total_employees: number
    total_users: number
  }
  tenant_trend: { month: string; label: string; count: number }[]
  segments: { small: number; medium: number; large: number }
}

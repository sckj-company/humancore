export interface User {
  id: number
  name: string
  email: string
  locale: string
  timezone: string
  is_active: boolean
  roles: string[]
  permissions: string[]
  tenant_id?: number | null
  home_tenant_id?: number | null
  accessible_tenants?: Array<{ id: number; name: string; slug: string; status?: string; logo_path?: string | null; is_managed?: boolean }>
  active_department_ids?: number[] | null
  active_permission_group_id?: number | null
  employee?: EmployeeSummary | null
  tenant?: Tenant | null
  entitlements?: TenantEntitlements | null
}

export interface Tenant {
  id: number
  name: string
  slug: string
  email?: string
  billing_email?: string | null
  phone?: string
  tax_id?: string          // NIF angolano (10 dígitos)
  inss_number?: string     // Nº INSS
  legal_entity_type?: string  // lda, sa, unipessoal, etc.
  economic_sector?: string    // Sector de actividade
  logo_path?: string
  address?: string
  city?: string
  province?: string        // Província angolana
  country?: string
  postal_code?: string
  website?: string
  currency: string
  locale: string
  timezone: string
  status: 'active' | 'inactive' | 'suspended'
  origin_type?: 'platform' | 'agency' | 'self_service'
  created_by_tenant_id?: number | null
  stats?: { employees: number; departments: number; users: number; managed_tenants?: number } | null
  subscription?: {
    id: number
    plan_id: number
    plan_name?: string | null
    status: string
    ends_at?: string | null
    custom_price?: number | null
  } | null
  managed_by?: {
    relationship_id: number
    relationship_type: string
    manager_tenant_id: number
    manager_tenant_name: string
  } | null
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
  approval_status?: 'pending' | 'approved'
  approved_at?: string | null
  hired_at?: string
  active_contract?: {
    id?: number
    base_salary: number | null
    contract_type: ContractType
    end_date?: string | null
    is_active?: boolean
  }
  is_contract_expired?: boolean
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
  overtime_hourly_rate?: number | null
  photo_path?: string
  photo_url?: string
  status: EmployeeStatus
  approval_status?: 'pending' | 'approved'
  approved_at?: string | null
  unverified_documents_count?: number
  documents_count?: number
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
  active_schedule?: {
    id: number
    employee_id: number
    shift_id: number
    effective_from?: string
    effective_to?: string | null
    custom_days?: number[] | null
    is_active: boolean
    notes?: string | null
    shift?: {
      id: number
      name: string
      code?: string | null
      start_time: string
      end_time: string
      work_hours: number
      color?: string | null
      is_night_shift: boolean
    }
  } | null
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
  document_url?: string
  notes?: string
  termination_type?: string | null
  termination_reason?: string | null
  termination_date?: string | null
  notice_days_required?: number | null
  notice_days_served?: number | null
  unused_vacation_days?: number | null
  settlement_breakdown?: ContractTerminationPreview | null
  gross_settlement?: number | null
  total_deductions_settlement?: number | null
  net_settlement?: number | null
  terminated_at?: string | null
  position?: Position
  department?: Department
}

export type EmployeeAssetCategory =
  | 'computer'
  | 'phone'
  | 'vehicle'
  | 'uniform'
  | 'tool'
  | 'furniture'
  | 'access_card'
  | 'other'

export type EmployeeAssetCondition = 'new' | 'good' | 'fair' | 'damaged' | 'lost'

export type EmployeeAssetStatus =
  | 'assigned'
  | 'returned'
  | 'damaged_pending'
  | 'lost_unreturned'
  | 'maintenance'

export interface EmployeeAsset {
  id: number
  employee_id: number
  tenant_id: number
  name: string
  category: EmployeeAssetCategory
  category_label?: string
  asset_code?: string | null
  serial_number?: string | null
  brand_model?: string | null
  condition: EmployeeAssetCondition
  condition_label?: string
  status: EmployeeAssetStatus
  status_label?: string
  estimated_value: number
  chargeable_amount: number
  pending_liability_amount: number
  deduct_on_termination: boolean
  is_settled: boolean
  assigned_at?: string | null
  expected_return_at?: string | null
  returned_at?: string | null
  assigned_by?: { id: number; name: string } | null
  return_notes?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

export interface EmployeeAssetsResponse {
  items: EmployeeAsset[]
  summary: {
    total_count: number
    assigned_count: number
    returned_count: number
    issue_count: number
    total_estimated_value: number
    active_assigned_value: number
    pending_liability_amount: number
  }
}

export interface ContractTerminationPreview {
  contract_id: number
  employee_id: number
  employee_name?: string
  employee_code?: string
  department?: string | null
  position?: string | null
  termination_type: string
  termination_type_label: string
  legal_basis: string
  termination_reason: string
  hire_date: string
  termination_date: string
  base_salary: number
  calendar_daily_rate: number
  work_daily_rate: number
  tenure: {
    days: number
    months: number
    years: number
    completed_years: number
  }
  parameters: {
    worked_days_in_month: number
    months_worked_in_year: number
    unused_vacation_days: number
    proportional_vacation_days: number
    notice_days_required: number
    notice_days_served: number
    unserved_notice_days: number
    unjustified_absence_days: number
    include_vacation_subsidy: boolean
    include_christmas_subsidy: boolean
    include_severance: boolean
    apply_taxes: boolean
    discount_pending_deductions: boolean
    discount_unreturned_assets: boolean
    discount_attendance_pendencies: boolean
  }
  earnings_breakdown: Array<{
    code: string
    name: string
    quantity?: number | null
    unit_rate?: number | null
    amount: number
  }>
  deductions_breakdown: Array<{
    code: string
    category: string
    deduction_id?: number
    asset_id?: number
    name: string
    amount: number
  }>
  pending_advances_and_deductions: Array<{
    id: number
    name: string
    deduction_type: string
    type_label: string
    total_amount: number
    paid_amount: number
    remaining_balance: number
    total_installments: number
    paid_installments: number
    pending_installments: number
    next_installment?: {
      installment_number: number
      reference_month: string
      amount: number
    } | null
  }>
  pending_assets: Array<{
    id: number
    name: string
    category: string
    category_label: string
    asset_code?: string | null
    serial_number?: string | null
    condition: string
    condition_label: string
    status: string
    status_label: string
    estimated_value: number
    chargeable_amount: number
    deduct_on_termination: boolean
    liability_amount: number
  }>
  attendance_pendencies: {
    unjustified_absence_days: number
    late_minutes: number
    estimated_deduction: number
  }
  totals: {
    gross_settlement: number
    total_deductions: number
    pending_advances_total: number
    pending_assets_total: number
    taxes_total: number
    net_settlement: number
    remaining_employee_debt: number
  }
  legal_notes: string[]
  termination_types_catalog: Array<{
    code: string
    label: string
    legal_basis: string
    default_notice_days: number
    grants_severance: boolean
  }>
}

export interface DocxPreviewResponse {
  id: number
  name: string
  original_name?: string | null
  mime_type?: string | null
  format: 'docx'
  html: string
  text: string
  paragraphs_count: number
  tables_count: number
  images_count: number
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

export type PayrollPeriodStatus =
  | 'open'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'pending_validation'
  | 'pending_approval'
  | 'approved'
  | 'paid'
  | 'closed'
  | 'cancelled'

export interface PayrollValidationIssue {
  employee_id?: number
  employee_name?: string
  code: string
  message: string
  params?: Record<string, string | number | null | undefined>
}

export interface PayrollValidationReport {
  is_valid: boolean
  blocking_count: number
  warning_count: number
  errors: PayrollValidationIssue[]
  warnings: PayrollValidationIssue[]
}

export type PayrollPeriodEventType =
  | 'simulated'
  | 'processed'
  | 'validated'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'reopened'
  | 'paid'

export interface PayrollPeriodEvent {
  id: number
  event_type: PayrollPeriodEventType | string
  actor_id?: number | null
  actor?: { id: number; name: string } | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

export interface PayrollPeriodProgress {
  id: number
  status: PayrollPeriodStatus
  progress_total?: number | null
  progress_done?: number | null
  progress_message?: string | null
  records_count?: number
  processed_at?: string | null
}

export interface ProcessableEmployeeAdvance {
  id: number
  name: string
  deduction_type: string
  type_label: string
  amount_type: 'fixed' | 'percentage'
  percentage?: number | null
  total_amount: number
  paid_amount: number
  remaining_balance: number
  installment_count: number
  paid_installments_count: number
  remaining_installments_count: number
  current_installment_number?: number | null
  current_installment_label: string
  current_reference_month?: string | null
  discount_amount_this_period: number
  will_discount_this_period: boolean
}

export interface ProcessableEmployeePendingImpacts {
  deductible_absence_days: number
  unjustified_absence_days: number
  late_minutes: number
  late_days_count: number
  overtime_hours: number
  unreturned_assets_count: number
  unreturned_assets_liability: number
  has_pending_impacts: boolean
}

export interface ProcessableEmployee {
  id: number
  employee_code: string
  full_name: string
  position?: string | null
  department?: string | null
  base_salary?: number | string | null
  contract_end_date?: string | null
  is_contract_expired: boolean
  eligible: boolean
  advances_and_deductions?: ProcessableEmployeeAdvance[]
  total_discount_this_period?: number
  pending_impacts?: ProcessableEmployeePendingImpacts
}

export interface PayrollPeriodTotalsSnapshot {
  total_gross?: number
  total_net?: number
  total_employer_cost?: number
  total_inss_employee?: number
  total_inss_employer?: number
  total_irt?: number
  record_count?: number
}

export type PayrollPeriodReportDocumentType =
  | 'inss_guide'
  | 'inss_payment_proof'
  | 'payslips_summary_pdf'
  | 'payroll_sheet'
  | 'irt_guide'
  | 'irt_payment_proof'
  | 'bank_transfer_proof'
  | 'attendance_report'
  | 'other'

export interface PayrollPeriodReportDocument {
  id: number
  document_type: PayrollPeriodReportDocumentType
  title: string
  file_name: string
  mime_type?: string | null
  file_size?: number | null
  is_paid: boolean
  is_sent: boolean
  paid_at?: string | null
  sent_at?: string | null
  notes?: string | null
  uploaded_by?: number | null
  uploaded_by_user?: { id: number; name: string } | null
  created_at?: string | null
  updated_at?: string | null
}

export interface PayrollPeriodReportMandatoryItem {
  attached: boolean
  document_id?: number | null
  file_name?: string | null
  is_sent: boolean
  is_paid: boolean
}

export interface PayrollPeriodReport {
  id: number | null
  tenant_id: number
  payroll_period_id: number
  is_reportable?: boolean
  title?: string | null
  notes?: string | null
  inss_guide_sent: boolean
  inss_payment_proof_sent: boolean
  inss_paid: boolean
  payslips_summary_sent: boolean
  payroll_sheet_sent: boolean
  is_summary_complete: boolean
  submitted_at?: string | null
  updated_by?: number | null
  updated_by_user?: { id: number; name: string } | null
  has_inss_payment_proof: boolean
  mandatory_status: {
    inss_guide: PayrollPeriodReportMandatoryItem
    inss_payment_proof: PayrollPeriodReportMandatoryItem
    payslips_summary_pdf: PayrollPeriodReportMandatoryItem
    payroll_sheet: PayrollPeriodReportMandatoryItem
    all_mandatory_attached: boolean
    all_mandatory_sent: boolean
    has_inss_payment_proof: boolean
    inss_paid: boolean
    is_summary_complete: boolean
  }
  documents_count: number
  documents: PayrollPeriodReportDocument[]
  created_at?: string | null
  updated_at?: string | null
}

export type CompanyPayrollReportPeriodicity = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

export type CompanyDossierSection =
  | 'payroll_sheet'
  | 'payslips'
  | 'inss_map'
  | 'irt_map'
  | 'inss_payment_proof'
  | 'attendance'

export interface CompanyPayrollPeriodOverviewRow {
  period_id: number
  tenant_id: number
  tenant_name: string
  tenant_tax_id?: string | null
  period_name: string
  period_type: string
  period_start?: string | null
  period_end?: string | null
  month_key: string
  status: PayrollPeriodStatus
  employees_count: number
  total_gross: number
  total_inss_employee: number
  total_inss_employer: number
  total_inss: number
  total_irt: number
  total_deductions: number
  total_net: number
  total_employer_cost: number
  inss_guide_sent: boolean
  inss_payment_proof_attached: boolean
  inss_payment_proof_sent: boolean
  inss_paid: boolean
  payslips_summary_sent: boolean
  payroll_sheet_sent: boolean
  is_summary_complete: boolean
  documents_count: number
}

export interface CompanyPayrollOverviewItem {
  tenant_id: number
  name: string
  slug: string
  tax_id?: string | null
  inss_number?: string | null
  currency: string
  periods_count: number
  has_approved_payroll: boolean
  ready_for_dossier: boolean
  latest_period_id?: number | null
  latest_period_name?: string | null
  latest_report_id?: number | null
  employees_count: number
  total_gross: number
  total_inss_employee: number
  total_inss_employer: number
  total_inss: number
  total_irt: number
  total_deductions: number
  total_net: number
  total_employer_cost: number
  documents_count: number
  compliance: {
    inss_guide_sent: boolean
    inss_payment_proof_attached: boolean
    inss_payment_proof_sent: boolean
    inss_paid: boolean
    payslips_summary_sent: boolean
    payroll_sheet_sent: boolean
    is_summary_complete: boolean
  }
  periods: CompanyPayrollPeriodOverviewRow[]
}

export interface CompanyPayrollOverviewResponse {
  range: {
    periodicity: CompanyPayrollReportPeriodicity
    year: number
    month?: number | null
    quarter?: number | null
    semester?: number | null
    start_date: string
    end_date: string
    label: string
    label_zh: string
    code: string
  }
  totals: {
    companies_total: number
    companies_with_approved_payroll: number
    companies_ready_for_dossier: number
    periods_count: number
    reports_complete_count: number
    inss_paid_periods_count: number
    inss_proof_attached_count: number
    employees_count: number
    total_gross: number
    total_inss_employee: number
    total_inss_employer: number
    total_inss: number
    total_irt: number
    total_deductions: number
    total_net: number
    total_employer_cost: number
  }
  companies: CompanyPayrollOverviewItem[]
  period_rows: CompanyPayrollPeriodOverviewRow[]
  monthly_timeline: Array<{
    month: string
    periods_count: number
    employees_count: number
    total_gross: number
    total_inss: number
    total_irt: number
    total_net: number
    inss_paid_count: number
    complete_count: number
  }>
}

export interface CompanyDossierInspectResponse {
  tenant: {
    id: number
    name: string
    slug: string
    tax_id?: string | null
    inss_number?: string | null
    currency: string
  }
  period: {
    id: number
    name: string
    period_type: string
    period_start?: string | null
    period_end?: string | null
    status: PayrollPeriodStatus
    is_reportable: boolean
    employees_count: number
    total_gross: number
    total_net: number
    total_inss: number
    total_irt: number
  } | null
  has_inss_payment_proof: boolean
  inss_paid: boolean
  inss_payment_proof_sent: boolean
  can_print: boolean
  blocking_reason?: string | null
  available_periods: Array<{
    id: number
    name: string
    status: PayrollPeriodStatus
    period_start?: string | null
    period_end?: string | null
    has_inss_payment_proof: boolean
    inss_paid: boolean
  }>
}

export interface PayrollPeriod {
  id: number
  tenant_id: number
  name: string
  period_type: 'monthly' | 'quarterly' | 'custom' | 'biweekly' | 'weekly'
  period_start: string
  period_end: string
  payment_date?: string
  status: PayrollPeriodStatus
  processed_at?: string
  closed_at?: string
  approved_by?: number | null
  approved_at?: string | null
  rejection_reason?: string | null
  totals_snapshot?: PayrollPeriodTotalsSnapshot | null
  progress_total?: number | null
  progress_done?: number | null
  progress_message?: string | null
  employee_count?: number
  total_gross?: number
  total_net?: number
  is_reportable?: boolean
  report?: PayrollPeriodReport | null
  records?: PayrollRecord[]
  events?: PayrollPeriodEvent[]
}

export type PayrollRecordStatus = 'calculated' | 'approved' | 'paid' | 'rejected'

export interface PayrollBreakdownItem {
  code: string
  name: string
  type: 'earning' | 'deduction' | 'tax' | 'benefit'
  priority: number
  amount: number
}

export interface PayrollRecordItem {
  id: number
  category: 'earning' | 'deduction' | 'tax' | 'employer_contribution' | 'employer_cost'
  code: string
  name: string
  base_amount?: number | null
  quantity?: number | null
  rate?: number | null
  amount: number
  notes?: string | null
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
  // Phase 2 fields
  inss_base?: number | null
  employer_inss_base?: number | null
  employer_inss?: number | null
  irt_taxable_base?: number | null
  employer_cost?: number | null
  currency?: string | null
  engine_version?: string | null
  validation_errors?: Array<{ code: string; message: string; severity: string; params?: Record<string, string | number | null | undefined> }> | null
  snapshot?: Record<string, unknown> | null
  manual_adjustments?: {
    work_days?: number | null
    absent_days?: number | null
    overtime_hours?: number | null
    late_minutes?: number | null
    components?: Record<string, number | null>
    extra_items?: Array<{ name: string; type: 'earning' | 'deduction'; amount: number }>
  } | null
  status: PayrollRecordStatus
  is_outdated?: boolean
  outdated_reason?: string | null
  contract_type?: string | null
  approved_at?: string
  paid_at?: string
  details?: {
    breakdown?: PayrollBreakdownItem[]
    work_days?: number
    scheduled_work_days?: number
    absent_days?: number
    late_minutes?: number
    overtime_hours?: number
  }
  items?: PayrollRecordItem[]
  employee?: EmployeeSummary
  contract?: { id: number; base_salary: number; contract_type: string }
}

export type SalaryComponentRegulationStatus = 'draft' | 'validated' | 'active' | 'revoked'
export type SalaryIncidence = boolean | null

export interface SalaryComponentSummary {
  id: number
  name: string
  code: string
  type: string
}

export interface SalaryComponentRegulation {
  id: number
  salary_component_id: number
  country_code: string
  regime_code: string
  version: number
  effective_from: string
  effective_to: string | null
  employee_inss_applicable: SalaryIncidence
  employer_inss_applicable: SalaryIncidence
  irt_applicable: SalaryIncidence
  status: SalaryComponentRegulationStatus
  legal_source: string | null
  legal_reference: string | null
  legal_document_name?: string | null
  legal_document_url?: string | null
  has_legal_document?: boolean
  validated_at: string | null
  revocation_reason?: string | null
  validated_by?: { id: number; name: string } | null
  component?: SalaryComponentSummary | null
}

export interface PayrollInssRule {
  id: number
  country_code: string
  regime_code: string
  version: number
  employee_rate: number
  employer_rate: number
  max_base: number | null
  effective_from: string
  effective_to: string | null
  status: SalaryComponentRegulationStatus
  legal_source: string | null
  legal_reference: string | null
  legal_document_name?: string | null
  legal_document_url?: string | null
  has_legal_document?: boolean
  validated_at: string | null
  revoked_at?: string | null
  revocation_reason?: string | null
  validated_by?: { id: number; name: string } | null
  revoked_by?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

export interface PayrollIrtBracket {
  lower_bound: number
  upper_bound: number | null
  rate: number
  fixed_amount: number
}

export interface PayrollIrtTable {
  id: number
  country_code: string
  regime_code: string
  version: number
  effective_from: string
  effective_to: string | null
  brackets: PayrollIrtBracket[]
  status: SalaryComponentRegulationStatus
  legal_source: string | null
  legal_reference: string | null
  legal_document_name?: string | null
  legal_document_url?: string | null
  has_legal_document?: boolean
  validated_at: string | null
  revoked_at?: string | null
  revocation_reason?: string | null
  validated_by?: { id: number; name: string } | null
  revoked_by?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday' | 'vacation' | 'sick' | 'justified'

export interface AttendanceRecord {
  id: number
  employee_id: number
  shift_id?: number | null
  date: string
  clock_in?: string | null
  clock_out?: string | null
  break_start?: string | null
  break_end?: string | null
  total_worked?: number | null
  status: AttendanceStatus
  deduct_from_salary?: boolean
  late_minutes: number
  overtime_minutes?: number
  overtime_amount?: number | null
  normal_hours?: number
  notes?: string | null
  employee?: Pick<EmployeeSummary, 'id' | 'full_name' | 'employee_code'>
  shift?: { id: number; name: string; start_time: string; end_time: string; work_hours?: number } | null
}

export interface LeaveBalance {
  annual_entitlement: number
  days_used: number
  days_remaining: number
  days_pending: number
  year?: number
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
  occurrence_type?: 'absence' | 'day_off' | 'vacation' | 'medical' | 'family' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'personal' | 'training' | 'public_duty' | 'other' | null
  notice_type?: 'anticipated' | 'unanticipated' | null
  is_justified?: boolean | null
  deduct_from_salary?: boolean
  has_justification_document?: boolean
  has_signed_document?: boolean
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

export interface DocumentRequirement {
  type: string
  label: string
  required?: boolean
}

export interface EmployeeDocument {
  id: number
  employee_id: number
  name: string
  document_type: string
  original_name?: string | null
  file_path?: string | null
  file_url?: string | null
  mime_type?: string | null
  file_size?: number
  size_label?: string
  expiry_date?: string | null
  is_expiring?: boolean
  is_expired?: boolean
  notes?: string | null
  is_confidential: boolean
  is_verified?: boolean
  verified_at?: string | null
  verified_by?: { id: number; name: string } | null
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
    total_minutes?: number
    total_hours: number
    late_minutes: number
    overtime_minutes: number
    leaves_approved: number
    leaves_pending: number
  }
  by_status: Record<string, number>
  by_department: { department: string; records: number; total_minutes?: number; total_hours: number; late_minutes: number; overtime_minutes: number }[]
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
  department_id?: number | null
  position_id?: number | null
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

export type DeductionType = string

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

export interface DeductionInstallment {
  id: number
  installment_number: number
  reference_month: string
  percentage: number | null
  amount: number | null
  status: 'pending' | 'paid' | 'cancelled' | string
  status_label?: string
  payroll_period_id?: number | null
  payroll_period_name?: string | null
  paid_at?: string | null
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
  start_period?: string | null
  requested_at?: string | null
  is_recurring: boolean
  is_mandatory: boolean
  legal_basis?: string | null
  has_signed_document?: boolean
  signed_document_url?: string | null
  signed_document_uploaded_at?: string | null
  status: DeductionStatus
  status_label: string
  status_variant: 'success' | 'warning' | 'info' | 'destructive'
  progress_label: string
  approved_by?: number | null
  approved_at?: string | null
  notes?: string | null
  cancellation_reason?: string | null
  cancelled_at?: string | null
  installments?: DeductionInstallment[]
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

export interface EmployeeEducation {
  id: number
  tenant_id: number
  employee_id?: number | null
  is_general?: boolean
  title?: string | null
  reason: string
  sanction_warning?: string | null
  occurred_on?: string | null
  has_document: boolean
  document_name?: string | null
  document_mime?: string | null
  document_url?: string | null
  has_signed_document: boolean
  signed_document_name?: string | null
  signed_document_mime?: string | null
  signed_document_url?: string | null
  signed_document_uploaded_at?: string | null
  creator?: { id: number; name: string } | null
  created_at?: string
  updated_at?: string
}

// SaaS Plans, Subscriptions, Billing & Multi-Company Portfolio
export interface PlanCatalogResponse {
  features: Record<string, { label: string; group: string; description: string; default: boolean }>
  limits: Record<string, { label: string; unit: string; description: string; default: number | string | null }>
  billing_cycles: Record<string, { label: string; months: number | null; days: number | null }>
  pricing_models: Record<string, string>
  defaults: {
    features: Record<string, boolean>
    limits: Record<string, number | string | null>
    agency_config: PlanAgencyConfig
  }
}

export interface PlanAgencyConfig {
  can_manage_other_tenants: boolean
  can_create_managed_tenants: boolean
  can_link_existing_tenants: boolean
  max_managed_tenants: number | null
  max_hierarchy_depth: number
  quota_scope: 'pooled_under_manager' | 'per_managed_tenant'
  can_manage_child_users: boolean
  can_customize_child_permissions: boolean
}

export interface Plan {
  id: number
  name: string
  slug: string
  code?: string | null
  description?: string | null
  badge_text?: string | null
  visibility: 'public' | 'private' | 'archived'
  is_active: boolean
  sort_order: number
  billing_cycle: string
  custom_cycle_days?: number | null
  currency: string
  base_price: number
  pricing_model: string
  included_employees: number
  extra_employee_price: number
  included_managed_tenants: number
  extra_managed_tenant_price: number
  setup_fee: number
  trial_days: number
  grace_period_days: number
  features: Record<string, boolean>
  limits: Record<string, number | string | null>
  agency_config: PlanAgencyConfig
  custom_rules: Record<string, unknown>
  subscriptions_count?: number
  active_subscriptions_count?: number
  created_at?: string
  updated_at?: string
}

export interface TenantEntitlements {
  has_subscription: boolean
  status: string
  is_operational: boolean
  is_managed: boolean
  inherited_from_manager: boolean
  billing_tenant_id: number
  manager_tenant?: { id: number; name: string; slug: string } | null
  plan?: {
    id: number
    name: string
    slug: string
    code?: string | null
    billing_cycle: string
    currency: string
    base_price: number
    pricing_model: string
  } | null
  subscription?: {
    id: number
    status: string
    starts_at?: string | null
    ends_at?: string | null
    grace_until?: string | null
    auto_renew: boolean
    custom_price?: number | null
    overrides?: Record<string, unknown> | null
  } | null
  features: Record<string, boolean>
  limits: Record<string, number | string | null>
  agency: PlanAgencyConfig
  custom_rules: Record<string, unknown>
  usage: {
    employees: number
    users: number
    branches: number
    departments: number
    storage_mb: number
    ocr_requests_this_month: number
    payroll_runs_this_month: number
    managed_tenants: number
  }
  quota_scope?: 'pooled_under_manager' | 'per_managed_tenant'
  hierarchy_depth: number
}

export interface SubscriptionPayment {
  id: number
  invoice_id: number
  tenant_id: number
  amount: number
  currency: string
  payment_method: string
  reference_code?: string | null
  payment_date?: string | null
  proof_file_path?: string | null
  proof_original_name?: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at?: string | null
  rejection_reason?: string | null
  notes?: string | null
  tenant?: { id: number; name: string; slug: string; tax_id?: string | null }
  invoice?: { id: number; invoice_number: string; total_amount: number; currency: string; status: string; due_date: string }
  submitter?: { id: number; name: string; email: string }
  created_at?: string
}

export interface SubscriptionInvoice {
  id: number
  invoice_number: string
  tenant_id: number
  subscription_id: number
  plan_id: number
  period_start: string
  period_end?: string | null
  due_date: string
  currency: string
  subtotal: number
  overage_amount: number
  discount_amount: number
  total_amount: number
  line_items: Array<{ description: string; quantity: number; unit_price: number; amount: number }>
  status: 'draft' | 'open' | 'under_review' | 'paid' | 'overdue' | 'void'
  paid_at?: string | null
  notes?: string | null
  tenant?: { id: number; name: string; slug: string; tax_id?: string | null }
  plan?: { id: number; name: string; slug: string }
  payments?: SubscriptionPayment[]
  created_at?: string
}

export interface TenantRelationship {
  id: number
  manager_tenant_id: number
  managed_tenant_id: number
  relationship_type: 'bpo' | 'accounting' | 'consulting' | 'holding' | 'reseller'
  status: 'pending' | 'active' | 'suspended' | 'revoked'
  management_scope?: {
    can_manage_users?: boolean
    can_manage_settings?: boolean
    can_manage_billing?: boolean
    allowed_modules?: string[] | null
  } | null
  notes?: string | null
  accepted_at?: string | null
  manager_tenant?: { id: number; name: string; slug: string; status: string }
  managed_tenant?: { id: number; name: string; slug: string; status: string; tax_id?: string | null }
}

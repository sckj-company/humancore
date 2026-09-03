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

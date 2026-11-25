import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@/types'

export interface Department {
  id: number
  tenant_id?: number
  branch_id?: number | null
  name: string
  code?: string | null
  parent_id?: number | null
  level: number
  manager_id?: number | null
  cost_center?: string | null
  description?: string | null
  status: 'active' | 'inactive'
  permission_group_id?: number | null
  permission_group_name?: string | null
  default_permissions?: string[]
  default_role_name?: string | null
  effective_permissions_count?: number
  employee_count?: number
  branch?: { id: number; name: string } | null
  manager?: { id: number; full_name: string } | null
  parent?: { id: number; name: string; level?: number } | null
  children?: Department[]
}

export interface DepartmentPayload {
  name: string
  code?: string | null
  branch_id?: number | null
  parent_id?: number | null
  level?: number | null
  manager_id?: number | null
  cost_center?: string | null
  description?: string | null
  status?: 'active' | 'inactive'
  cascade_levels?: boolean
}

export type DepartmentUpdatePayload = Partial<DepartmentPayload> & { cascade_levels?: boolean }

export interface Position {
  id: number
  tenant_id?: number
  department_id?: number | null
  parent_id?: number | null
  level: number
  title: string
  code?: string | null
  description?: string | null
  requirements?: string | null
  salary_min?: number | null
  salary_max?: number | null
  is_management: boolean
  permission_group_id?: number | null
  permission_group_name?: string | null
  default_permissions?: string[]
  default_role_name?: string | null
  effective_permissions_count?: number
  employee_count?: number
  department?: { id: number; name: string } | null
  parent?: { id: number; title: string; level?: number } | null
}

export interface PositionPayload {
  title: string
  code?: string | null
  department_id?: number | null
  parent_id?: number | null
  level?: number | null
  description?: string | null
  requirements?: string | null
  salary_min?: number | null
  salary_max?: number | null
  is_management?: boolean
  cascade_levels?: boolean
}

export type PositionUpdatePayload = Partial<PositionPayload> & { cascade_levels?: boolean }

export interface Branch {
  id: number
  tenant_id?: number
  name: string
  code?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  manager_id?: number | null
  is_headquarter: boolean
  status: 'active' | 'inactive'
  department_count?: number
  manager?: { id: number; full_name: string } | null
}

export interface BranchPayload {
  name: string
  code?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
  manager_id?: number | null
  is_headquarter?: boolean
  status?: 'active' | 'inactive'
}

export interface EmployeeSummary {
  id: number
  employee_code?: string
  full_name: string
  email?: string
  photo_path?: string | null
  department_id?: number | null
  department?: string | null
  department_ids?: number[]
  departments?: Array<{ id: number; name: string }>
  position_id?: number | null
  position?: string | null
  status?: string
}

export interface PermissionCatalogItem {
  id: number
  name: string
  group_name: string | null
}

export interface PermissionGroupSummary {
  id: number
  tenant_id?: number | null
  name: string
  description?: string | null
  permissions: string[]
  is_system: boolean
}

export interface PermissionsCatalogResponse {
  permissions: PermissionCatalogItem[]
  permission_groups: PermissionGroupSummary[]
  can_manage_permissions: boolean
}

export interface DepartmentEmployeeItem {
  id: number
  employee_code?: string | null
  full_name: string
  email?: string | null
  photo_path?: string | null
  status: string
  departments?: Array<{ id: number; name: string }>
  position?: { id: number; title: string; level: number } | null
  has_user_account: boolean
  user_id?: number | null
  user_email?: string | null
  user_is_active: boolean
  role_name?: string | null
  permission_source:
    | 'individual'
    | 'department'
    | 'position'
    | 'department_and_position'
    | 'role'
    | 'none'
  permission_group_id?: number | null
  permission_group_name?: string | null
  effective_permissions: string[]
  custom_permissions?: string[] | null
  department_scope_ids: number[]
}

export interface DepartmentEmployeesResponse {
  department: Department
  employees: DepartmentEmployeeItem[]
  can_manage_permissions: boolean
  can_manage_employees?: boolean
}

export interface PositionEmployeeItem {
  id: number
  employee_code?: string | null
  full_name: string
  email?: string | null
  photo_path?: string | null
  status: string
  department_id?: number | null
  department?: { id: number; name: string } | null
  departments?: Array<{ id: number; name: string }>
  has_user_account: boolean
  user_id?: number | null
  user_email?: string | null
  user_is_active: boolean
  role_name?: string | null
  permission_source:
    | 'individual'
    | 'department'
    | 'position'
    | 'department_and_position'
    | 'role'
    | 'none'
  permission_group_id?: number | null
  permission_group_name?: string | null
  effective_permissions: string[]
  custom_permissions?: string[] | null
  department_scope_ids: number[]
}

export interface PositionEmployeesResponse {
  position: Position
  employees: PositionEmployeeItem[]
  can_manage_permissions: boolean
  can_manage_employees: boolean
}

export interface ExternalTeamMember {
  id: number
  name: string
  email: string
  is_active: boolean
  source_type: 'super_admin_full' | 'super_admin_limited' | 'manager_tenant'
  source_label: string
  is_protected: boolean
  is_current_user: boolean
  status_in_company: 'global_default' | 'customized' | 'blocked'
  role_name?: string | null
  permission_group_id?: number | null
  permission_group_name?: string | null
  effective_permissions: string[]
  has_salary_access: boolean
  department_scope_ids: number[]
}

export interface ExternalTeamResponse {
  members: ExternalTeamMember[]
  departments: Array<{ id: number; name: string; code?: string | null; level: number }>
  can_manage_permissions: boolean
  can_create_platform_users: boolean
  can_create_full_super_admin: boolean
}

export interface UpdateExternalTeamPermissionsPayload {
  user_ids: number[]
  mode: 'customize' | 'hide_salaries' | 'restore_default' | 'block'
  permissions?: string[] | null
  permission_group_id?: number | null
  role_name?: string | null
  department_ids?: number[] | null
}

export interface CreatePlatformAdminPayload {
  name: string
  email: string
  password: string
  role: 'super-admin' | 'super-admin-limited'
  permissions?: string[]
  role_name?: string | null
  can_manage_super_admins?: boolean
  hide_salaries_in_current_company?: boolean
}

export interface DepartmentPermissionsPayload {
  permissions?: string[] | null
  permission_group_id?: number | null
  role_name?: string | null
  apply_to_existing_overrides?: boolean
}

export interface AssignEmployeePermissionsPayload {
  employee_ids: number[]
  clear_individual?: boolean
  permissions?: string[] | null
  permission_group_id?: number | null
  role_name?: string | null
  scope_to_department?: boolean
  auto_create_accounts?: boolean
  default_password?: string | null
  employee_emails?: Record<number, string>
}

export interface AssignEmployeePermissionsResponse {
  updated_count: number
  created_accounts_count: number
  skipped: Array<{ employee_id: number; name: string; reason: string }>
}

export function collectDescendantIds<T extends { id: number; parent_id?: number | null }>(
  items: T[],
  rootId: number,
): Set<number> {
  const excluded = new Set<number>([rootId])
  let added = true
  while (added) {
    added = false
    for (const item of items) {
      if (item.parent_id != null && excluded.has(item.parent_id) && !excluded.has(item.id)) {
        excluded.add(item.id)
        added = true
      }
    }
  }
  return excluded
}

// ================= Departments Hooks =================
export const useDepartments = (params?: { search?: string; tree?: boolean }) =>
  useQuery({
    queryKey: ['departments', params],
    queryFn: () => api.get<Department[]>('departments', params as Record<string, unknown>),
  })

export const useCreateDepartment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: DepartmentPayload) => api.post<Department>('departments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export const useUpdateDepartment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DepartmentUpdatePayload }) =>
      api.put<Department>(`departments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
    },
  })
}

export const useDeleteDepartment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
    },
  })
}

export const usePermissionsCatalog = () =>
  useQuery({
    queryKey: ['departments-permissions-catalog'],
    queryFn: () => api.get<PermissionsCatalogResponse>('departments/permissions-catalog'),
  })

export const useDepartmentEmployees = (departmentId: number | null, search?: string) =>
  useQuery({
    queryKey: ['department-employees', departmentId, search ?? ''],
    queryFn: () =>
      api.get<DepartmentEmployeesResponse>(`departments/${departmentId}/employees`, {
        ...(search ? { search } : {}),
      }),
    enabled: departmentId !== null,
  })

export const useUpdateDepartmentPermissions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, data }: { departmentId: number; data: DepartmentPermissionsPayload }) =>
      api.put<{ department: Department; affected_employees_count: number }>(
        `departments/${departmentId}/permissions`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
    },
  })
}

export const useAssignDepartmentEmployeesPermissions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, data }: { departmentId: number; data: AssignEmployeePermissionsPayload }) =>
      api.post<AssignEmployeePermissionsResponse>(
        `departments/${departmentId}/employees/permissions`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

export const useAddDepartmentEmployees = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, employeeIds }: { departmentId: number; employeeIds: number[] }) =>
      api.post<{ added_count: number; department: Department }>(`departments/${departmentId}/employees`, {
        employee_ids: employeeIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

export const useRemoveDepartmentEmployee = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ departmentId, employeeId }: { departmentId: number; employeeId: number }) =>
      api.delete<{ department: Department }>(`departments/${departmentId}/employees/${employeeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

// ================= Positions Hooks =================
export const usePositions = (params?: { search?: string; department_id?: number }) =>
  useQuery({
    queryKey: ['positions', params],
    queryFn: () => api.get<Position[]>('positions', params as Record<string, unknown>),
  })

export const useCreatePosition = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: PositionPayload) => api.post<Position>('positions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
  })
}

export const useUpdatePosition = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PositionUpdatePayload }) =>
      api.put<Position>(`positions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
    },
  })
}

export const useDeletePosition = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`positions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
    },
  })
}

export const usePositionEmployees = (positionId: number | null, search?: string) =>
  useQuery({
    queryKey: ['position-employees', positionId, search ?? ''],
    queryFn: () =>
      api.get<PositionEmployeesResponse>(`positions/${positionId}/employees`, {
        ...(search ? { search } : {}),
      }),
    enabled: positionId !== null,
  })

export const useAddPositionEmployees = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      positionId,
      employeeIds,
      syncDepartment,
    }: {
      positionId: number
      employeeIds: number[]
      syncDepartment?: boolean
    }) =>
      api.post<{ added_count: number; position: Position }>(`positions/${positionId}/employees`, {
        employee_ids: employeeIds,
        sync_department: syncDepartment,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

export const useRemovePositionEmployee = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ positionId, employeeId }: { positionId: number; employeeId: number }) =>
      api.delete<{ position: Position }>(`positions/${positionId}/employees/${employeeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

export const useUpdatePositionPermissions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ positionId, data }: { positionId: number; data: DepartmentPermissionsPayload }) =>
      api.put<{ position: Position; affected_employees_count: number }>(
        `positions/${positionId}/permissions`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
    },
  })
}

export const useAssignPositionEmployeesPermissions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ positionId, data }: { positionId: number; data: AssignEmployeePermissionsPayload }) =>
      api.post<AssignEmployeePermissionsResponse>(
        `positions/${positionId}/employees/permissions`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['position-employees'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['department-employees'] })
      queryClient.invalidateQueries({ queryKey: ['employees-summary'] })
      queryClient.invalidateQueries({ queryKey: ['employees-picker'] })
    },
  })
}

// ================= Branches Hooks =================
export const useBranches = () =>
  useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<Branch[]>('branches'),
  })

export const useCreateBranch = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BranchPayload) => api.post<Branch>('branches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export const useUpdateBranch = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: BranchPayload }) =>
      api.put<Branch>(`branches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export const useDeleteBranch = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`branches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

// ================= Helper Hooks =================
export const useEmployeesSummary = () =>
  useQuery({
    queryKey: ['employees-summary'],
    queryFn: async () => {
      const res = await api.get<Paginated<EmployeeSummary>>('employees', { per_page: 200 })
      return res.data ?? []
    },
  })

export const useEmployeesPicker = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: ['employees-picker', search],
    queryFn: async () => {
      const res = await api.get<Paginated<EmployeeSummary>>('employees', {
        per_page: 200,
        ...(search.trim() ? { search: search.trim() } : {}),
      })
      return res.data ?? []
    },
    enabled,
  })

// ================= External Team / Platform Admins Hooks =================
export const useExternalTeam = () =>
  useQuery({
    queryKey: ['external-team'],
    queryFn: () => api.get<ExternalTeamResponse>('organization/external-team'),
  })

export const useUpdateExternalTeamPermissions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateExternalTeamPermissionsPayload) =>
      api.post<{ updated_count: number; skipped: Array<{ user_id: number; name: string; reason: string }> }>(
        'organization/external-team/permissions',
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-team'] })
    },
  })
}

export const useCreatePlatformAdminFromOrg = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePlatformAdminPayload) =>
      api.post<{ id: number; name: string; email: string; role: string }>(
        'organization/external-team/platform-users',
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-team'] })
    },
  })
}

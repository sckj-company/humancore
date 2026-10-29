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
  manager_id?: number | null
  cost_center?: string | null
  description?: string | null
  status: 'active' | 'inactive'
  employee_count?: number
  branch?: { id: number; name: string } | null
  manager?: { id: number; full_name: string } | null
  parent?: { id: number; name: string } | null
  children?: Department[]
}

export interface DepartmentPayload {
  name: string
  code?: string | null
  branch_id?: number | null
  parent_id?: number | null
  manager_id?: number | null
  cost_center?: string | null
  description?: string | null
  status?: 'active' | 'inactive'
}

export interface Position {
  id: number
  tenant_id?: number
  department_id?: number | null
  title: string
  code?: string | null
  description?: string | null
  requirements?: string | null
  salary_min?: number | null
  salary_max?: number | null
  is_management: boolean
  department?: { id: number; name: string } | null
}

export interface PositionPayload {
  title: string
  code?: string | null
  department_id?: number | null
  description?: string | null
  requirements?: string | null
  salary_min?: number | null
  salary_max?: number | null
  is_management?: boolean
}

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
    mutationFn: ({ id, data }: { id: number; data: DepartmentPayload }) =>
      api.put<Department>(`departments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export const useDeleteDepartment = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
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
    mutationFn: ({ id, data }: { id: number; data: PositionPayload }) =>
      api.put<Position>(`positions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    },
  })
}

export const useDeletePosition = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`positions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
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

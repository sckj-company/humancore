import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Paginated } from '@/types'

export interface Department {
  id: number
  name: string
  code?: string
  parent_id?: number | null
  status: 'active' | 'inactive'
  manager_id?: number | null
  employees_count?: number
}

export const useDepartments = () =>
  useQuery({
    queryKey: ['departments', { per_page: 100 }],
    queryFn: () => api.get<Paginated<Department>>('departments', { per_page: 100 }),
  })

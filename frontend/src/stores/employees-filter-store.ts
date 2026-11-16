import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface EmployeesFilterState {
  tenantKey: string
  search: string
  status: string
  page: number
  setSearch: (search: string) => void
  setStatus: (status: string) => void
  setPage: (page: number | ((prev: number) => number)) => void
  syncTenant: (tenantKey: string) => void
  resetFilters: () => void
}

export const useEmployeesFilterStore = create<EmployeesFilterState>()(
  persist(
    (set, get) => ({
      tenantKey: '',
      search: '',
      status: 'all',
      page: 1,
      setSearch: (search) => set({ search, page: 1 }),
      setStatus: (status) => set({ status, page: 1 }),
      setPage: (page) =>
        set((state) => ({
          page: typeof page === 'function' ? page(state.page) : page,
        })),
      syncTenant: (tenantKey) => {
        if (get().tenantKey !== tenantKey) {
          set({ tenantKey, search: '', status: 'all', page: 1 })
        }
      },
      resetFilters: () => set({ search: '', status: 'all', page: 1 }),
    }),
    {
      name: 'hrms_employees_filters',
    },
  ),
)

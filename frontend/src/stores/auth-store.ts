import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('hrms_token', token)
        set({ user, token })
      },
      setUser: (user) => set({ user }),
      clear: () => {
        localStorage.removeItem('hrms_token')
        set({ user: null, token: null })
      },
    }),
    {
      name: 'hrms_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    },
  ),
)

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false
  if (user.roles?.includes('super-admin')) return true
  return user.permissions?.includes(permission) ?? false
}

export function hasAnyRole(user: User | null, roles: string[]): boolean {
  if (!user) return false
  return user.roles?.some((r) => roles.includes(r)) ?? false
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      resolvedTheme: getSystemTheme(),
      setTheme: (theme) => {
        const resolved = theme === 'system' ? getSystemTheme() : theme
        applyTheme(resolved)
        set({ theme, resolvedTheme: resolved })
      },
    }),
    {
      name: 'hrms_theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved = state.theme === 'system' ? getSystemTheme() : state.theme
          state.resolvedTheme = resolved
          applyTheme(resolved)
        }
      },
    },
  ),
)

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState()
    if (state.theme === 'system') {
      const resolved = getSystemTheme()
      state.resolvedTheme = resolved
      applyTheme(resolved)
    }
  })
}

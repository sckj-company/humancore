import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/query-client'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/lib/i18n'
import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'

function AuthInitializer({ children }: { children: ReactNode }) {
  const { user, token, setUser, clear } = useAuthStore()

  useEffect(() => {
    if (token && !user) {
      api.get<{ id: number; name: string; email: string; roles: string[]; permissions: string[] }>('auth/me')
        .then((u) => setUser(u as any))
        .catch(() => clear())
    }
  }, [token, user, setUser, clear])

  return <>{children}</>
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthInitializer>
            <TooltipProvider>
              <SonnerToaster position="top-right" richColors />
              {children}
            </TooltipProvider>
          </AuthInitializer>
        </BrowserRouter>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

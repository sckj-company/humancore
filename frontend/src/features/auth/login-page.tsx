import { useLocation, Navigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import { Building2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth-store'
import { api, getApiErrorMessage } from '@/lib/api'
import { toast } from 'sonner'
import type { User } from '@/types'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

type FormValues = { email: string; password: string }

export function LoginPage() {
  const { t } = useTranslation()
  const schema = z.object({
    email: z.string().email(t('auth.invalidEmail')),
    password: z.string().min(1, t('auth.passwordRequired')),
  })
  const setAuth = useAuthStore((s) => s.setAuth)
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/dashboard'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (user) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    try {
      const data = await api.post<{ access_token: string; user: User }>('auth/login', values)
      setAuth(data.user, data.access_token)
      toast.success(t('auth.logged_in'))
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        toast.error(t('auth.invalid'))
      } else {
        toast.error(getApiErrorMessage(error, t('auth.loginError')))
      }
    }
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-sidebar/20 p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md border-border/50 shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">{t('app.name')}</CardTitle>
          <CardDescription>{t('app.tagline')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" type="email" autoComplete="email" autoFocus {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                {t('auth.forgot')}
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t('common.loading') : t('auth.login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

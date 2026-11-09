import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { LanguageSwitcher } from '@/components/shared/language-switcher'

type ResetStep = 'request' | 'verify' | 'password'

export function PasswordResetPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<ResetStep>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await api.post('auth/password-reset/request', { email })
      setStep('verify')
      toast.success(t('passwordReset.requestSuccess'))
    } catch {
      toast.error(t('passwordReset.requestError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      const result = await api.post<{ reset_token: string }>('auth/password-reset/verify', { email, code })
      setResetToken(result.reset_token)
      setStep('password')
      toast.success(t('passwordReset.codeConfirmed'))
    } catch {
      toast.error(t('passwordReset.codeError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password.length < 8) {
      toast.error(t('passwordReset.passwordMinLength'))
      return
    }
    if (password !== passwordConfirmation) {
      toast.error(t('passwordReset.passwordMismatch'))
      return
    }

    setIsSubmitting(true)
    try {
      await api.post('auth/password-reset/reset', {
        email,
        reset_token: resetToken,
        password,
        password_confirmation: passwordConfirmation,
      })
      toast.success(t('passwordReset.resetSuccess'))
      navigate('/login', { replace: true })
    } catch {
      toast.error(t('passwordReset.resetError'))
    } finally {
      setIsSubmitting(false)
    }
  }

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
          <CardTitle className="text-2xl">{t('passwordReset.title')}</CardTitle>
          <CardDescription>
            {step === 'request' && t('passwordReset.requestDescription')}
            {step === 'verify' && t('passwordReset.verifyDescription')}
            {step === 'password' && t('passwordReset.passwordDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'request' && (
            <form onSubmit={requestCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('auth.email')}</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('passwordReset.sending') : t('passwordReset.sendCode')}
              </Button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={verifyCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-code">{t('passwordReset.verificationCode')}</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || code.length !== 6}>
                {isSubmitting ? t('passwordReset.verifying') : t('passwordReset.confirmCode')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isSubmitting}
                onClick={() => setStep('request')}
              >
                {t('passwordReset.changeEmail')}
              </Button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={resetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('passwordReset.newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('passwordReset.confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('passwordReset.updating') : t('passwordReset.changePassword')}
              </Button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">{t('passwordReset.backToLogin')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

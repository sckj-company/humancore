import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PublicInvite {
  email: string
  name?: string | null
  role_name: string
  tenant: { id: number; name: string; slug: string }
  expires_at: string
}

export function AcceptInvitationPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [invite, setInvite] = useState<PublicInvite | null>(null)
  const [loading, setLoading] = useState(() => Boolean(token))
  const [error, setError] = useState<string | null>(() => (token ? null : t('saas.invitation.missingToken')))
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      return
    }
    api
      .get<PublicInvite>(`invitations/${token}`)
      .then((res) => {
        setInvite(res)
        setName(res.name ?? '')
      })
      .catch((err) => setError(getApiErrorMessage(err, t('saas.invitation.invalidOrExpired'))))
      .finally(() => setLoading(false))
  }, [token, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post(`invitations/${token}/accept`, {
        name,
        password,
        password_confirmation: passwordConfirmation,
      })
      toast.success(t('saas.invitation.toastAccepted'))
      navigate('/login')
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('saas.invitation.toastAcceptError')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <CardTitle>{t('saas.invitation.title')}</CardTitle>
          <CardDescription>
            {invite
              ? t('saas.invitation.joinCompany', { company: invite.tenant.name, email: invite.email })
              : t('saas.invitation.defaultSubtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="py-4 text-center text-sm text-destructive">{error}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <Label>{t('saas.invitation.fullName')}</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.invitation.password')}</Label>
                <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('saas.invitation.confirmPassword')}</Label>
                <Input type="password" required minLength={8} value={passwordConfirmation} onChange={(e) => setPasswordConfirmation(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                {t('saas.invitation.activateButton')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

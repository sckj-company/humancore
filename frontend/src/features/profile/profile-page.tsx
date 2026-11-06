import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Lock,
  Camera,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Check,
  Briefcase,
  Calendar,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/page-header'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth-store'
import { api, getApiErrorMessage } from '@/lib/api'
import i18n from '@/lib/i18n'

const makeProfileSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(2, t('profilePage.validation.nameRequired')),
  email: z.string().email(t('profilePage.validation.emailInvalid')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
})

const makePasswordSchema = (t: (key: string) => string) => z
  .object({
    current_password: z.string().min(1, t('profilePage.validation.currentPasswordRequired')),
    password: z.string().min(8, t('profilePage.validation.newPasswordMinimum')),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: t('profilePage.validation.passwordsMismatch'),
    path: ['password_confirmation'],
  })

type ProfileFormValues = z.infer<ReturnType<typeof makeProfileSchema>>
type PasswordFormValues = z.infer<ReturnType<typeof makePasswordSchema>>

function initials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('')
}

export function ProfilePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const queryClient = useQueryClient()

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(makeProfileSchema(t)),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.employee?.phone ?? '',
      address: user?.employee?.address ?? '',
      city: user?.employee?.city ?? '',
      state: user?.employee?.state ?? '',
      postal_code: user?.employee?.postal_code ?? '',
    },
  })

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(makePasswordSchema(t)),
  })

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) => api.put('auth/profile', data),
    onSuccess: (response: any) => {
      toast.success(t('profilePage.profileUpdated'))
      if (response?.data) {
        setUser(response.data)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('profilePage.profileUpdateError'))),
  })

  const updatePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormValues) => api.put('auth/password', data),
    onSuccess: () => {
      toast.success(t('profilePage.passwordUpdated'))
      passwordForm.reset()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('profilePage.passwordUpdateError'))),
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('avatar', file)
      return api.upload('auth/avatar', formData)
    },
    onSuccess: async () => {
      toast.success(t('profilePage.photoUpdated'))
      const me = await api.get<any>('auth/me')
      setUser(me)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('profilePage.photoUpdateError'))),
  })

  const switchLang = (lng: 'pt' | 'en' | 'zh' | 'bilingual') => {
    const locale = lng === 'bilingual' ? 'pt' : lng
    const bilingual = lng === 'bilingual'
    localStorage.setItem('hrms_bilingual', String(bilingual))
    document.documentElement.classList.toggle('bilingual', bilingual)
    void i18n.changeLanguage(locale)
    localStorage.setItem('hrms_locale', locale)
    void api.put('auth/profile', { locale }).catch(() => {})
  }

  if (!user) return null

  const langOptions = [
    { value: 'pt' as const, label: t('profilePage.languages.portuguese'), flag: '🇦🇴' },
    { value: 'en' as const, label: t('profilePage.languages.english'), flag: '🇬🇧' },
    { value: 'zh' as const, label: t('profilePage.languages.chinese'), flag: '🇨🇳' },
    { value: 'bilingual' as const, label: t('profilePage.languages.bilingual'), flag: '中' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('profilePage.eyebrow')}
        title={t('profilePage.title')}
        description={t('profilePage.description')}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="relative">
              <Avatar className="h-24 w-24 ring-4 ring-primary/10">
                <AvatarImage src={user.employee?.photo_path ?? undefined} alt={user.name} />
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-2xl text-primary-foreground">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadAvatarMutation.isPending}
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110"
              >
                {uploadAvatarMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadAvatarMutation.mutate(file)
                }}
              />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                {user.roles?.map((role) => (
                  <Badge key={role} variant="secondary" className="text-xs">
                    {role.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
            </div>

            {user.employee && (
              <>
                <Separator className="my-2" />
                <div className="w-full space-y-2 text-left text-sm">
                  {user.employee.employee_code && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span>{t('profilePage.employeeCode', { code: user.employee.employee_code })}</span>
                    </div>
                  )}
                  {user.employee.department && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{user.employee.department}</span>
                    </div>
                  )}
                  {user.employee.position && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      <span>{user.employee.position}</span>
                    </div>
                  )}
                  {user.employee.hired_at && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{t('profilePage.hireDate', { date: new Date(user.employee.hired_at).toLocaleDateString(i18n.language) })}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Settings Tabs */}
        <Card className="lg:col-span-2">
          <Tabs defaultValue="personal" className="w-full">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="personal">
                  <User className="mr-2 h-4 w-4" />
                  {t('profilePage.personal')}
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Lock className="mr-2 h-4 w-4" />
                  {t('profilePage.security')}
                </TabsTrigger>
                <TabsTrigger value="preferences">
                  <MapPin className="mr-2 h-4 w-4" />
                  {t('profilePage.preferences')}
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            {/* Personal Info */}
            <TabsContent value="personal">
              <CardContent>
                <form
                  onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t('profilePage.fullName')} *</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="name" className="pl-10" {...profileForm.register('name')} />
                      </div>
                      {profileForm.formState.errors.name && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.name.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">{t('common.email')} *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          className="pl-10"
                          {...profileForm.register('email')}
                        />
                      </div>
                      {profileForm.formState.errors.email && (
                        <p className="text-xs text-destructive">
                          {profileForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">{t('common.phone')}</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="phone" className="pl-10" {...profileForm.register('phone')} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postal_code">{t('profilePage.postalCode')}</Label>
                      <Input id="postal_code" {...profileForm.register('postal_code')} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="address">{t('profilePage.address')}</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="address" className="pl-10" {...profileForm.register('address')} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t('profilePage.city')}</Label>
                      <Input id="city" {...profileForm.register('city')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{t('profilePage.province')}</Label>
                      <Input id="state" {...profileForm.register('state')} />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updateProfileMutation.isPending}>
                      {updateProfileMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {t('profilePage.saveChanges')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security">
              <CardContent>
                <form
                  onSubmit={passwordForm.handleSubmit((data) => updatePasswordMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="current_password">{t('profilePage.currentPassword')} *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="current_password"
                        type={showCurrent ? 'text' : 'password'}
                        className="pl-10 pr-10"
                        {...passwordForm.register('current_password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.current_password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.current_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('profilePage.newPassword')} *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showNew ? 'text' : 'password'}
                        className="pl-10 pr-10"
                        {...passwordForm.register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordForm.formState.errors.password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{t('profilePage.minimumPassword')}</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password_confirmation">{t('profilePage.confirmNewPassword')} *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password_confirmation"
                        type="password"
                        className="pl-10"
                        {...passwordForm.register('password_confirmation')}
                      />
                    </div>
                    {passwordForm.formState.errors.password_confirmation && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.password_confirmation.message}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button type="submit" disabled={updatePasswordMutation.isPending}>
                      {updatePasswordMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('profilePage.updatePassword')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>

            {/* Preferences */}
            <TabsContent value="preferences">
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>{t('profilePage.language')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t('profilePage.languageDescription')}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {langOptions.map((lang) => (
                        <button
                          key={lang.value}
                          onClick={() => switchLang(lang.value)}
                          className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                            (lang.value === 'bilingual'
                              ? localStorage.getItem('hrms_bilingual') === 'true'
                              : i18n.language === lang.value && localStorage.getItem('hrms_bilingual') !== 'true')
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'hover:border-muted-foreground/50'
                          }`}
                        >
                          <span className="text-2xl">{lang.flag}</span>
                          <span className="text-xs font-medium">{lang.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}

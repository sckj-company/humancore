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

const profileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal_code: z.string().optional(),
})

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Palavra-passe atual obrigatória'),
    password: z.string().min(8, 'Nova palavra-passe deve ter pelo menos 8 caracteres'),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'As palavras-passe não coincidem',
    path: ['password_confirmation'],
  })

type ProfileFormValues = z.infer<typeof profileSchema>
type PasswordFormValues = z.infer<typeof passwordSchema>

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
    resolver: zodResolver(profileSchema),
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
    resolver: zodResolver(passwordSchema),
  })

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormValues) => api.put('auth/profile', data),
    onSuccess: (response: any) => {
      toast.success('Perfil atualizado com sucesso')
      if (response?.data) {
        setUser(response.data)
      }
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atualizar perfil')),
  })

  const updatePasswordMutation = useMutation({
    mutationFn: (data: PasswordFormValues) => api.put('auth/password', data),
    onSuccess: () => {
      toast.success('Palavra-passe atualizada com sucesso')
      passwordForm.reset()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atualizar palavra-passe')),
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('avatar', file)
      return api.upload('auth/avatar', formData)
    },
    onSuccess: async () => {
      toast.success('Foto atualizada com sucesso')
      const me = await api.get<any>('auth/me')
      setUser(me)
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao atualizar foto')),
  })

  const switchLang = (lng: 'pt' | 'en' | 'fr' | 'zh') => {
    void i18n.changeLanguage(lng)
    localStorage.setItem('hrms_locale', lng)
    void api.put('auth/profile', { locale: lng }).catch(() => {})
  }

  if (!user) return null

  const langOptions = [
    { value: 'pt' as const, label: 'Português', flag: '🇦🇴' },
    { value: 'en' as const, label: 'English', flag: '🇬🇧' },
    { value: 'fr' as const, label: 'Français', flag: '🇫🇷' },
    { value: 'zh' as const, label: '中文', flag: '🇨🇳' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CONTA"
        title="Meu Perfil"
        description="Gerencie as suas informações pessoais, palavra-passe e preferências"
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
                      <span>Código: {user.employee.employee_code}</span>
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
                      <span>Admissão: {new Date(user.employee.hired_at).toLocaleDateString('pt')}</span>
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
                  Pessoal
                </TabsTrigger>
                <TabsTrigger value="security">
                  <Lock className="mr-2 h-4 w-4" />
                  Segurança
                </TabsTrigger>
                <TabsTrigger value="preferences">
                  <MapPin className="mr-2 h-4 w-4" />
                  Preferências
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
                      <Label htmlFor="name">Nome Completo *</Label>
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
                      <Label htmlFor="email">Email *</Label>
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
                      <Label htmlFor="phone">Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="phone" className="pl-10" {...profileForm.register('phone')} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="postal_code">Código Postal</Label>
                      <Input id="postal_code" {...profileForm.register('postal_code')} />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="address">Morada</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="address" className="pl-10" {...profileForm.register('address')} />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade</Label>
                      <Input id="city" {...profileForm.register('city')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Província</Label>
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
                      Guardar Alterações
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
                    <Label htmlFor="current_password">Palavra-passe Atual *</Label>
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
                    <Label htmlFor="password">Nova Palavra-passe *</Label>
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
                    <p className="text-xs text-muted-foreground">Mínimo 8 caracteres</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password_confirmation">Confirmar Nova Palavra-passe *</Label>
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
                      Atualizar Palavra-passe
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
                    <Label>Idioma</Label>
                    <p className="text-sm text-muted-foreground">
                      Escolha o idioma da interface
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {langOptions.map((lang) => (
                        <button
                          key={lang.value}
                          onClick={() => switchLang(lang.value)}
                          className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                            i18n.language === lang.value
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

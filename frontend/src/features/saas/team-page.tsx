import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, Loader2, MailPlus, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface TeamIndexResponse {
  users: Array<{
    id: number
    name: string
    email: string
    is_active: boolean
    is_external_access: boolean
    roles: string[]
    tenant_access?: {
      role_name?: string | null
      permission_group_name?: string | null
    } | null
  }>
  invitations: Array<{
    id: number
    email: string
    name?: string | null
    role_name: string
    token: string
    expires_at: string
    is_expired: boolean
  }>
  permission_groups: Array<{ id: number; tenant_id?: number | null; name: string; description?: string | null }>
  quota: { allowed: boolean; limit: number | null; used: number }
}

export function TeamPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'hr-manager',
    permission_group_id: '',
  })

  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role_name: 'hr-manager',
    permission_group_id: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['team', 'index'],
    queryFn: () => api.get<TeamIndexResponse>('team'),
  })

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.post('team/users', {
        ...userForm,
        permission_group_id: userForm.permission_group_id ? Number(userForm.permission_group_id) : null,
      }),
    onSuccess: () => {
      toast.success(t('saas.team.toastUserCreated'))
      setCreateUserOpen(false)
      setUserForm({ name: '', email: '', password: '', role: 'hr-manager', permission_group_id: '' })
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.team.toastUserError'))),
  })

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.post('team/invitations', {
        ...inviteForm,
        permission_group_id: inviteForm.permission_group_id ? Number(inviteForm.permission_group_id) : null,
      }),
    onSuccess: () => {
      toast.success(t('saas.team.toastInviteCreated'))
      setInviteOpen(false)
      setInviteForm({ name: '', email: '', role_name: 'hr-manager', permission_group_id: '' })
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.team.toastInviteError'))),
  })

  const cancelInviteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`team/invitations/${id}`),
    onSuccess: () => {
      toast.success(t('saas.team.toastInviteCancelled'))
      qc.invalidateQueries({ queryKey: ['team'] })
    },
    onError: (err) => toast.error(getApiErrorMessage(err, t('saas.team.toastInviteCancelError'))),
  })

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/accept-invitation?token=${token}`
    navigator.clipboard.writeText(url)
    toast.success(t('saas.team.toastLinkCopied'))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('saas.team.title')}
        description={t('saas.team.description', {
          used: data?.quota.used ?? 0,
          limit: data?.quota.limit ?? '∞',
        })}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
              <MailPlus className="mr-1.5 h-4 w-4" />
              {t('saas.team.generateInvite')}
            </Button>
            <Button size="sm" onClick={() => setCreateUserOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              {t('saas.team.newUser')}
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {t('saas.team.usersTitle')}
          </CardTitle>
          <CardDescription>{t('saas.team.usersDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.users ?? []).map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {u.name}{' '}
                      {u.is_external_access && (
                        <Badge variant="outline" className="ml-1.5">
                          {t('saas.team.managerBadge')}
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{u.tenant_access?.role_name || u.roles[0] || 'employee'}</Badge>
                    <Badge variant={u.is_active ? 'default' : 'destructive'}>
                      {u.is_active ? t('saas.common.active') : t('saas.common.inactive')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('saas.team.pendingInvitesTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.invitations?.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('saas.team.noPendingInvites')}</p>
          ) : (
            <div className="space-y-2">
              {data.invitations.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.name || inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.email} • {t('saas.team.inviteProfile', { role: inv.role_name })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyInviteLink(inv.token)}>
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      {t('saas.team.copyLink')}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelInviteMutation.mutate(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Criar Utilizador */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('saas.team.createUserTitle')}</DialogTitle>
            <DialogDescription>{t('saas.team.createUserDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('saas.team.nameLabel')}</Label>
              <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.team.emailLabel')}</Label>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.team.passwordLabel')}</Label>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.team.roleLabel')}</Label>
              <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="admin">{t('saas.team.roles.admin')}</option>
                <option value="hr-manager">{t('saas.team.roles.hr-manager')}</option>
                <option value="manager">{t('saas.team.roles.manager')}</option>
                <option value="employee">{t('saas.team.roles.employee')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateUserOpen(false)}>{t('saas.common.cancel')}</Button>
              <Button disabled={createUserMutation.isPending} onClick={() => createUserMutation.mutate()}>{t('saas.common.create')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Convite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('saas.team.inviteTitle')}</DialogTitle>
            <DialogDescription>{t('saas.team.inviteDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('saas.team.emailLabel')}</Label>
              <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.team.nameOptionalLabel')}</Label>
              <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('saas.team.roleLabel')}</Label>
              <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={inviteForm.role_name} onChange={(e) => setInviteForm({ ...inviteForm, role_name: e.target.value })}>
                <option value="admin">{t('saas.team.roles.admin')}</option>
                <option value="hr-manager">{t('saas.team.roles.hr-manager')}</option>
                <option value="manager">{t('saas.team.roles.manager')}</option>
                <option value="employee">{t('saas.team.roles.employee')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>{t('saas.common.cancel')}</Button>
              <Button disabled={!inviteForm.email || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>{t('saas.team.generateInvite')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

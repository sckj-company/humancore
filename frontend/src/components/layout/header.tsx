import { useAuthStore } from '@/stores/auth-store'
import { Bell, Search, UserCircle, LogOut, Globe, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import i18n from '@/lib/i18n'

function initials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('')
}

export function Header() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const navigate = useNavigate()

  const switchLang = (lng: 'pt' | 'en' | 'fr' | 'zh') => {
    void i18n.changeLanguage(lng)
    localStorage.setItem('hrms_locale', lng)
  }

  const logout = async () => {
    try {
      await api.post('auth/logout')
    } catch {}
    clear()
    toast.success(t('auth.logged_out'))
    navigate('/login')
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Pesquisa global disponível com ⌘K</span>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => switchLang('pt')}>Português</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchLang('en')}>English</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchLang('fr')}>Français</DropdownMenuItem>
            <DropdownMenuItem onClick={() => switchLang('zh')}>中文</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon-sm" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.employee?.photo_path ?? undefined} alt={user?.name} />
                <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                  {initials(user?.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium leading-none">{user?.name}</div>
                <div className="text-xs text-muted-foreground">{user?.roles?.[0]}</div>
              </div>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <UserCircle className="mr-2 h-4 w-4" /> Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

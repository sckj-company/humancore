import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setAppLanguage } from '@/lib/i18n'

export function LanguageSwitcher() {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('language.select')}>
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setAppLanguage('pt')}>Português</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('en')}>English</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('zh')}>中文 (Mandarim)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('bilingual')}>Português + 中文</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

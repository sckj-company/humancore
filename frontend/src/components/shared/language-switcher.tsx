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
        <DropdownMenuItem onClick={() => setAppLanguage('pt')}>{t('language.portuguese')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('en')}>{t('language.english')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('zh')}>{t('language.chinese')}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppLanguage('bilingual')}>{t('language.bilingual')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

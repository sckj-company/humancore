import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type PdfLanguage = 'pt' | 'bilingual'

export function usePdfLanguagePrompt() {
  const [pendingAction, setPendingAction] = useState<((lang: PdfLanguage) => Promise<void> | void) | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const requestPdf = (action: (lang: PdfLanguage) => Promise<void> | void) => {
    setPendingAction(() => action)
  }

  const handleSelect = async (lang: PdfLanguage) => {
    const action = pendingAction
    setPendingAction(null)
    if (!action) return
    setIsDownloading(true)
    try {
      await action(lang)
    } finally {
      setIsDownloading(false)
    }
  }

  return {
    open: pendingAction !== null,
    onOpenChange: (nextOpen: boolean) => {
      if (!nextOpen) setPendingAction(null)
    },
    requestPdf,
    handleSelect,
    isDownloading,
  }
}

export function PdfLanguageDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (lang: PdfLanguage) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            {t('pdfLanguage.title', { defaultValue: 'Escolher idioma do PDF' })}
          </DialogTitle>
          <DialogDescription>
            {t('pdfLanguage.description', {
              defaultValue: 'Selecione o idioma em que pretende gerar o documento PDF.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <button
            type="button"
            onClick={() => onSelect('pt')}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('pdfLanguage.portuguese', { defaultValue: 'Português (PT)' })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('pdfLanguage.portugueseDesc', {
                  defaultValue: 'Gerar o documento apenas em Português.',
                })}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSelect('bilingual')}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
              <Languages className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('pdfLanguage.bilingual', {
                  defaultValue: 'Bilíngue (Português / Mandarim · 葡语 / 中文)',
                })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('pdfLanguage.bilingualDesc', {
                  defaultValue: 'Gerar o documento em Português e Mandarim.',
                })}
              </p>
            </div>
          </button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

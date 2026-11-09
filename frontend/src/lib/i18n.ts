import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from '@/locales/pt.json'
import en from '@/locales/en.json'
import zh from '@/locales/zh.json'

const storedLocale = localStorage.getItem('hrms_locale') || 'pt'
const stored = ['pt', 'en', 'zh'].includes(storedLocale) ? storedLocale : 'pt'
const isBilingual = localStorage.getItem('hrms_bilingual') === 'true'

document.documentElement.classList.toggle('bilingual', isBilingual)
document.documentElement.lang = stored

const bilingualPostProcessor = {
  type: 'postProcessor' as const,
  name: 'bilingual',
  process(value: string, key: string | string[], options: Record<string, unknown>) {
    if (localStorage.getItem('hrms_bilingual') !== 'true') return value

    const translationKey = Array.isArray(key) ? key[0] : key
    const translationOptions = { ...options, postProcess: [] }
    const portuguese = i18n.t(translationKey, { ...translationOptions, lng: 'pt' })
    const mandarin = i18n.t(translationKey, { ...translationOptions, lng: 'zh', fallbackLng: 'zh' })

    if (portuguese === mandarin) return portuguese
    if (portuguese === translationKey || mandarin === translationKey) return value
    return `${portuguese}\n${mandarin}`
  },
}

void i18n.use(initReactI18next).use(bilingualPostProcessor).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: stored,
  fallbackLng: 'pt',
  postProcess: ['bilingual'],
  interpolation: { escapeValue: false },
})

export function setAppLanguage(language: 'pt' | 'en' | 'zh' | 'bilingual'): void {
  const bilingual = language === 'bilingual'
  const locale = bilingual ? 'pt' : language

  localStorage.setItem('hrms_bilingual', String(bilingual))
  localStorage.setItem('hrms_locale', locale)
  document.documentElement.classList.toggle('bilingual', bilingual)
  document.documentElement.lang = locale
  void i18n.changeLanguage(locale)
}

export default i18n

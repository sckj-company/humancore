import i18n from '@/lib/i18n'

export function formatDate(
  date: string | null | undefined,
  locale = 'pt-PT',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  try {
    return new Intl.DateTimeFormat(locale, options).format(d)
  } catch {
    return d.toLocaleDateString()
  }
}

export function formatTime(
  date: string | null | undefined,
  locale = 'pt-PT',
): string {
  if (!date) return '—'
  const raw = String(date).trim()
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.slice(0, 5)
  }
  const norm = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
  const d = new Date(norm)
  if (isNaN(d.getTime())) return raw
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
}

export function formatRelative(date: string | null | undefined, locale = 'pt-PT'): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  const diffMs = d.getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute')
  const diffH = Math.round(diffMin / 60)
  if (Math.abs(diffH) < 24) return rtf.format(diffH, 'hour')
  const diffD = Math.round(diffH / 24)
  return rtf.format(diffD, 'day')
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = 'AOA',
  locale?: string,
): string {
  if (amount == null) return '—'
  const loc = locale ?? (typeof i18n !== 'undefined' ? i18n.language : 'pt')
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(amount)
  }
}

export function formatDateStr(
  date: string | null | undefined,
  dateFormat?: string,
  locale?: string,
): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  const loc = locale ?? (typeof i18n !== 'undefined' ? i18n.language : 'pt')
  // Intl.DateTimeFormat doesn't support custom PHP-style format strings,
  // so we just use dateStyle: 'medium' and let locale handle formatting.
  try {
    return new Intl.DateTimeFormat(loc, { dateStyle: 'medium' }).format(d)
  } catch {
    return d.toLocaleDateString()
  }
}

export function formatMinutesToHours(minutes?: number | null): string {
  const total = Math.max(0, Math.round(minutes ?? 0))
  const hours = Math.floor(total / 60)
  const remainingMinutes = total % 60

  if (hours === 0) {
    return `${total} min`
  }

  if (remainingMinutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${remainingMinutes} min`
}

const FULL_MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const FULL_MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatDayMonthLong(ymd: string, language: string, referenceYear?: number): string {
  const parts = ymd.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return '—'
  const [yr, m, d] = parts
  const dt = new Date(yr, m - 1, d)
  const day = String(dt.getDate()).padStart(2, '0')
  const monthIdx = dt.getMonth()
  const yearSuffix = referenceYear != null && dt.getFullYear() !== referenceYear ? ` (${dt.getFullYear()})` : ''

  if (language.startsWith('en')) {
    return `${FULL_MONTHS_EN[monthIdx]} ${day}${yearSuffix}`
  }
  if (language.startsWith('zh')) {
    return `${monthIdx + 1}月${day}日${yearSuffix}`
  }
  return `${day} de ${FULL_MONTHS_PT[monthIdx]}${yearSuffix}`
}

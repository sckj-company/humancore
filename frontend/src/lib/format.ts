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

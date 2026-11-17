import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { enUS, pt, zhCN } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatDayMonthLong } from '@/lib/format'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseYmdToDate(ymd?: string): Date | undefined {
  if (!ymd) return undefined
  const parts = ymd.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  return new Date(parts[0], parts[1] - 1, parts[2])
}

function dateToYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatCaptionMonth(date: Date, language: string, referenceYear: number): string {
  const monthIdx = date.getMonth()
  const yearSuffix = date.getFullYear() !== referenceYear ? ` ${date.getFullYear()}` : ''
  if (language.startsWith('en')) {
    return `${FULL_MONTHS_EN[monthIdx]}${yearSuffix}`
  }
  if (language.startsWith('zh')) {
    return `${monthIdx + 1}月${yearSuffix}`
  }
  return `${FULL_MONTHS_PT[monthIdx]}${yearSuffix}`
}

export interface CalendarDateFieldProps {
  id?: string
  value: string
  onChange: (ymd: string) => void
  year: number
  minDate?: string
  maxDate?: string
  allowNextYearOverflow?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function CalendarDateField({
  id,
  value,
  onChange,
  year,
  minDate,
  maxDate,
  allowNextYearOverflow = false,
  placeholder = 'Selecionar data',
  disabled = false,
  className,
}: CalendarDateFieldProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const selectedDate = parseYmdToDate(value)
  const minDateObj = parseYmdToDate(minDate)
  const maxDateObj = parseYmdToDate(maxDate)

  const startMonth = new Date(year, 0, 1)
  const endMonth = allowNextYearOverflow ? new Date(year + 1, 0, 31) : new Date(year, 11, 31)

  const initialVisibleMonth =
    selectedDate && selectedDate >= startMonth && selectedDate <= endMonth
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      : startMonth

  const [visibleMonth, setVisibleMonth] = useState<Date>(initialVisibleMonth)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setVisibleMonth(initialVisibleMonth)
    }
    setOpen(nextOpen)
  }

  const locale = i18n.language.startsWith('en') ? enUS : i18n.language.startsWith('zh') ? zhCN : pt

  const disabledMatchers = [
    ...(minDateObj ? [{ before: minDateObj }] : []),
    ...(maxDateObj ? [{ after: maxDateObj }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate font-medium">
            {value ? formatDayMonthLong(value, i18n.language, year) : placeholder}
          </span>
          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <DayPicker
          mode="single"
          locale={locale}
          selected={selectedDate}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          onSelect={(day) => {
            if (!day) return
            onChange(dateToYmd(day))
            setOpen(false)
          }}
          formatters={{
            formatCaption: (d) => formatCaptionMonth(d, i18n.language, year),
          }}
          components={{
            Chevron: ({ orientation }) =>
              orientation === 'left' ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              ),
          }}
          classNames={{
            root: 'select-none',
            months: 'flex flex-col',
            month: 'space-y-3',
            month_caption: 'relative flex h-8 items-center justify-center px-8',
            caption_label: 'text-sm font-semibold text-foreground',
            nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
            button_previous:
              'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-35',
            button_next:
              'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-background text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-35',
            month_grid: 'w-full border-collapse',
            weekdays: 'grid grid-cols-7',
            weekday: 'flex h-8 w-9 items-center justify-center text-[11px] font-medium uppercase text-muted-foreground',
            weeks: 'mt-1 flex flex-col gap-1',
            week: 'grid grid-cols-7',
            day: 'flex h-9 w-9 items-center justify-center p-0 text-center text-sm',
            day_button:
              'flex h-8 w-8 items-center justify-center rounded-md font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected:
              '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
            today: '[&>button]:ring-1 [&>button]:ring-primary/50 [&>button]:font-semibold',
            outside: 'text-muted-foreground/40',
            disabled: '[&>button]:opacity-30 [&>button]:pointer-events-none',
            hidden: 'invisible',
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

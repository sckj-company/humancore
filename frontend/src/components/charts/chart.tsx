import { useEffect, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTheme } from '@/hooks/use-theme'
import type { EChartsOption } from 'echarts'

interface ChartProps {
  option: EChartsOption
  height?: number | string
  className?: string
  loading?: boolean
  empty?: boolean
}

export function Chart({ option, height = 320, className, loading, empty }: ChartProps) {
  const ref = useRef<ReactECharts>(null)
  const theme = useTheme()
  const [, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  if (loading) {
    return <div className="h-full w-full animate-pulse rounded-md bg-muted" style={{ height }} />
  }

  if (empty) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        Sem dados para mostrar
      </div>
    )
  }

  return (
    <div className={className}>
      <ReactECharts
        ref={ref}
        option={option}
        theme={theme === 'dark' ? 'dark' : undefined}
        style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}

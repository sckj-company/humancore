import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface Step {
  id: string
  label: string
  description?: string
}

interface StepsProps {
  steps: Step[]
  activeStep: string
  completedSteps?: Set<string>
  onStepClick?: (stepId: string) => void
  className?: string
}

export function Steps({
  steps,
  activeStep,
  completedSteps = new Set(),
  onStepClick,
  className,
}: StepsProps) {
  const activeIdx = steps.findIndex((s) => s.id === activeStep)

  return (
    <ol className={cn('flex items-center gap-1 overflow-x-auto pb-2 scrollbar-thin', className)}>
      {steps.map((step, idx) => {
        const isCompleted = completedSteps.has(step.id)
        const isActive = idx === activeIdx
        const isPast = idx < activeIdx
        const status = isActive ? 'active' : isCompleted || isPast ? 'completed' : 'pending'

        return (
          <li key={step.id} className="flex flex-1 items-center gap-2 min-w-fit">
            <button
              type="button"
              disabled={!onStepClick}
              onClick={() => onStepClick?.(step.id)}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                onStepClick && 'hover:bg-muted/50 cursor-pointer',
                isActive && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  status === 'completed' && 'bg-success text-success-foreground',
                  status === 'active' && 'bg-primary text-primary-foreground shadow-md shadow-primary/30',
                  status === 'pending' && 'bg-muted text-muted-foreground ring-1 ring-border',
                )}
              >
                {status === 'completed' ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <div className="hidden text-left sm:block">
                <p
                  className={cn(
                    'text-xs font-medium leading-tight',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="text-[10px] text-muted-foreground">{step.description}</p>
                )}
              </div>
            </button>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1 transition-colors',
                  idx < activeIdx ? 'bg-success/40' : 'bg-border',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
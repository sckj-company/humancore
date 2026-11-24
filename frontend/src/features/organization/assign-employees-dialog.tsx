import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, Check, Loader2, Search, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useEmployeesPicker, type Department, type Position } from './api'

export interface AssignEmployeesSubmitPayload {
  employeeIds: number[]
  syncDepartment: boolean
}

export function AssignEmployeesDialog({
  open,
  onOpenChange,
  mode,
  targetDepartment,
  targetPosition,
  isSaving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'department' | 'position'
  targetDepartment?: Department | null
  targetPosition?: Position | null
  isSaving: boolean
  onSubmit: (payload: AssignEmployeesSubmitPayload) => Promise<void> | void
}) {
  const targetKey =
    mode === 'department' ? `dept-${targetDepartment?.id ?? 'none'}` : `pos-${targetPosition?.id ?? 'none'}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <AssignEmployeesDialogBody
          key={targetKey}
          onOpenChange={onOpenChange}
          mode={mode}
          targetDepartment={targetDepartment}
          targetPosition={targetPosition}
          isSaving={isSaving}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  )
}

function AssignEmployeesDialogBody({
  onOpenChange,
  mode,
  targetDepartment,
  targetPosition,
  isSaving,
  onSubmit,
}: {
  onOpenChange: (open: boolean) => void
  mode: 'department' | 'position'
  targetDepartment?: Department | null
  targetPosition?: Position | null
  isSaving: boolean
  onSubmit: (payload: AssignEmployeesSubmitPayload) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [syncDepartment, setSyncDepartment] = useState(false)

  const { data: employees, isLoading } = useEmployeesPicker(search, true)

  const isAlreadyAssigned = (emp: NonNullable<typeof employees>[number]) =>
    mode === 'department'
      ? Boolean(
          targetDepartment &&
            (emp.department_ids?.includes(targetDepartment.id) ||
              emp.department_id === targetDepartment.id),
        )
      : emp.position_id === targetPosition?.id

  const visibleEmployees = useMemo(() => {
    const list = employees ?? []
    if (!onlyUnassigned) return list
    return list.filter((emp) =>
      mode === 'department'
        ? (emp.department_ids?.length ?? 0) === 0 && emp.department_id == null
        : emp.position_id == null,
    )
  }, [employees, onlyUnassigned, mode])

  const eligibleVisibleIds = useMemo(
    () =>
      visibleEmployees
        .filter((emp) =>
          mode === 'department'
            ? !(
                targetDepartment &&
                (emp.department_ids?.includes(targetDepartment.id) ||
                  emp.department_id === targetDepartment.id)
              )
            : emp.position_id !== targetPosition?.id,
        )
        .map((e) => e.id),
    [visibleEmployees, mode, targetDepartment, targetPosition?.id],
  )

  const allEligibleSelected =
    eligibleVisibleIds.length > 0 && eligibleVisibleIds.every((id) => selectedIds.includes(id))

  const toggleEmployee = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id),
    )
  }

  const toggleSelectAllEligible = () => {
    if (allEligibleSelected) {
      const visibleSet = new Set(eligibleVisibleIds)
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)))
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...eligibleVisibleIds])])
    }
  }

  const targetTitle =
    mode === 'department' ? targetDepartment?.name ?? '' : targetPosition?.title ?? ''

  return (
    <DialogContent className="flex max-h-[88vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-primary" />
          {mode === 'department'
            ? t('organizationPage.assignEmployees.departmentTitle', {
                name: targetTitle,
                defaultValue: `Adicionar funcionários a ${targetTitle}`,
              })
            : t('organizationPage.assignEmployees.positionTitle', {
                name: targetTitle,
                defaultValue: `Adicionar funcionários ao cargo ${targetTitle}`,
              })}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {mode === 'department'
            ? t('organizationPage.assignEmployees.departmentDesc', {
                defaultValue:
                  'Selecione um ou mais funcionários da empresa para integrar neste departamento.',
              })
            : t('organizationPage.assignEmployees.positionDesc', {
                defaultValue:
                  'Selecione um ou mais funcionários da empresa para ocupar este cargo.',
              })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 border-b bg-muted/20 px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('organizationPage.assignEmployees.searchPlaceholder', {
              defaultValue: 'Pesquisar por nome, código ou email…',
            })}
            className="h-9 bg-background pl-9 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="only-unassigned"
              checked={onlyUnassigned}
              onCheckedChange={setOnlyUnassigned}
            />
            <Label htmlFor="only-unassigned" className="cursor-pointer text-xs text-muted-foreground">
              {mode === 'department'
                ? t('organizationPage.assignEmployees.onlyWithoutDepartment', {
                    defaultValue: 'Mostrar apenas sem departamento',
                  })
                : t('organizationPage.assignEmployees.onlyWithoutPosition', {
                    defaultValue: 'Mostrar apenas sem cargo',
                  })}
            </Label>
          </div>

          {eligibleVisibleIds.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={toggleSelectAllEligible}
            >
              {allEligibleSelected
                ? t('organizationPage.assignEmployees.deselectVisible', {
                    defaultValue: 'Desmarcar visíveis',
                  })
                : t('organizationPage.assignEmployees.selectVisible', {
                    defaultValue: 'Selecionar visíveis',
                  })}
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[220px] flex-1 overflow-y-auto px-6 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleEmployees.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            {t('organizationPage.assignEmployees.noEmployeesFound', {
              defaultValue: 'Nenhum funcionário encontrado com os filtros atuais.',
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleEmployees.map((emp) => {
              const alreadyInTarget = isAlreadyAssigned(emp)
              const checked = alreadyInTarget || selectedIds.includes(emp.id)
              const currentLabel =
                mode === 'department'
                  ? emp.departments && emp.departments.length > 0
                    ? emp.departments.map((d) => d.name).join(', ')
                    : emp.department
                  : emp.position
              const initials = emp.full_name
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('')

              return (
                <label
                  key={emp.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                    alreadyInTarget
                      ? 'cursor-not-allowed border-border/50 bg-muted/40 opacity-70'
                      : checked
                        ? 'cursor-pointer border-primary bg-primary/5'
                        : 'cursor-pointer border-border/70 hover:bg-muted/30',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      checked={checked}
                      disabled={alreadyInTarget}
                      onCheckedChange={(val) => toggleEmployee(emp.id, val === true)}
                    />
                    <Avatar size="sm" className="h-8 w-8 shrink-0">
                      <AvatarImage src={emp.photo_path ?? undefined} alt={emp.full_name} />
                      <AvatarFallback className="text-[11px] font-medium">
                        {initials || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{emp.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[emp.employee_code, emp.email].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {alreadyInTarget ? (
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <Check className="h-3 w-3" />
                        {t('organizationPage.assignEmployees.alreadyAssigned', {
                          defaultValue: 'Já pertence',
                        })}
                      </Badge>
                    ) : currentLabel ? (
                      <Badge variant="outline" className="max-w-[200px] truncate text-[11px]">
                        {mode === 'department'
                          ? t('organizationPage.assignEmployees.alsoInLabel', {
                              name: currentLabel,
                              defaultValue: `Também em: ${currentLabel}`,
                            })
                          : t('organizationPage.assignEmployees.currentLabel', {
                              name: currentLabel,
                              defaultValue: `Atual: ${currentLabel}`,
                            })}
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {mode === 'department'
                          ? t('organizationPage.assignEmployees.noDepartment', {
                              defaultValue: 'Sem departamento',
                            })
                          : t('organizationPage.assignEmployees.noPosition', {
                              defaultValue: 'Sem cargo',
                            })}
                      </span>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {mode === 'position' && targetPosition?.department && (
        <div className="border-t bg-muted/20 px-6 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="sync-dept-switch" className="cursor-pointer font-medium">
                {t('organizationPage.assignEmployees.syncDepartmentLabel', {
                  name: targetPosition.department.name,
                  defaultValue: `Atualizar também o departamento para ${targetPosition.department.name}`,
                })}
              </Label>
            </div>
            <Switch
              id="sync-dept-switch"
              checked={syncDepartment}
              onCheckedChange={setSyncDepartment}
            />
          </div>
        </div>
      )}

      <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3 sm:justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {t('organizationPage.permissions.selectedCount', {
            count: selectedIds.length,
            defaultValue: `${selectedIds.length} selecionado(s)`,
          })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t('organizationPage.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={isSaving || selectedIds.length === 0}
            onClick={() => onSubmit({ employeeIds: selectedIds, syncDepartment })}
          >
            {isSaving
              ? t('organizationPage.common.saving')
              : t('organizationPage.assignEmployees.confirmButton', {
                  defaultValue: 'Adicionar funcionários',
                })}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Settings2,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'

export interface DataTableColumn<T> {
  id: string
  header: string
  accessor?: keyof T | ((row: T) => unknown)
  cell?: (row: T) => ReactNode
  sortable?: boolean
  width?: string
  align?: 'left' | 'right' | 'center'
  className?: string
  hidden?: boolean
}

export interface DataTableAction<T> {
  label: string
  icon?: ReactNode
  onClick: (row: T) => void
  destructive?: boolean
  hidden?: (row: T) => boolean
  disabled?: (row: T) => boolean
}

export interface DataTableBulkAction<T> {
  label: string
  icon?: ReactNode
  onClick: (rows: T[]) => void
  destructive?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  rowKey: (row: T) => string | number
  isLoading?: boolean
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  toolbar?: ReactNode
  actions?: DataTableAction<T>[]
  bulkActions?: DataTableBulkAction<T>[]
  selectable?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  pagination?: {
    page: number
    perPage: number
    total: number
    lastPage: number
    onPageChange: (page: number) => void
  }
  onRowClick?: (row: T) => void
  className?: string
}

type SortDir = 'asc' | 'desc' | null

export function DataTable<T>({
  data,
  columns,
  rowKey,
  isLoading,
  search,
  onSearchChange,
  searchPlaceholder = 'Pesquisar...',
  toolbar,
  actions,
  bulkActions,
  selectable = false,
  emptyTitle = 'Nenhum registo encontrado',
  emptyDescription = 'Tente ajustar os filtros ou adicione um novo registo.',
  emptyAction,
  pagination,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set())

  const visibleCols = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.id)),
    [columns, hiddenCols],
  )

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data
    const col = columns.find((c) => c.id === sortKey)
    if (!col) return data
    const get = (row: T): unknown => {
      if (typeof col.accessor === 'function') return col.accessor(row)
      if (typeof col.accessor === 'string') return row[col.accessor]
      return undefined
    }
    return [...data].sort((a, b) => {
      const va = get(a) as string | number | null | undefined
      const vb = get(b) as string | number | null | undefined
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va))
    })
  }, [data, columns, sortKey, sortDir])

  const toggleSort = (id: string) => {
    if (sortKey !== id) {
      setSortKey(id)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
      setSortDir(null)
    }
  }

  const toggleAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(data.map(rowKey)))
    }
  }

  const toggleOne = (key: string | number) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  const selectedRows = data.filter((d) => selected.has(rowKey(d)))

  const toggleCol = (id: string) => {
    const next = new Set(hiddenCols)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setHiddenCols(next)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          {onSearchChange !== undefined && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search ?? ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {selectable && selected.size > 0 && bulkActions && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              <span className="font-medium text-primary">{selected.size} selecionado(s)</span>
              {bulkActions
                .filter((a) => !a.destructive || selectedRows.length > 0)
                .map((a, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className={cn('h-7 gap-1.5 text-xs', a.destructive && 'text-destructive hover:text-destructive')}
                    onClick={() => a.onClick(selectedRows)}
                  >
                    {a.icon}
                    {a.label}
                  </Button>
                ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelected(new Set())}
              >
                Limpar
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Colunas</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Colunas visíveis
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={!hiddenCols.has(col.id)}
                  onCheckedChange={() => toggleCol(col.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {col.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left">
              <tr>
                {selectable && (
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={selected.size === data.length && data.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                )}
                {visibleCols.map((col) => (
                  <th
                    key={col.id}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className={cn(
                          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                          col.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {col.header}
                        {sortKey === col.id ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                ))}
                {actions && actions.length > 0 && (
                  <th className="w-12 px-4 py-3 text-right">
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {selectable && (
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-4 rounded" />
                      </td>
                    )}
                    {visibleCols.map((col) => (
                      <td key={col.id} className="px-4 py-3">
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                    {actions && <td className="px-4 py-3" />}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleCols.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                    className="px-6 py-16 text-center"
                  >
                    <div className="mx-auto max-w-sm">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Search className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">{emptyTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
                      {emptyAction && <div className="mt-4">{emptyAction}</div>}
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((row) => {
                  const key = rowKey(row)
                  const isSelected = selected.has(key)
                  const visibleActions = (actions ?? []).filter(
                    (a) => !a.hidden?.(row),
                  )
                  return (
                    <tr
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'group transition-colors',
                        onRowClick && 'cursor-pointer',
                        isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                      )}
                    >
                      {selectable && (
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(key)}
                            aria-label="Selecionar linha"
                          />
                        </td>
                      )}
                      {visibleCols.map((col) => {
                        const raw =
                          typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : typeof col.accessor === 'string'
                              ? row[col.accessor]
                              : undefined
                        const content = col.cell ? col.cell(row) : (raw as ReactNode)
                        return (
                          <td
                            key={col.id}
                            className={cn(
                              'px-4 py-3',
                              col.align === 'right' && 'text-right',
                              col.align === 'center' && 'text-center',
                              col.className,
                            )}
                          >
                            {content as ReactNode}
                          </td>
                        )
                      })}
                      {actions && actions.length > 0 && (
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                                aria-label="Ações"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {visibleActions.map((a, idx) => (
                                <DropdownMenuItem
                                  key={idx}
                                  onClick={() => a.onClick(row)}
                                  disabled={a.disabled?.(row)}
                                  className={cn(
                                    a.destructive &&
                                      'text-destructive focus:text-destructive focus:bg-destructive/10',
                                  )}
                                >
                                  {a.icon}
                                  <span>{a.label}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.lastPage > 1 && (
          <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              Página <span className="font-medium text-foreground">{pagination.page}</span> de{' '}
              <span className="font-medium text-foreground">{pagination.lastPage}</span>
              <span className="mx-1">·</span>
              <span className="font-medium text-foreground">{pagination.total}</span> registos
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onPageChange(1)}
                aria-label="Primeira página"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onPageChange(pagination.page - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pagination.page >= pagination.lastPage}
                onClick={() => pagination.onPageChange(pagination.page + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={pagination.page >= pagination.lastPage}
                onClick={() => pagination.onPageChange(pagination.lastPage)}
                aria-label="Última página"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
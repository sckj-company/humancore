import { useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pencil,
  Trash2,
  Users,
  Shield,
  ArrowRight,
  GripVertical,
  ArrowUpToLine,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface OrgChartNode {
  id: number
  parentId?: number | null
  level: number
  title: string
  code?: string | null
  subtitle?: string | null
  employeeCount?: number
  permissionsCount?: number
  badgeText?: string | null
  isInactive?: boolean
  accentClass?: string
}

export interface OrgChartMovePayload {
  nodeId: number
  newParentId: number | null
  newLevel: number
}

type DropTargetState =
  | { kind: 'root' }
  | { kind: 'node'; id: number }
  | { kind: 'band'; level: number }
  | null

interface TreeEntry {
  node: OrgChartNode
  children: TreeEntry[]
}

const LEVEL_BADGE_COLORS = [
  'bg-primary/15 text-primary border-primary/30',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
]

function getLevelBadgeClass(level: number): string {
  const index = Math.max(0, level - 1) % LEVEL_BADGE_COLORS.length
  return LEVEL_BADGE_COLORS[index]
}

interface NodeDragContext {
  canDrag: boolean
  draggingId: number | null
  invalidDropIds: Set<number>
  dropTarget: DropTargetState
  setDropTarget: React.Dispatch<React.SetStateAction<DropTargetState>>
  onDragStartNode: (e: DragEvent<HTMLDivElement>, node: OrgChartNode) => void
  onDragEndNode: () => void
  onDropOnNode: (e: DragEvent<HTMLDivElement>, targetNode: OrgChartNode) => void
}

function OrgNodeCard({
  node,
  selectedId,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  selectHint,
  dragContext,
}: {
  node: OrgChartNode
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  selectHint?: string
  dragContext: NodeDragContext
}) {
  const { t } = useTranslation()
  const isSelected = selectedId === node.id
  const {
    canDrag,
    draggingId,
    invalidDropIds,
    dropTarget,
    setDropTarget,
    onDragStartNode,
    onDragEndNode,
    onDropOnNode,
  } = dragContext

  const isDragging = draggingId === node.id
  const isInvalidTarget = draggingId !== null && invalidDropIds.has(node.id)
  const isValidDropTarget =
    draggingId !== null && !invalidDropIds.has(node.id)
  const isDropHovered =
    isValidDropTarget && dropTarget?.kind === 'node' && dropTarget.id === node.id
  const nextLevel = Math.min(20, (node.level || 1) + 1)

  return (
    <div
      role={onSelectNode ? 'button' : undefined}
      tabIndex={onSelectNode ? 0 : undefined}
      draggable={canDrag}
      onDragStart={(e) => {
        if (canDrag) onDragStartNode(e, node)
      }}
      onDragEnd={onDragEndNode}
      onDragOver={(e) => {
        if (!canDrag || draggingId === null) return
        if (isInvalidTarget) {
          e.dataTransfer.dropEffect = 'none'
          return
        }
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDropTarget((prev) =>
          prev?.kind === 'node' && prev.id === node.id ? prev : { kind: 'node', id: node.id },
        )
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropTarget((prev) =>
            prev?.kind === 'node' && prev.id === node.id ? null : prev,
          )
        }
      }}
      onDrop={(e) => {
        if (!canDrag) return
        onDropOnNode(e, node)
      }}
      onClick={() => {
        if (draggingId === null) {
          onSelectNode?.(node)
        }
      }}
      onKeyDown={(e) => {
        if (onSelectNode && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelectNode(node)
        }
      }}
      className={cn(
        'group relative w-[228px] rounded-xl border bg-card p-3.5 text-left shadow-xs transition-all select-none',
        canDrag && 'cursor-grab active:cursor-grabbing',
        onSelectNode && !canDrag && 'cursor-pointer',
        onSelectNode && !isDragging && 'hover:border-primary/60 hover:shadow-md',
        isSelected && !isDropHovered ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        node.isInactive && 'opacity-65',
        isDragging && 'scale-[0.98] border-dashed border-primary/60 opacity-40',
        isInvalidTarget && !isDragging && 'opacity-55',
        isDropHovered && 'scale-[1.02] border-primary bg-primary/10 ring-2 ring-primary shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1">
          {canDrag && (
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
          )}
          <Badge
            variant="outline"
            className={cn('text-[10px] font-semibold', getLevelBadgeClass(node.level))}
          >
            {t('organizationPage.orgChart.levelBadge', { level: node.level })}
          </Badge>
        </div>

        <div className="flex items-center gap-0.5">
          {node.badgeText && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {node.badgeText}
            </Badge>
          )}
          {onEditNode && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onEditNode(node)
              }}
              title={t('organizationPage.common.edit', { defaultValue: 'Editar' })}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onDeleteNode && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteNode(node)
              }}
              title={t('organizationPage.common.delete')}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2">
        <h4 className="truncate text-sm font-semibold text-foreground" title={node.title}>
          {node.title}
        </h4>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {node.code && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {node.code}
            </span>
          )}
          {node.subtitle && (
            <span className="truncate text-[11px] text-muted-foreground">{node.subtitle}</span>
          )}
        </div>
      </div>

      {isDropHovered ? (
        <div className="mt-3 rounded-md border border-dashed border-primary/60 bg-primary/10 px-2 py-1 text-center text-[11px] font-medium text-primary">
          {t('organizationPage.orgChart.dropAsChild', {
            level: nextLevel,
            defaultValue: `Soltar aqui → Nível ${nextLevel}`,
          })}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3 shrink-0" />
            {node.employeeCount ?? 0}
          </span>

          {typeof node.permissionsCount === 'number' && node.permissionsCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <Shield className="h-3 w-3 shrink-0" />
              {node.permissionsCount}
            </span>
          ) : selectHint ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
              {selectHint}
              <ArrowRight className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function OrgTreeBranch({
  entry,
  selectedId,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  selectHint,
  dragContext,
}: {
  entry: TreeEntry
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  selectHint?: string
  dragContext: NodeDragContext
}) {
  return (
    <div className="flex flex-col items-center">
      <OrgNodeCard
        node={entry.node}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        onEditNode={onEditNode}
        onDeleteNode={onDeleteNode}
        selectHint={selectHint}
        dragContext={dragContext}
      />

      {entry.children.length > 0 && (
        <>
          <div className="h-6 w-px bg-border" />
          <div className="relative flex items-start justify-center gap-5">
            {entry.children.map((child, idx) => {
              const isSingle = entry.children.length === 1
              const isFirst = idx === 0
              const isLast = idx === entry.children.length - 1
              return (
                <div key={child.node.id} className="relative flex flex-col items-center pt-5">
                  {/* Horizontal connector bar across siblings */}
                  {!isSingle && (
                    <div
                      className={cn(
                        'absolute top-0 h-px bg-border',
                        isFirst ? 'left-1/2 right-0' : isLast ? 'left-0 right-1/2' : 'left-0 right-0',
                      )}
                    />
                  )}
                  {/* Vertical drop down into child card */}
                  <div className="absolute top-0 left-1/2 h-5 w-px -translate-x-1/2 bg-border" />
                  <OrgTreeBranch
                    entry={child}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    onEditNode={onEditNode}
                    onDeleteNode={onDeleteNode}
                    selectHint={selectHint}
                    dragContext={dragContext}
                  />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function OrgChartView({
  nodes,
  selectedId,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  onMoveNode,
  isMoving = false,
  hintText,
  selectHint,
}: {
  nodes: OrgChartNode[]
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  onMoveNode?: (payload: OrgChartMovePayload) => Promise<void> | void
  isMoving?: boolean
  hintText?: string
  selectHint?: string
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTargetState>(null)

  const canDrag = Boolean(onMoveNode) && !isMoving

  const { hasParentLinks, treeRoots, levelBands } = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
    const byId = new Map<number, OrgChartNode>(sorted.map((n) => [n.id, n]))
    const hasLinks = sorted.some((n) => n.parentId != null && byId.has(n.parentId))

    if (!hasLinks) {
      const bandMap = new Map<number, OrgChartNode[]>()
      for (const n of sorted) {
        const lvl = Math.max(1, n.level || 1)
        const list = bandMap.get(lvl) ?? []
        list.push(n)
        bandMap.set(lvl, list)
      }
      const bands = [...bandMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, items]) => ({ level, items }))

      return { hasParentLinks: false, treeRoots: [] as TreeEntry[], levelBands: bands }
    }

    const childrenByParent = new Map<number, OrgChartNode[]>()
    const roots: OrgChartNode[] = []

    for (const n of sorted) {
      if (n.parentId != null && byId.has(n.parentId) && n.parentId !== n.id) {
        const list = childrenByParent.get(n.parentId) ?? []
        list.push(n)
        childrenByParent.set(n.parentId, list)
      } else {
        roots.push(n)
      }
    }

    const visited = new Set<number>()
    const buildTree = (node: OrgChartNode): TreeEntry => {
      visited.add(node.id)
      const kids = (childrenByParent.get(node.id) ?? [])
        .filter((k) => !visited.has(k.id))
        .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
        .map(buildTree)
      return { node, children: kids }
    }

    return {
      hasParentLinks: true,
      treeRoots: roots.map(buildTree),
      levelBands: [] as Array<{ level: number; items: OrgChartNode[] }>,
    }
  }, [nodes])

  const invalidDropIds = useMemo(() => {
    const invalid = new Set<number>()
    if (draggingId === null) return invalid
    invalid.add(draggingId)

    let added = true
    while (added) {
      added = false
      for (const n of nodes) {
        if (n.parentId != null && invalid.has(n.parentId) && !invalid.has(n.id)) {
          invalid.add(n.id)
          added = true
        }
      }
    }
    return invalid
  }, [nodes, draggingId])

  const parseDraggedId = (e: DragEvent): number | null => {
    if (draggingId !== null) return draggingId
    const raw = Number(e.dataTransfer.getData('text/plain'))
    return Number.isFinite(raw) && raw > 0 ? raw : null
  }

  const handleDragStartNode = (e: DragEvent<HTMLDivElement>, node: OrgChartNode) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(node.id))
    setDraggingId(node.id)
  }

  const handleDragEndNode = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleDropOnNode = (e: DragEvent<HTMLDivElement>, targetNode: OrgChartNode) => {
    e.preventDefault()
    e.stopPropagation()

    const draggedNodeId = parseDraggedId(e)
    setDraggingId(null)
    setDropTarget(null)

    if (!onMoveNode || draggedNodeId === null || invalidDropIds.has(targetNode.id)) {
      return
    }

    const draggedNode = nodes.find((n) => n.id === draggedNodeId)
    const newLevel = Math.min(20, (targetNode.level || 1) + 1)

    if (
      draggedNode &&
      (draggedNode.parentId ?? null) === targetNode.id &&
      draggedNode.level === newLevel
    ) {
      return
    }

    onMoveNode({
      nodeId: draggedNodeId,
      newParentId: targetNode.id,
      newLevel,
    })
  }

  const handleDropOnRoot = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const draggedNodeId = parseDraggedId(e)
    setDraggingId(null)
    setDropTarget(null)

    if (!onMoveNode || draggedNodeId === null) {
      return
    }

    const draggedNode = nodes.find((n) => n.id === draggedNodeId)
    if (draggedNode && (draggedNode.parentId ?? null) === null && draggedNode.level === 1) {
      return
    }

    onMoveNode({
      nodeId: draggedNodeId,
      newParentId: null,
      newLevel: 1,
    })
  }

  const handleDropOnBand = (e: DragEvent<HTMLDivElement>, targetLevel: number) => {
    e.preventDefault()
    e.stopPropagation()

    const draggedNodeId = parseDraggedId(e)
    setDraggingId(null)
    setDropTarget(null)

    if (!onMoveNode || draggedNodeId === null) {
      return
    }

    const clampedLevel = Math.max(1, Math.min(20, targetLevel))
    const draggedNode = nodes.find((n) => n.id === draggedNodeId)
    if (draggedNode && (draggedNode.parentId ?? null) === null && draggedNode.level === clampedLevel) {
      return
    }

    onMoveNode({
      nodeId: draggedNodeId,
      newParentId: null,
      newLevel: clampedLevel,
    })
  }

  const dragContext: NodeDragContext = {
    canDrag,
    draggingId,
    invalidDropIds,
    dropTarget,
    setDropTarget,
    onDragStartNode: handleDragStartNode,
    onDragEndNode: handleDragEndNode,
    onDropOnNode: handleDropOnNode,
  }

  const maxBandLevel = levelBands.length > 0 ? levelBands[levelBands.length - 1].level : 1
  const nextBandLevel = Math.min(20, maxBandLevel + 1)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{hintText ?? t('organizationPage.orgChart.defaultHint')}</span>
            {onMoveNode && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
                {t('organizationPage.orgChart.dragHint', {
                  defaultValue: 'Arraste os cards para reorganizar níveis e hierarquia.',
                })}
              </span>
            )}
            {isMoving && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('organizationPage.orgChart.updatingHierarchy', {
                  defaultValue: 'A atualizar hierarquia…',
                })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-11 text-center text-xs font-medium tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            {zoom !== 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setZoom(1)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Zona para promover ao Nível 1 (topo / sem superior) durante o arrasto */}
        {canDrag && draggingId !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropTarget((prev) => (prev?.kind === 'root' ? prev : { kind: 'root' }))
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDropTarget((prev) => (prev?.kind === 'root' ? null : prev))
              }
            }}
            onDrop={handleDropOnRoot}
            className={cn(
              'mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-xs font-medium transition-all',
              dropTarget?.kind === 'root'
                ? 'border-primary bg-primary/10 text-primary shadow-xs'
                : 'border-border/80 bg-muted/30 text-muted-foreground',
            )}
          >
            <ArrowUpToLine className="h-4 w-4 shrink-0" />
            {t('organizationPage.orgChart.dropToTopLevel', {
              defaultValue: 'Soltar aqui para promover ao Nível 1 (Topo / sem superior)',
            })}
          </div>
        )}

        <div className="overflow-x-auto pb-4">
          <div
            className="min-w-max origin-top-left transition-transform duration-150"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            {hasParentLinks ? (
              <div className="flex items-start justify-center gap-8 px-4 py-2">
                {treeRoots.map((root) => (
                  <OrgTreeBranch
                    key={root.node.id}
                    entry={root}
                    selectedId={selectedId}
                    onSelectNode={onSelectNode}
                    onEditNode={onEditNode}
                    onDeleteNode={onDeleteNode}
                    selectHint={selectHint}
                    dragContext={dragContext}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-2">
                {levelBands.map((band, bandIdx) => {
                  const isBandHovered =
                    canDrag &&
                    draggingId !== null &&
                    dropTarget?.kind === 'band' &&
                    dropTarget.level === band.level

                  return (
                    <div key={band.level} className="flex w-full flex-col items-center">
                      {bandIdx > 0 && <div className="mb-2 h-6 w-px bg-border" />}
                      <div
                        onDragOver={(e) => {
                          if (!canDrag || draggingId === null) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          setDropTarget((prev) =>
                            prev?.kind === 'band' && prev.level === band.level
                              ? prev
                              : { kind: 'band', level: band.level },
                          )
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                            setDropTarget((prev) =>
                              prev?.kind === 'band' && prev.level === band.level ? null : prev,
                            )
                          }
                        }}
                        onDrop={(e) => {
                          if (canDrag) handleDropOnBand(e, band.level)
                        }}
                        className={cn(
                          'flex flex-col items-center gap-3 rounded-xl border border-dashed px-5 py-4 transition-all',
                          isBandHovered
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                            : 'border-border/80 bg-muted/20',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn('text-xs font-semibold', getLevelBadgeClass(band.level))}
                          >
                            {t('organizationPage.orgChart.levelBadge', { level: band.level })}
                          </Badge>
                          {isBandHovered && (
                            <span className="text-[11px] font-medium text-primary">
                              {t('organizationPage.orgChart.dropIntoLevel', {
                                level: band.level,
                                defaultValue: `Mover para Nível ${band.level}`,
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-stretch justify-center gap-4">
                          {band.items.map((node) => (
                            <OrgNodeCard
                              key={node.id}
                              node={node}
                              selectedId={selectedId}
                              onSelectNode={onSelectNode}
                              onEditNode={onEditNode}
                              onDeleteNode={onDeleteNode}
                              selectHint={selectHint}
                              dragContext={dragContext}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {canDrag && draggingId !== null && maxBandLevel < 20 && (
                  <div className="flex w-full flex-col items-center">
                    <div className="mb-2 h-6 w-px bg-border" />
                    <div
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDropTarget((prev) =>
                          prev?.kind === 'band' && prev.level === nextBandLevel
                            ? prev
                            : { kind: 'band', level: nextBandLevel },
                        )
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                          setDropTarget((prev) =>
                            prev?.kind === 'band' && prev.level === nextBandLevel ? null : prev,
                          )
                        }
                      }}
                      onDrop={(e) => handleDropOnBand(e, nextBandLevel)}
                      className={cn(
                        'flex min-w-[260px] items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-4 text-xs font-medium transition-all',
                        dropTarget?.kind === 'band' && dropTarget.level === nextBandLevel
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border/70 bg-muted/20 text-muted-foreground',
                      )}
                    >
                      {t('organizationPage.orgChart.dropNewLevel', {
                        level: nextBandLevel,
                        defaultValue: `+ Soltar aqui para Nível ${nextBandLevel}`,
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

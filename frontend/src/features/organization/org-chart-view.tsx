import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn, ZoomOut, RotateCcw, Pencil, Trash2, Users, Shield, ArrowRight } from 'lucide-react'
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

function OrgNodeCard({
  node,
  selectedId,
  onSelectNode,
  onEditNode,
  onDeleteNode,
  selectHint,
}: {
  node: OrgChartNode
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  selectHint?: string
}) {
  const { t } = useTranslation()
  const isSelected = selectedId === node.id

  return (
    <div
      role={onSelectNode ? 'button' : undefined}
      tabIndex={onSelectNode ? 0 : undefined}
      onClick={() => onSelectNode?.(node)}
      onKeyDown={(e) => {
        if (onSelectNode && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelectNode(node)
        }
      }}
      className={cn(
        'group relative w-[228px] rounded-xl border bg-card p-3.5 text-left shadow-xs transition-all',
        onSelectNode && 'cursor-pointer hover:border-primary/60 hover:shadow-md',
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
        node.isInactive && 'opacity-65',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] font-semibold', getLevelBadgeClass(node.level))}
        >
          {t('organizationPage.orgChart.levelBadge', { level: node.level })}
        </Badge>

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
}: {
  entry: TreeEntry
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  selectHint?: string
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
  hintText,
  selectHint,
}: {
  nodes: OrgChartNode[]
  selectedId?: number | null
  onSelectNode?: (node: OrgChartNode) => void
  onEditNode?: (node: OrgChartNode) => void
  onDeleteNode?: (node: OrgChartNode) => void
  hintText?: string
  selectHint?: string
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState(1)

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

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="text-xs text-muted-foreground">
            {hintText ?? t('organizationPage.orgChart.defaultHint')}
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
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-2">
                {levelBands.map((band, bandIdx) => (
                  <div key={band.level} className="flex w-full flex-col items-center">
                    {bandIdx > 0 && <div className="mb-2 h-6 w-px bg-border" />}
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-muted/20 px-5 py-4">
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-semibold', getLevelBadgeClass(band.level))}
                      >
                        {t('organizationPage.orgChart.levelBadge', { level: band.level })}
                      </Badge>
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
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

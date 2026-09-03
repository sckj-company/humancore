import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared/page-header'
import { api } from '@/lib/api'
import { Briefcase, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Position {
  id: number
  title: string
  code?: string
  description?: string
  salary_min?: number
  salary_max?: number
  is_management: boolean
  department?: { id: number; name: string }
}

export function PositionsPage() {
  const { t, i18n } = useTranslation()
  const { data, isLoading, isError, refetch } = useQuery<Position[]>({
    queryKey: ['positions'],
    queryFn: () => api.get<Position[]>('positions'),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.positions')}
        actions={
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo Cargo
          </Button>
        }
      />

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Erro ao carregar cargos" onRetry={refetch} />}
      {data && data.length === 0 && <EmptyState title="Nenhum cargo cadastrado" />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((p) => (
          <Card key={p.id} className="transition-all hover:border-primary/40">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-info/10 text-info">
                    <Briefcase className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{p.title}</p>
                    {p.department && <p className="text-xs text-muted-foreground">{p.department.name}</p>}
                  </div>
                </div>
                {p.is_management && <Badge variant="secondary">Gestão</Badge>}
              </div>
              {(p.salary_min || p.salary_max) && (
                <div className="mt-4 text-sm">
                  <p className="text-xs text-muted-foreground">Faixa Salarial</p>
                  <p className="font-mono">
                    {p.salary_min ? new Intl.NumberFormat(i18n.language).format(p.salary_min) : '—'} -{' '}
                    {p.salary_max ? new Intl.NumberFormat(i18n.language).format(p.salary_max) : '—'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

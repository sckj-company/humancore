import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader, LoadingState, ErrorState, EmptyState } from '@/components/shared/page-header'

interface Department {
  id: number
  name: string
  code?: string
  status: string
  employee_count?: number
  children?: Department[]
}

export function DepartmentsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, refetch } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('departments'),
  })

  const filtered = (data ?? []).filter((d) =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.departments')}
        actions={
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Novo Departamento
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar departamento..."
          />
        </CardContent>
      </Card>

      {isLoading && <LoadingState />}
      {isError && <ErrorState message="Erro ao carregar departamentos" onRetry={refetch} />}

      {data && filtered.length === 0 && (
        <EmptyState title="Nenhum departamento encontrado" />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((d) => (
          <Card key={d.id} className="transition-all hover:border-primary/40">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.code}</p>
                  </div>
                </div>
                <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>
                  {d.status}
                </Badge>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                {d.employee_count ?? 0} funcionário{(d.employee_count ?? 0) !== 1 ? 's' : ''}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone, MapPin, Calendar, FileText, Briefcase } from 'lucide-react'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PageHeader, LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'
import type { Employee } from '@/types'

const statusColor: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  suspended: 'bg-warning/10 text-warning',
  terminated: 'bg-destructive/10 text-destructive',
}

export function EmployeeDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const locale = i18n.language

  const { data, isLoading, isError, refetch } = useQuery<Employee>({
    queryKey: ['employees', id],
    queryFn: () => api.get<Employee>(`employees/${id}`),
  })

  const { data: timeline } = useQuery({
    queryKey: ['employees', id, 'timeline'],
    queryFn: () => api.get<{ type: string; title: string; date: string; description: string }[]>(`employees/${id}/timeline`),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message="Funcionário não encontrado." onRetry={refetch} />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span>{t('employees.title')}</span>
      </div>

      <PageHeader
        title={data.full_name}
        description={`${data.employee_code} · ${data.position?.title ?? '—'} · ${data.department?.name ?? '—'}`}
        actions={
          <Badge className={statusColor[data.status] ?? 'bg-muted'} variant="secondary">
            {data.status}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-24 w-24">
                <AvatarImage src={data.photo_path ?? undefined} />
                <AvatarFallback className="text-2xl">
                  {data.first_name[0]}{data.last_name[0]}
                </AvatarFallback>
              </Avatar>
              <h2 className="mt-4 text-lg font-semibold">{data.full_name}</h2>
              <p className="text-sm text-muted-foreground">{data.position?.title}</p>
              <p className="text-xs text-muted-foreground">{data.department?.name}</p>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              {data.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{data.email}</span>
                </div>
              )}
              {data.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{data.phone}</span>
                </div>
              )}
              {data.city && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{data.city}</span>
                </div>
              )}
              {data.hired_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Admitido em {new Intl.DateTimeFormat(locale).format(new Date(data.hired_at))}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informação Pessoal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome" value={data.first_name} />
                <Field label="Apelido" value={data.last_name} />
                <Field label="BI/Documento" value={data.id_document_number} />
                <Field label="NIF" value={data.tax_id} />
                <Field label="Data de Nascimento" value={data.birth_date ? new Intl.DateTimeFormat(locale).format(new Date(data.birth_date)) : null} />
                <Field label="Género" value={data.gender} />
                <Field label="Estado Civil" value={data.marital_status} />
                <Field label="Nacionalidade" value={data.nationality} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> Contrato Ativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.active_contract ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Tipo" value={data.active_contract.contract_type} />
                  <Field label="Salário Base" value={new Intl.NumberFormat(locale, { style: 'currency', currency }).format(data.active_contract.base_salary)} />
                  <Field label="Frequência" value={data.active_contract.salary_frequency} />
                  <Field label="Início" value={new Intl.DateTimeFormat(locale).format(new Date(data.active_contract.start_date))} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem contrato ativo</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Histórico
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timeline && timeline.length > 0 ? (
                <div className="space-y-3">
                  {timeline.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3 border-l-2 border-primary/30 pl-3">
                      <div>
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                        <p className="text-xs text-muted-foreground">{entry.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem histórico disponível</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value || '—'}</p>
    </div>
  )
}

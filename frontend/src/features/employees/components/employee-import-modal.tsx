import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  Loader2,
  Building2,
  Users,
  Wallet,
  FileCheck2,
} from 'lucide-react'

interface ImportPreviewStats {
  total_records: number
  dry_run: boolean
  tenants_detected: Record<string, number>
  status_breakdown: {
    active: number
    terminated: number
    inactive: number
  }
  salaries: {
    total_base_payroll: number
    records_with_salary: number
  }
  documents: {
    total_attachment_links: number
    by_type: Record<string, number>
  }
  anomalies: {
    missing_bi: Array<{ code: string; name: string; company: string }>
    duplicate_bi: Record<string, { bi: string; count: number; codes: string[] }>
    missing_company: Array<{ code: string; name: string; client?: string }>
    missing_phone: Array<{ code: string; name: string }>
  }
  duration_seconds: number
}

interface ImportResultStats extends ImportPreviewStats {
  imported: {
    employees_created: number
    employees_updated: number
    contracts_created: number
    salary_components_created: number
    document_jobs_dispatched: number
    tenants_created_or_matched: number
  }
}

interface Props {
  onSuccess?: () => void
}

export function EmployeeImportModal({ onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'success'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreviewStats | null>(null)
  const [result, setResult] = useState<ImportResultStats | null>(null)
  const [uploadCloudinary, setUploadCloudinary] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setStep('upload')
    setErrorMessage(null)
    setLoading(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile)
    setErrorMessage(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const data = await api.upload<ImportPreviewStats>('imports/employees/preview', formData)
      setPreview(data)
      setStep('preview')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string }
      setErrorMessage(error.response?.data?.message || error.message || 'Erro ao analisar o ficheiro Excel.')
    } finally {
      setLoading(false)
    }
  }

  const handleProcessImport = async () => {
    if (!file) return

    setStep('importing')
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_cloudinary', uploadCloudinary ? '1' : '0')

      const data = await api.upload<ImportResultStats>('imports/employees/process', formData)
      setResult(data)
      setStep('success')
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string }
      setErrorMessage(error.response?.data?.message || error.message || 'Falha ao processar a importação.')
      setStep('preview')
    }
  }

  const handleDownloadTemplate = () => {
    window.open('/api/v1/imports/employees/template', '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) resetState()
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Importação de Funcionários via Excel
          </DialogTitle>
          <DialogDescription>
            Carregue a folha de cálculo para cadastro massivo de colaboradores, contratos e envio de documentos para o Cloudinary.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="flex-1">{errorMessage}</p>
          </div>
        )}

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div className="space-y-6 py-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 rounded-xl p-8 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileChange(f)
                }}
              />
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-600">
                  {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <UploadCloud className="h-8 w-8" />}
                </div>
                <div>
                  <p className="text-base font-medium">
                    {loading ? 'A analisar o ficheiro Excel...' : 'Clique ou arraste o ficheiro Excel (.xlsx) aqui'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Compatível com a base Jiandaoyun (107 colunas) ou com o modelo padronizado do HumaCore
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-card border">
              <div>
                <h4 className="text-sm font-medium">Precisa do modelo padrão?</h4>
                <p className="text-xs text-muted-foreground">Descarregue uma folha de exemplo já configurada com os campos em português.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Descarregar Modelo
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & CONFIRMATION */}
        {step === 'preview' && preview && (
          <div className="space-y-6 py-2">
            {/* Top KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Users className="h-8 w-8 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Trabalhadores</p>
                    <p className="text-xl font-bold">{preview.total_records}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-emerald-500/5 border-emerald-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Empresas / Tenants</p>
                    <p className="text-xl font-bold">{Object.keys(preview.tenants_detected).length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <Wallet className="h-8 w-8 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Massa Salarial Base</p>
                    <p className="text-lg font-bold">
                      {(preview.salaries.total_base_payroll / 1_000_000).toFixed(1)}M Kz
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <FileCheck2 className="h-8 w-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Documentos Anexos</p>
                    <p className="text-xl font-bold">{preview.documents.total_attachment_links}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Companies Detected Pills */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Principais Empresas Identificadas</h4>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 border rounded-md bg-muted/10">
                {Object.entries(preview.tenants_detected)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 15)
                  .map(([name, count]) => (
                    <Badge key={name} variant="secondary" className="text-xs font-normal">
                      {name}: <span className="font-semibold ml-1">{count}</span>
                    </Badge>
                  ))}
              </div>
            </div>

            {/* Anomaly / Quality Summary */}
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Diagnóstico de Qualidade dos Dados:
              </div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>{preview.anomalies.missing_bi.length}</strong> colaboradores sem Nº de BI (será gerado identificador provisório).</li>
                <li><strong>{Object.keys(preview.anomalies.duplicate_bi).length}</strong> números de BI presentes em múltiplos registos/empresas.</li>
                <li><strong>{preview.anomalies.missing_company.length}</strong> registos sem empresa atribuída (serão vinculados à Empresa Pendente para triagem posterior).</li>
              </ul>
            </div>

            {/* Cloudinary Upload Option */}
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="cloudinary-opt"
                checked={uploadCloudinary}
                onCheckedChange={(checked) => setUploadCloudinary(Boolean(checked))}
              />
              <label
                htmlFor="cloudinary-opt"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Descarregar e enviar os {preview.documents.total_attachment_links} documentos para o Cloudinary (Recomendado)
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="ghost" onClick={resetState}>
                Escolher outro ficheiro
              </Button>
              <Button onClick={handleProcessImport} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Confirmar e Importar {preview.total_records} Registos
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: IMPORTING */}
        {step === 'importing' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">A processar a importação...</h3>
              <p className="text-sm text-muted-foreground">
                A registar colaboradores, contratos de trabalho e a enfileirar os uploads para o Cloudinary.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && result && (
          <div className="space-y-6 py-4 text-center">
            <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-600 inline-block mx-auto">
              <CheckCircle2 className="h-12 w-12" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold">Importação Concluída com Sucesso!</h3>
              <p className="text-sm text-muted-foreground">
                Todos os dados foram consolidados e persistidos na base de dados com integridade referencial.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Novos Colaboradores</p>
                <p className="text-lg font-bold text-emerald-600">+{result.imported.employees_created}</p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Contratos Criados</p>
                <p className="text-lg font-bold">{result.imported.contracts_created}</p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Empresas Processadas</p>
                <p className="text-lg font-bold">{result.imported.tenants_created_or_matched}</p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Componentes Salariais</p>
                <p className="text-lg font-bold">{result.imported.salary_components_created}</p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Uploads Cloudinary</p>
                <p className="text-lg font-bold text-blue-600">{result.imported.document_jobs_dispatched}</p>
              </div>
              <div className="p-3 border rounded-lg bg-card">
                <p className="text-xs text-muted-foreground">Tempo de Execução</p>
                <p className="text-lg font-bold">{result.duration_seconds}s</p>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-4 border-t">
              <Button onClick={() => setOpen(false)} className="px-8">
                Fechar e Ver Funcionários
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

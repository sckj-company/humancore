import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  User,
  Briefcase,
  FileText,
  Upload,
  X,
  FileCheck,
  CheckCircle2,
  Building2,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Plus,
  Eye,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader, ErrorState } from '@/components/shared/page-header'
import { api, getApiErrorMessage } from '@/lib/api'
import { useAuthStore, hasPermission } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import type { Paginated } from '@/types'

interface UploadedDoc {
  id: string
  file: File
  name: string
  document_type: string
  previewUrl?: string
}

export function EmployeeCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const canCreate = hasPermission(user, 'create_employee')

  const [activeTab, setActiveTab] = useState<'dados-basicos' | 'contrato'>('dados-basicos')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Preview Dialog state for uploaded files
  const [previewDoc, setPreviewDoc] = useState<UploadedDoc | null>(null)

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Tab 1: Dados Básicos Form State
  const [basicData, setBasicData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    alternative_phone: '',
    birth_date: '',
    gender: 'male' as 'male' | 'female' | 'other',
    marital_status: 'single' as 'single' | 'married' | 'divorced' | 'widowed',
    nationality: 'Angolana',
    id_document_type: 'BI',
    id_document_number: '',
    id_document_expiry: '',
    tax_id: '',
    social_security_id: '',
    address: '',
    city: '',
    state: '',
    country: 'Angola',
    postal_code: '',
    department_id: '',
    position_id: '',
    manager_id: '',
    hired_at: new Date().toISOString().split('T')[0],
    probation_end: '',
    status: 'active' as 'active' | 'inactive' | 'suspended' | 'terminated',
  })

  // Tab 2: Contrato Form State
  const [contractData, setContractData] = useState({
    contract_type: 'permanent',
    base_salary: '',
    salary_frequency: 'monthly',
    work_hours_per_week: '40',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    contract_signed_at: new Date().toISOString().split('T')[0],
    contract_notes: '',
  })

  // Tab 2: Documentos do Funcionário (PDFs ou Imagens)
  const [documents, setDocuments] = useState<UploadedDoc[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch Departments, Positions, and Managers
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<{ id: number; name: string }[]>('departments'),
    enabled: canCreate,
  })

  const { data: positions } = useQuery({
    queryKey: ['positions'],
    queryFn: () => api.get<{ id: number; title: string; department_id?: number }[]>('positions'),
    enabled: canCreate,
  })

  const { data: employeesData } = useQuery({
    queryKey: ['employees-for-manager'],
    queryFn: () => api.get<Paginated<{ id: number; full_name: string; email?: string }>>('employees', { per_page: 200 }),
    enabled: canCreate,
  })
  const managers = employeesData?.data ?? []

  if (!canCreate) {
    return <ErrorState message="Não tem permissão para criar funcionários." />
  }

  // Handle Photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor selecione uma imagem válida (JPG, PNG, WebP).')
        return
      }
      setPhotoFile(file)
      const url = URL.createObjectURL(file)
      setPhotoPreview(url)
    }
  }

  const handleRemovePhoto = () => {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  // Handle Document uploads (PDFs / Images)
  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newDocs: UploadedDoc[] = []
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      const isDoc = file.name.endsWith('.doc') || file.name.endsWith('.docx')

      if (!isImg && !isPdf && !isDoc) {
        toast.error(`O ficheiro ${file.name} não é suportado. Use PDF, imagens ou documentos.`)
        return
      }

      let defaultType = 'other'
      const lower = file.name.toLowerCase()
      if (lower.includes('contrat') || lower.includes('contract')) defaultType = 'contract'
      else if (lower.includes('bi') || lower.includes('passaport') || lower.includes('identidad')) defaultType = 'id_card'
      else if (lower.includes('cv') || lower.includes('curriculo')) defaultType = 'cv'
      else if (lower.includes('diploma') || lower.includes('certificad')) defaultType = 'certificate'
      else if (lower.includes('iban') || lower.includes('nib') || lower.includes('banc')) defaultType = 'bank_proof'

      newDocs.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        document_type: defaultType,
        previewUrl: isImg || isPdf ? URL.createObjectURL(file) : undefined,
      })
    })

    if (newDocs.length > 0) {
      setDocuments((prev) => [...prev, ...newDocs])
      toast.success(`${newDocs.length} documento(s) adicionado(s).`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveDocument = (id: string) => {
    setDocuments((prev) => {
      const doc = prev.find((d) => d.id === id)
      if (doc?.previewUrl) URL.revokeObjectURL(doc.previewUrl)
      return prev.filter((d) => d.id !== id)
    })
    if (previewDoc?.id === id) setPreviewDoc(null)
  }

  const handleUpdateDocumentMeta = (id: string, field: 'name' | 'document_type', val: string) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: val } : d)),
    )
  }

  // Filter positions by selected department
  const filteredPositions = positions?.filter(
    (p) => !basicData.department_id || String(p.department_id) === String(basicData.department_id),
  )

  // Single Save Handler
  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault()

    const errors: Record<string, string> = {}

    // Validation - Tab 1
    if (!basicData.first_name.trim()) errors.first_name = 'O nome próprio é obrigatório.'
    if (!basicData.last_name.trim()) errors.last_name = 'O apelido é obrigatório.'
    if (!basicData.email.trim()) {
      errors.email = 'O email é obrigatório.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(basicData.email)) {
      errors.email = 'Insira um email válido.'
    }

    // Validation - Tab 2 (Dates)
    if (
      contractData.contract_start_date &&
      contractData.contract_end_date &&
      contractData.contract_end_date < contractData.contract_start_date
    ) {
      errors.contract_end_date = 'A data de término deve ser posterior ou igual à data de início.'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      // Switch to the tab with errors
      if (errors.first_name || errors.last_name || errors.email) {
        setActiveTab('dados-basicos')
        toast.error('Preencha os campos obrigatórios na aba Dados Básicos.')
      } else if (errors.contract_end_date) {
        setActiveTab('contrato')
        toast.error(errors.contract_end_date)
      }
      return
    }

    setFormErrors({})
    setIsSubmitting(true)

    try {
      const formData = new FormData()

      // Basic Data
      Object.entries(basicData).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          formData.append(key, String(value))
        }
      })

      // Photo
      if (photoFile) {
        formData.append('photo', photoFile)
      }

      // Contract Data
      if (contractData.contract_type) formData.append('contract_type', contractData.contract_type)
      if (contractData.base_salary) formData.append('base_salary', contractData.base_salary)
      if (contractData.salary_frequency) formData.append('salary_frequency', contractData.salary_frequency)
      if (contractData.work_hours_per_week) formData.append('work_hours_per_week', contractData.work_hours_per_week)
      if (contractData.contract_start_date) formData.append('contract_start_date', contractData.contract_start_date)
      if (contractData.contract_end_date) formData.append('contract_end_date', contractData.contract_end_date)
      if (contractData.contract_signed_at) formData.append('contract_signed_at', contractData.contract_signed_at)
      if (contractData.contract_notes) formData.append('contract_notes', contractData.contract_notes)

      // Documents List (PDFs or Images)
      documents.forEach((doc) => {
        formData.append('documents[]', doc.file)
        formData.append('document_names[]', doc.name || doc.file.name)
        formData.append('document_types[]', doc.document_type || 'other')
      })

      await api.upload('employees', formData)

      toast.success('Funcionário, contrato e documentos registados com sucesso!')
      navigate('/employees')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao criar registo de funcionário.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span>{t('employees.title', { defaultValue: 'Funcionários' })}</span>
        <span>/</span>
        <span className="text-foreground font-medium">Novo Cadastro</span>
      </div>

      <PageHeader
        title={t('employees.add', { defaultValue: 'Registar Funcionário' })}
        description="Formulário completo de admissão: dados pessoais, organizacionais, contrato e documentos anexos."
      />

      {/* Main Two-Tab Form */}
      <form onSubmit={handleSaveAll} className="space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'dados-basicos' | 'contrato')}>
          <TabsList className="grid w-full grid-cols-2 max-w-md h-11 p-1 bg-muted">
            <TabsTrigger value="dados-basicos" className="gap-2 text-sm font-medium">
              <User className="h-4 w-4" />
              1. Dados Básicos
              {Object.keys(formErrors).some((k) => ['first_name', 'last_name', 'email'].includes(k)) && (
                <span className="h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="contrato" className="gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              2. Contrato & Documentos
              {documents.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {documents.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: DADOS BÁSICOS ================= */}
          <TabsContent value="dados-basicos" className="space-y-6 mt-4">
            {/* Card 1: Foto e Identificação */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Identificação Pessoal
                </CardTitle>
                <CardDescription>
                  Dados de identificação civil, nascimento e fotografia de perfil.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Photo Upload Row */}
                <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-lg bg-muted/40 border border-border/60">
                  <Avatar className="h-20 w-20 ring-2 ring-primary/20">
                    <AvatarImage src={photoPreview ?? undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                      {basicData.first_name ? basicData.first_name[0].toUpperCase() : <User className="h-8 w-8" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1.5 text-center sm:text-left flex-1">
                    <div className="text-sm font-medium">Fotografia do Funcionário</div>
                    <p className="text-xs text-muted-foreground">
                      Formatos suportados: JPG, PNG ou WebP. Máximo de 2MB.
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                      <input
                        type="file"
                        ref={photoInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {photoFile ? 'Alterar Foto' : 'Carregar Foto'}
                      </Button>
                      {photoFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemovePhoto}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">Nome Próprio *</Label>
                    <Input
                      id="first_name"
                      value={basicData.first_name}
                      onChange={(e) => {
                        setBasicData((p) => ({ ...p, first_name: e.target.value }))
                        if (formErrors.first_name) setFormErrors((p) => ({ ...p, first_name: '' }))
                      }}
                      placeholder="Ex: João"
                    />
                    {formErrors.first_name && (
                      <p className="text-xs text-destructive">{formErrors.first_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Apelido (Sobrenome) *</Label>
                    <Input
                      id="last_name"
                      value={basicData.last_name}
                      onChange={(e) => {
                        setBasicData((p) => ({ ...p, last_name: e.target.value }))
                        if (formErrors.last_name) setFormErrors((p) => ({ ...p, last_name: '' }))
                      }}
                      placeholder="Ex: Silva"
                    />
                    {formErrors.last_name && (
                      <p className="text-xs text-destructive">{formErrors.last_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gender">Género</Label>
                    <Select
                      value={basicData.gender}
                      onValueChange={(val: 'male' | 'female' | 'other') =>
                        setBasicData((p) => ({ ...p, gender: val }))
                      }
                    >
                      <SelectTrigger id="gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Masculino</SelectItem>
                        <SelectItem value="female">Feminino</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birth_date">Data de Nascimento</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={basicData.birth_date}
                      onChange={(e) => setBasicData((p) => ({ ...p, birth_date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marital_status">Estado Civil</Label>
                    <Select
                      value={basicData.marital_status}
                      onValueChange={(val: 'single' | 'married' | 'divorced' | 'widowed') =>
                        setBasicData((p) => ({ ...p, marital_status: val }))
                      }
                    >
                      <SelectTrigger id="marital_status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Solteiro(a)</SelectItem>
                        <SelectItem value="married">Casado(a)</SelectItem>
                        <SelectItem value="divorced">Divorciado(a)</SelectItem>
                        <SelectItem value="widowed">Viúvo(a)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nationality">Nacionalidade</Label>
                    <Input
                      id="nationality"
                      value={basicData.nationality}
                      onChange={(e) => setBasicData((p) => ({ ...p, nationality: e.target.value }))}
                      placeholder="Ex: Angolana"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_type">Tipo de Documento</Label>
                    <Select
                      value={basicData.id_document_type}
                      onValueChange={(val) => setBasicData((p) => ({ ...p, id_document_type: val }))}
                    >
                      <SelectTrigger id="id_document_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BI">Bilhete de Identidade (BI)</SelectItem>
                        <SelectItem value="Passaporte">Passaporte</SelectItem>
                        <SelectItem value="Cartão de Residente">Cartão de Residente</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_number">Número do Documento</Label>
                    <Input
                      id="id_document_number"
                      value={basicData.id_document_number}
                      onChange={(e) =>
                        setBasicData((p) => ({ ...p, id_document_number: e.target.value }))
                      }
                      placeholder="Ex: 004928123LA042"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_expiry">Validade do Documento</Label>
                    <Input
                      id="id_document_expiry"
                      type="date"
                      value={basicData.id_document_expiry}
                      onChange={(e) =>
                        setBasicData((p) => ({ ...p, id_document_expiry: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tax_id">NIF (Número de Identificação Fiscal)</Label>
                    <Input
                      id="tax_id"
                      value={basicData.tax_id}
                      onChange={(e) => setBasicData((p) => ({ ...p, tax_id: e.target.value }))}
                      placeholder="Ex: 5418291024"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="social_security_id">Nº da Segurança Social (INSS)</Label>
                    <Input
                      id="social_security_id"
                      value={basicData.social_security_id}
                      onChange={(e) =>
                        setBasicData((p) => ({ ...p, social_security_id: e.target.value }))
                      }
                      placeholder="Ex: 92837192"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Contacto e Residência */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Contacto & Residência
                </CardTitle>
                <CardDescription>
                  Meios de comunicação e localização geográfica do colaborador.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Profissional / Principal *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={basicData.email}
                      onChange={(e) => {
                        setBasicData((p) => ({ ...p, email: e.target.value }))
                        if (formErrors.email) setFormErrors((p) => ({ ...p, email: '' }))
                      }}
                      className="pl-9"
                      placeholder="funcionario@empresa.co.ao"
                    />
                  </div>
                  {formErrors.email && (
                    <p className="text-xs text-destructive">{formErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone Principal</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={basicData.phone}
                      onChange={(e) => setBasicData((p) => ({ ...p, phone: e.target.value }))}
                      className="pl-9"
                      placeholder="+244 9..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alternative_phone">Telefone Alternativo / Emergência</Label>
                  <Input
                    id="alternative_phone"
                    value={basicData.alternative_phone}
                    onChange={(e) =>
                      setBasicData((p) => ({ ...p, alternative_phone: e.target.value }))
                    }
                    placeholder="+244 9..."
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">Endereço Residencial</Label>
                  <Input
                    id="address"
                    value={basicData.address}
                    onChange={(e) => setBasicData((p) => ({ ...p, address: e.target.value }))}
                    placeholder="Rua, Número, Edifício, Bairro..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={basicData.city}
                    onChange={(e) => setBasicData((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Ex: Luanda"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Província / Estado</Label>
                  <Input
                    id="state"
                    value={basicData.state}
                    onChange={(e) => setBasicData((p) => ({ ...p, state: e.target.value }))}
                    placeholder="Ex: Luanda, Benguela..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    value={basicData.country}
                    onChange={(e) => setBasicData((p) => ({ ...p, country: e.target.value }))}
                    placeholder="Ex: Angola"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postal_code">Código Postal</Label>
                  <Input
                    id="postal_code"
                    value={basicData.postal_code}
                    onChange={(e) => setBasicData((p) => ({ ...p, postal_code: e.target.value }))}
                    placeholder="Ex: 1000"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Enquadramento Organizacional */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Enquadramento Organizacional
                </CardTitle>
                <CardDescription>
                  Alocação de departamento, cargo, superior hierárquico e estado na empresa.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="department_id">Departamento</Label>
                  <Select
                    value={basicData.department_id || 'none'}
                    onValueChange={(val) =>
                      setBasicData((p) => ({
                        ...p,
                        department_id: val === 'none' ? '' : val,
                        position_id: '',
                      }))
                    }
                  >
                    <SelectTrigger id="department_id">
                      <SelectValue placeholder="Selecionar departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {departments?.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position_id">Cargo</Label>
                  <Select
                    value={basicData.position_id || 'none'}
                    onValueChange={(val) =>
                      setBasicData((p) => ({ ...p, position_id: val === 'none' ? '' : val }))
                    }
                  >
                    <SelectTrigger id="position_id">
                      <SelectValue placeholder="Selecionar cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {filteredPositions?.map((pos) => (
                        <SelectItem key={pos.id} value={String(pos.id)}>
                          {pos.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manager_id">Superior Hierárquico / Gestor</Label>
                  <Select
                    value={basicData.manager_id || 'none'}
                    onValueChange={(val) =>
                      setBasicData((p) => ({ ...p, manager_id: val === 'none' ? '' : val }))
                    }
                  >
                    <SelectTrigger id="manager_id">
                      <SelectValue placeholder="Selecionar gestor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hired_at">Data de Admissão</Label>
                  <Input
                    id="hired_at"
                    type="date"
                    value={basicData.hired_at}
                    onChange={(e) => {
                      const val = e.target.value
                      setBasicData((p) => ({ ...p, hired_at: val }))
                      setContractData((c) => ({
                        ...c,
                        contract_start_date: c.contract_start_date || val,
                      }))
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="probation_end">Fim do Período Probatório</Label>
                  <Input
                    id="probation_end"
                    type="date"
                    value={basicData.probation_end}
                    onChange={(e) => setBasicData((p) => ({ ...p, probation_end: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Estado Inicial *</Label>
                  <Select
                    value={basicData.status}
                    onValueChange={(val: 'active' | 'inactive' | 'suspended' | 'terminated') =>
                      setBasicData((p) => ({ ...p, status: val }))
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="suspended">Suspenso</SelectItem>
                      <SelectItem value="terminated">Desligado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 2: CONTRATO & DOCUMENTOS ================= */}
          <TabsContent value="contrato" className="space-y-6 mt-4">
            {/* Card 1: Termos e Condições do Contrato */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Informações Contratuais
                </CardTitle>
                <CardDescription>
                  Configuração do contrato de trabalho, vencimento base e periodicidade.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">Tipo de Contrato</Label>
                    <Select
                      value={contractData.contract_type}
                      onValueChange={(val) => setContractData((c) => ({ ...c, contract_type: val }))}
                    >
                      <SelectTrigger id="contract_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanent">Tempo Indeterminado (Efetivo / Sem Termo)</SelectItem>
                        <SelectItem value="fixed_term">Termo Certo</SelectItem>
                        <SelectItem value="temporary">Temporário</SelectItem>
                        <SelectItem value="probation">Período de Experiência</SelectItem>
                        <SelectItem value="internship">Estágio Profissional</SelectItem>
                        <SelectItem value="outsourced">Prestação de Serviços / Outsourced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="base_salary">Salário Base ({currency})</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-success" />
                      <Input
                        id="base_salary"
                        type="number"
                        min="0"
                        step="any"
                        value={contractData.base_salary}
                        onChange={(e) =>
                          setContractData((c) => ({ ...c, base_salary: e.target.value }))
                        }
                        className="pl-9 font-mono"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="salary_frequency">Periodicidade de Pagamento</Label>
                    <Select
                      value={contractData.salary_frequency}
                      onValueChange={(val) =>
                        setContractData((c) => ({ ...c, salary_frequency: val }))
                      }
                    >
                      <SelectTrigger id="salary_frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="biweekly">Quinzenal</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="hourly">À Hora</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="work_hours">Carga Horária Semanal (Horas)</Label>
                    <Input
                      id="work_hours"
                      type="number"
                      min="1"
                      max="168"
                      value={contractData.work_hours_per_week}
                      onChange={(e) =>
                        setContractData((c) => ({ ...c, work_hours_per_week: e.target.value }))
                      }
                      placeholder="40"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contract_start_date">Data de Início do Contrato</Label>
                    <Input
                      id="contract_start_date"
                      type="date"
                      value={contractData.contract_start_date}
                      onChange={(e) =>
                        setContractData((c) => ({ ...c, contract_start_date: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contract_end_date">Data de Término (se aplicável)</Label>
                    <Input
                      id="contract_end_date"
                      type="date"
                      value={contractData.contract_end_date}
                      onChange={(e) => {
                        setContractData((c) => ({ ...c, contract_end_date: e.target.value }))
                        if (formErrors.contract_end_date) {
                          setFormErrors((p) => ({ ...p, contract_end_date: '' }))
                        }
                      }}
                    />
                    {formErrors.contract_end_date && (
                      <p className="text-xs text-destructive">{formErrors.contract_end_date}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contract_signed_at">Data de Assinatura</Label>
                    <Input
                      id="contract_signed_at"
                      type="date"
                      value={contractData.contract_signed_at}
                      onChange={(e) =>
                        setContractData((c) => ({ ...c, contract_signed_at: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="contract_notes">Observações e Cláusulas Especiais</Label>
                  <Textarea
                    id="contract_notes"
                    value={contractData.contract_notes}
                    onChange={(e) =>
                      setContractData((c) => ({ ...c, contract_notes: e.target.value }))
                    }
                    rows={2}
                    placeholder="Detalhes adicionais, subsídios acordados, cláusulas de confidencialidade..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Upload de Documentos (PDFs ou Imagens) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-primary" />
                      Documentos Anexados (Imagens ou PDFs)
                    </CardTitle>
                    <CardDescription>
                      Anexe o contrato assinado, cópia do BI, CV, certificados ou comprovativos. Ficheiros são armazenados com URL direta.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {documents.length} ficheiro{documents.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Drag & Drop Upload Zone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Clique aqui para carregar ou arraste os ficheiros
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suporta ficheiros PDF, JPG, PNG, WebP e DOCX (até 10MB cada)
                  </p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".pdf,image/jpeg,image/png,image/webp,.doc,.docx"
                    onChange={(e) => handleFilesAdded(e.target.files)}
                    className="hidden"
                  />
                  <Button type="button" variant="secondary" size="sm" className="mt-3">
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Escolher Ficheiros
                  </Button>
                </div>

                {/* Uploaded Documents List */}
                {documents.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Ficheiros a anexar ({documents.length}) — clique em pré-visualizar ou eliminar para substituir
                    </h4>

                    <div className="space-y-2.5">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-border bg-card shadow-xs transition-all hover:border-border/80"
                        >
                          {/* File Icon / Preview & Title */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {doc.previewUrl && doc.file.type.startsWith('image/') ? (
                              <img
                                src={doc.previewUrl}
                                alt={doc.name}
                                className="h-10 w-10 shrink-0 rounded object-cover border border-border cursor-pointer hover:opacity-80"
                                onClick={() => setPreviewDoc(doc)}
                                title="Clique para ampliar"
                              />
                            ) : (
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                                onClick={() => setPreviewDoc(doc)}
                                title="Clique para pré-visualizar"
                              >
                                {doc.file.type === 'application/pdf' ? (
                                  <FileText className="h-5 w-5 text-red-500" />
                                ) : (
                                  <FileCheck className="h-5 w-5 text-primary" />
                                )}
                              </div>
                            )}

                            <div className="space-y-1 min-w-0 flex-1">
                              <Input
                                value={doc.name}
                                onChange={(e) =>
                                  handleUpdateDocumentMeta(doc.id, 'name', e.target.value)
                                }
                                placeholder="Nome do documento"
                                className="h-8 text-xs font-medium"
                              />
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                                <span>{doc.file.name}</span>
                                <span>•</span>
                                <span className="font-mono">{formatFileSize(doc.file.size)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Document Type Select, Preview & Delete Buttons */}
                          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                            <Select
                              value={doc.document_type}
                              onValueChange={(val) =>
                                handleUpdateDocumentMeta(doc.id, 'document_type', val)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs w-[160px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="contract">Contrato de Trabalho</SelectItem>
                                <SelectItem value="id_card">Documento de Identificação</SelectItem>
                                <SelectItem value="cv">Currículo (CV)</SelectItem>
                                <SelectItem value="certificate">Certificado / Diploma</SelectItem>
                                <SelectItem value="bank_proof">Comprovativo Bancário</SelectItem>
                                <SelectItem value="medical">Atestado Médico</SelectItem>
                                <SelectItem value="other">Outro Documento</SelectItem>
                              </SelectContent>
                            </Select>

                            {/* Preview Button */}
                            {doc.previewUrl && (
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                onClick={() => setPreviewDoc(doc)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title="Pré-visualizar documento"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Delete Button to allow replacing with another file */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRemoveDocument(doc.id)}
                              className="text-muted-foreground hover:text-destructive h-8 w-8"
                              title="Eliminar este ficheiro para substituir por outro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Global Footer Actions with SINGLE Save Button (Non-sticky to avoid jumping) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-sm mt-8">
          <div className="text-xs text-muted-foreground">
            {activeTab === 'dados-basicos' ? (
              <span>Passo 1 de 2: Dados Básicos</span>
            ) : (
              <span>Passo 2 de 2: Contrato e Documentos ({documents.length} anexo{documents.length !== 1 ? 's' : ''})</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button type="button" variant="outline" asChild disabled={isSubmitting}>
              <Link to="/employees">{t('common.cancel', { defaultValue: 'Cancelar' })}</Link>
            </Button>

            {activeTab === 'dados-basicos' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActiveTab('contrato')}
              >
                Avançar para Contrato →
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActiveTab('dados-basicos')}
              >
                ← Voltar a Dados Básicos
              </Button>
            )}

            {/* O ÚNICO BOTÃO DE SAVE */}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[160px] shadow-sm bg-primary text-primary-foreground font-medium"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  A guardar tudo...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Guardar Funcionário
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Document Preview Modal */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="truncate">
                {previewDoc?.name || previewDoc?.file.name}
              </DialogTitle>
            </div>
            <DialogDescription>
              {previewDoc?.file.name} • {previewDoc && formatFileSize(previewDoc.file.size)}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {previewDoc?.file.type.startsWith('image/') && previewDoc.previewUrl && (
              <div className="flex items-center justify-center rounded-lg bg-black/5 dark:bg-black/40 p-2 overflow-hidden max-h-[65vh]">
                <img
                  src={previewDoc.previewUrl}
                  alt={previewDoc.name}
                  className="max-h-[60vh] max-w-full rounded object-contain"
                />
              </div>
            )}

            {previewDoc?.file.type === 'application/pdf' && previewDoc.previewUrl && (
              <div className="rounded-lg overflow-hidden border border-border h-[65vh] w-full bg-muted/20">
                <iframe
                  src={previewDoc.previewUrl}
                  title={previewDoc.name}
                  className="w-full h-full border-0"
                />
              </div>
            )}

            {!previewDoc?.file.type.startsWith('image/') && previewDoc?.file.type !== 'application/pdf' && (
              <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg">
                <FileCheck className="h-16 w-16 text-primary mb-3" />
                <p className="text-sm font-medium">{previewDoc?.file.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Documento pronto para envio ({previewDoc && formatFileSize(previewDoc.file.size)})
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (previewDoc) handleRemoveDocument(previewDoc.id)
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar para substituir
            </Button>

            <div className="flex items-center gap-2">
              {previewDoc?.previewUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={previewDoc.previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Abrir em nova aba
                  </a>
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreviewDoc(null)}
              >
                Fechar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

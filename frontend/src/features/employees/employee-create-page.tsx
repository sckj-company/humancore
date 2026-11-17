import { useState, useRef, useEffect, useMemo } from 'react'
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
  FileSearch,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  ANGOLA_DOCUMENT_LABELS,
  ANGOLA_DOCUMENT_PRESETS,
  ANGOLA_DOCUMENT_TYPE_KEYS,
} from '@/lib/document-presets'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DocumentRequirement, Paginated, SettingGroups } from '@/types'

interface DocumentRow {
  id: string
  file: File | null
  name: string
  document_type: string
  previewUrl?: string
  isRequired: boolean
  isConfigured: boolean
}

interface IdentityOcrFields {
  first_name?: string
  last_name?: string
  birth_date?: string
  gender?: 'male' | 'female'
  nationality?: string
  id_document_number?: string
  id_document_expiry?: string
}

export function EmployeeCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const canCreate = hasPermission(user, 'create_employee')
  const canUpdateDocumentSettings = hasPermission(user, 'update_setting') || hasPermission(user, 'configure_setting')

  const [activeTab, setActiveTab] = useState<'dados-basicos' | 'contrato'>('dados-basicos')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // Preview Dialog state for uploaded files
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null)

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [identityImage, setIdentityImage] = useState<File | null>(null)
  const [identityOcrConsent, setIdentityOcrConsent] = useState(false)
  const [isReadingIdentity, setIsReadingIdentity] = useState(false)
  const identityInputRef = useRef<HTMLInputElement>(null)

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

  // Tab 2: Documentos do Funcionário (linhas unificadas: input à esquerda + tipo à direita)
  const [documentRows, setDocumentRows] = useState<DocumentRow[]>([])
  const [customDocumentTypes, setCustomDocumentTypes] = useState<DocumentRequirement[]>([])
  const [newDocumentTypeName, setNewDocumentTypeName] = useState('')
  const [newDocumentRequired, setNewDocumentRequired] = useState(false)
  const [hasInitializedConfiguredDocs, setHasInitializedConfiguredDocs] = useState(false)
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

  const {
    data: documentSettings,
    isLoading: isLoadingDocumentSettings,
    isError: hasDocumentSettingsError,
    refetch: refetchDocumentSettings,
  } = useQuery({
    queryKey: ['settings', 'documents'],
    queryFn: () => api.get<SettingGroups>('settings', { group: 'documents' }),
    enabled: canCreate,
  })
  const getDocumentTypeLabel = (type: string, fallback?: string) =>
    ANGOLA_DOCUMENT_TYPE_KEYS.has(type) || type === 'other'
      ? t(`settingsPage.documentTypes.${type}`, {
          defaultValue: fallback || ANGOLA_DOCUMENT_LABELS[type] || type,
        })
      : (fallback || type)

  const configuredDocuments = useMemo(
    () =>
      normalizeDocumentRequirements(
        documentSettings?.documents?.find((setting) => setting.key === 'required')?.value,
      ).map((document) => ({
        ...document,
        label: getDocumentTypeLabel(document.type, document.label),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documentSettings, t],
  )

  useEffect(() => {
    if (hasInitializedConfiguredDocs || !documentSettings) return
    setHasInitializedConfiguredDocs(true)
    if (configuredDocuments.length === 0) return

    setDocumentRows((current) => {
      const existingTypes = new Set(current.map((row) => row.document_type).filter(Boolean))
      const initialRows: DocumentRow[] = configuredDocuments
        .filter((doc) => !existingTypes.has(doc.type))
        .map((doc) => ({
          id: `cfg-${doc.type}`,
          file: null,
          name: doc.label,
          document_type: doc.type,
          isRequired: doc.required !== false,
          isConfigured: true,
        }))
      return [...initialRows, ...current]
    })
  }, [documentSettings, configuredDocuments, hasInitializedConfiguredDocs])

  const documentTypeOptions = [...new Map(
    [
      ...ANGOLA_DOCUMENT_PRESETS.map((document) => ({
        type: document.type,
        label: getDocumentTypeLabel(document.type, document.label),
      })),
      ...configuredDocuments,
      ...customDocumentTypes,
      { type: 'other', label: getDocumentTypeLabel('other', 'Outro Documento') },
    ].map((document) => [document.type, document]),
  ).values()]

  const uploadedDocuments = documentRows.filter((row): row is DocumentRow & { file: File } => row.file !== null)
  const documents = uploadedDocuments

  const missingRequiredDocuments = documentRows
    .filter((row) => row.isRequired && row.file === null)
    .map((row) => ({
      type: row.document_type,
      label: row.name || getDocumentTypeLabel(row.document_type, row.document_type),
      required: true,
    }))
  const totalRequiredCount = documentRows.filter((row) => row.isRequired).length
  const requiredDoneCount = Math.max(0, totalRequiredCount - missingRequiredDocuments.length)
  const isCreateDisabled = isSubmitting
    || isLoadingDocumentSettings
    || hasDocumentSettingsError
    || missingRequiredDocuments.length > 0

  if (!canCreate) {
    return <ErrorState message={t('employeeCreate.noPermission')} />
  }

  // Handle Photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error(t('employeeCreate.errors.invalidPhoto'))
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

  const handleReadIdentity = async () => {
    if (!identityImage || !identityOcrConsent) return

    setIsReadingIdentity(true)
    try {
      const formData = new FormData()
      formData.append('image', identityImage)

      const fields = await api.upload<IdentityOcrFields>('employees/ocr-id', formData)
      setBasicData((current) => ({
        ...current,
        ...(fields.first_name ? { first_name: fields.first_name } : {}),
        ...(fields.last_name ? { last_name: fields.last_name } : {}),
        ...(fields.birth_date ? { birth_date: fields.birth_date } : {}),
        ...(fields.gender ? { gender: fields.gender } : {}),
        ...(fields.nationality ? { nationality: fields.nationality } : {}),
        ...(fields.id_document_number ? { id_document_number: fields.id_document_number } : {}),
        ...(fields.id_document_expiry ? { id_document_expiry: fields.id_document_expiry } : {}),
      }))
      toast.success(t('employeeCreate.ocr.success'))
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('employeeCreate.ocr.error')))
    } finally {
      setIsReadingIdentity(false)
    }
  }

  const handleAddEmptyDocumentRow = () => {
    setDocumentRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file: null,
        name: '',
        document_type: '',
        isRequired: false,
        isConfigured: false,
      },
    ])
  }

  const syncDocumentSettings = (nextRows: DocumentRow[]) => {
    if (!canUpdateDocumentSettings) return

    const syncedMap = new Map<string, DocumentRequirement>()
    configuredDocuments.forEach((doc) => {
      syncedMap.set(doc.type, { ...doc })
    })
    nextRows.forEach((row) => {
      if (!row.document_type) return
      if (row.isConfigured || syncedMap.has(row.document_type) || row.document_type.startsWith('custom_')) {
        syncedMap.set(row.document_type, {
          type: row.document_type,
          label: row.name.trim() || getDocumentTypeLabel(row.document_type, row.document_type),
          required: row.isRequired,
        })
      }
    })

    const payload = [...syncedMap.values()]
    api.put('settings/bulk', {
      group: 'documents',
      values: { required: payload },
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['settings'] })
      })
      .catch(() => {
        // Silencioso para não interromper o preenchimento; a criação usa override explícito por pedido.
      })
  }

  const handleAddCustomDocumentType = () => {
    const label = newDocumentTypeName.trim()
    if (!label) return
    const type = `custom_${label.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
    if (!type || type === 'custom_') return

    if (!documentTypeOptions.some((opt) => opt.type === type)) {
      setCustomDocumentTypes((prev) => [...prev, { type, label, required: newDocumentRequired }])
    }

    const nextRows: DocumentRow[] = [
      ...documentRows,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file: null,
        name: label,
        document_type: type,
        isRequired: newDocumentRequired,
        isConfigured: true,
      },
    ]
    setDocumentRows(nextRows)
    syncDocumentSettings(nextRows)
    setNewDocumentTypeName('')
    setNewDocumentRequired(false)
  }

  const handleRowFileChange = (rowId: string, file: File | undefined) => {
    if (!file) return
    const isImg = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    const isDoc = /\.docx?$/i.test(file.name)
    if (!isImg && !isPdf && !isDoc) {
      toast.error(t('employeeCreate.errors.unsupportedFile', { name: file.name }))
      return
    }

    setDocumentRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl)
        return {
          ...row,
          file,
          name: row.name || file.name.replace(/\.[^/.]+$/, ''),
          previewUrl: isImg || isPdf ? URL.createObjectURL(file) : undefined,
        }
      }),
    )
  }

  // Handle Document uploads (PDFs / Images via dropzone)
  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const newDocs: DocumentRow[] = []
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      const isDoc = file.name.endsWith('.doc') || file.name.endsWith('.docx')

      if (!isImg && !isPdf && !isDoc) {
        toast.error(t('employeeCreate.errors.unsupportedFile', { name: file.name }))
        return
      }

      let defaultType = 'other'
      const lower = file.name.toLowerCase()
      if (lower.includes('contrat') || lower.includes('contract')) defaultType = 'contract'
      else if (lower.includes('passaport')) defaultType = 'passport'
      else if (lower.includes('visto')) defaultType = 'work_visa'
      else if (lower.includes('bi') || lower.includes('identidad')) defaultType = 'id_card'
      else if (lower.includes('nif')) defaultType = 'nif_card'
      else if (lower.includes('inss')) defaultType = 'inss_card'
      else if (lower.includes('cv') || lower.includes('curriculo')) defaultType = 'cv'
      else if (lower.includes('diploma') || lower.includes('certificad')) defaultType = 'certificate'
      else if (lower.includes('criminal') || lower.includes('registo')) defaultType = 'criminal_record'
      else if (lower.includes('medic') || lower.includes('atestado')) defaultType = 'medical'
      else if (lower.includes('vacin')) defaultType = 'vaccination_card'
      else if (lower.includes('resid')) defaultType = 'residence_proof'
      else if (lower.includes('iban') || lower.includes('nib') || lower.includes('banc')) defaultType = 'bank_proof'
      else if (lower.includes('termo')) defaultType = 'term'
      else if (lower.includes('conduc')) defaultType = 'driver_license'
      else if (lower.includes('militar')) defaultType = 'military_record'

      newDocs.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        name: file.name.replace(/\.[^/.]+$/, ''),
        document_type: defaultType,
        previewUrl: isImg || isPdf ? URL.createObjectURL(file) : undefined,
        isRequired: false,
        isConfigured: false,
      })
    })

    if (newDocs.length > 0) {
      setDocumentRows((prev) => [...prev, ...newDocs])
      toast.success(t('employeeCreate.documents.addedCount', { count: newDocs.length }))
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveDocument = (id: string) => {
    setDocumentRows((prev) =>
      prev.flatMap((row) => {
        if (row.id !== id) return [row]
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl)
        if (row.isConfigured) {
          return [{ ...row, file: null, previewUrl: undefined }]
        }
        return []
      }),
    )
    if (previewDoc?.id === id) setPreviewDoc(null)
  }

  const handleUpdateDocumentMeta = (id: string, field: 'name' | 'document_type', val: string) => {
    setDocumentRows((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d
        if (field === 'document_type') {
          const optLabel = documentTypeOptions.find((o) => o.type === val)?.label
          return { ...d, document_type: val, name: d.name || optLabel || '' }
        }
        return { ...d, [field]: val }
      }),
    )
  }

  const handleToggleRowRequired = (id: string) => {
    const nextRows = documentRows.map((row) =>
      row.id === id ? { ...row, isRequired: !row.isRequired } : row,
    )
    setDocumentRows(nextRows)
    const changed = nextRows.find((row) => row.id === id)
    if (changed && (changed.isConfigured || changed.document_type.startsWith('custom_'))) {
      syncDocumentSettings(nextRows)
    }
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
    if (!basicData.first_name.trim()) errors.first_name = t('employeeCreate.validation.firstNameRequired')
    if (!basicData.last_name.trim()) errors.last_name = t('employeeCreate.validation.lastNameRequired')
    if (!basicData.email.trim()) {
      errors.email = t('employeeCreate.validation.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(basicData.email)) {
      errors.email = t('employeeCreate.validation.emailInvalid')
    }

    // Validation - Tab 2 (Dates)
    if (
      contractData.contract_start_date &&
      contractData.contract_end_date &&
      contractData.contract_end_date < contractData.contract_start_date
    ) {
      errors.contract_end_date = t('employeeCreate.validation.contractEndBeforeStart')
    }

    if (missingRequiredDocuments.length > 0) {
      errors.documents = t('employeeCreate.validation.missingRequiredDocuments', {
        documents: missingRequiredDocuments.map((document) => document.label).join(', '),
      })
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      // Switch to the tab with errors
      if (errors.first_name || errors.last_name || errors.email) {
        switchTab('dados-basicos')
        toast.error(t('employeeCreate.validation.fillRequiredBasicFields'))
      } else if (errors.contract_end_date) {
        switchTab('contrato')
        toast.error(errors.contract_end_date)
      } else if (errors.documents) {
        switchTab('contrato')
        toast.error(errors.documents)
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

      // Documents List (PDFs or Images) + overrides bilaterais de obrigatoriedade
      documents.forEach((doc) => {
        formData.append('documents[]', doc.file)
        formData.append('document_names[]', doc.name || doc.file.name)
        formData.append('document_types[]', doc.document_type || 'other')
      })
      documentRows
        .filter((row) => row.document_type && !row.isRequired)
        .forEach((row) => {
          formData.append('optional_document_types[]', row.document_type)
        })
      documentRows
        .filter((row) => row.document_type && row.isRequired)
        .forEach((row) => {
          formData.append('required_document_types[]', row.document_type)
        })

      await api.upload('employees', formData)

      toast.success(t('employeeCreate.saveSuccess'))
      navigate('/employees')
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('employeeCreate.saveError')))
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchTab = (tab: 'dados-basicos' | 'contrato') => {
    setActiveTab(tab)
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
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
        <span>{t('employees.title')}</span>
        <span>/</span>
        <span className="text-foreground font-medium">{t('employeeCreate.breadcrumb')}</span>
      </div>

      <PageHeader
        title={t('employees.add')}
        description={t('employeeCreate.pageDescription')}
      />

      {/* Main Two-Tab Form */}
      <form onSubmit={handleSaveAll} className="space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => switchTab(v as 'dados-basicos' | 'contrato')}>
          <TabsList className="grid w-full grid-cols-2 max-w-md h-11 p-1 bg-muted">
            <TabsTrigger value="dados-basicos" className="gap-2 text-sm font-medium">
              <User className="h-4 w-4" />
              {t('employeeCreate.tabs.basicData')}
              {Object.keys(formErrors).some((k) => ['first_name', 'last_name', 'email'].includes(k)) && (
                <span className="h-2 w-2 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="contrato" className="gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              {t('employeeCreate.tabs.contractDocuments')}
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
                  {t('employeeCreate.sections.personalId.title')}
                </CardTitle>
                <CardDescription>
                  {t('employeeCreate.sections.personalId.description')}
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
                    <div className="text-sm font-medium">{t('employeeCreate.photo.title')}</div>
                    <p className="text-xs text-muted-foreground">
                      {t('employeeCreate.photo.hint')}
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
                        {photoFile ? t('employeeCreate.photo.change') : t('employeeCreate.photo.upload')}
                      </Button>
                      {photoFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRemovePhoto}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> {t('employeeCreate.photo.remove')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileSearch className="h-4 w-4 text-primary" />
                      {t('employeeCreate.ocr.title')}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('employeeCreate.ocr.description')}
                    </p>
                  </div>
                  <input
                    ref={identityInputRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file && file.size > 5 * 1024 * 1024) {
                        toast.error(t('employeeCreate.ocr.maxSizeError'))
                        setIdentityImage(null)
                        event.target.value = ''
                        return
                      }
                      setIdentityImage(file ?? null)
                      setIdentityOcrConsent(false)
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => identityInputRef.current?.click()}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {identityImage ? t('employeeCreate.ocr.changeFile') : t('employeeCreate.ocr.selectFile')}
                    </Button>
                    {identityImage && (
                      <span className="text-xs text-muted-foreground">{identityImage.name}</span>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="identity-ocr-consent"
                      checked={identityOcrConsent}
                      disabled={!identityImage || isReadingIdentity}
                      onCheckedChange={(checked) => setIdentityOcrConsent(checked === true)}
                    />
                    <label htmlFor="identity-ocr-consent" className="text-xs leading-relaxed cursor-pointer">
                      {t('employeeCreate.ocr.consent')}
                    </label>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!identityImage || !identityOcrConsent || isReadingIdentity}
                    onClick={handleReadIdentity}
                  >
                    {isReadingIdentity ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSearch className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isReadingIdentity ? t('employeeCreate.ocr.reading') : t('employeeCreate.ocr.readButton')}
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">{t('employeeCreate.fields.firstName')} *</Label>
                    <Input
                      id="first_name"
                      value={basicData.first_name}
                      onChange={(e) => {
                        setBasicData((p) => ({ ...p, first_name: e.target.value }))
                        if (formErrors.first_name) setFormErrors((p) => ({ ...p, first_name: '' }))
                      }}
                      placeholder={t('employeeCreate.placeholders.firstName')}
                    />
                    {formErrors.first_name && (
                      <p className="text-xs text-destructive">{formErrors.first_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">{t('employeeCreate.fields.lastName')} *</Label>
                    <Input
                      id="last_name"
                      value={basicData.last_name}
                      onChange={(e) => {
                        setBasicData((p) => ({ ...p, last_name: e.target.value }))
                        if (formErrors.last_name) setFormErrors((p) => ({ ...p, last_name: '' }))
                      }}
                      placeholder={t('employeeCreate.placeholders.lastName')}
                    />
                    {formErrors.last_name && (
                      <p className="text-xs text-destructive">{formErrors.last_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gender">{t('employeeCreate.fields.gender')}</Label>
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
                        <SelectItem value="male">{t('employeeCreate.options.gender.male')}</SelectItem>
                        <SelectItem value="female">{t('employeeCreate.options.gender.female')}</SelectItem>
                        <SelectItem value="other">{t('employeeCreate.options.gender.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birth_date">{t('employeeCreate.fields.birthDate')}</Label>
                    <Input
                      id="birth_date"
                      type="date"
                      value={basicData.birth_date}
                      onChange={(e) => setBasicData((p) => ({ ...p, birth_date: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="marital_status">{t('employeeCreate.fields.maritalStatus')}</Label>
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
                        <SelectItem value="single">{t('employeeCreate.options.maritalStatus.single')}</SelectItem>
                        <SelectItem value="married">{t('employeeCreate.options.maritalStatus.married')}</SelectItem>
                        <SelectItem value="divorced">{t('employeeCreate.options.maritalStatus.divorced')}</SelectItem>
                        <SelectItem value="widowed">{t('employeeCreate.options.maritalStatus.widowed')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nationality">{t('employeeCreate.fields.nationality')}</Label>
                    <Input
                      id="nationality"
                      value={basicData.nationality}
                      onChange={(e) => setBasicData((p) => ({ ...p, nationality: e.target.value }))}
                      placeholder={t('employeeCreate.placeholders.nationality')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_type">{t('employeeCreate.fields.idDocumentType')}</Label>
                    <Select
                      value={basicData.id_document_type}
                      onValueChange={(val) => setBasicData((p) => ({ ...p, id_document_type: val }))}
                    >
                      <SelectTrigger id="id_document_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BI">{t('employeeCreate.options.idDocumentType.BI')}</SelectItem>
                        <SelectItem value="Passaporte">{t('employeeCreate.options.idDocumentType.passport')}</SelectItem>
                        <SelectItem value="Cartão de Residente">{t('employeeCreate.options.idDocumentType.residentCard')}</SelectItem>
                        <SelectItem value="Outro">{t('employeeCreate.options.idDocumentType.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_number">{t('employeeCreate.fields.idDocumentNumber')}</Label>
                    <Input
                      id="id_document_number"
                      value={basicData.id_document_number}
                      onChange={(e) =>
                        setBasicData((p) => ({ ...p, id_document_number: e.target.value }))
                      }
                      placeholder={t('employeeCreate.placeholders.idDocumentNumber')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="id_document_expiry">{t('employeeCreate.fields.idDocumentExpiry')}</Label>
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
                    <Label htmlFor="tax_id">{t('employeeCreate.fields.taxId')}</Label>
                    <Input
                      id="tax_id"
                      value={basicData.tax_id}
                      onChange={(e) => setBasicData((p) => ({ ...p, tax_id: e.target.value }))}
                      placeholder={t('employeeCreate.placeholders.taxId')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="social_security_id">{t('employeeCreate.fields.socialSecurityId')}</Label>
                    <Input
                      id="social_security_id"
                      value={basicData.social_security_id}
                      onChange={(e) =>
                        setBasicData((p) => ({ ...p, social_security_id: e.target.value }))
                      }
                      placeholder={t('employeeCreate.placeholders.socialSecurityId')}
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
                  {t('employeeCreate.sections.contactAddress.title')}
                </CardTitle>
                <CardDescription>
                  {t('employeeCreate.sections.contactAddress.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('employeeCreate.fields.email')} *</Label>
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
                      placeholder={t('employeeCreate.placeholders.email')}
                    />
                  </div>
                  {formErrors.email && (
                    <p className="text-xs text-destructive">{formErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{t('employeeCreate.fields.phone')}</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={basicData.phone}
                      onChange={(e) => setBasicData((p) => ({ ...p, phone: e.target.value }))}
                      className="pl-9"
                      placeholder={t('employeeCreate.placeholders.phone')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alternative_phone">{t('employeeCreate.fields.alternativePhone')}</Label>
                  <Input
                    id="alternative_phone"
                    value={basicData.alternative_phone}
                    onChange={(e) =>
                      setBasicData((p) => ({ ...p, alternative_phone: e.target.value }))
                    }
                    placeholder={t('employeeCreate.placeholders.phone')}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">{t('employeeCreate.fields.address')}</Label>
                  <Input
                    id="address"
                    value={basicData.address}
                    onChange={(e) => setBasicData((p) => ({ ...p, address: e.target.value }))}
                    placeholder={t('employeeCreate.placeholders.address')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">{t('employeeCreate.fields.city')}</Label>
                  <Input
                    id="city"
                    value={basicData.city}
                    onChange={(e) => setBasicData((p) => ({ ...p, city: e.target.value }))}
                    placeholder={t('employeeCreate.placeholders.city')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">{t('employeeCreate.fields.state')}</Label>
                  <Input
                    id="state"
                    value={basicData.state}
                    onChange={(e) => setBasicData((p) => ({ ...p, state: e.target.value }))}
                    placeholder={t('employeeCreate.placeholders.state')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">{t('employeeCreate.fields.country')}</Label>
                  <Input
                    id="country"
                    value={basicData.country}
                    onChange={(e) => setBasicData((p) => ({ ...p, country: e.target.value }))}
                    placeholder={t('employeeCreate.placeholders.country')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postal_code">{t('employeeCreate.fields.postalCode')}</Label>
                  <Input
                    id="postal_code"
                    value={basicData.postal_code}
                    onChange={(e) => setBasicData((p) => ({ ...p, postal_code: e.target.value }))}
                    placeholder={t('employeeCreate.placeholders.postalCode')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Enquadramento Organizacional */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  {t('employeeCreate.sections.organization.title')}
                </CardTitle>
                <CardDescription>
                  {t('employeeCreate.sections.organization.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="department_id">{t('employeeCreate.fields.department')}</Label>
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
                      <SelectValue placeholder={t('employeeCreate.placeholders.selectDepartment')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('employeeCreate.options.none')}</SelectItem>
                      {departments?.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position_id">{t('employeeCreate.fields.position')}</Label>
                  <Select
                    value={basicData.position_id || 'none'}
                    onValueChange={(val) =>
                      setBasicData((p) => ({ ...p, position_id: val === 'none' ? '' : val }))
                    }
                  >
                    <SelectTrigger id="position_id">
                      <SelectValue placeholder={t('employeeCreate.placeholders.selectPosition')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('employeeCreate.options.none')}</SelectItem>
                      {filteredPositions?.map((pos) => (
                        <SelectItem key={pos.id} value={String(pos.id)}>
                          {pos.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manager_id">{t('employeeCreate.fields.manager')}</Label>
                  <Select
                    value={basicData.manager_id || 'none'}
                    onValueChange={(val) =>
                      setBasicData((p) => ({ ...p, manager_id: val === 'none' ? '' : val }))
                    }
                  >
                    <SelectTrigger id="manager_id">
                      <SelectValue placeholder={t('employeeCreate.placeholders.selectManager')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('employeeCreate.options.none')}</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hired_at">{t('employeeCreate.fields.hiredAt')}</Label>
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
                  <Label htmlFor="probation_end">{t('employeeCreate.fields.probationEnd')}</Label>
                  <Input
                    id="probation_end"
                    type="date"
                    value={basicData.probation_end}
                    onChange={(e) => setBasicData((p) => ({ ...p, probation_end: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">{t('employeeCreate.fields.status')} *</Label>
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
                      <SelectItem value="active">{t('employeeCreate.options.status.active')}</SelectItem>
                      <SelectItem value="inactive">{t('employeeCreate.options.status.inactive')}</SelectItem>
                      <SelectItem value="suspended">{t('employeeCreate.options.status.suspended')}</SelectItem>
                      <SelectItem value="terminated">{t('employeeCreate.options.status.terminated')}</SelectItem>
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
                  {t('employeeCreate.sections.contract.title')}
                </CardTitle>
                <CardDescription>
                  {t('employeeCreate.sections.contract.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="contract_type">{t('employeeCreate.fields.contractType')}</Label>
                    <Select
                      value={contractData.contract_type}
                      onValueChange={(val) => setContractData((c) => ({ ...c, contract_type: val }))}
                    >
                      <SelectTrigger id="contract_type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanent">{t('employeeDetail.contractType.permanent')}</SelectItem>
                        <SelectItem value="fixed_term">{t('employeeDetail.contractType.fixed_term')}</SelectItem>
                        <SelectItem value="temporary">{t('employeeDetail.contractType.temporary')}</SelectItem>
                        <SelectItem value="probation">{t('employeeDetail.contractType.probation')}</SelectItem>
                        <SelectItem value="internship">{t('employeeDetail.contractType.internship')}</SelectItem>
                        <SelectItem value="outsourced">{t('employeeDetail.contractType.outsourced')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="base_salary">{t('employeeCreate.fields.baseSalary', { currency })}</Label>
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
                    <Label htmlFor="salary_frequency">{t('employeeCreate.fields.salaryFrequency')}</Label>
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
                        <SelectItem value="monthly">{t('employeeCreate.options.salaryFrequency.monthly')}</SelectItem>
                        <SelectItem value="biweekly">{t('employeeCreate.options.salaryFrequency.biweekly')}</SelectItem>
                        <SelectItem value="weekly">{t('employeeCreate.options.salaryFrequency.weekly')}</SelectItem>
                        <SelectItem value="hourly">{t('employeeCreate.options.salaryFrequency.hourly')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="work_hours">{t('employeeCreate.fields.workHoursPerWeek')}</Label>
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
                    <Label htmlFor="contract_start_date">{t('employeeCreate.fields.contractStartDate')}</Label>
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
                    <Label htmlFor="contract_end_date">{t('employeeCreate.fields.contractEndDate')}</Label>
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
                    <Label htmlFor="contract_signed_at">{t('employeeCreate.fields.contractSignedAt')}</Label>
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
                  <Label htmlFor="contract_notes">{t('employeeCreate.fields.contractNotes')}</Label>
                  <Textarea
                    id="contract_notes"
                    value={contractData.contract_notes}
                    onChange={(e) =>
                      setContractData((c) => ({ ...c, contract_notes: e.target.value }))
                    }
                    rows={2}
                    placeholder={t('employeeCreate.placeholders.contractNotes')}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Upload de Documentos (PDFs ou Imagens) */}
            <Card>
              <CardHeader className="border-b border-border/60 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-primary" />
                      {t('employeeCreate.documents.title')}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {t('employeeCreate.documents.description')}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {totalRequiredCount > 0 && (
                      <Badge
                        variant={missingRequiredDocuments.length === 0 ? 'outline' : 'secondary'}
                        className={`font-mono text-xs ${
                          missingRequiredDocuments.length === 0
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t('employeeCreate.documents.requiredProgress', {
                          done: requiredDoneCount,
                          total: totalRequiredCount,
                          defaultValue: 'Obrigatórios: {{done}}/{{total}}',
                        })}
                      </Badge>
                    )}
                    <Badge variant="outline" className="font-mono text-xs">
                      {t('employeeCreate.documents.fileCount', { count: uploadedDocuments.length })}
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-5">
                {isLoadingDocumentSettings && (
                  <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('employeeCreate.documents.loadingRequired')}</span>
                  </div>
                )}
                {hasDocumentSettingsError && (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    <span>{t('employeeCreate.documents.loadError')}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void refetchDocumentSettings()}>
                      {t('employeeCreate.documents.retry')}
                    </Button>
                  </div>
                )}

                {/* Tabela / Lista alinhada: Input de documento à Esquerda | Exigência | Tipo à Direita | Ações */}
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_124px_225px_76px] items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>{t('employeeCreate.documents.colFileInput', { defaultValue: 'Ficheiro / Documento' })}</span>
                    <span className="text-center">{t('employeeCreate.documents.colRequirement', { defaultValue: 'Exigência' })}</span>
                    <span>{t('employeeCreate.documents.colDocumentType', { defaultValue: 'Tipo de Documento' })}</span>
                    <span className="text-right">{t('common.actions')}</span>
                  </div>

                  {documentRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2 opacity-40" />
                      <p>{t('employeeCreate.documents.noRowsYet', { defaultValue: 'Nenhum documento na lista. Adicione um abaixo.' })}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/70">
                      {documentRows.map((row) => {
                        const hasType = row.document_type.trim() !== ''
                        const isImg = row.file?.type.startsWith('image/') ?? false
                        const isPdf = row.file?.type === 'application/pdf'
                        const fileInputId = `emp-create-doc-${row.id}`

                        return (
                          <div
                            key={row.id}
                            className={`grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_124px_225px_76px] items-center gap-3 px-4 py-3 transition-colors ${
                              row.file
                                ? 'bg-emerald-500/[0.03]'
                                : row.isRequired
                                  ? 'bg-amber-500/[0.02]'
                                  : 'hover:bg-muted/20'
                            }`}
                          >
                            {/* Coluna 1 (Esquerda): Controlo de Upload Limpo + Nome/Estado */}
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Miniatura / Ícone */}
                              {row.previewUrl && isImg ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(row)}
                                  title={t('employeeCreate.documents.zoomTitle')}
                                  className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted hover:opacity-85 transition-opacity"
                                >
                                  <img src={row.previewUrl} alt={row.name} className="h-full w-full object-cover" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!row.previewUrl}
                                  onClick={() => row.previewUrl && setPreviewDoc(row)}
                                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                                    row.file
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'border-border bg-muted/40 text-muted-foreground'
                                  } ${row.previewUrl ? 'cursor-pointer hover:bg-primary/10' : 'cursor-default'}`}
                                >
                                  {isPdf ? (
                                    <FileText className="h-5 w-5 text-red-500" />
                                  ) : row.file ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                  ) : (
                                    <FileCheck className="h-5 w-5" />
                                  )}
                                </button>
                              )}

                              {/* Input Box integrado */}
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-input bg-background px-3 py-2 shadow-2xs">
                                <div className="min-w-0 flex-1">
                                  <input
                                    type="text"
                                    value={row.name}
                                    onChange={(e) => handleUpdateDocumentMeta(row.id, 'name', e.target.value)}
                                    placeholder={t('employeeCreate.documents.namePlaceholder')}
                                    className="w-full min-w-0 bg-transparent text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none truncate"
                                  />
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                    {row.file ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                        {row.file.name} · {formatFileSize(row.file.size)}
                                      </span>
                                    ) : !hasType ? (
                                      <span className="text-amber-600 dark:text-amber-400">
                                        {t('employeeCreate.documents.selectTypeFirst')}
                                      </span>
                                    ) : (
                                      <span>{t('employeeCreate.documents.notAttached')}</span>
                                    )}
                                  </p>
                                </div>

                                <input
                                  id={fileInputId}
                                  type="file"
                                  disabled={!hasType}
                                  accept=".pdf,image/jpeg,image/png,image/webp,.doc,.docx"
                                  onChange={(e) => handleRowFileChange(row.id, e.target.files?.[0])}
                                  aria-label={t('employeeCreate.documents.attachAria', { label: row.name || row.document_type || 'documento' })}
                                  className="sr-only"
                                />
                                <label
                                  htmlFor={hasType ? fileInputId : undefined}
                                  className={`shrink-0 inline-flex h-9 min-w-[132px] items-center justify-center gap-2 rounded-md px-4 text-xs font-semibold transition-all ${
                                    !hasType
                                      ? 'cursor-not-allowed bg-muted text-muted-foreground/60 border border-border/60'
                                      : row.file
                                        ? 'cursor-pointer border border-border bg-secondary text-foreground hover:bg-secondary/80'
                                        : 'cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs ring-1 ring-primary/20'
                                  }`}
                                >
                                  <Upload className="h-3.5 w-3.5" />
                                  {row.file
                                    ? t('employeeCreate.documents.replaceFile', { defaultValue: 'Alterar' })
                                    : t('employeeCreate.documents.uploadButton', { defaultValue: 'Carregar' })}
                                </label>
                              </div>
                            </div>

                            {/* Coluna 2: Badge Alinhado de Obrigatoriedade (bilateral em qualquer linha) */}
                            <div className="flex items-center md:justify-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRowRequired(row.id)}
                                title={t('employeeCreate.documents.toggleRequiredHint', {
                                  defaultValue: 'Clique para alternar entre Obrigatório e Opcional',
                                })}
                                className={`inline-flex h-7 w-[110px] items-center justify-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                                  row.isRequired
                                    ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'
                                    : 'border-border bg-muted/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                }`}
                              >
                                {row.isRequired
                                  ? t('settingsPage.documentMandatory', { defaultValue: 'Obrigatório' })
                                  : t('settingsPage.documentOptional', { defaultValue: 'Opcional' })}
                              </button>
                            </div>

                            {/* Coluna 3 (Direita): Select de Tipo de Documento */}
                            <div className="w-full">
                              <Select
                                value={row.document_type || '__unset'}
                                onValueChange={(val) =>
                                  handleUpdateDocumentMeta(row.id, 'document_type', val === '__unset' ? '' : val)
                                }
                              >
                                <SelectTrigger className={`h-11 w-full text-xs ${!hasType ? 'border-amber-500/60 ring-1 ring-amber-500/20' : ''}`}>
                                  <SelectValue placeholder={t('employeeCreate.documents.selectTypePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__unset" disabled>
                                    {t('employeeCreate.documents.selectTypePlaceholder')}
                                  </SelectItem>
                                  {documentTypeOptions.map((option) => (
                                    <SelectItem key={option.type} value={option.type}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Coluna Ações */}
                            <div className="flex items-center justify-end gap-1">
                              {row.previewUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setPreviewDoc(row)}
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title={t('employeeCreate.documents.previewTitle')}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="w-8" />
                              )}

                              {(!row.isConfigured || row.file !== null) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleRemoveDocument(row.id)}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  title={t('employeeCreate.documents.deleteTitle')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="w-8" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Rodapé da tabela: Adicionar nova linha + Carregar múltiplos */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={handleAddEmptyDocumentRow}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {t('employeeCreate.documents.addDocumentRow')}
                      </Button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        accept=".pdf,image/jpeg,image/png,image/webp,.doc,.docx"
                        onChange={(e) => handleFilesAdded(e.target.files)}
                        className="hidden"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {t('employeeCreate.documents.chooseFiles')}
                      </Button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      PDF, JPG, PNG, WebP, DOCX (máx. 10 MB)
                    </span>
                  </div>
                </div>

                {/* Barra compacta: Criar novo tipo de documento */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/15 px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    {t('employeeCreate.documents.addCustomTypeTitle')}:
                  </span>
                  <Input
                    value={newDocumentTypeName}
                    onChange={(e) => setNewDocumentTypeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCustomDocumentType()
                      }
                    }}
                    placeholder={t('settingsPage.customDocumentPlaceholder')}
                    aria-label={t('settingsPage.customDocumentAriaLabel')}
                    className="h-8 text-xs flex-1 bg-background"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                    <Checkbox
                      checked={newDocumentRequired}
                      onCheckedChange={(checked) => setNewDocumentRequired(checked === true)}
                    />
                    <span>{t('settingsPage.documentMandatory')}</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomDocumentType}
                    disabled={!newDocumentTypeName.trim()}
                    className="h-8 shrink-0"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('settingsPage.add')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Global Footer Actions with SINGLE Save Button (Non-sticky to avoid jumping) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-sm mt-8">
          <div className="text-xs text-muted-foreground">
            {activeTab === 'dados-basicos' ? (
              <span>{t('employeeCreate.footer.step1')}</span>
            ) : (
              <span>{t('employeeCreate.footer.step2', { count: documents.length })}</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button type="button" variant="outline" asChild disabled={isSubmitting}>
              <Link to="/employees">{t('common.cancel')}</Link>
            </Button>

            {activeTab === 'dados-basicos' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => switchTab('contrato')}
              >
                {t('employeeCreate.footer.nextStep')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => switchTab('dados-basicos')}
              >
                {t('employeeCreate.footer.prevStep')}
              </Button>
            )}

            {/* O ÚNICO BOTÃO DE SAVE */}
            <Button
              type="submit"
              disabled={isCreateDisabled}
              title={hasDocumentSettingsError
                ? t('employeeCreate.documents.loadErrorShort')
                : isLoadingDocumentSettings
                  ? t('employeeCreate.documents.loadingRequired')
                  : missingRequiredDocuments.length > 0
                    ? t('employeeCreate.validation.missingRequiredDocuments', {
                        documents: missingRequiredDocuments.map((document) => document.label).join(', '),
                      })
                    : undefined}
              className="min-w-[160px] shadow-sm bg-primary text-primary-foreground font-medium"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  {t('employeeCreate.footer.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('employeeCreate.footer.submit')}
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
                {previewDoc?.name || previewDoc?.file?.name}
              </DialogTitle>
            </div>
            <DialogDescription>
              {previewDoc?.file?.name} • {previewDoc?.file && formatFileSize(previewDoc.file.size)}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {previewDoc?.file?.type.startsWith('image/') && previewDoc.previewUrl && (
              <div className="flex items-center justify-center rounded-lg bg-black/5 dark:bg-black/40 p-2 overflow-hidden max-h-[65vh]">
                <img
                  src={previewDoc.previewUrl}
                  alt={previewDoc.name}
                  className="max-h-[60vh] max-w-full rounded object-contain"
                />
              </div>
            )}

            {previewDoc?.file?.type === 'application/pdf' && previewDoc.previewUrl && (
              <div className="rounded-lg overflow-hidden border border-border h-[65vh] w-full bg-muted/20">
                <iframe
                  src={previewDoc.previewUrl}
                  title={previewDoc.name}
                  className="w-full h-full border-0"
                />
              </div>
            )}

            {!previewDoc?.file?.type.startsWith('image/') && previewDoc?.file?.type !== 'application/pdf' && (
              <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 rounded-lg">
                <FileCheck className="h-16 w-16 text-primary mb-3" />
                <p className="text-sm font-medium">{previewDoc?.file?.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('employeeCreate.preview.readyToUpload', {
                    size: previewDoc?.file ? formatFileSize(previewDoc.file.size) : '',
                  })}
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
              {t('employeeCreate.preview.deleteToReplace')}
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
                    {t('employeeCreate.preview.openInNewTab')}
                  </a>
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreviewDoc(null)}
              >
                {t('employeeCreate.preview.close')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function normalizeDocumentRequirements(value: unknown): DocumentRequirement[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') {
      return [{ type: item, label: ANGOLA_DOCUMENT_LABELS[item] ?? item, required: true }]
    }
    if (item && typeof item === 'object' && 'type' in item && 'label' in item) {
      const requirement = item as { type: unknown; label: unknown; required?: unknown }
      if (typeof requirement.type === 'string' && typeof requirement.label === 'string') {
        return [{
          type: requirement.type,
          label: requirement.label,
          required: typeof requirement.required === 'boolean' ? requirement.required : true,
        }]
      }
    }
    return []
  })
}

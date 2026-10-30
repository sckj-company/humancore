import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, FileText, Briefcase, Trash2, Eye,
  Download, Plus, Upload, ExternalLink, FileCheck, AlertCircle, Building2, User,
  CreditCard, Clock, CheckCircle2, DollarSign, Loader2, Sun, Moon, UserCheck,
  Activity, RotateCcw, ChevronRight, Save, BedDouble, PowerOff,
} from 'lucide-react'
import { api, getApiErrorMessage } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import type { Employee, EmployeeDocument, AttendanceRecord, LeaveRequest, Paginated } from '@/types'

const statusLabels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo', on_leave: 'Em Licença', probation: 'Em Probatório', suspended: 'Suspenso', terminated: 'Rescindido' }
const statusColors: Record<string, string> = { active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', inactive: 'bg-muted text-muted-foreground border-border', on_leave: 'bg-blue-500/10 text-blue-600 border-blue-500/20', probation: 'bg-amber-500/10 text-amber-600 border-amber-500/20', suspended: 'bg-rose-500/10 text-rose-600 border-rose-500/20', terminated: 'bg-red-500/10 text-red-600 border-red-500/20' }
const genderLabels: Record<string, string> = { male: 'Masculino', female: 'Feminino', other: 'Outro' }
const maritalStatusLabels: Record<string, string> = { single: 'Solteiro(a)', married: 'Casado(a)', divorced: 'Divorciado(a)', widowed: 'Viúvo(a)', separated: 'Separado(a)' }
const idDocumentTypeLabels: Record<string, string> = { national_id: 'Bilhete de Identidade (B.I.)', bi: 'Bilhete de Identidade (B.I.)', passport: 'Passaporte', driver_license: 'Carta de Condução', residence_permit: 'Cartão de Residência', other: 'Outro Documento' }
const contractTypeLabels: Record<string, string> = { permanent: 'Efetivo / Tempo Indeterminado', fixed_term: 'A Termo Certo', part_time: 'Tempo Parcial', internship: 'Estágio Profissional', temporary: 'Trabalho Temporário', contractor: 'Prestador de Serviços' }
const salaryFrequencyLabels: Record<string, string> = { monthly: 'Mensal', biweekly: 'Quinzenal', weekly: 'Semanal', hourly: 'Por Hora', yearly: 'Anual' }
const docTypeLabels: Record<string, string> = { contract: 'Contrato de Trabalho', id_document: 'B.I. / Passaporte', certificate: 'Certificado / Habilitações', resume: 'Curriculum Vitae', medical: 'Atestado Médico', tax_form: 'Documento Fiscal', other: 'Outro Documento' }
const attendanceStatusLabels: Record<string, string> = { present: 'Presente', absent: 'Falta', late: 'Atrasado', half_day: 'Meio Dia', holiday: 'Feriado', vacation: 'Férias', sick: 'Doença', justified: 'Justificado', excused: 'Justificado' }
const attendanceStatusColors: Record<string, string> = { present: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', late: 'bg-amber-500/10 text-amber-600 border-amber-500/20', absent: 'bg-red-500/10 text-red-600 border-red-500/20', half_day: 'bg-blue-500/10 text-blue-600 border-blue-500/20', excused: 'bg-gray-500/10 text-gray-600 border-gray-500/20', justified: 'bg-gray-500/10 text-gray-600 border-gray-500/20', vacation: 'bg-sky-500/10 text-sky-600 border-sky-500/20', sick: 'bg-rose-500/10 text-rose-600 border-rose-500/20' }
const leaveStatusLabels: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', cancelled: 'Cancelado', draft: 'Rascunho' }
const leaveStatusColors: Record<string, string> = { pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20', approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', rejected: 'bg-red-500/10 text-red-600 border-red-500/20', cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/20', draft: 'bg-muted text-muted-foreground border-border' }

interface LeaveType { id: number; name: string; code: string; days_per_year?: number; is_paid: boolean }
interface Shift { id: number; name: string; code?: string | null; start_time: string; end_time: string; break_minutes: number; work_hours: number; late_tolerance_minutes: number; working_days?: number[]; color?: string | null; is_night_shift: boolean; is_active: boolean; notes?: string | null }
interface EmployeeScheduleRecord { id: number; employee_id: number; shift_id: number; effective_from?: string; effective_to?: string | null; is_active: boolean; notes?: string | null; shift?: { id: number; name: string; code?: string | null; start_time: string; end_time: string; color?: string | null } }

export function EmployeeDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'personal'
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const locale = i18n.language || 'pt-PT'
  const qc = useQueryClient()

  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadFormData, setUploadFormData] = useState({ name: '', document_type: 'other', expiry_date: '', notes: '' })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isManualAttOpen, setIsManualAttOpen] = useState(false)
  const [manualAttForm, setManualAttForm] = useState({ date: new Date().toISOString().slice(0, 10), clock_in: '', clock_out: '', status: 'present', notes: '' })
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [leaveForm, setLeaveForm] = useState({ leave_type_id: '', start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: '', status: 'approved' })
  const [isShiftOpen, setIsShiftOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState({ shift_id: '', effective_from: new Date().toISOString().slice(0, 10), notes: '' })
  const [isDeactivateContractOpen, setIsDeactivateContractOpen] = useState(false)
  const [deactivateContractForm, setDeactivateContractForm] = useState({ reason: '', end_date: new Date().toISOString().slice(0, 10) })

  const { data, isLoading, isError, refetch } = useQuery<Employee>({ queryKey: ['employees', id], queryFn: () => api.get<Employee>(`employees/${id}`) })
  const { data: timeline } = useQuery({ queryKey: ['employees', id, 'timeline'], queryFn: () => api.get<{ type: string; title: string; date: string; description: string }[]>(`employees/${id}/timeline`) })
  const { data: documents } = useQuery<EmployeeDocument[]>({ queryKey: ['employee-documents', id], queryFn: () => api.get<{ data: EmployeeDocument[] }>('documents', { employee_id: id, per_page: 100 }).then((res) => (Array.isArray(res) ? res : (res as any).data ?? [])), enabled: !!id })
  const { data: attendanceData, refetch: refetchAttendance } = useQuery<Paginated<AttendanceRecord>>({ queryKey: ['attendance', id], queryFn: () => api.get<Paginated<AttendanceRecord>>('attendance', { employee_id: id, per_page: 50 }), enabled: !!id && activeTab === 'attendance' })
  const { data: todayAttendance, refetch: refetchToday } = useQuery<AttendanceRecord | null>({ queryKey: ['attendance-today', id], queryFn: () => api.get<AttendanceRecord | null>('attendance/today', { employee_id: id }), enabled: !!id })
  const { data: leaveBalance, refetch: refetchBalance } = useQuery({ queryKey: ['leave-balance', id], queryFn: () => api.get<{ annual_entitlement: number; days_used: number; days_remaining: number; days_pending: number }>('leaves/balance', { employee_id: id }), enabled: !!id && activeTab === 'leaves' })
  const { data: leavesData, refetch: refetchLeaves } = useQuery<Paginated<LeaveRequest>>({ queryKey: ['leaves', id], queryFn: () => api.get<Paginated<LeaveRequest>>('leaves', { employee_id: id, per_page: 50 }), enabled: !!id && activeTab === 'leaves' })
  const { data: leaveTypes } = useQuery<LeaveType[]>({ queryKey: ['leave-types'], queryFn: () => api.get<LeaveType[]>('leaves/types'), enabled: isLeaveOpen })
  const { data: shiftsData } = useQuery<Paginated<Shift>>({ queryKey: ['shifts-all'], queryFn: () => api.get<Paginated<Shift>>('shifts', { per_page: 100 }), enabled: isShiftOpen })
  const { data: scheduleHistory, refetch: refetchSchedule } = useQuery<Paginated<EmployeeScheduleRecord>>({ queryKey: ['employee-schedules-history', id], queryFn: () => api.get<Paginated<EmployeeScheduleRecord>>('employee-schedules', { employee_id: id, per_page: 20 }), enabled: !!id && activeTab === 'shift' })

  const todayStr = new Date().toISOString().slice(0, 10)
  const attRecords = attendanceData?.data ?? []
  const selectedManualRecord = attRecords.find((r) => r.date === manualAttForm.date) || (todayAttendance?.date === manualAttForm.date ? todayAttendance : null)
  const isManualDateFuture = manualAttForm.date > todayStr
  const isManualDateClosed = !!(selectedManualRecord?.clock_in && selectedManualRecord?.clock_out)

  const deleteDoc = useMutation({ mutationFn: (docId: number) => api.delete(`documents/${docId}`), onSuccess: () => { toast.success('Documento eliminado.'); setPreviewDoc(null); qc.invalidateQueries({ queryKey: ['employee-documents', id] }) }, onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao eliminar.')) })
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error('Selecione um ficheiro.')
      const fd = new FormData()
      fd.append('employee_id', id!); fd.append('file', uploadFile); fd.append('name', uploadFormData.name || uploadFile.name); fd.append('document_type', uploadFormData.document_type)
      if (uploadFormData.expiry_date) fd.append('expiry_date', uploadFormData.expiry_date)
      if (uploadFormData.notes) fd.append('notes', uploadFormData.notes)
      return api.post('documents', fd)
    },
    onSuccess: () => { toast.success('Documento carregado com sucesso.'); setIsUploadOpen(false); setUploadFile(null); setUploadFormData({ name: '', document_type: 'other', expiry_date: '', notes: '' }); qc.invalidateQueries({ queryKey: ['employee-documents', id] }) },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao carregar.'))
  })
  const toggleAttendance = useMutation({ mutationFn: () => api.post('attendance/toggle', { employee_id: Number(id) }), onSuccess: (res: any) => { toast.success(res?.message ?? 'Presença registada.'); refetchToday(); refetchAttendance() }, onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar.')) })
  const manualAttMutation = useMutation({
    mutationFn: () => {
      if (manualAttForm.date > todayStr) {
        throw new Error('Não é permitido registar presenças para datas futuras.')
      }
      const selected = attRecords.find((r) => r.date === manualAttForm.date) || (todayAttendance?.date === manualAttForm.date ? todayAttendance : null)
      if (selected?.clock_in && selected?.clock_out) {
        throw new Error('A jornada deste dia já foi fechada e não permite novos registos de presença.')
      }
      return api.post('attendance/manual', { employee_id: Number(id), date: manualAttForm.date, clock_in: manualAttForm.clock_in || undefined, clock_out: manualAttForm.clock_out || undefined, status: manualAttForm.status, notes: manualAttForm.notes || undefined })
    },
    onSuccess: () => { toast.success('Registo manual efetuado.'); setIsManualAttOpen(false); setManualAttForm({ date: new Date().toISOString().slice(0, 10), clock_in: '', clock_out: '', status: 'present', notes: '' }); refetchAttendance(); refetchToday() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar.'))
  })
  const deactivateContractMutation = useMutation({
    mutationFn: () => {
      if (!data?.active_contract?.id) throw new Error('Nenhum contrato ativo para desativar.')
      if (!deactivateContractForm.reason.trim()) throw new Error('Por favor, informe o motivo da desativação.')
      return api.post(`contracts/${data.active_contract.id}/deactivate`, {
        reason: deactivateContractForm.reason,
        end_date: deactivateContractForm.end_date || undefined,
      })
    },
    onSuccess: () => {
      toast.success('Contrato desativado com sucesso.')
      setIsDeactivateContractOpen(false)
      setDeactivateContractForm({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
      qc.invalidateQueries({ queryKey: ['employees', id] })
      qc.invalidateQueries({ queryKey: ['employees', id, 'timeline'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao desativar contrato.'))
  })
  const leaveMutation = useMutation({
    mutationFn: () => api.post('leaves', { employee_id: Number(id), leave_type_id: Number(leaveForm.leave_type_id), start_date: leaveForm.start_date, end_date: leaveForm.end_date, reason: leaveForm.reason || undefined, status: leaveForm.status }),
    onSuccess: () => { toast.success('Ausência registada.'); setIsLeaveOpen(false); setLeaveForm({ leave_type_id: '', start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), reason: '', status: 'approved' }); refetchLeaves(); refetchBalance() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao registar.'))
  })
  const shiftMutation = useMutation({
    mutationFn: () => api.post('employee-schedules', { employee_id: Number(id), shift_id: Number(shiftForm.shift_id), effective_from: shiftForm.effective_from, notes: shiftForm.notes || undefined, is_active: true }),
    onSuccess: () => { toast.success('Turno vinculado.'); setIsShiftOpen(false); setShiftForm({ shift_id: '', effective_from: new Date().toISOString().slice(0, 10), notes: '' }); qc.invalidateQueries({ queryKey: ['employees', id] }); refetchSchedule() },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Erro ao vincular.'))
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message="Funcionário não encontrado." onRetry={refetch} />

  const formatDate = (d?: string | null) => {
    if (!d) return '—'
    const raw = String(d).trim()
    const parts = raw.split('T')[0].split(' ')[0].split('-')
    if (parts.length === 3 && parts[0].length === 4) {
      const [year, month, day] = parts.map(Number)
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(year, month - 1, day))
      }
    }
    try {
      const dateObj = new Date(raw)
      if (isNaN(dateObj.getTime())) return raw
      return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(dateObj)
    } catch {
      return raw
    }
  }
  const formatTime = (s?: string | null) => {
    if (!s) return '—'
    const raw = String(s).trim()
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
      return raw.slice(0, 5)
    }
    try {
      const norm = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw
      const d = new Date(norm)
      if (isNaN(d.getTime())) return raw
      return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    } catch {
      return raw
    }
  }
  const formatMinutes = (m?: number | null) => { if (!m) return '0h 00m'; const h = Math.floor(m / 60); const mn = m % 60; return `${h}h ${String(mn).padStart(2, '0')}m` }
  const formatCurrency = (a?: number | null) => { if (a == null) return '—'; return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(a) }
  const calculateAge = (b?: string | null) => { if (!b) return null; try { const diff = Date.now() - new Date(b).getTime(); const a = Math.abs(new Date(diff).getUTCFullYear() - 1970); return isNaN(a) ? null : `${a} anos` } catch { return null } }
  const isImage = (m?: string | null) => m?.startsWith('image/') ?? false
  const isPdf = (m?: string | null) => m === 'application/pdf'
  const handleDownload = async (url?: string | null, fileName?: string | null, docId?: number) => {
    if (!url) { toast.error('URL não disponível.'); return }
    const name = fileName || 'documento'
    if (docId) setDownloadingId(docId)
    const tid = toast.loading(`A transferir "${name}"...`)
    try {
      const r = await fetch(url, { mode: 'cors' })
      if (!r.ok) throw new Error('CORS')
      const blob = await r.blob()
      const burl = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.style.display = 'none'; a.href = burl; a.download = name; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(burl); document.body.removeChild(a)
      toast.success(`Download concluído!`, { id: tid })
    } catch {
      if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        const cn = encodeURIComponent(name.replace(/[/\\?%*:|"<>]/g, '_'))
        const au = url.replace(/\/upload\/(?:v\d+\/)?/, `/upload/fl_attachment:${cn}/`)
        const a = document.createElement('a'); a.href = au; a.download = name; a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a)
        toast.success(`Download iniciado!`, { id: tid })
      } else { window.open(url, '_blank'); toast.dismiss(tid) }
    } finally { if (docId) setDownloadingId(null) }
  }

  const age = calculateAge(data.birth_date)
  const activeShift = data.active_schedule?.shift
  const leaves = leavesData?.data ?? []
  const worked = attRecords.filter((r) => r.status === 'present' || r.status === 'late').length
  const lateCount = attRecords.filter((r) => r.status === 'late').length
  const absent = attRecords.filter((r) => r.status === 'absent').length
  const totalMins = attRecords.reduce((acc, r) => acc + (r.total_worked ?? 0), 0)
  const isClockedIn = !!(todayAttendance?.clock_in && !todayAttendance?.clock_out)
  const isClockedOut = !!(todayAttendance?.clock_in && todayAttendance?.clock_out)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" asChild><Link to="/employees"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <Link to="/employees" className="hover:text-foreground transition-colors">{t('employees.title', { defaultValue: 'Funcionários' })}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-semibold">{data.full_name}</span>
        </div>
        <Button variant="outline" size="sm" asChild><Link to="/employees"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Voltar</Link></Button>
      </div>

      {/* Hero Header */}
      <Card className="border-border/80 shadow-xs bg-card">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 text-center sm:text-left">
              <div className="relative shrink-0">
                <Avatar className="h-24 w-24 ring-2 ring-border shadow-xs">
                  <AvatarImage src={data.photo_url ?? data.photo_path ?? undefined} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground font-bold">{data.first_name?.[0]}{data.last_name?.[0]}</AvatarFallback>
                </Avatar>
                <span className={`absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full ring-2 ring-background ${data.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} title={statusLabels[data.status] ?? data.status} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{data.full_name}</h1>
                  <Badge variant="outline" className="font-mono text-xs">{data.employee_code}</Badge>
                  <Badge variant="outline" className={`font-medium ${statusColors[data.status] ?? ''}`}>{statusLabels[data.status] ?? data.status}</Badge>
                  {activeShift && (
                    <Badge variant="outline" className="gap-1 font-medium" style={{ borderColor: activeShift.color ?? undefined, color: activeShift.color ?? undefined }}>
                      <Clock className="h-3 w-3" />{activeShift.name}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{data.position?.title ?? 'Sem Cargo'}</span>
                  <span className="mx-1.5">·</span>
                  <span>{data.department?.name ?? 'Sem Departamento'}</span>
                  {data.manager && (<><span className="mx-1.5">·</span><span className="inline-flex items-center gap-1"><User className="h-3 w-3" />Gestor: {data.manager.full_name}</span></>)}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                  {data.email && (<a href={`mailto:${data.email}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Mail className="h-3 w-3 text-primary" />{data.email}</a>)}
                  {data.phone && (<a href={`tel:${data.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Phone className="h-3 w-3 text-primary" />{data.phone}</a>)}
                  {data.city && (<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 text-primary" />{[data.city, data.country].filter(Boolean).join(', ')}</span>)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 shrink-0">
              <Button
                size="sm"
                variant={isClockedIn ? 'secondary' : isClockedOut ? 'outline' : 'default'}
                className="gap-1.5"
                onClick={() => {
                  setSearchParams({ tab: 'attendance' }, { replace: true })
                  if (!isClockedOut) toggleAttendance.mutate()
                }}
                disabled={toggleAttendance.isPending || isClockedOut}
              >
                {toggleAttendance.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isClockedIn ? (
                  <Activity className="h-3.5 w-3.5" />
                ) : isClockedOut ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                {isClockedIn ? 'Registar Saída' : isClockedOut ? 'Jornada Concluída' : 'Registar Entrada'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSearchParams({ tab: 'leaves' }, { replace: true }); setIsLeaveOpen(true) }}>
                <BedDouble className="h-3.5 w-3.5" />Lançar Ausência
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSearchParams({ tab: 'shift' }, { replace: true }); setIsShiftOpen(true) }}>
                <RotateCcw className="h-3.5 w-3.5" />Alterar Turno
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Briefcase className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Vínculo Contratual</p>
            <p className="text-sm font-semibold truncate text-foreground">{data.active_contract ? (contractTypeLabels[data.active_contract.contract_type] ?? data.active_contract.contract_type) : 'Sem Contrato'}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><DollarSign className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Remuneração Base</p>
            <p className="text-sm font-semibold truncate text-foreground">{data.active_contract ? formatCurrency(data.active_contract.base_salary) : '—'}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-600"><Building2 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Departamento</p>
            <p className="text-sm font-semibold truncate text-foreground">{data.department?.name ?? '—'}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">Turno Ativo</p>
            <p className="text-sm font-semibold truncate text-foreground">{activeShift?.name ?? '—'}</p>
            {activeShift && <p className="text-[11px] text-muted-foreground font-mono">{activeShift.start_time} – {activeShift.end_time}</p>}
          </div>
        </Card>
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={(tab) => setSearchParams({ tab }, { replace: true })} className="w-full">
        <TabsList className="w-full flex-wrap justify-start h-auto gap-1 p-1.5 bg-muted/60 border border-border/60 rounded-lg">
          <TabsTrigger value="personal" className="gap-1.5 px-3 py-1.5 text-xs"><User className="h-3.5 w-3.5" />Dados Pessoais</TabsTrigger>
          <TabsTrigger value="contract" className="gap-1.5 px-3 py-1.5 text-xs"><Briefcase className="h-3.5 w-3.5" />Contrato</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 px-3 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />Documentos
            {(documents ?? []).length > 0 && <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 px-1 font-semibold">{documents!.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5 px-3 py-1.5 text-xs"><UserCheck className="h-3.5 w-3.5" />Presença</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5 px-3 py-1.5 text-xs"><BedDouble className="h-3.5 w-3.5" />Ausências & Férias</TabsTrigger>
          <TabsTrigger value="shift" className="gap-1.5 px-3 py-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />Turno</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 px-3 py-1.5 text-xs"><Calendar className="h-3.5 w-3.5" />Histórico</TabsTrigger>
        </TabsList>

        {/* Tab: Dados Pessoais */}
        <TabsContent value="personal" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-primary" />Identificação Pessoal</CardTitle><CardDescription>Dados civis e demográficos</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label="Nome Próprio" value={data.first_name} />
                <DF label="Apelido" value={data.last_name} />
                <DF label="Nome Completo" value={data.full_name} span={2} />
                <DF label="Género" value={data.gender ? (genderLabels[data.gender] ?? data.gender) : null} />
                <DF label="Estado Civil" value={data.marital_status ? (maritalStatusLabels[data.marital_status] ?? data.marital_status) : null} />
                <DF label="Data de Nascimento" value={data.birth_date ? `${formatDate(data.birth_date)}${age ? ` (${age})` : ''}` : null} />
                <DF label="Nacionalidade" value={data.nationality} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Documentos Oficiais & Fiscais</CardTitle><CardDescription>Identificação legal, tributária e previdenciária</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label="Tipo de Documento" value={data.id_document_type ? (idDocumentTypeLabels[data.id_document_type] ?? data.id_document_type) : null} span={2} />
                <DF label="Nº de Documento" value={data.id_document_number} />
                <DF label="Data de Validade" value={formatDate(data.id_document_expiry)} />
                <DF label="NIF (Número Fiscal)" value={data.tax_id} />
                <DF label="Segurança Social (INSS)" value={data.social_security_id} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Contactos e Localização</CardTitle><CardDescription>Canais de contacto e residência oficial</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <DF label="Email" value={data.email} />
                <DF label="Telefone" value={data.phone} />
                <DF label="Telefone Alt." value={data.alternative_phone} />
                <DF label="Morada" value={data.address} span={2} />
                <DF label="Código Postal" value={data.postal_code} />
                <DF label="Cidade" value={data.city} />
                <DF label="Província / Estado" value={data.state} />
                <DF label="País" value={data.country} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Contrato */}
        <TabsContent value="contract" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />Contrato de Trabalho Ativo
                  </CardTitle>
                  <CardDescription>Termos jurídicos, remuneração e vigência</CardDescription>
                </div>
                {data.active_contract?.is_active && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-8 gap-1.5"
                    onClick={() => {
                      setDeactivateContractForm({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
                      setIsDeactivateContractOpen(true)
                    }}
                  >
                    <PowerOff className="h-3.5 w-3.5" />Desativar Contrato
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {data.active_contract ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DF label="Tipo de Contrato" value={contractTypeLabels[data.active_contract.contract_type] ?? data.active_contract.contract_type} highlight />
                      <DF label="Salário Base" value={formatCurrency(data.active_contract.base_salary)} highlight />
                      <DF label="Periodicidade" value={salaryFrequencyLabels[data.active_contract.salary_frequency] ?? data.active_contract.salary_frequency} />
                      <DF label="Carga Horária Semanal" value={data.active_contract.work_hours_per_week ? `${data.active_contract.work_hours_per_week}h/semana` : null} />
                      <DF label="Início" value={formatDate(data.active_contract.start_date)} />
                      <DF label="Término" value={data.active_contract.end_date ? formatDate(data.active_contract.end_date) : 'Indeterminado'} />
                      <DF label="Assinatura" value={formatDate(data.active_contract.signed_at)} />
                      <div>
                        <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">Situação</p>
                        <div className="mt-1 flex items-center gap-2">
                          {data.active_contract.is_active ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDeactivateContractForm({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
                                setIsDeactivateContractOpen(true)
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group"
                              title="Clique para desativar este contrato"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Contrato Vigente
                              <PowerOff className="h-3 w-3 opacity-60 group-hover:opacity-100 ml-1 text-destructive" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                              Inativo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {data.active_contract.notes && <div className="rounded-lg bg-muted/40 p-3 text-xs border border-border/60"><p className="font-semibold mb-1">Notas:</p><p className="text-muted-foreground">{data.active_contract.notes}</p></div>}
                    {(data.active_contract.document_url || data.active_contract.document_path) && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0"><FileText className="h-5 w-5 text-primary shrink-0" /><div><p className="text-xs font-semibold">Contrato Digitalizado</p><p className="text-[11px] text-muted-foreground">Cloudinary</p></div></div>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleDownload(data.active_contract?.document_url ?? data.active_contract?.document_path, `Contrato_${data.full_name.replace(/\s+/g, '_')}.pdf`)}><Download className="h-3.5 w-3.5" />Baixar</Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild><a href={data.active_contract.document_url ?? data.active_contract.document_path ?? '#'} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (<div className="py-8 text-center text-sm text-muted-foreground"><Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />Nenhum contrato ativo.</div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Enquadramento Organizacional</CardTitle><CardDescription>Lotação funcional e hierarquia</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label="Departamento" value={data.department?.name} highlight />
                <DF label="Cargo / Função" value={data.position?.title} highlight />
                <DF label="Gestor Direto" value={data.manager?.full_name} />
                <DF label="Estado" value={statusLabels[data.status] ?? data.status} />
                <DF label="Data de Admissão" value={formatDate(data.hired_at)} />
                <DF label="Fim do Probatório" value={formatDate(data.probation_end)} />
                {data.termination_at && (<><DF label="Data de Saída" value={formatDate(data.termination_at)} /><DF label="Motivo de Rescisão" value={data.termination_reason} /></>)}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Documentos */}
        <TabsContent value="documents" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Documentos e Anexos Digitais{(documents ?? []).length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{documents!.length} ficheiros</Badge>}</CardTitle>
                  <CardDescription>Armazenados com segurança no Cloudinary</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5" onClick={() => setIsUploadOpen(true)}><Plus className="h-4 w-4" />Adicionar Documento</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-3"><Upload className="h-8 w-8 text-primary" /></div>
                  <p className="text-sm font-semibold">Sem documentos anexados</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">Carregue B.I., contratos, certificados ou atestados médicos.</p>
                  <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setIsUploadOpen(true)}><Plus className="h-3.5 w-3.5" />Carregar Documento</Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {documents.map((doc) => {
                    const isImg = isImage(doc.mime_type), isPd = isPdf(doc.mime_type), isDl = downloadingId === doc.id
                    return (
                      <div key={doc.id} className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all">
                        <div>
                          <div className="flex items-start gap-3">
                            <div className="shrink-0">
                              {isImg && doc.file_url ? (<img src={doc.file_url} alt={doc.name} className="h-12 w-12 rounded-lg object-cover border border-border cursor-pointer" onClick={() => setPreviewDoc(doc)} />)
                                : (<div className={`flex h-12 w-12 items-center justify-center rounded-lg cursor-pointer ${isPd ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`} onClick={() => (isImg || isPd) && setPreviewDoc(doc)}>{isPd ? <FileText className="h-6 w-6" /> : <FileCheck className="h-6 w-6" />}</div>)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary" title={doc.name} onClick={() => (isImg || isPd) && setPreviewDoc(doc)}>{doc.name}</p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{docTypeLabels[doc.document_type] ?? doc.document_type}</p>
                              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                                {doc.size_label && <span>{doc.size_label}</span>}
                                {doc.created_at && (<><span>·</span><span>{formatDate(doc.created_at)}</span></>)}
                              </div>
                            </div>
                          </div>
                          {(doc.is_expired || doc.is_expiring) && (<div className="mt-2.5">{doc.is_expired ? (<Badge variant="destructive" className="text-[10px] py-0 px-2 gap-1"><AlertCircle className="h-3 w-3" />Expirou {formatDate(doc.expiry_date)}</Badge>) : (<Badge variant="secondary" className="bg-amber-500/15 text-amber-600 text-[10px] py-0 px-2 gap-1"><Clock className="h-3 w-3" />Expira {formatDate(doc.expiry_date)}</Badge>)}</div>)}
                          {doc.notes && <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">{doc.notes}</p>}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-1">
                          {(isImg || isPd) ? (<Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setPreviewDoc(doc)}><Eye className="mr-1 h-3.5 w-3.5" />Ver</Button>) : (<span className="text-xs text-muted-foreground">Ficheiro</span>)}
                          <div className="flex items-center gap-1">
                            {doc.file_url && (<Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" disabled={isDl} onClick={() => handleDownload(doc.file_url, doc.original_name ?? doc.name, doc.id)}>{isDl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-primary" />}Baixar</Button>)}
                            {doc.file_url && (<Button size="icon-sm" variant="ghost" className="h-8 w-8" asChild><a href={doc.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>)}
                            <Button size="icon-sm" variant="ghost" className="h-8 w-8 hover:text-destructive" disabled={deleteDoc.isPending} onClick={() => { if (window.confirm(`Eliminar "${doc.name}"?`)) deleteDoc.mutate(doc.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Presença */}
        <TabsContent value="attendance" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className={`p-4 flex items-center gap-3 border-2 ${isClockedIn ? 'border-emerald-500/40 bg-emerald-500/5' : isClockedOut ? 'border-blue-500/40 bg-blue-500/5' : 'border-border'}`}>
              <div className={`rounded-lg p-2.5 ${isClockedIn ? 'bg-emerald-500/15 text-emerald-600' : isClockedOut ? 'bg-blue-500/15 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                {isClockedOut ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">Estado Hoje</p>
                <p className="text-sm font-bold text-foreground">{isClockedIn ? 'Em Trabalho' : isClockedOut ? 'Jornada Concluída' : 'Sem Registo'}</p>
                {todayAttendance?.clock_in && <p className="text-[11px] text-muted-foreground font-mono">Entrada: {formatTime(todayAttendance.clock_in)}{todayAttendance.clock_out && ` · Saída: ${formatTime(todayAttendance.clock_out)}`}</p>}
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Dias Trabalhados</p><p className="text-2xl font-bold text-foreground">{worked}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Atrasos</p><p className="text-2xl font-bold text-foreground">{lateCount}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-red-500/10 p-2.5 text-red-600"><AlertCircle className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Faltas</p><p className="text-2xl font-bold text-foreground">{absent}</p><p className="text-[11px] text-muted-foreground">{formatMinutes(totalMins)} total</p></div></Card>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary" />Histórico de Presenças</CardTitle><CardDescription>Registos de entrada, saída e assiduidade</CardDescription></div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={isClockedIn ? 'secondary' : isClockedOut ? 'outline' : 'default'}
                    className="gap-1.5"
                    onClick={() => toggleAttendance.mutate()}
                    disabled={toggleAttendance.isPending || isClockedOut}
                  >
                    {toggleAttendance.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isClockedIn ? (
                      <Activity className="h-3.5 w-3.5" />
                    ) : isClockedOut ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5" />
                    )}
                    {isClockedIn ? 'Registar Saída' : isClockedOut ? 'Jornada Concluída' : 'Registar Entrada'}
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => setIsManualAttOpen(true)}><Plus className="h-4 w-4" />Registo Manual</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {attRecords.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm"><UserCheck className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">Sem registos de presença</p></div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50"><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Data</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Entrada</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Saída</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Total</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Estado</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {attRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs">{formatDate(rec.date)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatTime(rec.clock_in)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatTime(rec.clock_out)}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatMinutes(rec.total_worked)}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] font-medium ${attendanceStatusColors[rec.status] ?? ''}`}>{attendanceStatusLabels[rec.status] ?? rec.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Ausências & Férias */}
        <TabsContent value="leaves" className="mt-6 space-y-6">
          {leaveBalance && (
            <div className="grid gap-4 sm:grid-cols-4">
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-600"><Calendar className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Direito Anual (LGT)</p><p className="text-2xl font-bold text-foreground">{leaveBalance.annual_entitlement}<span className="text-sm font-normal text-muted-foreground ml-1">dias</span></p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Dias Gozados</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_used}</p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><BedDouble className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Dias Restantes</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_remaining}</p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">Pendentes</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_pending}</p></div></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><CardTitle className="text-base flex items-center gap-2"><BedDouble className="h-4 w-4 text-primary" />Registo de Ausências, Folgas & Férias</CardTitle><CardDescription>Nos termos da Lei Geral do Trabalho (LGT) angolana</CardDescription></div>
                <Button size="sm" className="gap-1.5" onClick={() => setIsLeaveOpen(true)}><Plus className="h-4 w-4" />Lançar Ausência / Férias</Button>
              </div>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm"><BedDouble className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">Sem ausências ou férias registadas</p></div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-muted/50"><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tipo</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Início</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Fim</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Dias</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Estado</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {leaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3"><p className="font-medium text-foreground">{leave.leave_type?.name ?? `#${leave.leave_type_id}`}</p>{leave.reason && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{leave.reason}</p>}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatDate(leave.start_date)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatDate(leave.end_date)}</td>
                          <td className="px-4 py-3 font-bold text-xs">{leave.total_days}d</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] font-medium ${leaveStatusColors[leave.status] ?? ''}`}>{leaveStatusLabels[leave.status] ?? leave.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Turno */}
        <TabsContent value="shift" className="mt-6 space-y-6">
          <Card className={`border-2 ${activeShift ? 'border-primary/30 bg-primary/3' : 'border-border'}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" />Turno Atualmente Vinculado</CardTitle><CardDescription>Horário de trabalho ativo</CardDescription></div>
                <Button size="sm" className="gap-1.5" onClick={() => setIsShiftOpen(true)}><RotateCcw className="h-4 w-4" />{activeShift ? 'Alterar Turno' : 'Vincular Turno'}</Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeShift ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: activeShift.color ? `${activeShift.color}22` : undefined, color: activeShift.color ?? undefined }}>
                      {activeShift.is_night_shift ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                    </span>
                    <div><p className="font-bold text-lg text-foreground">{activeShift.name}</p>{activeShift.code && <p className="text-xs text-muted-foreground font-mono">{activeShift.code}</p>}</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Entrada</p><p className="text-xl font-bold font-mono text-foreground">{activeShift.start_time}</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Saída</p><p className="text-xl font-bold font-mono text-foreground">{activeShift.end_time}</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Horas/Dia</p><p className="text-xl font-bold text-foreground">{activeShift.work_hours}h</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Tipo</p><p className="text-sm font-bold text-foreground">{activeShift.is_night_shift ? 'Noturno' : 'Diurno'}</p></div>
                  </div>
                  {data.active_schedule?.effective_from && <p className="text-xs text-muted-foreground">Vigente desde: <span className="font-mono font-medium">{formatDate(data.active_schedule.effective_from)}</span>{data.active_schedule.effective_to && ` → ${formatDate(data.active_schedule.effective_to)}`}</p>}
                  {data.active_schedule?.notes && <p className="text-xs text-muted-foreground italic">{data.active_schedule.notes}</p>}
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <RotateCcw className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">Sem turno vinculado</p>
                  <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setIsShiftOpen(true)}><Plus className="h-3.5 w-3.5" />Vincular Turno</Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />Histórico de Turnos</CardTitle><CardDescription>Todos os turnos atribuídos</CardDescription></CardHeader>
            <CardContent>
              {!scheduleHistory || scheduleHistory.data.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">Nenhum histórico de turnos disponível.</p>) : (
                <div className="space-y-2">
                  {scheduleHistory.data.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.shift?.color ?? 'var(--primary)' }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.shift?.name ?? `Turno #${s.shift_id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.effective_from} {s.effective_to ? `→ ${s.effective_to}` : '(atual)'}</p>
                          {s.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{s.notes}</p>}
                        </div>
                      </div>
                      <Badge variant={s.is_active ? 'success' : 'secondary'} className="text-[10px]">{s.is_active ? 'Ativo' : 'Anterior'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="history" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />Linha do Tempo</CardTitle><CardDescription>Acontecimentos e alterações de carreira</CardDescription></CardHeader>
            <CardContent>
              {timeline && timeline.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {timeline.map((entry, idx) => (<div key={idx} className="relative"><div className="absolute -left-[19px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" /><div><p className="text-sm font-semibold text-foreground">{entry.title}</p><p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p><span className="inline-block mt-1 text-[11px] font-mono text-muted-foreground/80">{formatDate(entry.date)}</span></div></div>))}
                </div>
              ) : (<div className="py-8 text-center text-sm text-muted-foreground">Sem histórico registado.</div>)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODALS */}

      {/* Upload Documento */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" />Adicionar Documento</DialogTitle><DialogDescription>Ficheiro guardado no Cloudinary associado a {data.full_name}.</DialogDescription></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); uploadMutation.mutate() }} className="space-y-4 py-2">
            <div><Label className="text-xs font-semibold">Ficheiro <span className="text-destructive">*</span></Label><Input type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="mt-1.5" onChange={(e) => { const f = e.target.files?.[0] || null; setUploadFile(f); if (f && !uploadFormData.name) setUploadFormData((p) => ({ ...p, name: f.name.replace(/\.[^/.]+$/, '') })) }} /></div>
            <div><Label className="text-xs font-semibold">Nome <span className="text-destructive">*</span></Label><Input required value={uploadFormData.name} onChange={(e) => setUploadFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Nome do documento" className="mt-1.5" /></div>
            <div><Label className="text-xs font-semibold">Tipo <span className="text-destructive">*</span></Label><Select value={uploadFormData.document_type} onValueChange={(v) => setUploadFormData((p) => ({ ...p, document_type: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(docTypeLabels).map(([k, l]) => (<SelectItem key={k} value={k}>{l}</SelectItem>))}</SelectContent></Select></div>
            <div><Label className="text-xs font-semibold">Validade (Opcional)</Label><Input type="date" value={uploadFormData.expiry_date} onChange={(e) => setUploadFormData((p) => ({ ...p, expiry_date: e.target.value }))} className="mt-1.5" /></div>
            <div><Label className="text-xs font-semibold">Notas (Opcional)</Label><Input value={uploadFormData.notes} onChange={(e) => setUploadFormData((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas..." className="mt-1.5" /></div>
            <DialogFooter><Button type="button" variant="outline" size="sm" onClick={() => setIsUploadOpen(false)} disabled={uploadMutation.isPending}>Cancelar</Button><Button type="submit" size="sm" disabled={uploadMutation.isPending || !uploadFile}>{uploadMutation.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />A carregar...</> : <><Upload className="mr-1.5 h-4 w-4" />Guardar</>}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visualizar Documento */}
      <Dialog open={!!previewDoc} onOpenChange={(o) => !o && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border/70 pr-12"><DialogTitle className="truncate text-base font-semibold">{previewDoc?.name}</DialogTitle><DialogDescription className="mt-1 text-xs text-muted-foreground">{docTypeLabels[previewDoc?.document_type ?? ''] ?? previewDoc?.document_type}{previewDoc?.size_label && ` · ${previewDoc.size_label}`}</DialogDescription></div>
          <div className="flex-1 min-h-0 overflow-auto bg-black/5 dark:bg-black/40 p-4 flex items-center justify-center">
            {previewDoc && isImage(previewDoc.mime_type) && previewDoc.file_url && (<img src={previewDoc.file_url} alt={previewDoc.name} className="max-h-full max-w-full rounded-md object-contain shadow-sm" />)}
            {previewDoc && isPdf(previewDoc.mime_type) && previewDoc.file_url && (<iframe src={previewDoc.file_url} title={previewDoc.name} className="w-full h-full min-h-[300px] rounded-md border border-border/60 bg-white" />)}
            {previewDoc && !isImage(previewDoc.mime_type) && !isPdf(previewDoc.mime_type) && (<div className="text-center p-8"><FileCheck className="h-12 w-12 text-primary mx-auto mb-2" /><p className="text-sm font-semibold">Pré-visualização não disponível</p><p className="text-xs text-muted-foreground mt-1">Descarregue para visualizar.</p></div>)}
          </div>
          <div className="shrink-0 px-6 py-3.5 border-t border-border bg-card/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <Button variant="destructive" size="sm" disabled={deleteDoc.isPending} onClick={() => { if (previewDoc && window.confirm(`Eliminar "${previewDoc.name}"?`)) deleteDoc.mutate(previewDoc.id) }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar</Button>
            <div className="flex items-center gap-2">
              {previewDoc?.file_url && (<><Button variant="default" size="sm" className="gap-1.5" disabled={downloadingId === previewDoc.id} onClick={() => handleDownload(previewDoc.file_url, previewDoc.original_name ?? previewDoc.name, previewDoc.id)}>{downloadingId === previewDoc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Descarregar</Button><Button variant="outline" size="sm" asChild><a href={previewDoc.file_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir</a></Button></>)}
              <Button variant="secondary" size="sm" onClick={() => setPreviewDoc(null)}>Fechar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registo Manual de Presença */}
      <Dialog open={isManualAttOpen} onOpenChange={setIsManualAttOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />Registo Manual de Presença
            </DialogTitle>
            <DialogDescription>Registe a presença de {data.first_name} para dias sem jornada fechada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Data <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                max={todayStr}
                className="mt-1.5"
                value={manualAttForm.date}
                onChange={(e) => setManualAttForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            {isManualDateFuture && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Data Futura Não Permitida</p>
                  <p className="mt-0.5">Não é permitido registar presenças para datas futuras.</p>
                </div>
              </div>
            )}

            {isManualDateClosed && !isManualDateFuture && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Jornada Já Fechada</p>
                  <p className="mt-0.5">
                    A jornada de {formatDate(manualAttForm.date)} já se encontra concluída (Entrada: {formatTime(selectedManualRecord?.clock_in)} · Saída: {formatTime(selectedManualRecord?.clock_out)}). Não é permitido registar nova presença para esta data.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Hora de Entrada</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  disabled={isManualDateClosed || isManualDateFuture}
                  value={manualAttForm.clock_in}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, clock_in: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Hora de Saída</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  disabled={isManualDateClosed || isManualDateFuture}
                  value={manualAttForm.clock_out}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, clock_out: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Estado <span className="text-destructive">*</span></Label>
              <Select
                value={manualAttForm.status}
                disabled={isManualDateClosed || isManualDateFuture}
                onValueChange={(v) => setManualAttForm((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Presente</SelectItem>
                  <SelectItem value="late">Atrasado</SelectItem>
                  <SelectItem value="absent">Falta</SelectItem>
                  <SelectItem value="half_day">Meio Dia</SelectItem>
                  <SelectItem value="excused">Justificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Observações</Label>
              <Input
                className="mt-1.5"
                disabled={isManualDateClosed || isManualDateFuture}
                placeholder="Motivo ou notas..."
                value={manualAttForm.notes}
                onChange={(e) => setManualAttForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsManualAttOpen(false)} disabled={manualAttMutation.isPending}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => manualAttMutation.mutate()}
              disabled={manualAttMutation.isPending || isManualDateClosed || isManualDateFuture}
            >
              {manualAttMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lançar Ausência / Férias */}
      <Dialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5 text-primary" />Lançar Ausência / Folga / Férias</DialogTitle><DialogDescription>Registe ausência para {data.first_name} nos termos da LGT angolana.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs font-semibold">Tipo de Ausência (LGT) <span className="text-destructive">*</span></Label><Select value={leaveForm.leave_type_id} onValueChange={(v) => setLeaveForm((p) => ({ ...p, leave_type_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger><SelectContent>{(leaveTypes ?? []).map((lt) => (<SelectItem key={lt.id} value={String(lt.id)}>{lt.name}{lt.days_per_year ? ` (até ${lt.days_per_year}d)` : ''} · {lt.is_paid ? 'Remunerado' : 'Não Remunerado'}</SelectItem>))}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs font-semibold">Data de Início <span className="text-destructive">*</span></Label><Input type="date" className="mt-1.5" value={leaveForm.start_date} onChange={(e) => setLeaveForm((p) => ({ ...p, start_date: e.target.value }))} /></div>
              <div><Label className="text-xs font-semibold">Data de Fim <span className="text-destructive">*</span></Label><Input type="date" className="mt-1.5" value={leaveForm.end_date} onChange={(e) => setLeaveForm((p) => ({ ...p, end_date: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs font-semibold">Estado</Label><Select value={leaveForm.status} onValueChange={(v) => setLeaveForm((p) => ({ ...p, status: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">Aprovado (direto)</SelectItem><SelectItem value="pending">Pendente (para aprovação)</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs font-semibold">Motivo / Observações</Label><Input className="mt-1.5" placeholder="Justificação..." value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setIsLeaveOpen(false)} disabled={leaveMutation.isPending}>Cancelar</Button><Button size="sm" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending || !leaveForm.leave_type_id}>{leaveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Registar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular / Alterar Turno */}
      <Dialog open={isShiftOpen} onOpenChange={setIsShiftOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" />{activeShift ? 'Alterar Turno' : 'Vincular Turno'}</DialogTitle><DialogDescription>Atribua um turno a {data.first_name}. O turno anterior será automaticamente desativado.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs font-semibold">Turno <span className="text-destructive">*</span></Label><Select value={shiftForm.shift_id} onValueChange={(v) => setShiftForm((p) => ({ ...p, shift_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o turno..." /></SelectTrigger><SelectContent>{(shiftsData?.data ?? []).filter((s) => s.is_active).map((s) => (<SelectItem key={s.id} value={String(s.id)}><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color ?? 'var(--primary)' }} />{s.name} · {s.start_time}–{s.end_time} ({s.work_hours}h){s.is_night_shift && ' 🌙'}</div></SelectItem>))}</SelectContent></Select></div>
            <div><Label className="text-xs font-semibold">Vigente a Partir de <span className="text-destructive">*</span></Label><Input type="date" className="mt-1.5" value={shiftForm.effective_from} onChange={(e) => setShiftForm((p) => ({ ...p, effective_from: e.target.value }))} /></div>
            <div><Label className="text-xs font-semibold">Observações (Opcional)</Label><Input className="mt-1.5" placeholder="Motivo da alteração..." value={shiftForm.notes} onChange={(e) => setShiftForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setIsShiftOpen(false)} disabled={shiftMutation.isPending}>Cancelar</Button><Button size="sm" onClick={() => shiftMutation.mutate()} disabled={shiftMutation.isPending || !shiftForm.shift_id}>{shiftMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{activeShift ? 'Alterar' : 'Vincular'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desativar Contrato */}
      <Dialog open={isDeactivateContractOpen} onOpenChange={setIsDeactivateContractOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <PowerOff className="h-5 w-5" />Desativar Contrato de Trabalho
            </DialogTitle>
            <DialogDescription>
              Registe a rescisão ou encerramento do contrato de {data.full_name}. Esta ação marcará o contrato e o funcionário como inativos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Data de Efeito / Término <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                className="mt-1.5"
                value={deactivateContractForm.end_date}
                onChange={(e) => setDeactivateContractForm((p) => ({ ...p, end_date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Motivo da Desativação / Rescisão <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1.5"
                placeholder="Ex.: Rescisão por mútuo acordo, termo do prazo, despedimento..."
                value={deactivateContractForm.reason}
                onChange={(e) => setDeactivateContractForm((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDeactivateContractOpen(false)} disabled={deactivateContractMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deactivateContractMutation.mutate()}
              disabled={deactivateContractMutation.isPending || !deactivateContractForm.reason.trim()}
            >
              {deactivateContractMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PowerOff className="mr-1.5 h-4 w-4" />}
              Confirmar Desativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DF({ label, value, span, highlight }: { label: string; value?: string | number | null; span?: number; highlight?: boolean }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : ''}>
      <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${highlight ? 'font-semibold text-primary' : 'font-medium text-foreground'} ${!value ? 'text-muted-foreground/60' : ''}`}>{value ?? '—'}</p>
    </div>
  )
}

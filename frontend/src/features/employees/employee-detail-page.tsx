import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, FileText, Briefcase, Trash2, Eye,
  Download, Plus, Upload, ExternalLink, FileCheck, AlertCircle, Building2, User,
  CreditCard, Clock, CheckCircle2, DollarSign, Loader2, Sun, Moon, UserCheck,
  Activity, RotateCcw, ChevronRight, Save, BedDouble, PowerOff, Pencil, UploadCloud, X, FileWarning, FileDown, ZoomIn, ZoomOut,
} from 'lucide-react'
import { api, getApiErrorMessage } from '@/lib/api'
import { compressImageIfNeeded } from '@/lib/file-upload'
import { PdfLanguageDialog, usePdfLanguagePrompt, type PdfLanguage } from '@/components/shared/pdf-language-dialog'
import { formatMinutesToHours } from '@/lib/format'
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
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingState, ErrorState } from '@/components/shared/page-header'
import { useAuthStore, hasAnyRole, hasFieldPermission, hasPermission } from '@/stores/auth-store'
import { toast } from 'sonner'
import type { Department, Employee, EmployeeContract, EmployeeDocument, AttendanceRecord, LeaveRequest, Paginated, Position } from '@/types'
import { LeaveDocumentActions } from '@/features/leave/leave-document-actions'
import { LeaveTypeCreateDialog } from '@/features/leave/leave-type-create-dialog'
import { EmployeeEditDialog } from '@/features/employees/employee-edit-dialog'
import { EmployeePayrollTab } from '@/features/employees/employee-payroll-tab'
import { EmployeeEducationTab } from '@/features/employees/components/employee-education-tab'

const statusColors: Record<string, string> = { active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', inactive: 'bg-muted text-muted-foreground border-border', on_leave: 'bg-blue-500/10 text-blue-600 border-blue-500/20', probation: 'bg-amber-500/10 text-amber-600 border-amber-500/20', suspended: 'bg-rose-500/10 text-rose-600 border-rose-500/20', terminated: 'bg-red-500/10 text-red-600 border-red-500/20' }
const attendanceStatusColors: Record<string, string> = { present: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', late: 'bg-amber-500/10 text-amber-600 border-amber-500/20', absent: 'bg-red-500/10 text-red-600 border-red-500/20', half_day: 'bg-blue-500/10 text-blue-600 border-blue-500/20', excused: 'bg-gray-500/10 text-gray-600 border-gray-500/20', justified: 'bg-gray-500/10 text-gray-600 border-gray-500/20', vacation: 'bg-sky-500/10 text-sky-600 border-sky-500/20', sick: 'bg-rose-500/10 text-rose-600 border-rose-500/20' }
const leaveStatusColors: Record<string, string> = { pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20', approved: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', rejected: 'bg-red-500/10 text-red-600 border-red-500/20', cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/20', draft: 'bg-muted text-muted-foreground border-border' }

interface LeaveType { id: number; name: string; code: string; days_per_year?: number; is_paid: boolean }
interface Shift { id: number; name: string; code?: string | null; start_time: string; end_time: string; break_minutes: number; work_hours: number; late_tolerance_minutes: number; working_days?: number[]; color?: string | null; is_night_shift: boolean; is_active: boolean; notes?: string | null }
interface EmployeeScheduleRecord { id: number; employee_id: number; shift_id: number; effective_from?: string; effective_to?: string | null; custom_days?: number[] | null; is_active: boolean; notes?: string | null; shift?: { id: number; name: string; code?: string | null; start_time: string; end_time: string; color?: string | null; working_days?: number[] } }

interface ContractFormState {
  contract_type: string
  position_id: string
  department_id: string
  manager_id: string
  base_salary: string
  salary_frequency: string
  work_hours_per_week: string
  start_date: string
  end_date: string
  signed_at: string
  notes: string
}

export function EmployeeDetailPage() {
  const { t, i18n } = useTranslation()
  const statusLabels: Record<string, string> = Object.fromEntries(
    ['active', 'inactive', 'on_leave', 'probation', 'suspended', 'terminated'].map((key) => [key, t(`employeeDetail.status.${key}`)]),
  )
  const genderLabels: Record<string, string> = Object.fromEntries(
    ['male', 'female', 'other'].map((key) => [key, t(`employeeDetail.gender.${key}`)]),
  )
  const maritalStatusLabels: Record<string, string> = Object.fromEntries(
    ['single', 'married', 'divorced', 'widowed', 'separated'].map((key) => [key, t(`employeeDetail.maritalStatus.${key}`)]),
  )
  const idDocumentTypeLabels: Record<string, string> = Object.fromEntries(
    ['national_id', 'bi', 'passport', 'driver_license', 'residence_permit', 'other'].map((key) => [key, t(`employeeDetail.idDocumentType.${key}`)]),
  )
  const contractTypeLabels: Record<string, string> = Object.fromEntries(
    ['permanent', 'fixed_term', 'part_time', 'internship', 'temporary', 'contractor'].map((key) => [key, t(`employeeDetail.contractType.${key}`)]),
  )
  const salaryFrequencyLabels: Record<string, string> = Object.fromEntries(
    ['monthly', 'biweekly', 'weekly', 'hourly', 'yearly'].map((key) => [key, t(`employeeDetail.salaryFrequency.${key}`)]),
  )
  const docTypeLabels: Record<string, string> = Object.fromEntries(
    ['id_card_front', 'id_card_back', 'id_document', 'contract', 'contract_doc', 'contract_pdf', 'certificate', 'education_certificate', 'professional_cert', 'inefop_certificate', 'driving_license', 'residence_certificate', 'criminal_record', 'tax_id', 'tax_form', 'resume', 'medical', 'other'].map((key) => [key, t(`employeeDetail.documentType.${key}`)]),
  )
  const attendanceStatusLabels: Record<string, string> = Object.fromEntries(
    ['present', 'absent', 'late', 'half_day', 'holiday', 'vacation', 'sick', 'justified', 'excused'].map((key) => [key, t(`employeeDetail.attendanceStatus.${key}`)]),
  )
  const leaveStatusLabels: Record<string, string> = Object.fromEntries(
    ['pending', 'approved', 'rejected', 'cancelled', 'draft'].map((key) => [key, t(`employeeDetail.leaveStatus.${key}`)]),
  )
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'personal'
  const user = useAuthStore((s) => s.user)
  const currency = user?.tenant?.currency ?? 'AOA'
  const canViewEmployeeSalary = hasFieldPermission(user, 'employee', 'salary', 'view')
    || hasFieldPermission(user, 'contract', 'base_salary', 'view')
  const canEditEmployeeSalary = hasFieldPermission(user, 'employee', 'salary', 'edit')
  const canManageLeaveTypes = hasAnyRole(user, ['super-admin', 'admin', 'hr-manager']) || hasPermission(user, 'manage_leave_types')
  const canViewPayroll = canViewEmployeeSalary && (
    hasPermission(user, 'view_any_payroll')
    || hasPermission(user, 'view_any_deduction')
    || hasPermission(user, 'create_deduction')
    || hasPermission(user, 'update_employee')
  )
  const canViewDeductions = hasPermission(user, 'view_any_deduction')
  const canManageAllowances = canEditEmployeeSalary && hasPermission(user, 'update_employee')
  const canManageDeductions = hasPermission(user, 'create_deduction')
  const canCreateContracts = hasPermission(user, 'create_contract')
  const canUpdateContracts = hasPermission(user, 'update_contract')
  const canUpdateLeaves = hasPermission(user, 'update_leave')
  const canApproveEmployee = hasPermission(user, 'approve_employee') || hasPermission(user, 'update_employee')
  const canVerifyDocuments = hasPermission(user, 'approve_document') || hasPermission(user, 'update_document') || canApproveEmployee
  const locale = i18n.language || 'pt-PT'
  const qc = useQueryClient()

  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadFormData, setUploadFormData] = useState({ name: '', document_type: 'other', expiry_date: '', notes: '' })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isDraggingDoc, setIsDraggingDoc] = useState(false)
  const docFileInputRef = useRef<HTMLInputElement>(null)
  const uploadFilePreviewUrl = useMemo(() => {
    if (!uploadFile || !uploadFile.type.startsWith('image/')) return null
    return URL.createObjectURL(uploadFile)
  }, [uploadFile])

  useEffect(() => {
    return () => {
      if (uploadFilePreviewUrl) URL.revokeObjectURL(uploadFilePreviewUrl)
    }
  }, [uploadFilePreviewUrl])

  const selectDocumentFile = (file: File | null) => {
    setUploadFile(file)
    if (file && !uploadFormData.name.trim()) {
      setUploadFormData((p) => ({ ...p, name: file.name.replace(/\.[^/.]+$/, '') }))
    }
    if (!file && docFileInputRef.current) {
      docFileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }
  const [isManualAttOpen, setIsManualAttOpen] = useState(false)
  const [manualAttRecordId, setManualAttRecordId] = useState<number | null>(null)
  const [manualAttForm, setManualAttForm] = useState({ date: new Date().toISOString().slice(0, 10), shift_id: '', clock_in: '', clock_out: '', status: 'present', deduct_from_salary: false, notes: '' })
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null)
  const [isDownloadingLeavePdf, setIsDownloadingLeavePdf] = useState(false)
  const leavePdfPrompt = usePdfLanguagePrompt()
  const [isEmployeeEditOpen, setIsEmployeeEditOpen] = useState(false)
  const [attendanceShiftId, setAttendanceShiftId] = useState('')
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: '',
    occurrence_type: 'absence',
    notice_type: 'anticipated',
    is_justified: false,
    deduct_from_salary: false,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    reason: '',
    status: 'approved',
    signed_document: null as File | null,
  })
  const [isShiftOpen, setIsShiftOpen] = useState(false)
  const [shiftForm, setShiftForm] = useState({
    shift_id: '',
    period_mode: 'continuous' as 'continuous' | 'daily' | 'weekly' | 'monthly' | 'custom',
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    month: new Date().toISOString().slice(0, 7),
    replace_previous: true,
    notes: '',
  })
  const [isDeactivateContractOpen, setIsDeactivateContractOpen] = useState(false)
  const [deactivateContractForm, setDeactivateContractForm] = useState({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<EmployeeContract | null>(null)
  const [contractDocument, setContractDocument] = useState<File | null>(null)
  const [contractForm, setContractForm] = useState<ContractFormState>({
    contract_type: 'permanent',
    position_id: '',
    department_id: '',
    manager_id: '',
    base_salary: '',
    salary_frequency: 'monthly',
    work_hours_per_week: '40',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    signed_at: '',
    notes: '',
  })
  const todayStr = new Date().toISOString().slice(0, 10)

  const { data, isLoading, isError, refetch } = useQuery<Employee>({ queryKey: ['employees', id], queryFn: () => api.get<Employee>(`employees/${id}`) })
  const { data: timeline } = useQuery({ queryKey: ['employees', id, 'timeline'], queryFn: () => api.get<{ type: string; title: string; date: string; description: string }[]>(`employees/${id}/timeline`) })
  const { data: contracts = [] } = useQuery<EmployeeContract[]>({ queryKey: ['employee-contracts', id], queryFn: () => api.get<EmployeeContract[]>(`employees/${id}/contracts`), enabled: !!id && activeTab === 'contract' })
  const { data: contractPositions } = useQuery<Paginated<Position>>({ queryKey: ['contract-positions'], queryFn: () => api.get<Paginated<Position>>('positions', { per_page: 100 }), enabled: isContractDialogOpen })
  const { data: contractDepartments } = useQuery<Paginated<Department>>({ queryKey: ['contract-departments'], queryFn: () => api.get<Paginated<Department>>('departments', { per_page: 100 }), enabled: isContractDialogOpen })
  const { data: contractManagers } = useQuery<Paginated<{ id: number; full_name: string; employee_code: string }>>({ queryKey: ['contract-managers'], queryFn: () => api.get<Paginated<{ id: number; full_name: string; employee_code: string }>>('employees', { per_page: 200 }), enabled: isContractDialogOpen })
  const { data: documents } = useQuery<EmployeeDocument[]>({ queryKey: ['employee-documents', id], queryFn: () => api.get<{ data: EmployeeDocument[] }>('documents', { employee_id: id, per_page: 100 }).then((res) => (Array.isArray(res) ? res : (res as any).data ?? [])), enabled: !!id })
  const { data: attendanceData, refetch: refetchAttendance } = useQuery<Paginated<AttendanceRecord>>({ queryKey: ['attendance', id], queryFn: () => api.get<Paginated<AttendanceRecord>>('attendance', { employee_id: id, per_page: 50 }), enabled: !!id && activeTab === 'attendance' })
  const { data: todayAttendance, refetch: refetchToday } = useQuery<AttendanceRecord | null>({ queryKey: ['attendance-today', id, attendanceShiftId], queryFn: () => api.get<AttendanceRecord | null>('attendance/today', { employee_id: id, ...(attendanceShiftId ? { shift_id: Number(attendanceShiftId) } : {}) }), enabled: !!id })
  const { data: leaveBalance, refetch: refetchBalance } = useQuery({ queryKey: ['leave-balance', id], queryFn: () => api.get<{ annual_entitlement: number; days_used: number; days_remaining: number; days_pending: number }>('leaves/balance', { employee_id: id }), enabled: !!id && activeTab === 'leaves' })
  const { data: leavesData, refetch: refetchLeaves } = useQuery<Paginated<LeaveRequest>>({ queryKey: ['leaves', id], queryFn: () => api.get<Paginated<LeaveRequest>>('leaves', { employee_id: id, per_page: 50 }), enabled: !!id && activeTab === 'leaves' })
  const { data: leaveTypes } = useQuery<LeaveType[]>({ queryKey: ['leave-types'], queryFn: () => api.get<LeaveType[]>('leaves/types'), enabled: isLeaveOpen })
  const { data: shiftsData } = useQuery<Paginated<Shift>>({ queryKey: ['shifts-all'], queryFn: () => api.get<Paginated<Shift>>('shifts', { per_page: 100 }), enabled: isShiftOpen })
  const { data: scheduleHistory, refetch: refetchSchedule } = useQuery<Paginated<EmployeeScheduleRecord>>({ queryKey: ['employee-schedules-history', id], queryFn: () => api.get<Paginated<EmployeeScheduleRecord>>('employee-schedules', { employee_id: id, per_page: 100 }), enabled: !!id && (activeTab === 'shift' || activeTab === 'attendance' || isManualAttOpen) })
  const attendanceSchedules = (scheduleHistory?.data ?? []).filter((schedule) =>
    schedule.is_active
    && (!schedule.effective_from || schedule.effective_from <= todayStr)
    && (!schedule.effective_to || schedule.effective_to >= todayStr)
    && ((schedule.custom_days ?? schedule.shift?.working_days) == null
      || (schedule.custom_days ?? schedule.shift?.working_days ?? []).includes(new Date(`${todayStr}T00:00:00Z`).getUTCDay()))
    && schedule.shift,
  )

  useEffect(() => {
    if (!attendanceShiftId && attendanceSchedules.length === 1) {
      setAttendanceShiftId(String(attendanceSchedules[0].shift_id))
    }
  }, [scheduleHistory?.data, attendanceShiftId])

  useEffect(() => {
    setAttendanceShiftId('')
  }, [id])

  const attRecords = attendanceData?.data ?? []
  const attendanceByWeek = useMemo(() => {
    const weeks = new Map<string, { start: string; records: AttendanceRecord[]; workedMinutes: number; lateMinutes: number; overtimeMinutes: number }>()
    for (const record of [...attRecords].sort((a, b) => b.date.localeCompare(a.date))) {
      const date = new Date(`${record.date}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
      const weekStart = date.toISOString().slice(0, 10)
      const week = weeks.get(weekStart) ?? { start: weekStart, records: [], workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0 }
      week.records.push(record)
      week.workedMinutes += record.total_worked ?? 0
      week.lateMinutes += record.late_minutes ?? 0
      week.overtimeMinutes += record.overtime_minutes ?? 0
      weeks.set(weekStart, week)
    }
    return [...weeks.values()]
  }, [attRecords])
  const manualSchedules = (scheduleHistory?.data ?? []).filter((schedule) =>
    (schedule.is_active || (manualAttRecordId !== null && schedule.shift_id === Number(manualAttForm.shift_id)))
    && (!schedule.effective_from || schedule.effective_from <= manualAttForm.date)
    && (!schedule.effective_to || schedule.effective_to >= manualAttForm.date)
    && ((schedule.custom_days ?? schedule.shift?.working_days) == null
      || (schedule.custom_days ?? schedule.shift?.working_days ?? []).includes(new Date(`${manualAttForm.date}T00:00:00Z`).getUTCDay()))
    && schedule.shift,
  )
  const manualShiftId = manualAttForm.shift_id || (manualSchedules.length === 1 ? String(manualSchedules[0].shift_id) : '')
  const selectedManualRecord = attRecords.find((r) =>
    r.date === manualAttForm.date
    && (manualShiftId ? r.shift_id === Number(manualShiftId) : !r.shift_id),
  ) || (todayAttendance?.date === manualAttForm.date && (!manualShiftId || todayAttendance.shift_id === Number(manualShiftId)) ? todayAttendance : null)
  const isManualDateFuture = manualAttForm.date > todayStr
  const isManualDateClosed = !manualAttRecordId && !!(selectedManualRecord?.clock_in && selectedManualRecord?.clock_out)

  const deleteDoc = useMutation({ mutationFn: (docId: number) => api.delete(`documents/${docId}`), onSuccess: () => { toast.success(t('employeeDetail.messages.documentDeleted')); setPreviewDoc(null); qc.invalidateQueries({ queryKey: ['employee-documents', id] }); qc.invalidateQueries({ queryKey: ['employees', id] }) }, onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.deleteError'))) })
  const verifyDocMutation = useMutation({
    mutationFn: ({ docId, is_verified }: { docId: number; is_verified: boolean }) =>
      api.patch(`documents/${docId}/verify`, { is_verified }),
    onSuccess: (_res, vars) => {
      toast.success(
        vars.is_verified
          ? t('employeeDetail.messages.documentVerified', { defaultValue: 'Documento verificado e aprovado.' })
          : t('employeeDetail.messages.documentUnverified', { defaultValue: 'Verificação do documento removida.' }),
      )
      qc.invalidateQueries({ queryKey: ['employee-documents', id] })
      qc.invalidateQueries({ queryKey: ['employees', id] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.verifyError', { defaultValue: 'Não foi possível verificar o documento.' }))),
  })
  const approvalMutation = useMutation({
    mutationFn: (approval_status: 'pending' | 'approved') =>
      api.patch(`employees/${id}/approval`, { approval_status }),
    onSuccess: (_res, approval_status) => {
      toast.success(
        approval_status === 'approved'
          ? t('employeeDetail.messages.employeeApproved', { defaultValue: 'Funcionário aprovado e disponível para operações.' })
          : t('employeeDetail.messages.employeeSetPending', { defaultValue: 'Funcionário movido para estado Pendente.' }),
      )
      qc.invalidateQueries({ queryKey: ['employees', id] })
      qc.invalidateQueries({ queryKey: ['employees'] })
      qc.invalidateQueries({ queryKey: ['hr-dashboard'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.approvalError', { defaultValue: 'Não foi possível alterar o estado de aprovação.' }))),
  })
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error(t('employeeDetail.messages.selectFile'))
      const fd = new FormData()
      fd.append('employee_id', id!); fd.append('file', uploadFile); fd.append('name', uploadFormData.name || uploadFile.name); fd.append('document_type', uploadFormData.document_type)
      if (uploadFormData.expiry_date) fd.append('expiry_date', uploadFormData.expiry_date)
      if (uploadFormData.notes) fd.append('notes', uploadFormData.notes)
      return api.post('documents', fd)
    },
    onSuccess: () => { toast.success(t('employeeDetail.messages.documentUploaded')); setIsUploadOpen(false); setUploadFile(null); setUploadFormData({ name: '', document_type: 'other', expiry_date: '', notes: '' }); qc.invalidateQueries({ queryKey: ['employee-documents', id] }) },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.uploadError')))
  })
  const toggleAttendance = useMutation({ mutationFn: () => api.post('attendance/toggle', { employee_id: Number(id), ...(attendanceShiftId ? { shift_id: Number(attendanceShiftId) } : {}) }), onSuccess: (res: any) => { toast.success(res?.message ?? t('employeeDetail.messages.attendanceRecorded')); refetchToday(); refetchAttendance() }, onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.recordError'))) })
  const manualAttMutation = useMutation({
    mutationFn: () => {
      if (manualAttForm.date > todayStr) {
        throw new Error(t('employeeDetail.messages.futureAttendanceError'))
      }
      if (!manualAttRecordId && selectedManualRecord?.clock_in && selectedManualRecord?.clock_out) {
        throw new Error(t('employeeDetail.messages.closedWorkdayError'))
      }
      const attendance = {
        employee_id: Number(id),
        date: manualAttForm.date,
        shift_id: manualShiftId ? Number(manualShiftId) : undefined,
        clock_in: manualAttForm.clock_in || undefined,
        clock_out: manualAttForm.clock_out || undefined,
        status: manualAttForm.status,
        deduct_from_salary: manualAttForm.deduct_from_salary,
        notes: manualAttForm.notes || undefined,
      }
      return manualAttRecordId
        ? api.put(`attendance/${manualAttRecordId}`, attendance)
        : api.post('attendance/manual', attendance)
    },
    onSuccess: () => { toast.success(t('employeeDetail.messages.manualRecordSaved')); setIsManualAttOpen(false); setManualAttRecordId(null); setManualAttForm({ date: new Date().toISOString().slice(0, 10), shift_id: '', clock_in: '', clock_out: '', status: 'present', deduct_from_salary: false, notes: '' }); refetchAttendance(); refetchToday() },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.recordError')))
  })
  const contractMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error(t('employeeDetail.messages.contractSaveError'))
      const payload = {
        ...contractForm,
        position_id: contractForm.position_id ? Number(contractForm.position_id) : null,
        department_id: contractForm.department_id ? Number(contractForm.department_id) : null,
        manager_id: contractForm.manager_id ? Number(contractForm.manager_id) : null,
        base_salary: Number(contractForm.base_salary),
        work_hours_per_week: contractForm.work_hours_per_week ? Number(contractForm.work_hours_per_week) : null,
        end_date: contractForm.end_date || null,
        signed_at: contractForm.signed_at || null,
      }
      if (contractDocument) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, value]) => formData.append(key, value == null ? '' : String(value)))
        formData.append('document', contractDocument)
        if (editingContract) {
          formData.append('_method', 'PUT')
          return api.upload(`contracts/${editingContract.id}`, formData)
        }
        return api.upload(`employees/${id}/contracts`, formData)
      }
      return editingContract
        ? api.put(`contracts/${editingContract.id}`, payload)
        : api.post(`employees/${id}/contracts`, payload)
    },
    onSuccess: () => {
      toast.success(t('employeeDetail.messages.contractSaved'))
      setIsContractDialogOpen(false)
      setEditingContract(null)
      setContractDocument(null)
      qc.invalidateQueries({ queryKey: ['employees', id] })
      qc.invalidateQueries({ queryKey: ['employee-contracts', id] })
      qc.invalidateQueries({ queryKey: ['employee-documents', id] })
      qc.invalidateQueries({ queryKey: ['employees', id, 'timeline'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('employeeDetail.messages.contractSaveError'))),
  })
  const deactivateContractMutation = useMutation({
    mutationFn: () => {
      if (!data?.active_contract?.id) throw new Error(t('employeeDetail.messages.noContractToDeactivate'))
      if (!deactivateContractForm.reason.trim()) throw new Error(t('employeeDetail.messages.reasonRequired'))
      return api.post(`contracts/${data.active_contract.id}/deactivate`, {
        reason: deactivateContractForm.reason,
        end_date: deactivateContractForm.end_date || undefined,
      })
    },
    onSuccess: () => {
      toast.success(t('employeeDetail.messages.contractDeactivated'))
      setIsDeactivateContractOpen(false)
      setDeactivateContractForm({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
      qc.invalidateQueries({ queryKey: ['employees', id] })
      qc.invalidateQueries({ queryKey: ['employees', id, 'timeline'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.deactivateError')))
  })
  const leaveMutation = useMutation({
    mutationFn: async () => {
      if (editingLeave) {
        const updated = await api.put(`leaves/${editingLeave.id}`, {
          leave_type_id: Number(leaveForm.leave_type_id),
          occurrence_type: leaveForm.occurrence_type,
          notice_type: leaveForm.notice_type,
          is_justified: leaveForm.is_justified,
          deduct_from_salary: leaveForm.deduct_from_salary,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason || null,
        })
        if (leaveForm.signed_document) {
          const signedFd = new FormData()
          signedFd.append('document', await compressImageIfNeeded(leaveForm.signed_document))
          await api.upload(`leave/${editingLeave.id}/documents/signed`, signedFd)
        }
        return updated
      }

      const fd = new FormData()
      fd.append('employee_id', String(id))
      fd.append('leave_type_id', String(leaveForm.leave_type_id))
      fd.append('occurrence_type', leaveForm.occurrence_type)
      fd.append('notice_type', leaveForm.notice_type)
      fd.append('is_justified', leaveForm.is_justified ? '1' : '0')
      fd.append('deduct_from_salary', leaveForm.deduct_from_salary ? '1' : '0')
      fd.append('start_date', leaveForm.start_date)
      fd.append('end_date', leaveForm.end_date)
      if (leaveForm.reason) fd.append('reason', leaveForm.reason)
      fd.append('status', leaveForm.status)
      if (leaveForm.signed_document) {
        fd.append('signed_document', await compressImageIfNeeded(leaveForm.signed_document))
      }
      return api.upload('leaves', fd)
    },
    onSuccess: () => {
      toast.success(t(editingLeave ? 'employeeDetail.messages.leaveUpdated' : 'employeeDetail.messages.leaveRecorded'))
      setIsLeaveOpen(false)
      setEditingLeave(null)
      setLeaveForm({ leave_type_id: '', occurrence_type: 'absence', notice_type: 'anticipated', is_justified: false, deduct_from_salary: false, start_date: todayStr, end_date: todayStr, reason: '', status: 'approved', signed_document: null })
      refetchLeaves()
      refetchBalance()
      qc.invalidateQueries({ queryKey: ['leave-requests'] })
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.recordError')))
  })
  const handleDownloadLeaveReceiptPreview = () => {
    leavePdfPrompt.requestPdf(async (lang: PdfLanguage) => {
      setIsDownloadingLeavePdf(true)
      try {
        await api.downloadFilePost(
          'leave/receipt-preview.pdf',
          {
            employee_id: Number(id),
            leave_type_id: leaveForm.leave_type_id ? Number(leaveForm.leave_type_id) : null,
            occurrence_type: leaveForm.occurrence_type,
            notice_type: leaveForm.notice_type,
            is_justified: leaveForm.is_justified,
            deduct_from_salary: leaveForm.deduct_from_salary,
            start_date: leaveForm.start_date,
            end_date: leaveForm.end_date,
            reason: leaveForm.reason || null,
            status: editingLeave?.status ?? leaveForm.status,
            lang,
          },
          `comprovativo-ausencia-${id}.pdf`,
        )
      } catch (e) {
        toast.error(getApiErrorMessage(e, t('leave.receiptDownloadError', { defaultValue: 'Erro ao gerar comprovativo PDF.' })))
      } finally {
        setIsDownloadingLeavePdf(false)
      }
    })
  }
  const resolveShiftDates = () => {
    if (shiftForm.period_mode === 'daily') {
      return { effective_from: shiftForm.effective_from, effective_to: shiftForm.effective_from }
    }
    if (shiftForm.period_mode === 'weekly' && shiftForm.effective_from) {
      const start = new Date(`${shiftForm.effective_from}T00:00:00`)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { effective_from: shiftForm.effective_from, effective_to: end.toISOString().slice(0, 10) }
    }
    if (shiftForm.period_mode === 'monthly' && /^\d{4}-\d{2}$/.test(shiftForm.month)) {
      const [y, m] = shiftForm.month.split('-').map(Number)
      const first = new Date(y, m - 1, 1)
      const last = new Date(y, m, 0)
      const pad = (n: number) => String(n).padStart(2, '0')
      return {
        effective_from: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`,
        effective_to: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`,
      }
    }
    if (shiftForm.period_mode === 'custom') {
      return { effective_from: shiftForm.effective_from, effective_to: shiftForm.effective_to || null }
    }
    return { effective_from: shiftForm.effective_from, effective_to: null }
  }

  const shiftMutation = useMutation({
    mutationFn: () => {
      const { effective_from, effective_to } = resolveShiftDates()
      return api.post('employee-schedules', {
        employee_id: Number(id),
        shift_id: Number(shiftForm.shift_id),
        effective_from,
        effective_to: effective_to ?? undefined,
        replace_previous: shiftForm.replace_previous,
        notes: shiftForm.notes || undefined,
        is_active: true,
      })
    },
    onSuccess: () => {
      toast.success(t('employeeDetail.messages.shiftAssigned'))
      setIsShiftOpen(false)
      setShiftForm({
        shift_id: '',
        period_mode: 'continuous',
        effective_from: new Date().toISOString().slice(0, 10),
        effective_to: '',
        month: new Date().toISOString().slice(0, 7),
        replace_previous: true,
        notes: '',
      })
      qc.invalidateQueries({ queryKey: ['employees', id] })
      refetchSchedule()
    },
    onError: (e) => toast.error(getApiErrorMessage(e, t('employeeDetail.messages.assignShiftError')))
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <ErrorState message={t('employeeDetail.messages.employeeNotFound')} onRetry={refetch} />

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
  const formatMinutes = (m?: number | null) => { const total = m ?? 0; const h = Math.floor(total / 60); const mn = total % 60; return t('employeeDetail.text.durationHoursMinutes', { hours: h, minutes: String(mn).padStart(2, '0') }) }
  const formatCurrency = (a?: number | null) => { if (a == null) return '—'; return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(a) }
  const calculateAge = (b?: string | null) => { if (!b) return null; try { const diff = Date.now() - new Date(b).getTime(); const a = Math.abs(new Date(diff).getUTCFullYear() - 1970); return isNaN(a) ? null : t('employeeDetail.text.ageYears', { count: a }) } catch { return null } }
  const openContractDialog = (contract?: EmployeeContract | null, renew = false) => {
    setEditingContract(renew ? null : contract ?? null)
    setContractDocument(null)
    setContractForm({
      contract_type: contract?.contract_type ?? 'permanent',
      position_id: String(contract?.position_id ?? data.position_id ?? ''),
      department_id: String(contract?.department_id ?? data.department_id ?? ''),
      manager_id: String(contract?.manager_id ?? data.manager_id ?? ''),
      base_salary: contract?.base_salary != null ? String(contract.base_salary) : '',
      salary_frequency: contract?.salary_frequency ?? 'monthly',
      work_hours_per_week: contract?.work_hours_per_week != null ? String(contract.work_hours_per_week) : '40',
      start_date: renew || !contract ? todayStr : contract.start_date,
      end_date: renew ? '' : contract?.end_date ?? '',
      signed_at: renew ? '' : contract?.signed_at ?? '',
      notes: renew ? '' : contract?.notes ?? '',
    })
    setIsContractDialogOpen(true)
  }
  const openLeaveDialog = (leave?: LeaveRequest) => {
    setEditingLeave(leave ?? null)
    setLeaveForm(leave ? {
      leave_type_id: String(leave.leave_type_id),
      occurrence_type: leave.occurrence_type ?? 'absence',
      notice_type: leave.notice_type ?? 'anticipated',
      is_justified: leave.is_justified ?? false,
      deduct_from_salary: leave.deduct_from_salary ?? false,
      start_date: leave.start_date,
      end_date: leave.end_date,
      reason: leave.reason ?? '',
      status: leave.status === 'approved' ? 'approved' : 'pending',
      signed_document: null,
    } : {
      leave_type_id: '',
      occurrence_type: 'absence',
      notice_type: 'anticipated',
      is_justified: false,
      deduct_from_salary: false,
      start_date: todayStr,
      end_date: todayStr,
      reason: '',
      status: 'approved',
      signed_document: null,
    })
    setIsLeaveOpen(true)
  }
  const contractExpired = !!data.active_contract?.end_date && data.active_contract.end_date < todayStr
  const contractNeedsRenewal = !!data.active_contract && (!data.active_contract.is_active || contractExpired)
  const isImage = (m?: string | null) => m?.startsWith('image/') ?? false
  const isPdf = (m?: string | null) => m === 'application/pdf'
  const handleDownload = async (url?: string | null, fileName?: string | null, docId?: number) => {
    if (!url) { toast.error(t('employeeDetail.messages.urlUnavailable')); return }
    const name = fileName || t('employeeDetail.text.unnamedDocument')
    if (docId) setDownloadingId(docId)
    const tid = toast.loading(t('employeeDetail.messages.downloading', { name }))
    try {
      const r = await fetch(url, { mode: 'cors' })
      if (!r.ok) throw new Error('CORS')
      const blob = await r.blob()
      const burl = window.URL.createObjectURL(blob)
      const a = document.createElement('a'); a.style.display = 'none'; a.href = burl; a.download = name; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(burl); document.body.removeChild(a)
      toast.success(t('employeeDetail.messages.downloadComplete'), { id: tid })
    } catch {
      if (url.includes('cloudinary.com') && url.includes('/upload/')) {
        const cn = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_') || 'download'
        const au = url.replace(/\/upload\/(v\d+\/)?/, (_match, version = '') => `/upload/fl_attachment:${cn}/${version}`)
        const a = document.createElement('a'); a.href = au; a.download = name; a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a)
        toast.success(t('employeeDetail.messages.downloadStarted'), { id: tid })
      } else { window.open(url, '_blank'); toast.dismiss(tid) }
    } finally { if (docId) setDownloadingId(null) }
  }

  const age = calculateAge(data.birth_date)
  const activeShift = data.active_schedule?.shift
  const leaves = leavesData?.data ?? []
  const worked = attRecords.filter((r) => r.status === 'present' || r.status === 'late').length
  const lateCount = attRecords.filter((r) => r.status === 'late').length
  const totalLateMinutes = attRecords.reduce((acc, r) => acc + (r.late_minutes ?? 0), 0)
  const lateDurationLabel = t('employeeDetail.text.accumulatedDuration', {
    duration: formatMinutesToHours(totalLateMinutes),
    defaultValue: `${formatMinutesToHours(totalLateMinutes)} acumulados`,
  })
  const overtimeCount = attRecords.filter((r) => (r.overtime_minutes ?? 0) > 0).length
  const totalOvertimeMinutes = attRecords.reduce((acc, r) => acc + (r.overtime_minutes ?? 0), 0)
  const totalOvertimeAmount = attRecords.reduce((acc, r) => acc + (r.overtime_amount ?? 0), 0)
  const overtimeDurationLabel = t('employeeDetail.text.accumulatedDuration', {
    duration: formatMinutesToHours(totalOvertimeMinutes),
    defaultValue: `${formatMinutesToHours(totalOvertimeMinutes)} acumulados`,
  })
  const absent = attRecords.filter((r) => r.status === 'absent').length
  const totalMins = attRecords.reduce((acc, r) => acc + (r.total_worked ?? 0), 0)
  const vacationUsed = leaves.filter((leave) => leave.leave_type?.code === 'vacation' && leave.status === 'approved').reduce((acc, leave) => acc + (leave.total_days ?? 0), 0)
  const isClockedIn = !!(todayAttendance?.clock_in && !todayAttendance?.clock_out)
  const isClockedOut = !!(todayAttendance?.clock_in && todayAttendance?.clock_out)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" aria-label={t('employeeDetail.text.back')} asChild><Link to="/employees"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <Link to="/employees" className="hover:text-foreground transition-colors">{t('employeesPage.title')}</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-semibold">{data.full_name}</span>
        </div>
        <Button variant="outline" size="sm" asChild><Link to="/employees"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />{t('employeeDetail.text.back')}</Link></Button>
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
                  <Badge
                    variant="outline"
                    className={`font-medium ${
                      data.approval_status === 'pending'
                        ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400'
                        : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                    }`}
                  >
                    {data.approval_status === 'pending'
                      ? t('employeesPage.approval.pending', { defaultValue: 'Pendente' })
                      : t('employeesPage.approval.approved', { defaultValue: 'Aprovado' })}
                  </Badge>
                  {activeShift && (
                    <Badge variant="outline" className="gap-1 font-medium" style={{ borderColor: activeShift.color ?? undefined, color: activeShift.color ?? undefined }}>
                      <Clock className="h-3 w-3" />{activeShift.name}
                    </Badge>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{data.position?.title ?? t('employeeDetail.text.noPosition')}</span>
                  <span className="mx-1.5">·</span>
                  <span>{data.department?.name ?? t('employeeDetail.text.noDepartment')}</span>
                  {data.manager && (<><span className="mx-1.5">·</span><span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{t('employeeDetail.text.managerLabel', { name: data.manager.full_name })}</span></>)}
                </p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                  {data.email && (<a href={`mailto:${data.email}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Mail className="h-3 w-3 text-primary" />{data.email}</a>)}
                  {data.phone && (<a href={`tel:${data.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Phone className="h-3 w-3 text-primary" />{data.phone}</a>)}
                  {data.city && (<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 text-primary" />{[data.city, data.country].filter(Boolean).join(', ')}</span>)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 shrink-0 [&>button]:h-auto [&>button]:min-h-9 [&>button]:whitespace-normal [&>button]:text-center">
              {canApproveEmployee && (
                data.approval_status === 'pending' ? (
                  <Button
                    size="sm"
                    variant="default"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={approvalMutation.isPending}
                    onClick={() => approvalMutation.mutate('approved')}
                  >
                    {approvalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {t('employeeDetail.text.approveEmployee', { defaultValue: 'Aprovar Funcionário' })}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={approvalMutation.isPending}
                    onClick={() => approvalMutation.mutate('pending')}
                  >
                    {approvalMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    {t('employeeDetail.text.setEmployeePending', { defaultValue: 'Mover para Pendente' })}
                  </Button>
                )
              )}
              {hasPermission(user, 'update_employee') && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsEmployeeEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />{t('employeeDetail.text.editEmployee')}
                </Button>
              )}
              <Button
                size="sm"
                variant={isClockedIn ? 'secondary' : isClockedOut ? 'outline' : 'default'}
                className="h-auto min-h-9 whitespace-normal text-center gap-1.5"
                onClick={() => {
                  setSearchParams({ tab: 'attendance' }, { replace: true })
                  if (!isClockedOut) toggleAttendance.mutate()
                }}
                disabled={toggleAttendance.isPending || isClockedOut || data.approval_status === 'pending'}
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
                {isClockedIn ? t('employeeDetail.text.clockOutAction') : isClockedOut ? t('employeeDetail.text.workdayComplete') : t('employeeDetail.text.clockInAction')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={data.approval_status === 'pending'}
                onClick={() => { setSearchParams({ tab: 'leaves' }, { replace: true }); setIsLeaveOpen(true) }}
              >
                <BedDouble className="h-3.5 w-3.5" />{t('employeeDetail.text.recordAbsence')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={data.approval_status === 'pending'}
                onClick={() => { setSearchParams({ tab: 'shift' }, { replace: true }); setIsShiftOpen(true) }}
              >
                <RotateCcw className="h-3.5 w-3.5" />{t('employeeDetail.text.changeShift')}
              </Button>
            </div>
          </div>
          {data.approval_status === 'pending' && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {t('employeeDetail.text.pendingApprovalBanner', {
                    count: documents?.filter((doc) => !doc.is_verified).length ?? data.unverified_documents_count ?? 0,
                    defaultValue: 'Este funcionário está PENDENTE. Verifique os documentos anexados no separador Documentos e aprove-o para liberar folha salarial, presenças e restantes operações.',
                  })}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 bg-background"
                onClick={() => setSearchParams({ tab: 'documents' }, { replace: true })}
              >
                <FileCheck className="mr-1.5 h-3.5 w-3.5" />
                {t('employeeDetail.text.reviewDocuments', { defaultValue: 'Verificar Documentos' })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Briefcase className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.contractualLink')}</p>
            <p className="text-sm font-semibold truncate text-foreground">{data.active_contract ? (contractTypeLabels[data.active_contract.contract_type] ?? data.active_contract.contract_type) : t('employeeDetail.text.noContract')}</p>
          </div>
        </Card>
        {canViewEmployeeSalary && (
          <Card className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><DollarSign className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.basePay')}</p>
              <p className="text-sm font-semibold truncate text-foreground">
                {data.active_contract && data.active_contract.base_salary != null ? formatCurrency(data.active_contract.base_salary) : '—'}
              </p>
            </div>
          </Card>
        )}
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-600"><Building2 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.department')}</p>
            <p className="text-sm font-semibold truncate text-foreground">{data.department?.name ?? '—'}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.activeShift')}</p>
            <p className="text-sm font-semibold truncate text-foreground">{activeShift?.name ?? '—'}</p>
            {activeShift && <p className="text-[11px] text-muted-foreground font-mono">{activeShift.start_time} – {activeShift.end_time}</p>}
          </div>
        </Card>
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={(tab) => setSearchParams({ tab }, { replace: true })} className="w-full">
        <TabsList className="w-full flex-wrap justify-start h-auto gap-1 p-1.5 bg-muted/60 border border-border/60 rounded-lg">
          <TabsTrigger value="personal" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><User className="h-3.5 w-3.5" />{t('employeeDetail.text.personalTab')}</TabsTrigger>
          <TabsTrigger value="contract" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><Briefcase className="h-3.5 w-3.5" />{t('employeeDetail.text.contractTab')}</TabsTrigger>
          {canViewPayroll && <TabsTrigger value="payroll" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />{t('employeeDetail.text.payrollTab')}</TabsTrigger>}
          <TabsTrigger value="documents" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs">
            <FileText className="h-3.5 w-3.5" />{t('employeeDetail.text.documentsTab')}
            {(documents ?? []).length > 0 && <Badge variant="secondary" className="ml-0.5 text-[10px] h-4 px-1 font-semibold">{documents!.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="attendance" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><UserCheck className="h-3.5 w-3.5" />{t('employeeDetail.text.attendanceTab')}</TabsTrigger>
          <TabsTrigger value="leaves" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><BedDouble className="h-3.5 w-3.5" />{t('employeeDetail.text.leavesTab')}</TabsTrigger>
          <TabsTrigger value="shift" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" />{t('employeeDetail.text.shiftTab')}</TabsTrigger>
          <TabsTrigger value="education" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><FileWarning className="h-3.5 w-3.5" />{t('employeeDetail.text.educationTab', { defaultValue: 'Educação' })}</TabsTrigger>
          <TabsTrigger value="history" className="h-auto min-h-8 whitespace-normal text-center gap-1.5 px-3 py-1.5 text-xs"><Calendar className="h-3.5 w-3.5" />{t('employeeDetail.text.historyTab')}</TabsTrigger>
        </TabsList>

        {/* Tab: Dados Pessoais */}
        <TabsContent value="personal" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4 text-primary" />{t('employeeDetail.text.personalIdentification')}</CardTitle><CardDescription>{t('employeeDetail.text.civilDataDescription')}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label={t('employeeDetail.text.firstName')} value={data.first_name} />
                <DF label={t('employeeDetail.text.lastName')} value={data.last_name} />
                <DF label={t('employeeDetail.text.fullName')} value={data.full_name} span={2} />
                <DF label={t('employeeDetail.text.gender')} value={data.gender ? (genderLabels[data.gender] ?? data.gender) : null} />
                <DF label={t('employeeDetail.text.maritalStatus')} value={data.marital_status ? (maritalStatusLabels[data.marital_status] ?? data.marital_status) : null} />
                <DF label={t('employeeDetail.text.birthDate')} value={data.birth_date ? `${formatDate(data.birth_date)}${age ? ` (${age})` : ''}` : null} />
                <DF label={t('employeeDetail.text.nationality')} value={data.nationality} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />{t('employeeDetail.text.officialDocuments')}</CardTitle><CardDescription>{t('employeeDetail.text.officialDocumentsDescription')}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label={t('employeeDetail.text.documentType')} value={data.id_document_type ? (idDocumentTypeLabels[data.id_document_type] ?? data.id_document_type) : null} span={2} />
                <DF label={t('employeeDetail.text.documentNumber')} value={data.id_document_number} />
                <DF label={t('employeeDetail.text.expiryDate')} value={formatDate(data.id_document_expiry)} />
                <DF label={t('employeeDetail.text.taxNumber')} value={data.tax_id} />
                <DF label={t('employeeDetail.text.socialSecurity')} value={data.social_security_id} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{t('employeeDetail.text.contactLocation')}</CardTitle><CardDescription>{t('employeeDetail.text.contactLocationDescription')}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <DF label={t('employeeDetail.text.email')} value={data.email} />
                <DF label={t('employeeDetail.text.phone')} value={data.phone} />
                <DF label={t('employeeDetail.text.alternativePhone')} value={data.alternative_phone} />
                <DF label={t('employeeDetail.text.address')} value={data.address} span={2} />
                <DF label={t('employeeDetail.text.postalCode')} value={data.postal_code} />
                <DF label={t('employeeDetail.text.city')} value={data.city} />
                <DF label={t('employeeDetail.text.stateProvince')} value={data.state} />
                <DF label={t('employeeDetail.text.country')} value={data.country} />
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
                    <Briefcase className="h-4 w-4 text-primary" />{t('employeeDetail.text.activeEmploymentContract')}
                  </CardTitle>
                  <CardDescription>{t('employeeDetail.text.contractDescription')}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canUpdateContracts && data.active_contract && (
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => openContractDialog(data.active_contract)}>
                      <Pencil className="h-3.5 w-3.5" />{t('employeeDetail.text.editContract')}
                    </Button>
                  )}
                  {canCreateContracts && (contractNeedsRenewal || !data.active_contract) && (
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openContractDialog(contracts[0] ?? data.active_contract, true)}>
                      <RotateCcw className="h-3.5 w-3.5" />{contractNeedsRenewal ? t('employeeDetail.text.renewContract') : t('employeeDetail.text.newContract')}
                    </Button>
                  )}
                  {data.active_contract?.is_active && !contractExpired && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 border-destructive/30 text-xs h-8 gap-1.5"
                      onClick={() => {
                        setDeactivateContractForm({ reason: '', end_date: todayStr })
                        setIsDeactivateContractOpen(true)
                      }}
                    >
                      <PowerOff className="h-3.5 w-3.5" />{t('employeeDetail.text.deactivateContract')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {data.active_contract ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <DF label={t('employeeDetail.text.contractType')} value={contractTypeLabels[data.active_contract.contract_type] ?? data.active_contract.contract_type} highlight />
                      {canViewEmployeeSalary && (
                        <DF label={t('employeeDetail.text.baseSalary')} value={data.active_contract.base_salary != null ? formatCurrency(data.active_contract.base_salary) : '—'} highlight />
                      )}
                      <DF label={t('employeeDetail.text.salaryFrequency')} value={salaryFrequencyLabels[data.active_contract.salary_frequency] ?? data.active_contract.salary_frequency} />
                      <DF label={t('employeeDetail.text.weeklyHours')} value={data.active_contract.work_hours_per_week ? t('employeeDetail.text.hoursPerWeek', { count: data.active_contract.work_hours_per_week }) : null} />
                      <DF label={t('employeeDetail.text.startDate')} value={formatDate(data.active_contract.start_date)} />
                      <DF label={t('employeeDetail.text.endDate')} value={data.active_contract.end_date ? formatDate(data.active_contract.end_date) : 'Indeterminado'} />
                      <DF label={t('employeeDetail.text.signature')} value={formatDate(data.active_contract.signed_at)} />
                      <div>
                        <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">{t('employeeDetail.text.situation')}</p>
                        <div className="mt-1 flex items-center gap-2">
                          {data.active_contract.is_active ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDeactivateContractForm({ reason: '', end_date: new Date().toISOString().slice(0, 10) })
                                setIsDeactivateContractOpen(true)
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all cursor-pointer group"
                              title={t('employeeDetail.text.deactivateContractHint')}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {t('employeeDetail.text.contractCurrent')}
                              <PowerOff className="h-3 w-3 opacity-60 group-hover:opacity-100 ml-1 text-destructive" />
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                              {t('employeeDetail.text.inactive')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {data.active_contract.notes && <div className="rounded-lg bg-muted/40 p-3 text-xs border border-border/60"><p className="font-semibold mb-1">{t('employeeDetail.text.notes')}</p><p className="text-muted-foreground">{data.active_contract.notes}</p></div>}
                    {(data.active_contract.document_url || data.active_contract.document_path) && (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0"><FileText className="h-5 w-5 text-primary shrink-0" /><div><p className="text-xs font-semibold">{t('employeeDetail.text.digitalContract')}</p><p className="text-[11px] text-muted-foreground">Cloudinary</p></div></div>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleDownload(data.active_contract?.document_url ?? data.active_contract?.document_path, `Contrato_${data.full_name.replace(/\s+/g, '_')}.pdf`)}><Download className="h-3.5 w-3.5" />{t('employeeDetail.text.download')}</Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={t('employeeDetail.text.open')} asChild><a href={data.active_contract.document_url ?? data.active_contract.document_path ?? '#'} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (<div className="py-8 text-center text-sm text-muted-foreground"><Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />{t('employeeDetail.text.noActiveContract')}</div>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />{t('employeeDetail.text.organizationAssignment')}</CardTitle><CardDescription>{t('employeeDetail.text.organizationDescription')}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <DF label={t('employeeDetail.text.department')} value={data.department?.name} highlight />
                <DF label={t('employeeDetail.text.position')} value={data.position?.title} highlight />
                <DF label={t('employeeDetail.text.directManager')} value={data.manager?.full_name} />
                <DF label={t('employeeDetail.text.status')} value={statusLabels[data.status] ?? data.status} />
                <DF label={t('employeeDetail.text.hireDate')} value={formatDate(data.hired_at)} />
                <DF label={t('employeeDetail.text.probationEnd')} value={formatDate(data.probation_end)} />
                {data.termination_at && (<><DF label={t('employeeDetail.text.terminationDate')} value={formatDate(data.termination_at)} /><DF label={t('employeeDetail.text.terminationReason')} value={data.termination_reason} /></>)}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('employeeDetail.text.contractHistory')}</CardTitle>
              <CardDescription>{t('employeeDetail.text.contractHistoryDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              {contracts.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t('employeeDetail.text.noContractHistory')}</p>
              ) : (
                <div className="space-y-2">
                  {contracts.map((contract) => (
                    <div key={contract.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div>
                        <p className="font-medium">
                          {contractTypeLabels[contract.contract_type] ?? contract.contract_type}
                          {canViewEmployeeSalary && contract.base_salary != null ? ` · ${formatCurrency(contract.base_salary)}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(contract.start_date)} – {contract.end_date ? formatDate(contract.end_date) : t('employeeDetail.text.indefinite')}
                          {' · '}{contract.is_active ? t('common.active') : t('common.inactive')}
                        </p>
                      </div>
                      {canUpdateContracts && (
                        <Button size="sm" variant="outline" onClick={() => openContractDialog(contract)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />{t('common.edit')}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canViewPayroll && (
          <TabsContent value="payroll">
            <EmployeePayrollTab
              employee={data}
              employeeId={Number(id)}
              canManageAllowances={canManageAllowances}
              canManageDeductions={canManageDeductions}
              canViewDeductions={canViewDeductions}
            />
          </TabsContent>
        )}

        {/* Tab: Documentos */}
        <TabsContent value="documents" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{t('employeeDetail.text.documentsHeading')}{(documents ?? []).length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{t('employeeDetail.text.fileCount', { count: documents!.length })}</Badge>}</CardTitle>
                  <CardDescription>{t('employeeDetail.text.cloudinaryStorage')}</CardDescription>
                </div>
                <Button size="sm" className="h-auto min-h-8 max-w-full whitespace-normal text-center gap-1.5" onClick={() => setIsUploadOpen(true)}><Plus className="h-4 w-4" />{t('employeeDetail.text.addDocument')}</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!documents || documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
                  <div className="rounded-full bg-primary/10 p-4 mb-3"><Upload className="h-8 w-8 text-primary" /></div>
                  <p className="text-sm font-semibold">{t('employeeDetail.text.noDocuments')}</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">{t('employeeDetail.text.documentsEmptyDescription')}</p>
                  <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => setIsUploadOpen(true)}><Plus className="h-3.5 w-3.5" />{t('employeeDetail.text.uploadDocument')}</Button>
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
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{t(`settingsPage.documentTypes.${doc.document_type}`, { defaultValue: docTypeLabels[doc.document_type] ?? doc.document_type })}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                                {doc.size_label && <span>{doc.size_label}</span>}
                                {doc.created_at && (<><span>·</span><span>{formatDate(doc.created_at)}</span></>)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={doc.is_verified ? 'outline' : 'secondary'}
                              className={`text-[10px] py-0 px-2 gap-1 ${
                                doc.is_verified
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {doc.is_verified ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                              {doc.is_verified
                                ? t('employeeDetail.text.documentVerifiedBadge', { defaultValue: 'Verificado' })
                                : t('employeeDetail.text.documentUnverifiedBadge', { defaultValue: 'Por verificar' })}
                            </Badge>
                            {doc.is_verified && doc.verified_by?.name && (
                              <span className="text-[10px] text-muted-foreground">{doc.verified_by.name}</span>
                            )}
                            {doc.is_expired && (<Badge variant="destructive" className="text-[10px] py-0 px-2 gap-1"><AlertCircle className="h-3 w-3" />{t('employeeDetail.text.expiredOn', { date: formatDate(doc.expiry_date) })}</Badge>)}
                            {!doc.is_expired && doc.is_expiring && (<Badge variant="secondary" className="bg-amber-500/15 text-amber-600 text-[10px] py-0 px-2 gap-1"><Clock className="h-3 w-3" />{t('employeeDetail.text.expiresOn', { date: formatDate(doc.expiry_date) })}</Badge>)}
                          </div>
                          {doc.notes && <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">{doc.notes}</p>}
                        </div>
                        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            {(isImg || isPd) ? (<Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setPreviewDoc(doc)}><Eye className="mr-1 h-3.5 w-3.5" />{t('employeeDetail.text.view')}</Button>) : (<span className="text-xs text-muted-foreground px-1">{t('employeeDetail.text.file')}</span>)}
                            {canVerifyDocuments && (
                              <Button
                                size="sm"
                                variant={doc.is_verified ? 'outline' : 'default'}
                                className={`h-8 px-2.5 text-xs gap-1 ${doc.is_verified ? 'border-emerald-500/40 text-emerald-600 hover:text-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                disabled={verifyDocMutation.isPending}
                                onClick={() => verifyDocMutation.mutate({ docId: doc.id, is_verified: !doc.is_verified })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {doc.is_verified
                                  ? t('employeeDetail.text.verifiedAction', { defaultValue: 'Verificado' })
                                  : t('employeeDetail.text.verifyAction', { defaultValue: 'Verificar' })}
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {doc.file_url && (<Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" disabled={isDl} onClick={() => handleDownload(doc.file_url, doc.original_name ?? doc.name, doc.id)}>{isDl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-primary" />}{t('employeeDetail.text.download')}</Button>)}
                            {doc.file_url && (<Button size="icon-sm" variant="ghost" className="h-8 w-8" aria-label={t('employeeDetail.text.open')} asChild><a href={doc.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>)}
                            <Button size="icon-sm" variant="ghost" className="h-8 w-8 hover:text-destructive" aria-label={t('employeeDetail.text.delete')} disabled={deleteDoc.isPending} onClick={() => { if (window.confirm(t('employeeDetail.messages.confirmDeleteDocument', { name: doc.name }))) deleteDoc.mutate(doc.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card className={`p-4 flex items-center gap-3 border-2 ${isClockedIn ? 'border-emerald-500/40 bg-emerald-500/5' : isClockedOut ? 'border-blue-500/40 bg-blue-500/5' : 'border-border'}`}>
              <div className={`rounded-lg p-2.5 ${isClockedIn ? 'bg-emerald-500/15 text-emerald-600' : isClockedOut ? 'bg-blue-500/15 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                {isClockedOut ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Activity className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.todayStatus')}</p>
                <p className="text-sm font-bold text-foreground">{isClockedIn ? t('employeeDetail.text.working') : isClockedOut ? t('employeeDetail.text.workdayComplete') : t('employeeDetail.text.noRecord')}</p>
                {todayAttendance?.clock_in && <p className="text-[11px] text-muted-foreground font-mono">{t('employeeDetail.text.clockInTime', { time: formatTime(todayAttendance.clock_in) })}{todayAttendance.clock_out && ` · ${t('employeeDetail.text.clockOutTime', { time: formatTime(todayAttendance.clock_out) })}`}</p>}
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.daysWorked')}</p><p className="text-2xl font-bold text-foreground">{worked}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.lateArrivals')}</p><p className="text-2xl font-bold text-foreground">{lateCount}</p><p className="text-[11px] text-muted-foreground">{lateDurationLabel}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-600"><Clock className="h-5 w-5" /></div><div className="min-w-0"><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.overtime')}</p><p className="text-2xl font-bold text-foreground">{overtimeCount}</p><p className="text-[11px] text-muted-foreground">{overtimeDurationLabel}{totalOvertimeAmount > 0 ? ` · ${totalOvertimeAmount.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz` : ''}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-red-500/10 p-2.5 text-red-600"><AlertCircle className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.absences')}</p><p className="text-2xl font-bold text-foreground">{absent}</p><p className="text-[11px] text-muted-foreground">{t('employeeDetail.text.totalDuration', { duration: formatMinutes(totalMins) })}</p></div></Card>
            <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-600"><Calendar className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.vacationUsed')}</p><p className="text-2xl font-bold text-foreground">{vacationUsed}</p><p className="text-[11px] text-muted-foreground">{t('employeeDetail.text.approvedDays')}</p></div></Card>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4 text-primary" />{t('employeeDetail.text.attendanceHistory')}</CardTitle><CardDescription>{t('employeeDetail.text.attendanceHistoryDescription')}</CardDescription></div>
                <div className="flex items-center gap-2">
                  {attendanceSchedules.length > 0 && (
                    <Select value={attendanceShiftId} onValueChange={setAttendanceShiftId}>
                      <SelectTrigger className="w-48"><SelectValue placeholder={t('attendance.selectShift')} /></SelectTrigger>
                      <SelectContent>
                        {attendanceSchedules.map((schedule) => (
                          <SelectItem key={schedule.id} value={String(schedule.shift_id)}>
                            {schedule.shift?.name} · {schedule.shift?.start_time}–{schedule.shift?.end_time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    variant={isClockedIn ? 'secondary' : isClockedOut ? 'outline' : 'default'}
                    className="h-auto min-h-8 whitespace-normal text-center gap-1.5"
                    onClick={() => toggleAttendance.mutate()}
                    disabled={toggleAttendance.isPending || isClockedOut || (attendanceSchedules.length > 1 && !attendanceShiftId)}
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
                    {isClockedIn ? t('employeeDetail.text.clockOutAction') : isClockedOut ? t('employeeDetail.text.workdayComplete') : t('employeeDetail.text.clockInAction')}
                  </Button>
                  <Button size="sm" className="h-auto min-h-8 whitespace-normal text-center gap-1.5" onClick={() => {
                    setManualAttRecordId(null)
                    setManualAttForm({ date: todayStr, shift_id: '', clock_in: '', clock_out: '', status: 'present', deduct_from_salary: false, notes: '' })
                    setIsManualAttOpen(true)
                  }}><Plus className="h-4 w-4" />{t('employeeDetail.text.manualRecord')}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {attRecords.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm"><UserCheck className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">{t('employeeDetail.text.noAttendance')}</p></div>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="bg-muted/50"><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.date')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('attendance.shift')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.clockIn')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.clockOut')}</th><th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('attendance.normalHours')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.total')}</th><th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.dailyLateMinutes')}</th><th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.overtime')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.status')}</th><th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('common.actions')}</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {attendanceByWeek.map((week) => (
                        <Fragment key={week.start}>
                          {week.records.map((rec) => (
                            <tr key={rec.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs">{formatDate(rec.date)}</td>
                              <td className="px-4 py-3 text-xs">{rec.shift?.name ?? '—'}</td>
                              <td className="px-4 py-3 font-mono text-xs">{formatTime(rec.clock_in)}</td>
                              <td className="px-4 py-3 font-mono text-xs">{formatTime(rec.clock_out)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatMinutesToHours(Math.round((rec.normal_hours ?? rec.shift?.work_hours ?? 8) * 60))}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatMinutes(rec.total_worked)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">{formatMinutesToHours(rec.late_minutes)}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs">{formatMinutesToHours(rec.overtime_minutes)}</td>
                              <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] font-medium ${attendanceStatusColors[rec.status] ?? ''}`}>{attendanceStatusLabels[rec.status] ?? rec.status}</Badge></td>
                              <td className="px-4 py-3 text-right">
                                <Button size="icon-sm" variant="ghost" aria-label={t('common.edit')} onClick={() => {
                                  setManualAttRecordId(rec.id)
                                  setManualAttForm({
                                    date: rec.date,
                                    shift_id: rec.shift_id ? String(rec.shift_id) : '',
                                    clock_in: rec.clock_in ?? '',
                                    clock_out: rec.clock_out ?? '',
                                    status: rec.status,
                                    deduct_from_salary: rec.deduct_from_salary ?? false,
                                    notes: rec.notes ?? '',
                                  })
                                  setIsManualAttOpen(true)
                                }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-muted/40 font-semibold">
                            <td colSpan={5} className="px-4 py-2 text-xs">{t('employeeDetail.text.weeklyLateSummary', { date: formatDate(week.start) })}</td>
                            <td className="px-4 py-2 font-mono text-xs">{formatMinutes(week.workedMinutes)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{formatMinutesToHours(week.lateMinutes)}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs">{formatMinutesToHours(week.overtimeMinutes)}</td>
                            <td colSpan={2} />
                          </tr>
                        </Fragment>
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
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-sky-500/10 p-2.5 text-sky-600"><Calendar className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.annualEntitlement')}</p><p className="text-2xl font-bold text-foreground">{leaveBalance.annual_entitlement}<span className="text-sm font-normal text-muted-foreground ml-1">{t('employeeDetail.text.days')}</span></p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.daysTaken')}</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_used}</p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><BedDouble className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.daysRemaining')}</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_remaining}</p></div></Card>
              <Card className="p-4 flex items-center gap-3"><div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600"><Clock className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground font-medium">{t('employeeDetail.text.pending')}</p><p className="text-2xl font-bold text-foreground">{leaveBalance.days_pending}</p></div></Card>
            </div>
          )}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><CardTitle className="text-base flex items-center gap-2"><BedDouble className="h-4 w-4 text-primary" />{t('employeeDetail.text.leaveRegister')}</CardTitle><CardDescription>{t('employeeDetail.text.angolaLaborLaw')}</CardDescription></div>
                <Button size="sm" className="h-auto min-h-8 whitespace-normal text-center gap-1.5" onClick={() => openLeaveDialog()}><Plus className="h-4 w-4" />{t('employeeDetail.text.recordLeave')}</Button>
              </div>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm"><BedDouble className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">{t('employeeDetail.text.noLeaves')}</p></div>
              ) : (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead><tr className="bg-muted/50"><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.type')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.startDate')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.end')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.days')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.status')}</th><th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">{t('employeeDetail.text.documentsTab')}</th>{canUpdateLeaves && <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">{t('common.actions')}</th>}</tr></thead>
                    <tbody className="divide-y divide-border">
                      {leaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3"><p className="font-medium text-foreground">{leave.leave_type?.name ?? `#${leave.leave_type_id}`}</p>{leave.reason && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{leave.reason}</p>}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatDate(leave.start_date)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{formatDate(leave.end_date)}</td>
                          <td className="px-4 py-3 font-bold text-xs">{t('employeeDetail.text.daysCount', { count: leave.total_days })}</td>
                          <td className="px-4 py-3"><Badge variant="outline" className={`text-[10px] font-medium ${leaveStatusColors[leave.status] ?? ''}`}>{leaveStatusLabels[leave.status] ?? leave.status}</Badge></td>
                          <td className="px-4 py-3"><LeaveDocumentActions leave={leave} /></td>
                          {canUpdateLeaves && <td className="px-4 py-3 text-right"><Button size="icon-sm" variant="ghost" aria-label={t('common.edit')} onClick={() => openLeaveDialog(leave)}><Pencil className="h-4 w-4" /></Button></td>}
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
                <div><CardTitle className="text-base flex items-center gap-2"><RotateCcw className="h-4 w-4 text-primary" />{t('employeeDetail.text.currentShift')}</CardTitle><CardDescription>{t('employeeDetail.text.activeWorkSchedule')}</CardDescription></div>
                <Button size="sm" className="gap-1.5" onClick={() => setIsShiftOpen(true)}><RotateCcw className="h-4 w-4" />{activeShift ? t('employeeDetail.text.changeShift') : t('employeeDetail.text.assignShift')}</Button>
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
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{t('employeeDetail.text.clockIn')}</p><p className="text-xl font-bold font-mono text-foreground">{activeShift.start_time}</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{t('employeeDetail.text.clockOut')}</p><p className="text-xl font-bold font-mono text-foreground">{activeShift.end_time}</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{t('employeeDetail.text.hoursPerDay')}</p><p className="text-xl font-bold text-foreground">{t('employeeDetail.text.hoursCount', { count: activeShift.work_hours })}</p></div>
                    <div className="rounded-lg bg-muted/40 p-3 text-center"><p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium mb-1">{t('employeeDetail.text.type')}</p><p className="text-sm font-bold text-foreground">{activeShift.is_night_shift ? t('employeeDetail.text.night') : t('employeeDetail.text.day')}</p></div>
                  </div>
                  {data.active_schedule?.effective_from && <p className="text-xs text-muted-foreground">{t('employeeDetail.text.effectiveSince')} <span className="font-mono font-medium">{formatDate(data.active_schedule.effective_from)}</span>{data.active_schedule.effective_to && ` → ${formatDate(data.active_schedule.effective_to)}`}</p>}
                  {data.active_schedule?.notes && <p className="text-xs text-muted-foreground italic">{data.active_schedule.notes}</p>}
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  <RotateCcw className="h-10 w-10 mx-auto mb-2 opacity-30" /><p className="font-medium">{t('employeeDetail.text.noShift')}</p>
                  <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-center mt-4 gap-1.5" onClick={() => setIsShiftOpen(true)}><Plus className="h-3.5 w-3.5" />{t('employeeDetail.text.assignShift')}</Button>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />{t('employeeDetail.text.shiftHistory')}</CardTitle><CardDescription>{t('employeeDetail.text.allAssignedShifts')}</CardDescription></div>
                <Button size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-center gap-1.5" onClick={() => setIsShiftOpen(true)}><Plus className="h-4 w-4" />{t('employeeDetail.text.addShift')}</Button>
              </div>
            </CardHeader>
            <CardContent>
              {!scheduleHistory || scheduleHistory.data.length === 0 ? (<p className="text-sm text-muted-foreground text-center py-6">{t('employeeDetail.text.noShiftHistory')}</p>) : (
                <div className="space-y-2">
                  {scheduleHistory.data.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.shift?.color ?? 'var(--primary)' }} />
                        <div>
                          <p className="text-sm font-medium text-foreground">{s.shift?.name ?? `Turno #${s.shift_id}`}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.effective_from} {s.effective_to ? `→ ${s.effective_to}` : `(${t('employeeDetail.text.current')})`}</p>
                          {s.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{s.notes}</p>}
                        </div>
                      </div>
                      <Badge variant={s.is_active ? 'success' : 'secondary'} className="text-[10px]">{s.is_active ? t('employeeDetail.status.active') : t('employeeDetail.text.previous')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Educação */}
        <TabsContent value="education" className="mt-6 space-y-4">
          <EmployeeEducationTab
            employeeId={Number(id)}
            employeeName={data.full_name}
            canManage={hasPermission(user, 'update_employee')}
          />
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="history" className="mt-6 space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />{t('employeeDetail.text.timeline')}</CardTitle><CardDescription>{t('employeeDetail.text.timelineDescription')}</CardDescription></CardHeader>
            <CardContent>
              {timeline && timeline.length > 0 ? (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {timeline.map((entry, idx) => (<div key={idx} className="relative"><div className="absolute -left-[19px] top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" /><div><p className="text-sm font-semibold text-foreground">{entry.title}</p><p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p><span className="inline-block mt-1 text-[11px] font-mono text-muted-foreground/80">{formatDate(entry.date)}</span></div></div>))}
                </div>
              ) : (<div className="py-8 text-center text-sm text-muted-foreground">{t('employeeDetail.text.noTimeline')}</div>)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODALS */}
      <EmployeeEditDialog
        key={`${data.id}-${data.updated_at}`}
        employee={data}
        open={isEmployeeEditOpen}
        onOpenChange={setIsEmployeeEditOpen}
      />

      {/* Upload Documento */}
      <Dialog
        open={isUploadOpen}
        onOpenChange={(open) => {
          setIsUploadOpen(open)
          if (!open) {
            setUploadFile(null)
            setUploadFormData({ name: '', document_type: 'other', expiry_date: '', notes: '' })
            setIsDraggingDoc(false)
            if (docFileInputRef.current) docFileInputRef.current.value = ''
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="shrink-0 border-b border-border bg-muted/20 px-6 pt-6 pb-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Upload className="h-4 w-4" />
                </span>
                {t('employeeDetail.text.addDocument')}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t('employeeDetail.text.uploadDocumentDescription', { name: data.full_name })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              uploadMutation.mutate()
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <Label className="text-xs font-semibold">
                  {t('employeeDetail.text.file')} <span className="text-destructive">*</span>
                </Label>
                <input
                  ref={docFileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                  className="hidden"
                  onChange={(e) => selectDocumentFile(e.target.files?.[0] || null)}
                />

                {!uploadFile ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => docFileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        docFileInputRef.current?.click()
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setIsDraggingDoc(true)
                    }}
                    onDragLeave={() => setIsDraggingDoc(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setIsDraggingDoc(false)
                      const dropped = e.dataTransfer.files?.[0] ?? null
                      if (dropped) selectDocumentFile(dropped)
                    }}
                    className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                      isDraggingDoc
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
                    }`}
                  >
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {t('employeeDetail.text.dropDocumentHere')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('employeeDetail.text.acceptedDocumentFormats')}
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      {uploadFilePreviewUrl ? (
                        <img
                          src={uploadFilePreviewUrl}
                          alt={uploadFile.name}
                          className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FileText className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{uploadFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(uploadFile.size)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => docFileInputRef.current?.click()}
                      >
                        {t('employeeDetail.text.changeFile')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('employeeDetail.text.removeFile')}
                        onClick={() => selectDocumentFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">
                    {t('employeeDetail.text.name')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    required
                    value={uploadFormData.name}
                    onChange={(e) => setUploadFormData((p) => ({ ...p, name: e.target.value }))}
                    placeholder={t('employeeDetail.text.documentName')}
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold">
                    {t('employeeDetail.text.type')} <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={uploadFormData.document_type}
                    onValueChange={(v) => setUploadFormData((p) => ({ ...p, document_type: v }))}
                  >
                    <SelectTrigger className="mt-1.5 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(docTypeLabels).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-semibold">{t('employeeDetail.text.expiryOptional')}</Label>
                  <Input
                    type="date"
                    value={uploadFormData.expiry_date}
                    onChange={(e) => setUploadFormData((p) => ({ ...p, expiry_date: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold">{t('employeeDetail.text.notesOptional')}</Label>
                  <Textarea
                    rows={2}
                    value={uploadFormData.notes}
                    onChange={(e) => setUploadFormData((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={t('employeeDetail.text.notesPlaceholder')}
                    className="mt-1.5 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-muted/20 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUploadOpen(false)}
                disabled={uploadMutation.isPending}
              >
                {t('employeeDetail.text.cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={uploadMutation.isPending || !uploadFile || !uploadFormData.name.trim()}
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    {t('employeeDetail.text.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-4 w-4" />
                    {t('employeeDetail.text.save')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Visualizar Documento */}
      <Dialog
        open={!!previewDoc}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewDoc(null)
            setPreviewZoom(1)
          }
        }}
      >
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          <div className="shrink-0 px-6 pt-5 pb-3 border-b border-border/70 pr-12 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">{previewDoc?.name}</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-muted-foreground">
                {docTypeLabels[previewDoc?.document_type ?? ''] ?? previewDoc?.document_type}{previewDoc?.size_label && ` · ${previewDoc.size_label}`}
              </DialogDescription>
            </div>
            {previewDoc && (isImage(previewDoc.mime_type) || isPdf(previewDoc.mime_type)) && previewDoc.file_url && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={t('employeeDetail.text.zoomOut')}
                  title={t('employeeDetail.text.zoomOut')}
                  disabled={previewZoom <= 0.5}
                  onClick={() => setPreviewZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 min-w-[54px] px-2 font-mono text-xs tabular-nums"
                  title={t('employeeDetail.text.zoomReset')}
                  onClick={() => setPreviewZoom(1)}
                >
                  {Math.round(previewZoom * 100)}%
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={t('employeeDetail.text.zoomIn')}
                  title={t('employeeDetail.text.zoomIn')}
                  disabled={previewZoom >= 3}
                  onClick={() => setPreviewZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-black/5 dark:bg-black/40 p-4 flex">
            {previewDoc && isImage(previewDoc.mime_type) && previewDoc.file_url && (
              <img
                src={previewDoc.file_url}
                alt={previewDoc.name}
                style={{ zoom: previewZoom }}
                onClick={() => setPreviewZoom((z) => (z === 1 ? 1.5 : 1))}
                className={`m-auto rounded-md object-contain shadow-sm transition-transform ${
                  previewZoom === 1 ? 'max-h-full max-w-full cursor-zoom-in' : 'max-w-none cursor-zoom-out'
                }`}
              />
            )}
            {previewDoc && isPdf(previewDoc.mime_type) && previewDoc.file_url && (
              <iframe
                src={previewDoc.file_url}
                title={previewDoc.name}
                style={{ zoom: previewZoom }}
                className="m-auto w-full h-full min-h-[300px] rounded-md border border-border/60 bg-white"
              />
            )}
            {previewDoc && !isImage(previewDoc.mime_type) && !isPdf(previewDoc.mime_type) && (<div className="m-auto text-center p-8"><FileCheck className="h-12 w-12 text-primary mx-auto mb-2" /><p className="text-sm font-semibold">{t('employeeDetail.text.previewUnavailable')}</p><p className="text-xs text-muted-foreground mt-1">{t('employeeDetail.text.downloadToView')}</p></div>)}
          </div>
          <div className="shrink-0 px-6 py-3.5 border-t border-border bg-card/80 flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <Button variant="destructive" size="sm" disabled={deleteDoc.isPending} onClick={() => { if (previewDoc && window.confirm(t('employeeDetail.messages.confirmDeleteDocument', { name: previewDoc.name }))) deleteDoc.mutate(previewDoc.id) }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{t('employeeDetail.text.delete')}</Button>
            <div className="flex items-center gap-2">
              {previewDoc?.file_url && (<><Button variant="default" size="sm" className="gap-1.5" disabled={downloadingId === previewDoc.id} onClick={() => handleDownload(previewDoc.file_url, previewDoc.original_name ?? previewDoc.name, previewDoc.id)}>{downloadingId === previewDoc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{t('employeeDetail.text.download')}</Button><Button variant="outline" size="sm" asChild><a href={previewDoc.file_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{t('employeeDetail.text.open')}</a></Button></>)}
              <Button variant="secondary" size="sm" onClick={() => { setPreviewDoc(null); setPreviewZoom(1) }}>{t('employeeDetail.text.close')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Registo Manual de Presença */}
      <Dialog open={isManualAttOpen} onOpenChange={setIsManualAttOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />{manualAttRecordId ? t('employeeDetail.text.editAttendance') : t('employeeDetail.text.manualAttendance')}
            </DialogTitle>
            <DialogDescription>{t('employeeDetail.text.manualAttendanceDescription', { name: data.first_name })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">{t('employeeDetail.text.date')} <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                max={todayStr}
                className="mt-1.5"
                value={manualAttForm.date}
                onChange={(e) => setManualAttForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>

            {manualSchedules.length > 0 && (
              <div>
                <Label className="text-xs font-semibold">{t('attendance.shift')}</Label>
                <Select value={manualShiftId} onValueChange={(value) => setManualAttForm((form) => ({ ...form, shift_id: value }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder={t('attendance.selectShift')} /></SelectTrigger>
                  <SelectContent>
                    {manualSchedules.map((schedule) => (
                      <SelectItem key={schedule.id} value={String(schedule.shift_id)}>
                        {schedule.shift?.name} · {schedule.shift?.start_time}–{schedule.shift?.end_time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isManualDateFuture && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t('employeeDetail.text.futureDateNotAllowed')}</p>
                  <p className="mt-0.5">{t('employeeDetail.text.futureDateMessage')}</p>
                </div>
              </div>
            )}

            {isManualDateClosed && !isManualDateFuture && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{t('employeeDetail.text.workdayAlreadyClosed')}</p>
                  <p className="mt-0.5">
                    {t('employeeDetail.text.closedWorkdayDescription', { date: formatDate(manualAttForm.date), clockIn: formatTime(selectedManualRecord?.clock_in), clockOut: formatTime(selectedManualRecord?.clock_out) })}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">{t('employeeDetail.text.timeIn')}</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  disabled={(isManualDateClosed && !manualAttRecordId) || isManualDateFuture}
                  value={manualAttForm.clock_in}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, clock_in: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">{t('employeeDetail.text.timeOut')}</Label>
                <Input
                  type="time"
                  className="mt-1.5"
                  disabled={(isManualDateClosed && !manualAttRecordId) || isManualDateFuture}
                  value={manualAttForm.clock_out}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, clock_out: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">{t('employeeDetail.text.status')} <span className="text-destructive">*</span></Label>
              <Select
                value={manualAttForm.status}
                disabled={(isManualDateClosed && !manualAttRecordId) || isManualDateFuture}
                onValueChange={(v) => setManualAttForm((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">{t('employeeDetail.text.present')}</SelectItem>
                  <SelectItem value="late">{t('employeeDetail.text.late')}</SelectItem>
                  <SelectItem value="absent">{t('employeeDetail.text.absent')}</SelectItem>
                  <SelectItem value="half_day">{t('employeeDetail.text.halfDay')}</SelectItem>
                  <SelectItem value="justified">{t('employeeDetail.text.justified')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(manualAttForm.status === 'absent' || manualAttForm.status === 'justified' || manualAttForm.status === 'late') && (
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span>
                  <span className="block text-sm font-medium">{t('employeeDetail.text.deductSalary')}</span>
                  <span className="block text-xs text-muted-foreground">{t('employeeDetail.text.deductSalaryDescription')}</span>
                </span>
                <input
                  type="checkbox"
                  checked={manualAttForm.deduct_from_salary}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, deduct_from_salary: e.target.checked }))}
                  className="h-4 w-4"
                />
              </label>
            )}
            <div>
              <Label className="text-xs font-semibold">{t('employeeDetail.text.observations')}</Label>
              <Input
                className="mt-1.5"
                disabled={(isManualDateClosed && !manualAttRecordId) || isManualDateFuture}
                placeholder={t('employeeDetail.text.reasonOrNotes')}
                value={manualAttForm.notes}
                onChange={(e) => setManualAttForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2 [&>button]:h-auto [&>button]:min-h-8 [&>button]:whitespace-normal [&>button]:text-center">
            <Button variant="outline" size="sm" onClick={() => setIsManualAttOpen(false)} disabled={manualAttMutation.isPending}>
              {t('employeeDetail.text.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => manualAttMutation.mutate()}
              disabled={manualAttMutation.isPending || (isManualDateClosed && !manualAttRecordId) || isManualDateFuture || (manualSchedules.length > 1 && !manualAttForm.shift_id)}
            >
              {manualAttMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              {t('employeeDetail.text.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lançar Ausência / Férias */}
      <Dialog open={isLeaveOpen} onOpenChange={(open) => { setIsLeaveOpen(open); if (!open) setEditingLeave(null) }}>
        <DialogContent className="flex h-[90vh] max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0"><DialogTitle className="flex items-center gap-2"><BedDouble className="h-5 w-5 text-primary" />{t(editingLeave ? 'employeeDetail.text.editLeaveDialog' : 'employeeDetail.text.recordLeaveDialog')}</DialogTitle><DialogDescription>{t('employeeDetail.text.recordLeaveDescription', { name: data.first_name })}</DialogDescription></DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto py-2 pr-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold">{t('employeeDetail.text.leaveTypeLgt')} <span className="text-destructive">*</span></Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Select value={leaveForm.leave_type_id} onValueChange={(v) => setLeaveForm((p) => ({ ...p, leave_type_id: v }))}>
                  <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder={t('employeeDetail.text.selectLeaveType')} /></SelectTrigger>
                  <SelectContent>{(leaveTypes ?? []).map((lt) => (<SelectItem key={lt.id} value={String(lt.id)}>{lt.name}{lt.days_per_year ? ` (${t('employeeDetail.text.upToDays', { count: lt.days_per_year })})` : ''} · {lt.is_paid ? t('employeeDetail.text.paid') : t('employeeDetail.text.unpaid')}</SelectItem>))}</SelectContent>
                </Select>
                {canManageLeaveTypes && <LeaveTypeCreateDialog onCreated={(type) => setLeaveForm((current) => ({ ...current, leave_type_id: String(type.id) }))} />}
              </div>
            </div>
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.occurrenceType')}</Label><Select value={leaveForm.occurrence_type} onValueChange={(v) => setLeaveForm((p) => ({ ...p, occurrence_type: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="absence">{t('employeeDetail.text.occurrence.absence')}</SelectItem><SelectItem value="day_off">{t('employeeDetail.text.occurrence.dayOff')}</SelectItem><SelectItem value="vacation">{t('employeeDetail.text.occurrence.vacation')}</SelectItem><SelectItem value="medical">{t('employeeDetail.text.occurrence.medical')}</SelectItem><SelectItem value="family">{t('employeeDetail.text.occurrence.family')}</SelectItem><SelectItem value="maternity">{t('employeeDetail.text.occurrence.maternity')}</SelectItem><SelectItem value="paternity">{t('employeeDetail.text.occurrence.paternity')}</SelectItem><SelectItem value="bereavement">{t('employeeDetail.text.occurrence.bereavement')}</SelectItem><SelectItem value="unpaid">{t('employeeDetail.text.occurrence.unpaid')}</SelectItem><SelectItem value="personal">{t('employeeDetail.text.occurrence.personal')}</SelectItem><SelectItem value="training">{t('employeeDetail.text.occurrence.training')}</SelectItem><SelectItem value="public_duty">{t('employeeDetail.text.occurrence.publicDuty')}</SelectItem><SelectItem value="other">{t('employeeDetail.text.occurrence.other')}</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.noticeType')}</Label><Select value={leaveForm.notice_type} onValueChange={(v) => setLeaveForm((p) => ({ ...p, notice_type: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="anticipated">{t('employeeDetail.text.notice.anticipated')}</SelectItem><SelectItem value="unanticipated">{t('employeeDetail.text.notice.unanticipated')}</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.startDate')} <span className="text-destructive">*</span></Label><Input type="date" className="mt-1.5" value={leaveForm.start_date} onChange={(e) => setLeaveForm((p) => ({ ...p, start_date: e.target.value }))} /></div>
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.endDate')} <span className="text-destructive">*</span></Label><Input type="date" className="mt-1.5" value={leaveForm.end_date} onChange={(e) => setLeaveForm((p) => ({ ...p, end_date: e.target.value }))} /></div>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span><span className="block text-sm font-medium">{t('employeeDetail.text.isJustified')}</span><span className="block text-xs text-muted-foreground">{t('employeeDetail.text.justifiedDescription')}</span></span>
              <input type="checkbox" checked={leaveForm.is_justified} onChange={(e) => setLeaveForm((p) => ({ ...p, is_justified: e.target.checked }))} className="h-4 w-4" />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <span><span className="block text-sm font-medium">{t('employeeDetail.text.deductSalary')}</span><span className="block text-xs text-muted-foreground">{t('employeeDetail.text.deductLeaveDescription')}</span></span>
              <input type="checkbox" checked={leaveForm.deduct_from_salary} onChange={(e) => setLeaveForm((p) => ({ ...p, deduct_from_salary: e.target.checked }))} className="h-4 w-4" />
            </label>
            {!editingLeave && <div><Label className="text-xs font-semibold">{t('employeeDetail.text.status')}</Label><Select value={leaveForm.status} onValueChange={(v) => setLeaveForm((p) => ({ ...p, status: v }))}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="approved">{t('employeeDetail.text.approvedDirect')}</SelectItem><SelectItem value="pending">{t('employeeDetail.text.pendingApproval')}</SelectItem></SelectContent></Select></div>}
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.reasonNotes')}</Label><Input className="mt-1.5" placeholder={t('employeeDetail.text.justificationPlaceholder')} value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} /></div>
            <div className="min-w-0 space-y-2">
              <Label className="text-xs font-semibold">{t('employeeDetail.text.receiptForSignatureLabel', { defaultValue: 'Comprovativo para Assinatura (PDF)' })}</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={isDownloadingLeavePdf || !leaveForm.start_date || !leaveForm.end_date}
                onClick={handleDownloadLeaveReceiptPreview}
              >
                {isDownloadingLeavePdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {t('employeeDetail.text.generateReceiptForSignature', { defaultValue: 'Gerar Comprovativo para Assinar (PDF)' })}
              </Button>
            </div>
            <div className="min-w-0 space-y-2">
              <Label className="text-xs font-semibold">{t('employeeDetail.text.signedEmployeeDocumentOptional')}</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setLeaveForm((p) => ({ ...p, signed_document: e.target.files?.[0] ?? null }))} />
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-wrap gap-2 [&>button]:h-auto [&>button]:min-h-8 [&>button]:whitespace-normal [&>button]:text-center"><Button type="button" variant="outline" size="sm" onClick={() => setIsLeaveOpen(false)} disabled={leaveMutation.isPending}>{t('employeeDetail.text.cancel')}</Button><Button type="button" size="sm" onClick={() => leaveMutation.mutate()} disabled={leaveMutation.isPending || !leaveForm.leave_type_id || !leaveForm.start_date || !leaveForm.end_date}>{leaveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t(editingLeave ? 'employeeDetail.text.save' : 'employeeDetail.text.record')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vincular / Alterar Turno */}
      <Dialog open={isShiftOpen} onOpenChange={setIsShiftOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" />{t('employeeDetail.text.assignShift')}</DialogTitle><DialogDescription>{t('employeeDetail.text.assignShiftDescription', { name: data.first_name })}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.shiftTab')} <span className="text-destructive">*</span></Label><Select value={shiftForm.shift_id} onValueChange={(v) => setShiftForm((p) => ({ ...p, shift_id: v }))}><SelectTrigger className="mt-1.5"><SelectValue placeholder={t('employeeDetail.text.selectShift')} /></SelectTrigger><SelectContent>{(shiftsData?.data ?? []).filter((s) => s.is_active).map((s) => (<SelectItem key={s.id} value={String(s.id)}><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color ?? 'var(--primary)' }} />{s.name} · {s.start_time}–{s.end_time} ({t('employeeDetail.text.hoursCount', { count: s.work_hours })}){s.is_night_shift && ' 🌙'}</div></SelectItem>))}</SelectContent></Select></div>
            <div>
              <Label className="text-xs font-semibold">{t('schedules.periodMode', { defaultValue: 'Duração / Período do Turno' })}</Label>
              <Select
                value={shiftForm.period_mode}
                onValueChange={(v) => setShiftForm((p) => ({
                  ...p,
                  period_mode: v as 'continuous' | 'daily' | 'weekly' | 'monthly' | 'custom',
                  effective_to: v === 'custom' && !p.effective_to ? p.effective_from : p.effective_to,
                }))}
              >
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="continuous">{t('schedules.periodContinuous', { defaultValue: 'Contínuo (sem data fim)' })}</SelectItem>
                  <SelectItem value="daily">{t('schedules.periodDaily', { defaultValue: 'Data única (1 dia)' })}</SelectItem>
                  <SelectItem value="weekly">{t('schedules.periodWeekly', { defaultValue: 'Semanal (7 dias a partir do início)' })}</SelectItem>
                  <SelectItem value="monthly">{t('schedules.periodMonthly', { defaultValue: 'Mensal (mês completo)' })}</SelectItem>
                  <SelectItem value="custom">{t('schedules.periodCustom', { defaultValue: 'Intervalo de datas (De – Até)' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {shiftForm.period_mode === 'monthly' ? (
              <div>
                <Label className="text-xs font-semibold">{t('schedules.month', { defaultValue: 'Mês' })} <span className="text-destructive">*</span></Label>
                <Input type="month" className="mt-1.5" value={shiftForm.month} onChange={(e) => setShiftForm((p) => ({ ...p, month: e.target.value }))} />
              </div>
            ) : (
              <div className={shiftForm.period_mode === 'custom' ? 'grid grid-cols-2 gap-3' : undefined}>
                <div>
                  <Label className="text-xs font-semibold">{shiftForm.period_mode === 'daily' ? t('common.date', { defaultValue: 'Data' }) : t('employeeDetail.text.effectiveFrom')} <span className="text-destructive">*</span></Label>
                  <Input type="date" className="mt-1.5" value={shiftForm.effective_from} onChange={(e) => setShiftForm((p) => ({ ...p, effective_from: e.target.value }))} />
                </div>
                {shiftForm.period_mode === 'custom' && (
                  <div>
                    <Label className="text-xs font-semibold">{t('schedules.effectiveTo', { defaultValue: 'Válido até' })} <span className="text-destructive">*</span></Label>
                    <Input type="date" className="mt-1.5" min={shiftForm.effective_from} value={shiftForm.effective_to} onChange={(e) => setShiftForm((p) => ({ ...p, effective_to: e.target.value }))} />
                  </div>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={shiftForm.replace_previous}
                onChange={(e) => setShiftForm((p) => ({ ...p, replace_previous: e.target.checked }))}
              />
              {t('schedules.replacePrevious', { defaultValue: 'Encerrar turno anterior na véspera do início' })}
            </label>
            <div><Label className="text-xs font-semibold">{t('employeeDetail.text.notesOptional')}</Label><Input className="mt-1.5" placeholder={t('employeeDetail.text.changeReason')} value={shiftForm.notes} onChange={(e) => setShiftForm((p) => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter className="flex-wrap gap-2 [&>button]:h-auto [&>button]:min-h-8 [&>button]:whitespace-normal [&>button]:text-center"><Button variant="outline" size="sm" onClick={() => setIsShiftOpen(false)} disabled={shiftMutation.isPending}>{t('employeeDetail.text.cancel')}</Button><Button size="sm" onClick={() => shiftMutation.mutate()} disabled={shiftMutation.isPending || !shiftForm.shift_id || (shiftForm.period_mode === 'custom' && (!shiftForm.effective_to || shiftForm.effective_to < shiftForm.effective_from))}>{shiftMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{t('employeeDetail.text.assign')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isContractDialogOpen} onOpenChange={(open) => { setIsContractDialogOpen(open); if (!open) setContractDocument(null) }}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden sm:max-w-4xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingContract ? t('employeeDetail.text.editContract') : contractNeedsRenewal ? t('employeeDetail.text.renewContract') : t('employeeDetail.text.newContract')}</DialogTitle>
            <DialogDescription>{t('employeeDetail.text.contractDialogDescription', { name: data.full_name })}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 sm:grid-cols-2">
            <div className="border-b pb-2 sm:col-span-2"><p className="text-sm font-semibold">{t('employeeDetail.text.contractTerms')}</p></div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.contractType')} *</Label>
              <Select value={contractForm.contract_type} onValueChange={(value) => setContractForm((form) => ({ ...form, contract_type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['permanent', 'fixed_term', 'temporary', 'probation', 'internship', 'outsourced'].map((value) => (
                    <SelectItem key={value} value={value}>{contractTypeLabels[value] ?? value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.position')}</Label>
              <Select value={contractForm.position_id || '__none'} onValueChange={(value) => setContractForm((form) => ({ ...form, position_id: value === '__none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('employeeDetail.text.noPosition')}</SelectItem>
                  {(contractPositions?.data ?? []).map((position) => (
                    <SelectItem key={position.id} value={String(position.id)}>{position.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.department')}</Label>
              <Select value={contractForm.department_id || '__none'} onValueChange={(value) => setContractForm((form) => ({ ...form, department_id: value === '__none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('employeeDetail.text.noDepartment')}</SelectItem>
                  {(contractDepartments?.data ?? []).map((department) => (
                    <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.directManager')}</Label>
              <Select value={contractForm.manager_id || '__none'} onValueChange={(value) => setContractForm((form) => ({ ...form, manager_id: value === '__none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('employeeDetail.text.noManager')}</SelectItem>
                  {(contractManagers?.data ?? []).filter((manager) => manager.id !== Number(id)).map((manager) => (
                    <SelectItem key={manager.id} value={String(manager.id)}>{manager.full_name} ({manager.employee_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="border-b pb-2 pt-2 sm:col-span-2"><p className="text-sm font-semibold">{t('employeeDetail.text.compensationAndDates')}</p></div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.baseSalary')} *</Label>
              <Input type="number" min="0" step="0.01" value={contractForm.base_salary} onChange={(event) => setContractForm((form) => ({ ...form, base_salary: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.salaryFrequency')} *</Label>
              <Select value={contractForm.salary_frequency} onValueChange={(value) => setContractForm((form) => ({ ...form, salary_frequency: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['monthly', 'biweekly', 'weekly', 'hourly'].map((value) => (
                    <SelectItem key={value} value={value}>{salaryFrequencyLabels[value] ?? value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.weeklyHours')}</Label>
              <Input type="number" min="1" max="168" step="0.01" value={contractForm.work_hours_per_week} onChange={(event) => setContractForm((form) => ({ ...form, work_hours_per_week: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.startDate')} *</Label>
              <Input type="date" value={contractForm.start_date} onChange={(event) => setContractForm((form) => ({ ...form, start_date: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.endDate')}</Label>
              <Input type="date" min={contractForm.start_date} value={contractForm.end_date} onChange={(event) => setContractForm((form) => ({ ...form, end_date: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('employeeDetail.text.signature')}</Label>
              <Input type="date" value={contractForm.signed_at} onChange={(event) => setContractForm((form) => ({ ...form, signed_at: event.target.value }))} />
            </div>
            <div className="border-b pb-2 pt-2 sm:col-span-2"><p className="text-sm font-semibold">{t('employeeDetail.text.contractDocumentsAndNotes')}</p></div>
            {!editingContract && <div className="space-y-1.5 sm:col-span-2">
              <Label>{t('employeeDetail.text.signedContractDocument')}</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => setContractDocument(event.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">{t('employeeDetail.text.signedContractDocumentHint')}</p>
            </div>}
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t('common.notes')}</Label>
              <Textarea value={contractForm.notes} onChange={(event) => setContractForm((form) => ({ ...form, notes: event.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsContractDialogOpen(false)} disabled={contractMutation.isPending}>{t('common.cancel')}</Button>
            <Button onClick={() => contractMutation.mutate()} disabled={contractMutation.isPending || !contractForm.base_salary || !contractForm.start_date}>
              {contractMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
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
              {t('employeeDetail.text.deactivateContractDescription', { name: data.full_name })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">{t('employeeDetail.text.effectiveEndDate')} <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                className="mt-1.5"
                value={deactivateContractForm.end_date}
                onChange={(e) => setDeactivateContractForm((p) => ({ ...p, end_date: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">{t('employeeDetail.text.deactivationReason')} <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1.5"
                placeholder={t('employeeDetail.text.deactivationReasonPlaceholder')}
                value={deactivateContractForm.reason}
                onChange={(e) => setDeactivateContractForm((p) => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2 [&>button]:h-auto [&>button]:min-h-8 [&>button]:whitespace-normal [&>button]:text-center">
            <Button variant="outline" size="sm" onClick={() => setIsDeactivateContractOpen(false)} disabled={deactivateContractMutation.isPending}>
              {t('employeeDetail.text.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deactivateContractMutation.mutate()}
              disabled={deactivateContractMutation.isPending || !deactivateContractForm.reason.trim()}
            >
              {deactivateContractMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PowerOff className="mr-1.5 h-4 w-4" />}
              {t('employeeDetail.text.confirmDeactivation')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfLanguageDialog
        open={leavePdfPrompt.open}
        onOpenChange={leavePdfPrompt.onOpenChange}
        onSelect={leavePdfPrompt.handleSelect}
      />
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

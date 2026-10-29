import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { QrCodePayload, AttendanceRecord } from '@/types'

export const useIssueQrCode = () =>
  useMutation({
    mutationFn: () => api.post<QrCodePayload>('attendance/qr/issue'),
  })

export const useCurrentAttendance = () =>
  useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get<AttendanceRecord | null>('attendance/today'),
    refetchInterval: 30000,
  })

export const useScanQrCode = () =>
  useMutation({
    mutationFn: (data: { hash: string; employee_id?: number }) =>
      api.post<AttendanceRecord>('attendance/qr/scan', data),
  })

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { EmailTemplate, EmailTemplateEvent, Paginated } from '@/types'

export interface EmailTemplateFilters {
  search?: string
  event?: EmailTemplateEvent
  is_active?: boolean
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  per_page?: number
  page?: number
}

export const useEmailTemplates = (filters: EmailTemplateFilters = {}) =>
  useQuery({
    queryKey: ['email-templates', filters],
    queryFn: () => api.get<Paginated<EmailTemplate>>('email-templates', filters as Record<string, unknown>),
  })

export const useCreateEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<EmailTemplate>) => api.post<EmailTemplate>('email-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export const useUpdateEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<EmailTemplate> }) =>
      api.patch<EmailTemplate>(`email-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export const useDeleteEmailTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`email-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  })
}

export const usePreviewEmailTemplate = () =>
  useMutation({
    mutationFn: ({ id, data }: { id: number; data?: Record<string, string> }) =>
      api.post<{ subject: string; body: string }>(`email-templates/${id}/preview`, { data }),
  })

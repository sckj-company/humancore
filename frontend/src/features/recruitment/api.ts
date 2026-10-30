import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  Candidate,
  CandidateStatus,
  JobOpening,
  JobOpeningStatus,
  Paginated,
} from '@/types'

export interface JobOpeningFilters {
  search?: string
  status?: JobOpeningStatus
  department_id?: number
  employment_type?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  per_page?: number
  page?: number
}

export const useJobOpenings = (filters: JobOpeningFilters = {}) =>
  useQuery({
    queryKey: ['recruitment-jobs', filters],
    queryFn: () => api.get<Paginated<JobOpening>>('recruitment/jobs', filters as Record<string, unknown>),
  })

export const useJobOpening = (id: number | string | undefined) =>
  useQuery({
    queryKey: ['recruitment-jobs', id],
    queryFn: () => api.get<JobOpening>(`recruitment/jobs/${id}`),
    enabled: !!id,
  })

export const useCreateJobOpening = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<JobOpening>) => api.post<JobOpening>('recruitment/jobs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-jobs'] })
    },
  })
}

export const useUpdateJobOpening = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<JobOpening> }) =>
      api.put<JobOpening>(`recruitment/jobs/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['recruitment-jobs'] })
      qc.invalidateQueries({ queryKey: ['recruitment-jobs', vars.id] })
    },
  })
}

export const useDeleteJobOpening = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`recruitment/jobs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment-jobs'] }),
  })
}

export const usePublishJobOpening = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post<JobOpening>(`recruitment/jobs/${id}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment-jobs'] }),
  })
}

export const useCloseJobOpening = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post<JobOpening>(`recruitment/jobs/${id}/close`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruitment-jobs'] }),
  })
}

export interface CandidateFilters {
  search?: string
  job_opening_id?: number
  status?: CandidateStatus
  source?: string
  per_page?: number
  page?: number
}

export const useCandidates = (filters: CandidateFilters = {}) =>
  useQuery({
    queryKey: ['recruitment-candidates', filters],
    queryFn: () => api.get<Paginated<Candidate>>('recruitment/candidates', filters as Record<string, unknown>),
  })

export const useCandidatesByJob = (jobId: number | string | undefined) =>
  useQuery({
    queryKey: ['recruitment-candidates-by-job', jobId],
    queryFn: () => api.get<Candidate[]>(`recruitment/jobs/${jobId}/candidates`),
    enabled: !!jobId,
  })

export const useCreateCandidate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Candidate> & { resume?: File }) => {
      if (data.resume) {
        const fd = new FormData()
        Object.entries(data).forEach(([k, v]) => {
          if (k === 'resume' && v instanceof File) fd.append('resume', v)
          else if (v !== null && v !== undefined) fd.append(k, String(v))
        })
        return api.upload<Candidate>('recruitment/candidates', fd)
      }
      const { resume: _resume, ...payload } = data
      return api.post<Candidate>('recruitment/candidates', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] })
      qc.invalidateQueries({ queryKey: ['recruitment-candidates-by-job'] })
    },
  })
}

export const useUpdateCandidate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Candidate> }) =>
      api.put<Candidate>(`recruitment/candidates/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] })
      qc.invalidateQueries({ queryKey: ['recruitment-candidates-by-job'] })
    },
  })
}

export const useMoveCandidate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: CandidateStatus }) =>
      api.post<Candidate>(`recruitment/candidates/${id}/move`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] })
      qc.invalidateQueries({ queryKey: ['recruitment-candidates-by-job'] })
    },
  })
}

export const useDeleteCandidate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`recruitment/candidates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] })
      qc.invalidateQueries({ queryKey: ['recruitment-candidates-by-job'] })
    },
  })
}

export interface HirePayload {
  contract_type: string
  base_salary: number
  salary_frequency: string
  work_hours_per_week?: number
  start_date: string
  end_date?: string | null
  department_id?: number | null
  position_id?: number | null
  manager_id?: number | null
  notes?: string | null
}

export const useHireCandidate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: HirePayload }) =>
      api.post<{ candidate: Candidate; employee: unknown; contract: unknown }>(`recruitment/candidates/${id}/hire`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruitment-candidates'] })
      qc.invalidateQueries({ queryKey: ['recruitment-candidates-by-job'] })
      qc.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}


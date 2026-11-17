import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      withCredentials: true,
    })

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('hrms_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      const tenantId = localStorage.getItem('hrms_selected_tenant')
      if (tenantId) {
        config.headers['X-Tenant-ID'] = tenantId
      }
      return config
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('hrms_token')
          const base = import.meta.env.BASE_URL.replace(/\/$/, '')
          if (!window.location.pathname.startsWith(`${base}/login`)) {
            window.location.href = `${base}/login`
          }
        }
        return Promise.reject(error)
      },
    )
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request<ApiResponse<T>>(config)
    return response.data.data
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: 'GET', url, params })
  }

  async post<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', url, data })
  }

  async upload<T>(url: string, formData: FormData, onUploadProgress?: (percent: number) => void): Promise<T> {
    const response = await this.client.post<ApiResponse<T>>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onUploadProgress && e.total) {
          onUploadProgress(Math.round((e.loaded * 100) / e.total))
        }
      },
    })
    return response.data.data
  }

  async put<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', url, data })
  }

  async patch<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', url, data })
  }

  async delete<T>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ method: 'DELETE', url, data })
  }

  async downloadFile(url: string, filename?: string, params?: Record<string, unknown>): Promise<void> {
    const response = await this.client.get(url, { params, responseType: 'blob' })
    this.triggerBlobDownload(response, filename)
  }

  async downloadFilePost(url: string, data?: unknown, filename?: string, params?: Record<string, unknown>): Promise<void> {
    const response = await this.client.post(url, data, { params, responseType: 'blob' })
    this.triggerBlobDownload(response, filename)
  }

  private triggerBlobDownload(response: { data: Blob; headers: Record<string, unknown> }, filename?: string): void {
    const blob: Blob = response.data
    const disposition = String(response.headers['content-disposition'] ?? '')
    const match = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disposition)
    let resolvedName = filename ?? match?.[1] ?? 'download'
    if (filename && !/\.[a-z0-9]{2,5}$/i.test(filename)) {
      if (match?.[1] && /\.[a-z0-9]{2,5}$/i.test(match[1])) {
        const ext = match[1].split('.').pop()
        resolvedName = `${filename}.${ext}`
      } else if (blob.type) {
        const extMap: Record<string, string> = {
          'application/pdf': 'pdf',
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/webp': 'webp',
        }
        const ext = extMap[blob.type]
        if (ext) resolvedName = `${filename}.${ext}`
      }
    }
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = resolvedName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  meta?: PaginationMeta
  errors?: Record<string, string[]>
}

export interface PaginationMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export const api = new ApiClient()

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiResponse<unknown> | undefined
    if (data?.errors) {
      return Object.values(data.errors).flat().join('\n')
    }
    if (data?.message) {
      return data.message
    }
  }
  return fallback
}

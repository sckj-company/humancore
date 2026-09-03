import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { Loader2 } from 'lucide-react'

interface Props {
  children: React.ReactNode
  roles?: string[]
}

export function ProtectedRoute({ children, roles }: Props) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && !roles.some((r) => user.roles?.includes(r))) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

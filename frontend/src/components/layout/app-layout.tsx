import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useUiStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Sidebar fixed to viewport - never moves or scrolls out of place */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-16',
        )}
      >
        <Sidebar />
      </div>

      {/* Main content offset by sidebar width */}
      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col transition-all duration-300 ease-in-out',
          sidebarOpen ? 'pl-64' : 'pl-16',
        )}
      >
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

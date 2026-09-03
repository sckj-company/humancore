import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useUiStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className={cn('shrink-0 transition-all', sidebarOpen ? 'w-64' : 'w-16')}>
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

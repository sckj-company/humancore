import { create } from 'zustand'

interface UiState {
  sidebarOpen: boolean
  commandPaletteOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  commandPaletteOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}))

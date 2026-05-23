import { create } from 'zustand'
import type { FocusedPanel } from '../types.js'
import { usePodsStore } from './pods.js'
import { requestExit } from '../lib/exit.js'

interface UiState {
  focusedPanel: FocusedPanel
  isVcluster: boolean
  vclusterConnected: boolean
  lastError: string | null
  setFocusedPanel: (panel: FocusedPanel) => void
  setIsVcluster: (v: boolean) => void
  setVclusterConnected: (v: boolean) => void
  setLastError: (e: string | null) => void
  handleEsc: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  focusedPanel: 'nodes',
  isVcluster: false,
  vclusterConnected: false,
  lastError: null,
  setFocusedPanel: (focusedPanel) => set({ focusedPanel }),
  setIsVcluster: (isVcluster) => set({ isVcluster }),
  setVclusterConnected: (vclusterConnected) => set({ vclusterConnected }),
  setLastError: (lastError) => set({ lastError }),
  handleEsc: () => {
    const { focusedPanel, vclusterConnected } = get()
    const { showFilter, setShowFilter, setFilterText } = usePodsStore.getState()
    if (showFilter) { setShowFilter(false); setFilterText(''); return }
    if (focusedPanel === 'pods') { set({ focusedPanel: 'nodes' }); return }
    if (vclusterConnected) { set({ vclusterConnected: false }); return }
    requestExit()
  },
}))

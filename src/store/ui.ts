import { create } from 'zustand'
import type { FocusedPanel, PodMetric } from '../types.js'
import { usePodsStore } from './pods.js'

interface UiState {
  focusedPanel: FocusedPanel
  showModal: boolean
  selectedModalAction: number
  selectedPodForModal: PodMetric | null
  isVcluster: boolean
  vclusterConnected: boolean
  lastError: string | null
  setFocusedPanel: (panel: FocusedPanel) => void
  setShowModal: (show: boolean, pod?: PodMetric) => void
  setSelectedModalAction: (i: number) => void
  setIsVcluster: (v: boolean) => void
  setVclusterConnected: (v: boolean) => void
  setLastError: (e: string | null) => void
  handleEsc: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  focusedPanel: 'nodes',
  showModal: false,
  selectedModalAction: 0,
  selectedPodForModal: null,
  isVcluster: false,
  vclusterConnected: false,
  lastError: null,
  setFocusedPanel: (focusedPanel) => set({ focusedPanel }),
  setShowModal: (showModal, pod) => set({ showModal, selectedPodForModal: pod ?? null, selectedModalAction: 0 }),
  setSelectedModalAction: (selectedModalAction) => set({ selectedModalAction }),
  setIsVcluster: (isVcluster) => set({ isVcluster }),
  setVclusterConnected: (vclusterConnected) => set({ vclusterConnected }),
  setLastError: (lastError) => set({ lastError }),
  handleEsc: () => {
    const { showModal, focusedPanel, vclusterConnected } = get()
    const { showFilter, setShowFilter, setFilterText } = usePodsStore.getState()
    if (showModal) { set({ showModal: false, selectedPodForModal: null }); return }
    if (showFilter) { setShowFilter(false); setFilterText(''); return }
    if (focusedPanel === 'pods') { set({ focusedPanel: 'nodes' }); return }
    if (vclusterConnected) { set({ vclusterConnected: false }); return }
    process.exit(0)
  },
}))

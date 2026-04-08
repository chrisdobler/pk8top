import { create } from 'zustand'
import type { PodMetric, SortMode } from '../types.js'

function applyFilterAndSort(pods: PodMetric[], filterText: string, sortMode: SortMode): PodMetric[] {
  const lower = filterText.toLowerCase()
  const filtered = lower
    ? pods.filter((p) => p.name.toLowerCase().includes(lower) || p.namespace.toLowerCase().includes(lower))
    : pods

  return [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'cpu': return b.cpuCores - a.cpuCores
      case 'memory': return b.memoryMi - a.memoryMi
      case 'status': return a.status.localeCompare(b.status)
      case 'namespace': return a.namespace.localeCompare(b.namespace)
      case 'restarts': return a.lastRestartAgeSeconds - b.lastRestartAgeSeconds
    }
  })
}

interface PodsState {
  pods: PodMetric[]
  filteredPods: PodMetric[]
  filterText: string
  showFilter: boolean
  sortMode: SortMode
  selectedIndex: number
  scrollOffset: number
  setPods: (pods: PodMetric[]) => void
  setFilterText: (text: string) => void
  setShowFilter: (show: boolean) => void
  setSortMode: (mode: SortMode) => void
  setSelectedIndex: (i: number) => void
  setScrollOffset: (offset: number) => void
}

export const usePodsStore = create<PodsState>((set) => ({
  pods: [],
  filteredPods: [],
  filterText: '',
  showFilter: false,
  sortMode: 'cpu',
  selectedIndex: 0,
  scrollOffset: 0,
  setPods: (pods) => set((s) => ({ pods, filteredPods: applyFilterAndSort(pods, s.filterText, s.sortMode) })),
  setFilterText: (filterText) => set((s) => ({ filterText, filteredPods: applyFilterAndSort(s.pods, filterText, s.sortMode), selectedIndex: 0, scrollOffset: 0 })),
  setShowFilter: (showFilter) => set({ showFilter }),
  setSortMode: (sortMode) => set((s) => ({ sortMode, filteredPods: applyFilterAndSort(s.pods, s.filterText, sortMode) })),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setScrollOffset: (scrollOffset) => set({ scrollOffset }),
}))

import { create } from 'zustand'
import type { PodMetric, SortMode } from '../types.js'

function applyFilterAndSort(
  pods: PodMetric[],
  filterText: string,
  sortMode: SortMode,
  nodeFilter: string,
): PodMetric[] {
  let filtered = pods

  // Filter by node if set
  if (nodeFilter) {
    filtered = filtered.filter((p) => p.nodeName === nodeFilter)
  }

  // Filter by text search
  const lower = filterText.toLowerCase()
  if (lower) {
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.namespace.toLowerCase().includes(lower),
    )
  }

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

// Pending async refilter timer — lets us debounce rapid node scrolling
let refilterTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefilter() {
  if (refilterTimer) clearTimeout(refilterTimer)
  refilterTimer = setTimeout(() => {
    refilterTimer = null
    const s = usePodsStore.getState()
    usePodsStore.setState({
      filteredPods: applyFilterAndSort(s.pods, s.filterText, s.sortMode, s.nodeFilter),
      selectedIndex: 0,
      scrollOffset: 0,
    })
  }, 0)
}

interface PodsState {
  pods: PodMetric[]
  filteredPods: PodMetric[]
  filterText: string
  showFilter: boolean
  sortMode: SortMode
  nodeFilter: string
  selectedIndex: number
  scrollOffset: number
  setPods: (pods: PodMetric[]) => void
  setFilterText: (text: string) => void
  setShowFilter: (show: boolean) => void
  setSortMode: (mode: SortMode) => void
  setNodeFilter: (node: string) => void
  setSelectedIndex: (i: number) => void
  setScrollOffset: (offset: number) => void
}

export const usePodsStore = create<PodsState>((set) => ({
  pods: [],
  filteredPods: [],
  filterText: '',
  showFilter: false,
  sortMode: 'cpu',
  nodeFilter: '',
  selectedIndex: 0,
  scrollOffset: 0,
  setPods: (pods) => set((s) => ({ pods, filteredPods: applyFilterAndSort(pods, s.filterText, s.sortMode, s.nodeFilter) })),
  setFilterText: (filterText) => set((s) => ({ filterText, filteredPods: applyFilterAndSort(s.pods, filterText, s.sortMode, s.nodeFilter), selectedIndex: 0, scrollOffset: 0 })),
  setShowFilter: (showFilter) => set({ showFilter }),
  setSortMode: (sortMode) => set((s) => ({ sortMode, filteredPods: applyFilterAndSort(s.pods, s.filterText, sortMode, s.nodeFilter) })),
  setNodeFilter: (nodeFilter) => {
    // Update the filter value immediately so the nodes panel re-renders instantly,
    // but defer the expensive filter+sort to the next tick so scrolling stays snappy.
    set({ nodeFilter })
    scheduleRefilter()
  },
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setScrollOffset: (scrollOffset) => set({ scrollOffset }),
}))

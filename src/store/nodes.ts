import { create } from 'zustand'
import type { NodeMetric } from '../types.js'

interface NodesState {
  nodes: NodeMetric[]
  selectedIndex: number
  history: Record<string, number[]>
  setNodes: (nodes: NodeMetric[]) => void
  setSelectedIndex: (i: number) => void
  pushHistory: (data: Record<string, number>) => void
}

export const useNodesStore = create<NodesState>((set) => ({
  nodes: [],
  selectedIndex: 0,
  history: {},
  setNodes: (nodes) => set({ nodes }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  pushHistory: (data) =>
    set((state) => {
      const history = { ...state.history }
      for (const [name, val] of Object.entries(data)) {
        const existing = history[name] ?? []
        history[name] = [...existing.slice(-59), val]
      }
      return { history }
    }),
}))

import { create } from 'zustand'
import type { NodeMetric } from '../types.js'

interface NodesState {
  nodes: NodeMetric[]
  selectedIndex: number
  history: Record<string, number[]>
  setNodes: (nodes: NodeMetric[]) => void
  setSelectedIndex: (i: number) => void
  pushHistory: (data: Record<string, number>) => void
  seedHistory: (data: Record<string, number>, count: number) => void
}

// Keep enough history to fill the widest reasonable terminal (e.g. ultrawide 4K ~ 500 cols)
const MAX_HISTORY = 500

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
        history[name] = [...existing.slice(-(MAX_HISTORY - 1)), val]
      }
      return { history }
    }),
  seedHistory: (data, count) =>
    set((state) => {
      const history = { ...state.history }
      for (const [name, val] of Object.entries(data)) {
        if ((history[name]?.length ?? 0) <= 1) {
          history[name] = Array(Math.min(count, MAX_HISTORY)).fill(val)
        }
      }
      return { history }
    }),
}))

import { describe, it, expect, vi } from 'vitest'
import { useNodesStore } from '../src/store/nodes.js'
import { usePodsStore } from '../src/store/pods.js'
import { useUiStore } from '../src/store/ui.js'
import type { PodMetric, NodeMetric } from '../src/types.js'

const makePod = (overrides: Partial<PodMetric> = {}): PodMetric => ({
  name: 'test-pod',
  namespace: 'default',
  nodeName: 'node-1',
  cpuCores: 0.1,
  memoryMi: 128,
  status: 'Running',
  lastRestartAgeSeconds: Infinity,
  isVcluster: false,
  ...overrides,
})

describe('nodesStore', () => {
  it('stores nodes', () => {
    const node: NodeMetric = { name: 'n1', cpuCores: 0.5, cpuPercent: 10, memoryMi: 1024, memoryPercent: 40, role: 'worker', status: 'Ready' }
    useNodesStore.getState().setNodes([node])
    expect(useNodesStore.getState().nodes).toHaveLength(1)
  })

  it('pushes CPU history and caps at 500', () => {
    const { pushHistory } = useNodesStore.getState()
    for (let i = 0; i < 505; i++) pushHistory({ all: i })
    const history = useNodesStore.getState().history['all']!
    expect(history).toHaveLength(500)
    expect(history[499]).toBe(504)
  })

  it('aggregates multiple nodes in history', () => {
    useNodesStore.getState().pushHistory({ node1: 20, node2: 40, all: 30 })
    const h = useNodesStore.getState().history
    expect(h['node1']).toHaveLength(1)
    expect(h['all']).toHaveLength(1)
  })

  it('seedHistory fills the history with N copies of the value', () => {
    useNodesStore.getState().seedHistory({ all: 50 }, 10)
    expect(useNodesStore.getState().history['all']).toHaveLength(10)
    expect(useNodesStore.getState().history['all']!.every((v) => v === 50)).toBe(true)
  })

  it('seedHistory caps at MAX_HISTORY (500) even if asked for more', () => {
    useNodesStore.getState().seedHistory({ all: 1 }, 9999)
    expect(useNodesStore.getState().history['all']).toHaveLength(500)
  })

  it('seedHistory skips a key that already has more than one entry', () => {
    useNodesStore.getState().pushHistory({ all: 10 })
    useNodesStore.getState().pushHistory({ all: 20 })
    useNodesStore.getState().seedHistory({ all: 99 }, 50)
    // Should retain the two pushed values, not get replaced
    expect(useNodesStore.getState().history['all']).toEqual([10, 20])
  })

  it('setSelectedIndex updates selectedIndex', () => {
    useNodesStore.getState().setSelectedIndex(3)
    expect(useNodesStore.getState().selectedIndex).toBe(3)
  })
})

describe('podsStore — filtering', () => {
  it('shows all pods when filter is empty', () => {
    usePodsStore.getState().setPods([makePod({ name: 'aaa' }), makePod({ name: 'bbb' })])
    expect(usePodsStore.getState().filteredPods).toHaveLength(2)
  })

  it('filters pods by name', () => {
    usePodsStore.getState().setPods([makePod({ name: 'frontend' }), makePod({ name: 'backend' })])
    usePodsStore.getState().setFilterText('front')
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
    expect(usePodsStore.getState().filteredPods[0].name).toBe('frontend')
  })

  it('filters pods by namespace', () => {
    usePodsStore.getState().setPods([
      makePod({ namespace: 'kube-system' }),
      makePod({ namespace: 'default' }),
    ])
    usePodsStore.getState().setFilterText('kube')
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
  })

  it('filter is case-insensitive', () => {
    usePodsStore.getState().setPods([makePod({ name: 'FrontEnd' })])
    usePodsStore.getState().setFilterText('FRONT')
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
  })

  it('recomputes filteredPods when pods are replaced', () => {
    usePodsStore.getState().setFilterText('front')
    usePodsStore.getState().setPods([makePod({ name: 'frontend' })])
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
  })

  it('setNodeFilter scopes pods to the named node (after debounce)', async () => {
    vi.useFakeTimers()
    usePodsStore.getState().setPods([
      makePod({ name: 'a', nodeName: 'node-1' }),
      makePod({ name: 'b', nodeName: 'node-2' }),
    ])
    usePodsStore.getState().setNodeFilter('node-1')
    // setNodeFilter schedules an async refilter; flush
    await vi.runAllTimersAsync()
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
    expect(usePodsStore.getState().filteredPods[0].name).toBe('a')
    vi.useRealTimers()
  })

  it('setNodeFilter empty string shows pods from all nodes', async () => {
    vi.useFakeTimers()
    usePodsStore.getState().setPods([
      makePod({ name: 'a', nodeName: 'node-1' }),
      makePod({ name: 'b', nodeName: 'node-2' }),
    ])
    usePodsStore.getState().setNodeFilter('node-1')
    await vi.runAllTimersAsync()
    usePodsStore.getState().setNodeFilter('')
    await vi.runAllTimersAsync()
    expect(usePodsStore.getState().filteredPods).toHaveLength(2)
    vi.useRealTimers()
  })

  it('rapid setNodeFilter only refilters once (debounced)', async () => {
    vi.useFakeTimers()
    usePodsStore.getState().setPods([makePod({ nodeName: 'node-1' })])
    usePodsStore.getState().setNodeFilter('node-1')
    usePodsStore.getState().setNodeFilter('node-2')
    usePodsStore.getState().setNodeFilter('node-3')
    await vi.runAllTimersAsync()
    // Only the final filter applies
    expect(usePodsStore.getState().nodeFilter).toBe('node-3')
    expect(usePodsStore.getState().filteredPods).toHaveLength(0)
    vi.useRealTimers()
  })
})

describe('podsStore — sorting', () => {
  it('sorts by CPU descending', () => {
    usePodsStore.getState().setPods([
      makePod({ name: 'low', cpuCores: 0.1 }),
      makePod({ name: 'high', cpuCores: 0.9 }),
    ])
    usePodsStore.getState().setSortMode('cpu')
    expect(usePodsStore.getState().filteredPods[0].name).toBe('high')
  })

  it('sorts by memory descending', () => {
    usePodsStore.getState().setPods([
      makePod({ name: 'small', memoryMi: 64 }),
      makePod({ name: 'large', memoryMi: 512 }),
    ])
    usePodsStore.getState().setSortMode('memory')
    expect(usePodsStore.getState().filteredPods[0].name).toBe('large')
  })

  it('sorts by status alphabetically', () => {
    usePodsStore.getState().setPods([
      makePod({ name: 'b', status: 'Running' }),
      makePod({ name: 'a', status: 'CrashLoopBackOff' }),
    ])
    usePodsStore.getState().setSortMode('status')
    expect(usePodsStore.getState().filteredPods[0].status).toBe('CrashLoopBackOff')
  })

  it('sorts by namespace alphabetically', () => {
    usePodsStore.getState().setPods([
      makePod({ name: 'z', namespace: 'zzz' }),
      makePod({ name: 'a', namespace: 'aaa' }),
    ])
    usePodsStore.getState().setSortMode('namespace')
    expect(usePodsStore.getState().filteredPods[0].namespace).toBe('aaa')
  })

  it('sorts by restarts ascending (most recent first)', () => {
    usePodsStore.getState().setPods([
      makePod({ name: 'old', lastRestartAgeSeconds: 7200 }),
      makePod({ name: 'recent', lastRestartAgeSeconds: 60 }),
      makePod({ name: 'never', lastRestartAgeSeconds: Infinity }),
    ])
    usePodsStore.getState().setSortMode('restarts')
    expect(usePodsStore.getState().filteredPods[0].name).toBe('recent')
    expect(usePodsStore.getState().filteredPods[2].name).toBe('never')
  })

  it('setFilterText resets selectedIndex and scrollOffset to 0', () => {
    usePodsStore.setState({ selectedIndex: 5, scrollOffset: 10 } as never)
    usePodsStore.getState().setPods([makePod({ name: 'a' }), makePod({ name: 'b' })])
    usePodsStore.getState().setFilterText('a')
    expect(usePodsStore.getState().selectedIndex).toBe(0)
    expect(usePodsStore.getState().scrollOffset).toBe(0)
  })
})

describe('podsStore — scroll and selection', () => {
  it('setSelectedIndex updates selectedIndex', () => {
    usePodsStore.getState().setSelectedIndex(7)
    expect(usePodsStore.getState().selectedIndex).toBe(7)
  })

  it('setScrollOffset updates scrollOffset', () => {
    usePodsStore.getState().setScrollOffset(25)
    expect(usePodsStore.getState().scrollOffset).toBe(25)
  })

  it('setShowFilter toggles filter visibility', () => {
    usePodsStore.getState().setShowFilter(true)
    expect(usePodsStore.getState().showFilter).toBe(true)
    usePodsStore.getState().setShowFilter(false)
    expect(usePodsStore.getState().showFilter).toBe(false)
  })
})

describe('uiStore — ESC chain', () => {
  it('clears filter first', () => {
    usePodsStore.setState({ showFilter: true, filterText: 'abc' } as never)
    useUiStore.getState().handleEsc()
    expect(usePodsStore.getState().showFilter).toBe(false)
    expect(usePodsStore.getState().filterText).toBe('')
  })

  it('switches focus to nodes second (when in pods, no filter)', () => {
    useUiStore.setState({ focusedPanel: 'pods' } as never)
    useUiStore.getState().handleEsc()
    expect(useUiStore.getState().focusedPanel).toBe('nodes')
  })

  it('disconnects vcluster third (when nodes-focused, no filter)', () => {
    useUiStore.setState({ focusedPanel: 'nodes', vclusterConnected: true } as never)
    useUiStore.getState().handleEsc()
    expect(useUiStore.getState().vclusterConnected).toBe(false)
  })

  it('exits process at the end of the chain (no filter, no pods focus, no vcluster)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    useUiStore.setState({ focusedPanel: 'nodes', vclusterConnected: false } as never)
    useUiStore.getState().handleEsc()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })
})

describe('uiStore — setters', () => {
  it('setFocusedPanel switches the focused panel', () => {
    useUiStore.getState().setFocusedPanel('pods')
    expect(useUiStore.getState().focusedPanel).toBe('pods')
  })

  it('setIsVcluster toggles vcluster flag', () => {
    useUiStore.getState().setIsVcluster(true)
    expect(useUiStore.getState().isVcluster).toBe(true)
  })

  it('setVclusterConnected toggles connected flag', () => {
    useUiStore.getState().setVclusterConnected(true)
    expect(useUiStore.getState().vclusterConnected).toBe(true)
  })

  it('setLastError stores and clears errors', () => {
    useUiStore.getState().setLastError('boom')
    expect(useUiStore.getState().lastError).toBe('boom')
    useUiStore.getState().setLastError(null)
    expect(useUiStore.getState().lastError).toBeNull()
  })
})

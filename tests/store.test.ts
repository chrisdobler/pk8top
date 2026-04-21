import { describe, it, expect, beforeEach } from 'vitest'
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

beforeEach(() => {
  useNodesStore.setState({ nodes: [], selectedIndex: 0, history: {} })
  usePodsStore.setState({
    pods: [],
    filteredPods: [],
    filterText: '',
    showFilter: false,
    sortMode: 'cpu',
    nodeFilter: '',
    selectedIndex: 0,
    scrollOffset: 0,
  })
  useUiStore.setState({
    focusedPanel: 'nodes',
    isVcluster: false,
    vclusterConnected: false,
    lastError: null,
  })
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

  it('recomputes filteredPods when pods are replaced', () => {
    usePodsStore.getState().setFilterText('front')
    usePodsStore.getState().setPods([makePod({ name: 'frontend' })])
    expect(usePodsStore.getState().filteredPods).toHaveLength(1)
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
})

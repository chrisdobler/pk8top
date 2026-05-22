import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'

// Mocks before importing the hook
const podLogsMock = vi.fn((_n: string, _ns: string) => 'log-output')
const podDescribeMock = vi.fn((_n: string, _ns: string) => 'describe-output')
const podDeleteMock = vi.fn((_n: string, _ns: string) => true)
const listNamespaceResourcesMock = vi.fn((_ns: string) => 'resources')
const vclusterConnectMock = vi.fn((_n: string, _ns: string) => true)

vi.mock('../../src/lib/kubectl.js', () => ({
  podLogs: (n: string, ns: string) => podLogsMock(n, ns),
  podDescribe: (n: string, ns: string) => podDescribeMock(n, ns),
  podDelete: (n: string, ns: string) => podDeleteMock(n, ns),
  listNamespaceResources: (ns: string) => listNamespaceResourcesMock(ns),
  vclusterConnect: (n: string, ns: string) => vclusterConnectMock(n, ns),
}))

const showActionModalMock = vi.fn<(p: string, ns: string, actions: string[]) => string | null>(
  () => null,
)
const showFullScreenViewerMock = vi.fn()

vi.mock('../../src/lib/outputViewer.js', () => ({
  showActionModal: (p: string, ns: string, actions: string[]) => showActionModalMock(p, ns, actions),
  showFullScreenViewer: (title: string, content: string) => showFullScreenViewerMock(title, content),
}))

import { useKeyboard } from '../../src/hooks/useKeyboard.js'
import { useNodesStore } from '../../src/store/nodes.js'
import { usePodsStore } from '../../src/store/pods.js'
import { useUiStore } from '../../src/store/ui.js'
import type { PodMetric, NodeMetric } from '../../src/types.js'

function Host() {
  useKeyboard()
  return null
}

async function tick() {
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

const makeNode = (name: string): NodeMetric => ({
  name,
  cpuCores: 0.5,
  cpuPercent: 50,
  memoryMi: 1024,
  memoryPercent: 50,
  role: 'worker',
  status: 'Ready',
})

const makePod = (overrides: Partial<PodMetric> = {}): PodMetric => ({
  name: 'p1',
  namespace: 'default',
  nodeName: 'node-1',
  cpuCores: 0.1,
  memoryMi: 128,
  status: 'Running',
  lastRestartAgeSeconds: Infinity,
  isVcluster: false,
  ...overrides,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any

beforeEach(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  podLogsMock.mockClear()
  podDescribeMock.mockClear()
  podDeleteMock.mockClear()
  listNamespaceResourcesMock.mockClear()
  vclusterConnectMock.mockClear()
  showActionModalMock.mockClear()
  showFullScreenViewerMock.mockClear()
  showActionModalMock.mockReturnValue(null)
})

afterEach(() => {
  exitSpy.mockRestore()
})

describe('useKeyboard — nodes panel', () => {
  it('arrow down increments selectedIndex and sets nodeFilter', async () => {
    useNodesStore.setState({ nodes: [makeNode('node-1'), makeNode('node-2')] })
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b[B')
    await tick()
    expect(useNodesStore.getState().selectedIndex).toBe(1)
    expect(usePodsStore.getState().nodeFilter).toBe('node-1')
  })

  it('j key acts like arrow down', async () => {
    useNodesStore.setState({ nodes: [makeNode('a'), makeNode('b')] })
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('j')
    await tick()
    expect(useNodesStore.getState().selectedIndex).toBe(1)
  })

  it('k key acts like arrow up', async () => {
    useNodesStore.setState({ nodes: [makeNode('a'), makeNode('b')], selectedIndex: 2 })
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('k')
    await tick()
    expect(useNodesStore.getState().selectedIndex).toBe(1)
  })

  it('selectedIndex 0 sets nodeFilter to empty (All Nodes)', async () => {
    useNodesStore.setState({ nodes: [makeNode('node-1')], selectedIndex: 1 })
    usePodsStore.setState({ nodeFilter: 'node-1' } as never)
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('k')
    await tick()
    expect(useNodesStore.getState().selectedIndex).toBe(0)
    expect(usePodsStore.getState().nodeFilter).toBe('')
  })

  it('Return switches focus to pods', async () => {
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(useUiStore.getState().focusedPanel).toBe('pods')
  })
})

describe('useKeyboard — pods panel', () => {
  beforeEach(() => {
    useUiStore.setState({ focusedPanel: 'pods' } as never)
  })

  it('arrow down increments pods selectedIndex', async () => {
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'a' }), makePod({ name: 'b' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b[B')
    await tick()
    expect(usePodsStore.getState().selectedIndex).toBe(1)
  })

  it('arrow down clamps at last index', async () => {
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'a' }), makePod({ name: 'b' })],
      selectedIndex: 1,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('j')
    await tick()
    expect(usePodsStore.getState().selectedIndex).toBe(1)
  })

  it('right arrow cycles sort mode forward', async () => {
    usePodsStore.setState({ sortMode: 'cpu' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b[C')
    await tick()
    expect(usePodsStore.getState().sortMode).toBe('memory')
  })

  it('l key cycles sort mode forward', async () => {
    usePodsStore.setState({ sortMode: 'cpu' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('l')
    await tick()
    expect(usePodsStore.getState().sortMode).toBe('memory')
  })

  it('h key cycles sort mode backward (wraps from cpu to restarts)', async () => {
    usePodsStore.setState({ sortMode: 'cpu' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('h')
    await tick()
    expect(usePodsStore.getState().sortMode).toBe('restarts')
  })

  it('right arrow wraps from restarts back to cpu', async () => {
    usePodsStore.setState({ sortMode: 'restarts' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b[C')
    await tick()
    expect(usePodsStore.getState().sortMode).toBe('cpu')
  })

  it('Enter opens the action modal and calls podDescribe on Describe', async () => {
    showActionModalMock.mockReturnValue('Describe')
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'mypod', namespace: 'myns' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(showActionModalMock).toHaveBeenCalledWith('mypod', 'myns', expect.any(Array))
    expect(podDescribeMock).toHaveBeenCalledWith('mypod', 'myns')
    expect(showFullScreenViewerMock).toHaveBeenCalled()
  })

  it('Enter → Logs calls podLogs and viewer', async () => {
    showActionModalMock.mockReturnValue('Logs')
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'p', namespace: 'ns' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(podLogsMock).toHaveBeenCalledWith('p', 'ns')
    expect(showFullScreenViewerMock).toHaveBeenCalled()
  })

  it('Enter → Delete calls podDelete', async () => {
    showActionModalMock.mockReturnValue('Delete')
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'p', namespace: 'ns' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(podDeleteMock).toHaveBeenCalledWith('p', 'ns')
  })

  it('Enter → List Namespace Resources calls listNamespaceResources', async () => {
    showActionModalMock.mockReturnValue('List Namespace Resources')
    usePodsStore.setState({
      filteredPods: [makePod({ namespace: 'team-a' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(listNamespaceResourcesMock).toHaveBeenCalledWith('team-a')
  })

  it('Enter → Connect to vCluster calls vclusterConnect for vcluster pod', async () => {
    showActionModalMock.mockReturnValue('Connect to vCluster')
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'vc', namespace: 'team', isVcluster: true })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(vclusterConnectMock).toHaveBeenCalledWith('vc', 'team')
    expect(useUiStore.getState().vclusterConnected).toBe(true)
  })

  it('Enter → Cancel does nothing', async () => {
    showActionModalMock.mockReturnValue('Cancel')
    usePodsStore.setState({
      filteredPods: [makePod({ name: 'p' })],
      selectedIndex: 0,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(podLogsMock).not.toHaveBeenCalled()
    expect(podDescribeMock).not.toHaveBeenCalled()
    expect(podDeleteMock).not.toHaveBeenCalled()
  })
})

describe('useKeyboard — filter mode + quit + ESC', () => {
  it('/ opens filter mode', async () => {
    useUiStore.setState({ focusedPanel: 'pods' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('/')
    await tick()
    expect(usePodsStore.getState().showFilter).toBe(true)
  })

  it('Enter in filter mode closes the filter', async () => {
    usePodsStore.setState({ showFilter: true } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\r')
    await tick()
    expect(usePodsStore.getState().showFilter).toBe(false)
  })

  it('q exits the process (outside filter)', async () => {
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('q')
    await tick()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('q in filter mode does not exit', async () => {
    usePodsStore.setState({ showFilter: true } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('q')
    await tick()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('ESC in pods focus switches back to nodes', async () => {
    useUiStore.setState({ focusedPanel: 'pods' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b')
    await tick()
    expect(useUiStore.getState().focusedPanel).toBe('nodes')
  })

  it('ESC clears active filter first', async () => {
    usePodsStore.setState({ showFilter: true, filterText: 'foo' } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b')
    await tick()
    expect(usePodsStore.getState().showFilter).toBe(false)
    expect(usePodsStore.getState().filterText).toBe('')
  })

  it('ESC disconnects vcluster when connected (and not in pods focus, no filter)', async () => {
    useUiStore.setState({
      focusedPanel: 'nodes',
      vclusterConnected: true,
    } as never)
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b')
    await tick()
    expect(useUiStore.getState().vclusterConnected).toBe(false)
  })

  it('ESC at root (nodes focus, no filter, not vcluster-connected) exits', async () => {
    const { stdin } = render(<Host />)
    await tick()
    stdin.write('\x1b')
    await tick()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})

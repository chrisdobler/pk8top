import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'

// kubectl module mocks — resolved promises that return immediately
const detectVclusterMock = vi.fn(async (_s?: AbortSignal) => false)
const topNodesMock = vi.fn(async (_s?: AbortSignal) => ({ stdout: '', error: '' }))
const getNodesMock = vi.fn(async (_s?: AbortSignal) => '{"items":[]}')
const topPodsMock = vi.fn(async (_s?: AbortSignal) => ({ stdout: '', error: '' }))
const getPodsMock = vi.fn(async (_s?: AbortSignal) => '{"items":[]}')
const podLogsMock = vi.fn((_n: string, _ns: string) => 'pretend log output')
const podDescribeMock = vi.fn((_n: string, _ns: string) => 'pretend describe output')
const podDeleteMock = vi.fn((_n: string, _ns: string) => true)
const listNamespaceResourcesMock = vi.fn((_ns: string) => 'pretend list')
const vclusterConnectMock = vi.fn((_n: string, _ns: string) => true)

vi.mock('../../src/lib/kubectl.js', () => ({
  detectVcluster: (s?: AbortSignal) => detectVclusterMock(s),
  topNodes: (s?: AbortSignal) => topNodesMock(s),
  getNodes: (s?: AbortSignal) => getNodesMock(s),
  topPods: (s?: AbortSignal) => topPodsMock(s),
  getPods: (s?: AbortSignal) => getPodsMock(s),
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

import App from '../../src/app.js'
import { useNodesStore } from '../../src/store/nodes.js'
import { usePodsStore } from '../../src/store/pods.js'
import { setExitFn } from '../../src/lib/exit.js'

async function tick() {
  await new Promise((r) => setTimeout(r, 20))
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

const NODE_TOP =
  'node-1   500m   10%   1024Mi   40%\n' +
  'node-2   1500m   30%   2048Mi   70%'
const NODE_JSON = JSON.stringify({
  items: [
    { metadata: { name: 'node-1', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
    { metadata: { name: 'node-2', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'True' }] } },
  ],
})
const POD_TOP =
  'default     web-1   100m   256Mi\n' +
  'kube-system coredns-x   50m   128Mi'
const POD_JSON = JSON.stringify({
  items: [
    {
      metadata: { name: 'web-1', namespace: 'default', labels: {} },
      spec: { nodeName: 'node-1' },
      status: { phase: 'Running', containerStatuses: [] },
    },
    {
      metadata: { name: 'coredns-x', namespace: 'kube-system', labels: {} },
      spec: { nodeName: 'node-2' },
      status: { phase: 'Running', containerStatuses: [] },
    },
  ],
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any

beforeEach(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
  detectVclusterMock.mockClear()
  topNodesMock.mockClear()
  getNodesMock.mockClear()
  topPodsMock.mockClear()
  getPodsMock.mockClear()
  podLogsMock.mockClear()
  podDescribeMock.mockClear()
  podDeleteMock.mockClear()
  listNamespaceResourcesMock.mockClear()
  vclusterConnectMock.mockClear()
  showActionModalMock.mockClear()
  showFullScreenViewerMock.mockClear()
  showActionModalMock.mockReturnValue(null)

  // Default mock responses with two nodes + two pods
  detectVclusterMock.mockImplementation(async () => false)
  topNodesMock.mockImplementation(async () => ({ stdout: NODE_TOP, error: '' }))
  getNodesMock.mockImplementation(async () => NODE_JSON)
  topPodsMock.mockImplementation(async () => ({ stdout: POD_TOP, error: '' }))
  getPodsMock.mockImplementation(async () => POD_JSON)
})

afterEach(() => {
  exitSpy.mockRestore()
})

describe('App integration', () => {
  it('mounts, fetches, and populates stores with both nodes and pods', async () => {
    const { lastFrame } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    expect(topNodesMock).toHaveBeenCalled()
    expect(useNodesStore.getState().nodes).toHaveLength(2)
    expect(usePodsStore.getState().pods).toHaveLength(2)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('node-1')
    expect(frame).toContain('node-2')
    // At least one pod is visible in the (small test viewport) window
    expect(frame).toContain('web-1')
  })

  it('typing / opens the filter input', async () => {
    const { stdin, lastFrame } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    stdin.write('/')
    await tick()
    expect(lastFrame()).toContain('Filter')
  })

  it('Tab between panels then Enter on a pod fires the action modal', async () => {
    const { stdin } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    // Move focus to pods (Enter from nodes panel)
    stdin.write('\r')
    await tick()
    // Now in pods. The Enter handler invokes showActionModal
    stdin.write('\r')
    await tick()
    expect(showActionModalMock).toHaveBeenCalled()
  })

  it('selecting Logs from the modal calls podLogs and the viewer', async () => {
    showActionModalMock.mockReturnValue('Logs')
    const { stdin } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    stdin.write('\r') // focus pods
    await tick()
    stdin.write('\r') // open modal (mocked to return 'Logs')
    await tick()
    expect(podLogsMock).toHaveBeenCalled()
    expect(showFullScreenViewerMock).toHaveBeenCalled()
    const [title, content] = showFullScreenViewerMock.mock.calls[0]
    expect(title).toMatch(/Logs:/)
    expect(content).toBe('pretend log output')
  })

  it('arrow-down on a node sets the pods nodeFilter', async () => {
    const { stdin } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    stdin.write('\x1b[B') // arrow down → selectedIndex 1 → nodeFilter = node-1
    await tick()
    // Allow scheduleRefilter to flush
    await new Promise((r) => setTimeout(r, 5))
    expect(usePodsStore.getState().nodeFilter).toBe('node-1')
  })

  it('sort cycling with l in the pods panel updates the ControlsBar indicator', async () => {
    const { stdin, lastFrame } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    stdin.write('\r') // focus pods
    await tick()
    stdin.write('l') // cpu -> memory
    await tick()
    expect(lastFrame()).toContain('memory')
  })

  it('q routes through the exit registry instead of calling process.exit directly', async () => {
    const { stdin } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    // App's useEffect already registered Ink's useApp().exit; swap it for a spy
    // so we can observe the request without unmounting the test instance.
    const exitFn = vi.fn()
    setExitFn(exitFn)
    stdin.write('q')
    await tick()
    expect(exitFn).toHaveBeenCalledTimes(1)
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('re-renders with a taller layout when stdout emits resize', async () => {
    const { stdout, lastFrame } = render(<App config={{ interval: 5, historyPoints: 60 }} />)
    await tick()
    const before = (lastFrame() ?? '').split('\n').length

    Object.defineProperty(stdout, 'rows', { value: 80, configurable: true })
    stdout.emit('resize')
    await tick()

    const after = (lastFrame() ?? '').split('\n').length
    expect(after).toBeGreaterThan(before)
  })
})

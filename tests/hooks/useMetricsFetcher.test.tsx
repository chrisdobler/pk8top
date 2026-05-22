import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

let detectVclusterDeferred: Deferred<boolean>
let topNodesDeferred: Deferred<{ stdout: string; error: string }>
let getNodesDeferred: Deferred<string>
let topPodsDeferred: Deferred<{ stdout: string; error: string }>
let getPodsDeferred: Deferred<string>

const detectVclusterMock = vi.fn((_signal?: AbortSignal) => detectVclusterDeferred.promise)
const topNodesMock = vi.fn((_signal?: AbortSignal) => topNodesDeferred.promise)
const getNodesMock = vi.fn((_signal?: AbortSignal) => getNodesDeferred.promise)
const topPodsMock = vi.fn((_signal?: AbortSignal) => topPodsDeferred.promise)
const getPodsMock = vi.fn((_signal?: AbortSignal) => getPodsDeferred.promise)

vi.mock('../../src/lib/kubectl.js', () => ({
  detectVcluster: (signal?: AbortSignal) => detectVclusterMock(signal),
  topNodes: (signal?: AbortSignal) => topNodesMock(signal),
  getNodes: (signal?: AbortSignal) => getNodesMock(signal),
  topPods: (signal?: AbortSignal) => topPodsMock(signal),
  getPods: (signal?: AbortSignal) => getPodsMock(signal),
}))

import { useMetricsFetcher } from '../../src/hooks/useMetricsFetcher.js'
import { useNodesStore } from '../../src/store/nodes.js'
import { usePodsStore } from '../../src/store/pods.js'
import { useUiStore } from '../../src/store/ui.js'

function Host({ interval }: { interval: number }) {
  useMetricsFetcher(interval)
  return null
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
const POD_TOP = 'default   p1   100m   256Mi'
const POD_JSON = JSON.stringify({
  items: [{
    metadata: { name: 'p1', namespace: 'default', labels: {} },
    spec: { nodeName: 'node-1' },
    status: { phase: 'Running', containerStatuses: [] },
  }],
})

function resetDeferreds() {
  detectVclusterDeferred = deferred<boolean>()
  topNodesDeferred = deferred<{ stdout: string; error: string }>()
  getNodesDeferred = deferred<string>()
  topPodsDeferred = deferred<{ stdout: string; error: string }>()
  getPodsDeferred = deferred<string>()
}

async function tick() {
  // Wait for Ink to mount and React useEffect to fire, then any pending microtasks.
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

function resolveAllSuccess() {
  detectVclusterDeferred.resolve(false)
  topNodesDeferred.resolve({ stdout: NODE_TOP, error: '' })
  getNodesDeferred.resolve(NODE_JSON)
  topPodsDeferred.resolve({ stdout: POD_TOP, error: '' })
  getPodsDeferred.resolve(POD_JSON)
}

beforeEach(() => {
  resetDeferreds()
  detectVclusterMock.mockClear()
  topNodesMock.mockClear()
  getNodesMock.mockClear()
  topPodsMock.mockClear()
  getPodsMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMetricsFetcher', () => {
  it('invokes all 5 kubectl helpers in parallel on mount', async () => {
    render(<Host interval={5} />)
    await tick()
    expect(detectVclusterMock).toHaveBeenCalledTimes(1)
    expect(topNodesMock).toHaveBeenCalledTimes(1)
    expect(getNodesMock).toHaveBeenCalledTimes(1)
    expect(topPodsMock).toHaveBeenCalledTimes(1)
    expect(getPodsMock).toHaveBeenCalledTimes(1)
  })

  it('passes the same AbortSignal to every helper', async () => {
    render(<Host interval={5} />)
    await tick()
    const signal = detectVclusterMock.mock.calls[0][0]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(topNodesMock.mock.calls[0][0]).toBe(signal)
    expect(getNodesMock.mock.calls[0][0]).toBe(signal)
    expect(topPodsMock.mock.calls[0][0]).toBe(signal)
    expect(getPodsMock.mock.calls[0][0]).toBe(signal)
  })

  it('populates nodes, pods, and isVcluster stores after a successful tick', async () => {
    render(<Host interval={5} />)
    await tick()
    detectVclusterDeferred.resolve(true)
    topNodesDeferred.resolve({ stdout: NODE_TOP, error: '' })
    getNodesDeferred.resolve(NODE_JSON)
    topPodsDeferred.resolve({ stdout: POD_TOP, error: '' })
    getPodsDeferred.resolve(POD_JSON)
    await tick()

    expect(useNodesStore.getState().nodes).toHaveLength(2)
    expect(usePodsStore.getState().pods).toHaveLength(1)
    expect(useUiStore.getState().isVcluster).toBe(true)
    expect(useUiStore.getState().lastError).toBeNull()
  })

  it('seeds CPU history once on first non-empty fetch', async () => {
    render(<Host interval={5} />)
    await tick()
    resolveAllSuccess()
    await tick()

    const h = useNodesStore.getState().history['all']!
    expect(h.length).toBeGreaterThan(1)
  })

  it('surfaces top-error into lastError when stdout is empty', async () => {
    render(<Host interval={5} />)
    await tick()
    detectVclusterDeferred.resolve(false)
    topNodesDeferred.resolve({ stdout: '', error: 'metrics-server unavailable' })
    getNodesDeferred.resolve('{}')
    topPodsDeferred.resolve({ stdout: '', error: '' })
    getPodsDeferred.resolve('{"items":[]}')
    await tick()

    expect(useUiStore.getState().lastError).toBe('metrics-server unavailable')
  })

  it('catches a rejected kubectl call into lastError', async () => {
    render(<Host interval={5} />)
    await tick()
    detectVclusterDeferred.resolve(false)
    topNodesDeferred.reject(new Error('boom'))
    getNodesDeferred.resolve('{}')
    topPodsDeferred.resolve({ stdout: '', error: '' })
    getPodsDeferred.resolve('{"items":[]}')
    await tick()

    expect(useUiStore.getState().lastError).toMatch(/boom/)
  })

  it('schedules a second tick after the interval', async () => {
    // Real-timer mount so React effects can fire, then switch to fake timers
    // for the interval-driven second tick.
    render(<Host interval={2} />)
    await tick()
    expect(topNodesMock).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    resolveAllSuccess()
    // Microtask flushes only (fake timers don't auto-run microtasks)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    resetDeferreds()

    await vi.advanceTimersByTimeAsync(2000)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(topNodesMock).toHaveBeenCalledTimes(2)
  })

  it('aborts in-flight fetch on unmount', async () => {
    const { unmount } = render(<Host interval={5} />)
    await tick()
    const signal = topNodesMock.mock.calls[0][0]!
    expect(signal.aborted).toBe(false)
    unmount()
    await tick()
    expect(signal.aborted).toBe(true)
  })

  it('does not update stores after unmount even if promises resolve late', async () => {
    const { unmount } = render(<Host interval={5} />)
    await tick()
    unmount()
    await tick()
    detectVclusterDeferred.resolve(true)
    topNodesDeferred.resolve({ stdout: NODE_TOP, error: '' })
    getNodesDeferred.resolve(NODE_JSON)
    topPodsDeferred.resolve({ stdout: POD_TOP, error: '' })
    getPodsDeferred.resolve(POD_JSON)
    await tick()

    expect(useNodesStore.getState().nodes).toHaveLength(0)
    expect(usePodsStore.getState().pods).toHaveLength(0)
    expect(useUiStore.getState().isVcluster).toBe(false)
  })
})

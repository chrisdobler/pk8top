import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

type SpawnArgs = { command: string; args: string[] }
type SpawnSyncArgs = { command: string; args: string[]; opts: unknown }

const spawnCalls: SpawnArgs[] = []
const spawnSyncCalls: SpawnSyncArgs[] = []
const liveChildren: FakeChild[] = []
let nextSyncResult: { stdout?: string; stderr?: string; status: number | null } = { status: 0 }

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill() {
    this.killed = true
  }
  emitData(channel: 'stdout' | 'stderr', text: string) {
    this[channel].emit('data', Buffer.from(text))
  }
  emitClose(code: number | null) {
    this.emit('close', code)
  }
  emitError(err: Error) {
    this.emit('error', err)
  }
}

vi.mock('child_process', () => ({
  spawn: (command: string, args: string[]) => {
    spawnCalls.push({ command, args })
    const child = new FakeChild()
    liveChildren.push(child)
    return child
  },
  spawnSync: (command: string, args: string[], opts: unknown) => {
    spawnSyncCalls.push({ command, args, opts })
    return {
      stdout: nextSyncResult.stdout ?? '',
      stderr: nextSyncResult.stderr ?? '',
      status: nextSyncResult.status,
    }
  },
}))

// Import after vi.mock so kubectl picks up the mocked child_process
import {
  topNodes,
  topPods,
  getNodes,
  getPods,
  detectVcluster,
  podLogs,
  podDescribe,
  podDelete,
  listNamespaceResources,
  vclusterConnect,
  vclusterDisconnect,
} from '../../src/lib/kubectl.js'

function lastChild(): FakeChild {
  return liveChildren[liveChildren.length - 1]!
}

beforeEach(() => {
  spawnCalls.length = 0
  spawnSyncCalls.length = 0
  liveChildren.length = 0
  nextSyncResult = { status: 0 }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('async polling helpers', () => {
  describe('topNodes', () => {
    it('returns stdout on success', async () => {
      const p = topNodes()
      const child = lastChild()
      child.emitData('stdout', 'node-1   500m   10%   1Gi   40%\n')
      child.emitClose(0)
      const r = await p
      expect(r.stdout).toContain('node-1')
      expect(r.error).toBe('')
      expect(spawnCalls[0].command).toBe('kubectl')
      expect(spawnCalls[0].args).toEqual(['top', 'nodes', '--no-headers'])
    })

    it('returns error on non-zero exit', async () => {
      const p = topNodes()
      const child = lastChild()
      child.emitData('stderr', 'permission denied\n')
      child.emitClose(1)
      const r = await p
      expect(r.stdout).toBe('')
      expect(r.error).toBe('permission denied')
    })
  })

  describe('topPods', () => {
    it('passes --no-headers --containers=false -A', async () => {
      const p = topPods()
      lastChild().emitClose(0)
      await p
      expect(spawnCalls[0].args).toEqual(['top', 'pods', '-A', '--no-headers', '--containers=false'])
    })
  })

  describe('getNodes', () => {
    it('returns JSON stdout on success', async () => {
      const p = getNodes()
      const child = lastChild()
      child.emitData('stdout', '{"items":[]}')
      child.emitClose(0)
      expect(await p).toBe('{"items":[]}')
    })

    it('returns empty JSON fallback on error', async () => {
      const p = getNodes()
      lastChild().emitClose(1)
      expect(await p).toBe('{}')
    })
  })

  describe('getPods', () => {
    it('returns empty-items fallback on error', async () => {
      const p = getPods()
      lastChild().emitClose(1)
      expect(await p).toBe('{"items":[]}')
    })
  })

  describe('detectVcluster', () => {
    it('returns true when context contains "vcluster"', async () => {
      const p = detectVcluster()
      const child = lastChild()
      child.emitData('stdout', 'my-VCluster-context\n')
      child.emitClose(0)
      expect(await p).toBe(true)
    })

    it('returns false when context lacks "vcluster"', async () => {
      const p = detectVcluster()
      const child = lastChild()
      child.emitData('stdout', 'minikube\n')
      child.emitClose(0)
      expect(await p).toBe(false)
    })

    it('returns false on kubectl error', async () => {
      const p = detectVcluster()
      lastChild().emitClose(1)
      expect(await p).toBe(false)
    })
  })
})

describe('async run() — abort + timeout + error', () => {
  it('resolves with aborted=false without spawning when signal is pre-aborted', async () => {
    const c = new AbortController()
    c.abort()
    const r = await topNodes(c.signal)
    expect(r.error).toBe('aborted')
    expect(spawnCalls).toHaveLength(0)
  })

  it('kills child and resolves when signal aborts mid-flight', async () => {
    const c = new AbortController()
    const p = topNodes(c.signal)
    const child = lastChild()
    c.abort()
    const r = await p
    expect(r.error).toBe('aborted')
    expect(child.killed).toBe(true)
  })

  it('kills child and resolves with timeout message after 15s', async () => {
    vi.useFakeTimers()
    const p = getNodes()
    const child = lastChild()
    vi.advanceTimersByTime(15001)
    const r = await p
    expect(child.killed).toBe(true)
    expect(r).toBe('{}') // getNodes maps ok:false to '{}' fallback
  })

  it('captures stderr.trim() on failure for top helpers', async () => {
    const p = topNodes()
    const child = lastChild()
    child.emitData('stderr', '   metrics-server not available  \n')
    child.emitClose(2)
    const r = await p
    expect(r.error).toBe('metrics-server not available')
  })

  it('resolves on spawn error event', async () => {
    const p = topNodes()
    lastChild().emitError(new Error('ENOENT kubectl'))
    const r = await p
    expect(r.error).toContain('ENOENT')
  })

  it('concatenates multiple stdout chunks', async () => {
    const p = getNodes()
    const child = lastChild()
    child.emitData('stdout', '{"items":[')
    child.emitData('stdout', '{"a":1}')
    child.emitData('stdout', ']}')
    child.emitClose(0)
    expect(await p).toBe('{"items":[{"a":1}]}')
  })
})

describe('sync action helpers', () => {
  describe('podLogs', () => {
    it('returns stdout on success', () => {
      nextSyncResult = { stdout: 'log line 1\nlog line 2', status: 0 }
      expect(podLogs('my-pod', 'default')).toBe('log line 1\nlog line 2')
      expect(spawnSyncCalls[0].command).toBe('kubectl')
      expect(spawnSyncCalls[0].args).toEqual(['logs', 'my-pod', '-n', 'default', '--tail=100'])
    })

    it('returns stderr on failure', () => {
      nextSyncResult = { stderr: 'pod not found', status: 1 }
      expect(podLogs('missing', 'default')).toBe('pod not found')
    })
  })

  describe('podDescribe', () => {
    it('returns stdout on success', () => {
      nextSyncResult = { stdout: 'Name: x', status: 0 }
      expect(podDescribe('x', 'ns')).toBe('Name: x')
      expect(spawnSyncCalls[0].args).toEqual(['describe', 'pod', 'x', '-n', 'ns'])
    })

    it('returns stderr on failure', () => {
      nextSyncResult = { stderr: 'not found', status: 1 }
      expect(podDescribe('x', 'ns')).toBe('not found')
    })
  })

  describe('podDelete', () => {
    it('returns true on success', () => {
      nextSyncResult = { status: 0 }
      expect(podDelete('x', 'ns')).toBe(true)
      expect(spawnSyncCalls[0].args).toEqual(['delete', 'pod', 'x', '-n', 'ns'])
    })

    it('returns false on failure', () => {
      nextSyncResult = { status: 1 }
      expect(podDelete('x', 'ns')).toBe(false)
    })
  })

  describe('listNamespaceResources', () => {
    it('returns stdout on success', () => {
      nextSyncResult = { stdout: 'pod/a\nservice/b', status: 0 }
      expect(listNamespaceResources('default')).toBe('pod/a\nservice/b')
      expect(spawnSyncCalls[0].args).toEqual(['get', 'all', '-n', 'default'])
    })

    it('returns stderr on failure', () => {
      nextSyncResult = { stderr: 'forbidden', status: 1 }
      expect(listNamespaceResources('default')).toBe('forbidden')
    })
  })
})

describe('vcluster helpers', () => {
  it('vclusterConnect spawns vcluster connect with namespace', () => {
    nextSyncResult = { status: 0 }
    expect(vclusterConnect('vc-1', 'team-a')).toBe(true)
    expect(spawnSyncCalls[0].command).toBe('vcluster')
    expect(spawnSyncCalls[0].args).toEqual(['connect', 'vc-1', '-n', 'team-a'])
  })

  it('vclusterConnect returns false on non-zero status', () => {
    nextSyncResult = { status: 1 }
    expect(vclusterConnect('vc-1', 'team-a')).toBe(false)
  })

  it('vclusterDisconnect spawns vcluster disconnect', () => {
    nextSyncResult = { status: 0 }
    expect(vclusterDisconnect()).toBe(true)
    expect(spawnSyncCalls[0].command).toBe('vcluster')
    expect(spawnSyncCalls[0].args).toEqual(['disconnect'])
  })

  it('vclusterDisconnect returns false on non-zero status', () => {
    nextSyncResult = { status: 1 }
    expect(vclusterDisconnect()).toBe(false)
  })
})

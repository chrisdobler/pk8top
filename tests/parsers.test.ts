import { describe, it, expect } from 'vitest'
import {
  parseMemoryMi,
  parseCpuCores,
  parseRestartAgeSeconds,
  formatRestartAge,
  createCpuBarChars,
  parseNodeMetrics,
  parsePodTopAndGet,
} from '../src/lib/parsers.js'

describe('parseMemoryMi', () => {
  it('parses Ki', () => expect(parseMemoryMi('1024Ki')).toBeCloseTo(1.0))
  it('parses Mi', () => expect(parseMemoryMi('1024Mi')).toBeCloseTo(1024.0))
  it('parses Gi', () => expect(parseMemoryMi('1Gi')).toBeCloseTo(1024.0))
  it('parses Ti', () => expect(parseMemoryMi('1Ti')).toBeCloseTo(1024.0 * 1024.0))
  it('returns 0 for invalid input', () => expect(parseMemoryMi('bad')).toBe(0))
})

describe('parseCpuCores', () => {
  it('parses millicores', () => expect(parseCpuCores('500m')).toBeCloseTo(0.5))
  it('parses full cores', () => expect(parseCpuCores('2')).toBeCloseTo(2.0))
  it('returns 0 for invalid input', () => expect(parseCpuCores('bad')).toBe(0))
})

describe('parseRestartAgeSeconds', () => {
  it('returns Infinity for "never"', () => expect(parseRestartAgeSeconds('never')).toBe(Infinity))
  it('returns Infinity for "?"', () => expect(parseRestartAgeSeconds('?')).toBe(Infinity))
  it('parses seconds', () => expect(parseRestartAgeSeconds('10s')).toBe(10))
  it('parses minutes', () => expect(parseRestartAgeSeconds('5m')).toBe(300))
  it('parses hours', () => expect(parseRestartAgeSeconds('2h')).toBe(7200))
  it('parses days', () => expect(parseRestartAgeSeconds('3d')).toBe(259200))
  it('returns Infinity for unknown format', () => expect(parseRestartAgeSeconds('not-a-time')).toBe(Infinity))
})

describe('formatRestartAge', () => {
  it('returns "never" for Infinity', () => expect(formatRestartAge(Infinity)).toBe('never'))
  it('formats seconds', () => expect(formatRestartAge(45)).toBe('45s'))
  it('formats minutes', () => expect(formatRestartAge(150)).toBe('2m'))
  it('formats hours', () => expect(formatRestartAge(7300)).toBe('2h'))
  it('formats days', () => expect(formatRestartAge(172800)).toBe('2d'))
})

describe('createCpuBarChars', () => {
  it('returns string of correct length', () => {
    expect(createCpuBarChars(50, 20).text.length).toBe(20)
  })
  it('uses green color below 50%', () => {
    expect(createCpuBarChars(10, 20).color).toBe('green')
  })
  it('uses yellow color 50-80%', () => {
    expect(createCpuBarChars(60, 20).color).toBe('yellow')
  })
  it('uses red color above 80%', () => {
    expect(createCpuBarChars(90, 20).color).toBe('red')
  })
  it('clamps percent below 0', () => {
    expect(createCpuBarChars(-10, 20).text.length).toBe(20)
  })
  it('clamps percent above 100', () => {
    expect(createCpuBarChars(200, 20).text.length).toBe(20)
  })
})

const NODE_TOP_STDOUT = `node-1   500m   10%   1024Mi   40%
node-2   1500m   30%   2048Mi   70%`

const NODE_GET_JSON = JSON.stringify({
  items: [
    {
      metadata: {
        name: 'node-1',
        labels: { 'node-role.kubernetes.io/control-plane': '' },
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    },
    {
      metadata: { name: 'node-2', labels: {} },
      status: {
        conditions: [{ type: 'Ready', status: 'False' }],
      },
    },
  ],
})

const POD_TOP_STDOUT = `default   frontend-abc   100m   256Mi
kube-system   coredns-xyz   50m   128Mi`

const POD_GET_JSON = JSON.stringify({
  items: [
    {
      metadata: { name: 'frontend-abc', namespace: 'default', labels: {} },
      spec: { nodeName: 'node-1' },
      status: {
        phase: 'Running',
        containerStatuses: [{ state: { running: {} }, lastState: {} }],
      },
    },
    {
      metadata: { name: 'coredns-xyz', namespace: 'kube-system', labels: {} },
      spec: { nodeName: 'node-1' },
      status: {
        phase: 'Running',
        containerStatuses: [],
      },
    },
  ],
})

describe('parseNodeMetrics', () => {
  it('parses two nodes', () => {
    const nodes = parseNodeMetrics(NODE_TOP_STDOUT, NODE_GET_JSON)
    expect(nodes).toHaveLength(2)
  })
  it('parses CPU correctly', () => {
    const nodes = parseNodeMetrics(NODE_TOP_STDOUT, NODE_GET_JSON)
    expect(nodes[0].cpuCores).toBeCloseTo(0.5)
    expect(nodes[0].cpuPercent).toBeCloseTo(10)
  })
  it('parses memory correctly', () => {
    const nodes = parseNodeMetrics(NODE_TOP_STDOUT, NODE_GET_JSON)
    expect(nodes[0].memoryMi).toBeCloseTo(1024)
    expect(nodes[0].memoryPercent).toBeCloseTo(40)
  })
  it('assigns role from metadata', () => {
    const nodes = parseNodeMetrics(NODE_TOP_STDOUT, NODE_GET_JSON)
    expect(nodes[0].role).toBe('control-plane')
    expect(nodes[1].role).toBe('worker')
  })
  it('assigns Ready status', () => {
    const nodes = parseNodeMetrics(NODE_TOP_STDOUT, NODE_GET_JSON)
    expect(nodes[0].status).toBe('Ready')
    expect(nodes[1].status).toBe('NotReady')
  })
  it('returns empty array on empty input', () => {
    expect(parseNodeMetrics('', NODE_GET_JSON)).toHaveLength(0)
  })
})

describe('parsePodTopAndGet', () => {
  it('parses two pods', () => {
    const pods = parsePodTopAndGet(POD_TOP_STDOUT, POD_GET_JSON)
    expect(pods).toHaveLength(2)
  })
  it('sets cpu and memory from top output', () => {
    const pods = parsePodTopAndGet(POD_TOP_STDOUT, POD_GET_JSON)
    const frontend = pods.find((p) => p.name === 'frontend-abc')!
    expect(frontend.cpuCores).toBeCloseTo(0.1)
    expect(frontend.memoryMi).toBeCloseTo(256)
  })
  it('sets status from pod phase', () => {
    const pods = parsePodTopAndGet(POD_TOP_STDOUT, POD_GET_JSON)
    expect(pods[0].status).toBe('Running')
  })
  it('defaults to zero metrics when pod not in top output', () => {
    const pods = parsePodTopAndGet('', POD_GET_JSON)
    expect(pods[0].cpuCores).toBe(0)
  })
  it('marks vcluster pods by namespace', () => {
    const vclusterPodGet = JSON.stringify({
      items: [{
        metadata: { name: 'vcluster-0', namespace: 'my-vcluster', labels: {} },
        spec: { nodeName: 'node-1' },
        status: { phase: 'Running', containerStatuses: [] },
      }],
    })
    const pods = parsePodTopAndGet('', vclusterPodGet)
    expect(pods[0].isVcluster).toBe(true)
  })
  it('marks vcluster pods by label', () => {
    const vclusterPodGet = JSON.stringify({
      items: [{
        metadata: { name: 'vc-0', namespace: 'default', labels: { app: 'vcluster' } },
        spec: { nodeName: 'node-1' },
        status: { phase: 'Running', containerStatuses: [] },
      }],
    })
    const pods = parsePodTopAndGet('', vclusterPodGet)
    expect(pods[0].isVcluster).toBe(true)
  })
})

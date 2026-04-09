import type { NodeMetric, PodMetric } from '../types.js'

/** Parse a Kubernetes memory string like "1024Mi", "8Gi", "1024Ki" to MiB. */
export function parseMemoryMi(raw: string): number {
  const s = raw.trim()
  const factors: Record<string, number> = {
    Ki: 1 / 1024,
    Mi: 1,
    Gi: 1024,
    Ti: 1024 * 1024,
    Pi: 1024 * 1024 * 1024,
    Ei: 1024 * 1024 * 1024 * 1024,
  }
  for (const [unit, factor] of Object.entries(factors)) {
    if (s.endsWith(unit)) {
      const n = parseFloat(s.slice(0, -unit.length))
      return isNaN(n) ? 0 : n * factor
    }
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/** Parse a Kubernetes CPU string like "500m" (millicores) or "2" (cores) to cores. */
export function parseCpuCores(raw: string): number {
  const s = raw.trim()
  if (s.endsWith('m')) {
    const n = parseFloat(s.slice(0, -1))
    return isNaN(n) ? 0 : n / 1000
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/** Parse a kubectl-formatted restart age string to seconds. "never"/"?" → Infinity. */
export function parseRestartAgeSeconds(raw: string): number {
  if (raw === 'never' || raw === '?') return Infinity
  const s = raw.trim()
  if (s.endsWith('s')) { const n = parseFloat(s); return isNaN(n) ? Infinity : n }
  if (s.endsWith('m')) { const n = parseFloat(s); return isNaN(n) ? Infinity : n * 60 }
  if (s.endsWith('h')) { const n = parseFloat(s); return isNaN(n) ? Infinity : n * 3600 }
  if (s.endsWith('d')) { const n = parseFloat(s); return isNaN(n) ? Infinity : n * 86400 }
  return Infinity
}

/** Format seconds since last restart to a human-readable string. */
export function formatRestartAge(seconds: number): string {
  if (!isFinite(seconds)) return 'never'
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

/** Build a CPU bar string and its color for use in Ink <Text color={color}> */
export function createCpuBarChars(
  cpuPercent: number,
  width: number,
): { text: string; color: 'green' | 'yellow' | 'red' } {
  const pct = Math.min(100, Math.max(0, cpuPercent))
  const filled = (pct / 100) * width
  const filledBlocks = Math.floor(filled)
  const partial = filled - filledBlocks

  let partialChar = ''
  if (partial >= 0.75) partialChar = '▓'
  else if (partial >= 0.5) partialChar = '▒'
  else if (partial >= 0.25) partialChar = '░'

  const empty = width - filledBlocks - (partialChar ? 1 : 0)
  const text = '█'.repeat(filledBlocks) + partialChar + '░'.repeat(empty)
  const color = pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green'
  return { text, color }
}

interface NodeMeta {
  role: string
  status: 'Ready' | 'NotReady'
}

function parseNodeMeta(getNodesJson: string): Record<string, NodeMeta> {
  const meta: Record<string, NodeMeta> = {}
  try {
    const data = JSON.parse(getNodesJson) as { items: unknown[] }
    for (const item of data.items as Record<string, unknown>[]) {
      const itemMeta = (item['metadata'] ?? {}) as Record<string, unknown>
      const name = itemMeta['name'] as string
      const labels = (itemMeta['labels'] ?? {}) as Record<string, string>
      const statusObj = (item['status'] ?? {}) as Record<string, unknown>
      const conditions = (statusObj['conditions'] ?? []) as Record<string, string>[]
      const ready = conditions.find((c) => c['type'] === 'Ready')
      const status: 'Ready' | 'NotReady' =
        ready?.['status'] === 'True' ? 'Ready' : 'NotReady'
      const roles: string[] = []
      for (const key of Object.keys(labels)) {
        if (key.startsWith('node-role.kubernetes.io/')) {
          roles.push(key.split('/')[1])
        }
      }
      if (!roles.length && labels['kubernetes.io/role']) {
        roles.push(labels['kubernetes.io/role'])
      }
      meta[name] = { role: roles.join(',') || 'worker', status }
    }
  } catch {
    // ignore parse errors
  }
  return meta
}

export function parseNodeMetrics(topStdout: string, getNodesJson: string): NodeMetric[] {
  const nodeMeta = parseNodeMeta(getNodesJson)
  const nodes: NodeMetric[] = []

  for (const line of topStdout.trim().split('\n')) {
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue

    const name = parts[0]
    const tokens = parts.slice(1)
    const pctIndices = tokens
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.endsWith('%'))
      .map(({ i }) => i)
    const memUnits = ['Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei']
    const cpuIdx = tokens.findIndex(
      (t) => !t.endsWith('%') && !memUnits.some((u) => t.endsWith(u)),
    )
    const memIdx = tokens.findIndex((t) => memUnits.some((u) => t.endsWith(u)))

    if (cpuIdx === -1 || pctIndices.length === 0) continue

    const cpuCores = parseCpuCores(tokens[cpuIdx])
    const cpuPercent = parseFloat(tokens[pctIndices[0]]) || 0
    const memoryMi = memIdx !== -1 ? parseMemoryMi(tokens[memIdx]) : 0
    const memoryPercent = pctIndices[1] !== undefined ? parseFloat(tokens[pctIndices[1]]) || 0 : 0
    const meta = nodeMeta[name] ?? { role: 'worker', status: 'Ready' as const }

    nodes.push({ name, cpuCores, cpuPercent, memoryMi, memoryPercent, ...meta })
  }
  return nodes
}

function isVclusterPod(name: string, namespace: string, labels: Record<string, string>): boolean {
  if (namespace.toLowerCase().includes('vcluster')) return true
  if (labels['app'] === 'vcluster') return true
  if (labels['app.kubernetes.io/name'] === 'vcluster') return true
  return false
}

export function parsePodTopAndGet(topStdout: string, getPodsJson: string): PodMetric[] {
  const topMap = new Map<string, { cpuCores: number; memoryMi: number }>()
  for (const line of topStdout.trim().split('\n')) {
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 4) continue
    const [ns, pod, cpuRaw, memRaw] = parts
    topMap.set(`${ns}/${pod}`, {
      cpuCores: parseCpuCores(cpuRaw),
      memoryMi: parseMemoryMi(memRaw),
    })
  }

  const pods: PodMetric[] = []
  try {
    const data = JSON.parse(getPodsJson) as { items: unknown[] }
    for (const item of data.items as Record<string, unknown>[]) {
      const meta = (item['metadata'] ?? {}) as Record<string, unknown>
      const spec = (item['spec'] ?? {}) as Record<string, unknown>
      const statusObj = (item['status'] ?? {}) as Record<string, unknown>

      const name = meta['name'] as string
      const namespace = meta['namespace'] as string
      const nodeName = (spec['nodeName'] as string) ?? ''
      const labels = (meta['labels'] ?? {}) as Record<string, string>
      const phase = (statusObj['phase'] as string) || 'Unknown'
      const containerStatuses = (statusObj['containerStatuses'] ?? []) as Record<string, unknown>[]

      let status = phase
      for (const cs of containerStatuses) {
        const state = (cs['state'] ?? {}) as Record<string, unknown>
        const waiting = state['waiting'] as Record<string, string> | undefined
        if (waiting?.['reason']) {
          status = waiting['reason']
          break
        }
      }

      let lastRestartAgeSeconds = Infinity
      const now = Date.now()
      for (const cs of containerStatuses) {
        const lastState = (cs['lastState'] ?? {}) as Record<string, unknown>
        const terminated = lastState['terminated'] as Record<string, string> | undefined
        if (terminated?.['finishedAt']) {
          try {
            const t = new Date(terminated['finishedAt']).getTime()
            const age = (now - t) / 1000
            if (age < lastRestartAgeSeconds) lastRestartAgeSeconds = age
          } catch {
            // ignore
          }
        }
      }

      const topKey = `${namespace}/${name}`
      const { cpuCores = 0, memoryMi = 0 } = topMap.get(topKey) ?? {}

      pods.push({
        name,
        namespace,
        nodeName,
        cpuCores,
        memoryMi,
        status,
        lastRestartAgeSeconds,
        isVcluster: isVclusterPod(name, namespace, labels),
      })
    }
  } catch {
    // return whatever we have
  }
  return pods
}

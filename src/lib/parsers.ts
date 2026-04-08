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

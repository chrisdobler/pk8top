import type { AppConfig } from '../types.js'

export const HELP_TEXT =
  'Usage: pk8top [--interval <seconds>] [--history <points>]\n' +
  '  --interval, -i  Refresh interval in seconds (default: 3.3)\n' +
  '  --history, -H   History points to keep (default: 60)'

export type ParseResult = { help: true } | { help: false; config: AppConfig }

export function parseArgs(argv: string[]): ParseResult {
  let interval = 3.3
  let historyPoints = 60

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--help' || arg === '-h') {
      return { help: true }
    }

    if ((arg === '--interval' || arg === '-i') && next) {
      const parsed = parseFloat(next)
      if (!Number.isNaN(parsed) && parsed > 0) interval = parsed
      i++
      continue
    }

    if ((arg === '--history' || arg === '-H') && next) {
      const parsed = parseInt(next, 10)
      if (!Number.isNaN(parsed) && parsed > 0) historyPoints = parsed
      i++
      continue
    }
  }

  return { help: false, config: { interval, historyPoints } }
}

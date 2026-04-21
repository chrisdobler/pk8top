/**
 * Direct ANSI terminal UI — bypasses Ink entirely.
 * Used for the pod action modal and full-screen text viewer.
 */
import { readSync } from 'fs'

const CSI = '\x1b['

function clearScreen() {
  process.stdout.write(`${CSI}2J${CSI}H`)
}

function hideCursor() {
  process.stdout.write(`${CSI}?25l`)
}

function writeAt(row: number, col: number, text: string) {
  process.stdout.write(`${CSI}${row};${col}H${text}`)
}

/** Pause Ink's stdin, enter raw mode, return restore function */
function takeOverStdin(): () => void {
  const existingListeners = process.stdin.listeners('data').slice()
  process.stdin.removeAllListeners('data')
  process.stdin.pause()
  const wasRaw = process.stdin.isRaw
  if (process.stdin.setRawMode) process.stdin.setRawMode(true)

  return () => {
    if (process.stdin.setRawMode) process.stdin.setRawMode(wasRaw ?? false)
    for (const listener of existingListeners) {
      process.stdin.on('data', listener as (...args: unknown[]) => void)
    }
    process.stdin.resume()
    clearScreen()
    hideCursor()
  }
}

/** Synchronous blocking read from stdin fd 0 */
function readKey(): string {
  const buf = Buffer.alloc(16)
  try {
    const n = readSync(0, buf, 0, buf.length, null)
    return n > 0 ? buf.toString('utf8', 0, n) : ''
  } catch {
    return ''
  }
}

// ── Action Modal ─────────────────────────────────────────

/**
 * Show a centered action modal. Returns the selected action string, or null if cancelled.
 */
export function showActionModal(podName: string, namespace: string, actions: string[]): string | null {
  const cols = process.stdout.columns ?? 120
  const rows = process.stdout.rows ?? 24

  // Modal dimensions
  const modalWidth = Math.min(60, cols - 4)
  const headerLines = 3 // pod name, namespace, blank line
  const modalHeight = headerLines + actions.length + 2 // +2 for top/bottom border
  const innerWidth = modalWidth - 2 // border left + right

  // Center position
  const startRow = Math.max(1, Math.floor((rows - modalHeight) / 2))
  const startCol = Math.max(1, Math.floor((cols - modalWidth) / 2))

  let selectedIdx = 0

  function render() {
    // Top border
    writeAt(startRow, startCol, `${CSI}36m╭${'─'.repeat(innerWidth)}╮${CSI}0m`)

    // Pod name (bold)
    const nameLine = ` ${podName}`.padEnd(innerWidth)
    writeAt(startRow + 1, startCol, `${CSI}36m│${CSI}0m${CSI}1m${nameLine.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)

    // Namespace (dim)
    const nsLine = ` ${namespace}`.padEnd(innerWidth)
    writeAt(startRow + 2, startCol, `${CSI}36m│${CSI}0m${CSI}2m${nsLine.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)

    // Blank line
    writeAt(startRow + 3, startCol, `${CSI}36m│${' '.repeat(innerWidth)}│${CSI}0m`)

    // Action items
    for (let i = 0; i < actions.length; i++) {
      const isSelected = i === selectedIdx
      const prefix = isSelected ? ' ▶ ' : '   '
      const label = (prefix + actions[i]).padEnd(innerWidth)
      const row = startRow + 4 + i

      if (isSelected) {
        writeAt(row, startCol, `${CSI}36m│${CSI}0m${CSI}1m${CSI}7m${CSI}36m${label.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)
      } else {
        writeAt(row, startCol, `${CSI}36m│${CSI}0m${label.slice(0, innerWidth)}${CSI}36m│${CSI}0m`)
      }
    }

    // Bottom border
    writeAt(startRow + 4 + actions.length, startCol, `${CSI}36m╰${'─'.repeat(innerWidth)}╯${CSI}0m`)
  }

  const restore = takeOverStdin()
  hideCursor()
  render()

  let result: string | null = null
  let running = true

  while (running) {
    const str = readKey()
    if (!str) continue

    if (str === '\x1b' || str === 'q') {
      result = null
      running = false
    } else if (str === '\x1b[A' || str === 'k') {
      selectedIdx = Math.max(0, selectedIdx - 1)
      render()
    } else if (str === '\x1b[B' || str === 'j') {
      selectedIdx = Math.min(actions.length - 1, selectedIdx + 1)
      render()
    } else if (str === '\r') {
      result = actions[selectedIdx]
      running = false
    }
  }

  restore()
  return result
}

// ── Full-Screen Text Viewer ──────────────────────────────

/**
 * Display a full-screen scrollable text viewer.
 * Blocks until the user presses ESC or q.
 */
export function showFullScreenViewer(title: string, content: string): void {
  const lines = content.split('\n')
  const cols = process.stdout.columns ?? 120
  const rows = process.stdout.rows ?? 24

  const viewportHeight = rows - 2
  let scrollOffset = 0
  const maxScroll = Math.max(0, lines.length - viewportHeight)

  function render() {
    clearScreen()
    hideCursor()

    const titleStr = ` ${title}`
    writeAt(1, 1, `${CSI}1m${CSI}36m${titleStr.slice(0, cols)}${CSI}0m`)

    for (let i = 0; i < viewportHeight; i++) {
      const lineIdx = scrollOffset + i
      const line = lineIdx < lines.length ? lines[lineIdx] : ''
      writeAt(i + 2, 1, line.slice(0, cols))
    }

    const totalLines = lines.length
    const from = scrollOffset + 1
    const to = Math.min(scrollOffset + viewportHeight, totalLines)
    const arrows = (scrollOffset > 0 ? ' ▲' : '') + (scrollOffset < maxScroll ? ' ▼' : '')
    const footer = ` ↑/↓/PgUp/PgDn scroll • q/ESC close • ${from}-${to} of ${totalLines} lines${arrows}`
    writeAt(rows, 1, `${CSI}2m${footer.slice(0, cols)}${CSI}0m`)
  }

  function scroll(delta: number) {
    const newOffset = Math.max(0, Math.min(maxScroll, scrollOffset + delta))
    if (newOffset !== scrollOffset) {
      scrollOffset = newOffset
      render()
    }
  }

  const restore = takeOverStdin()
  render()

  let running = true
  while (running) {
    const str = readKey()
    if (!str) continue

    if (str === 'q' || str === 'Q' || str === '\x1b') {
      running = false
    } else if (str === '\x1b[A' || str === 'k') {
      scroll(-1)
    } else if (str === '\x1b[B' || str === 'j') {
      scroll(1)
    } else if (str === '\x1b[5~') {
      scroll(-viewportHeight)
    } else if (str === '\x1b[6~') {
      scroll(viewportHeight)
    } else if (str === 'g') {
      scroll(-Infinity)
    } else if (str === 'G') {
      scroll(Infinity)
    }
  }

  restore()
}

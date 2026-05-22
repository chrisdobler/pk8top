/**
 * Direct ANSI terminal UI — bypasses Ink entirely.
 * Used for the pod action modal and full-screen text viewer.
 *
 * I/O is injected via the `ModalIo` interface so the loop is testable.
 * `defaultModalIo()` provides the real-terminal implementation.
 */
import { readSync } from 'fs'

const CSI = '\x1b['

export interface ModalIo {
  write(s: string): void
  readKey(): string
  columns: number
  rows: number
  /** Pause Ink stdin / enter raw mode; returns a restore function. */
  takeOver(): () => void
}

export function defaultModalIo(): ModalIo {
  return {
    write: (s) => process.stdout.write(s),
    readKey: () => {
      const buf = Buffer.alloc(16)
      try {
        const n = readSync(0, buf, 0, buf.length, null)
        return n > 0 ? buf.toString('utf8', 0, n) : ''
      } catch {
        return ''
      }
    },
    columns: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 24,
    takeOver: () => {
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
        process.stdout.write(`${CSI}2J${CSI}H`) // clear
        process.stdout.write(`${CSI}?25l`) // hide cursor
      }
    },
  }
}

function writeAt(io: ModalIo, row: number, col: number, text: string) {
  io.write(`${CSI}${row};${col}H${text}`)
}

// ── Action Modal ─────────────────────────────────────────

/**
 * Drive the action modal loop using an injected ModalIo. Returns the selected
 * action string, or null if cancelled.
 */
export function runActionModal(
  io: ModalIo,
  podName: string,
  namespace: string,
  actions: string[],
): string | null {
  const cols = io.columns
  const rows = io.rows

  const modalWidth = Math.min(60, cols - 4)
  const headerLines = 3
  const modalHeight = headerLines + actions.length + 2
  const innerWidth = modalWidth - 2

  const startRow = Math.max(1, Math.floor((rows - modalHeight) / 2))
  const startCol = Math.max(1, Math.floor((cols - modalWidth) / 2))

  let selectedIdx = 0

  function render() {
    writeAt(io, startRow, startCol, `${CSI}36m╭${'─'.repeat(innerWidth)}╮${CSI}0m`)

    const nameLine = ` ${podName}`.padEnd(innerWidth)
    writeAt(io, startRow + 1, startCol, `${CSI}36m│${CSI}0m${CSI}1m${nameLine.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)

    const nsLine = ` ${namespace}`.padEnd(innerWidth)
    writeAt(io, startRow + 2, startCol, `${CSI}36m│${CSI}0m${CSI}2m${nsLine.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)

    writeAt(io, startRow + 3, startCol, `${CSI}36m│${' '.repeat(innerWidth)}│${CSI}0m`)

    for (let i = 0; i < actions.length; i++) {
      const isSelected = i === selectedIdx
      const prefix = isSelected ? ' ▶ ' : '   '
      const label = (prefix + actions[i]).padEnd(innerWidth)
      const row = startRow + 4 + i

      if (isSelected) {
        writeAt(io, row, startCol, `${CSI}36m│${CSI}0m${CSI}1m${CSI}7m${CSI}36m${label.slice(0, innerWidth)}${CSI}0m${CSI}36m│${CSI}0m`)
      } else {
        writeAt(io, row, startCol, `${CSI}36m│${CSI}0m${label.slice(0, innerWidth)}${CSI}36m│${CSI}0m`)
      }
    }

    writeAt(io, startRow + 4 + actions.length, startCol, `${CSI}36m╰${'─'.repeat(innerWidth)}╯${CSI}0m`)
  }

  const restore = io.takeOver()
  io.write(`${CSI}?25l`) // hide cursor
  render()

  let result: string | null = null
  let running = true

  while (running) {
    const str = io.readKey()
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

/** Public wrapper using the real terminal. */
export function showActionModal(
  podName: string,
  namespace: string,
  actions: string[],
): string | null {
  return runActionModal(defaultModalIo(), podName, namespace, actions)
}

// ── Full-Screen Text Viewer ──────────────────────────────

/**
 * Drive the full-screen viewer loop using an injected ModalIo.
 * Returns when the user presses ESC or q.
 */
export function runViewer(io: ModalIo, title: string, content: string): void {
  const lines = content.split('\n')
  const cols = io.columns
  const rows = io.rows

  const viewportHeight = rows - 2
  let scrollOffset = 0
  const maxScroll = Math.max(0, lines.length - viewportHeight)

  function render() {
    io.write(`${CSI}2J${CSI}H`) // clear
    io.write(`${CSI}?25l`) // hide cursor

    const titleStr = ` ${title}`
    writeAt(io, 1, 1, `${CSI}1m${CSI}36m${titleStr.slice(0, cols)}${CSI}0m`)

    for (let i = 0; i < viewportHeight; i++) {
      const lineIdx = scrollOffset + i
      const line = lineIdx < lines.length ? lines[lineIdx] : ''
      writeAt(io, i + 2, 1, line.slice(0, cols))
    }

    const totalLines = lines.length
    const from = scrollOffset + 1
    const to = Math.min(scrollOffset + viewportHeight, totalLines)
    const arrows = (scrollOffset > 0 ? ' ▲' : '') + (scrollOffset < maxScroll ? ' ▼' : '')
    const footer = ` ↑/↓/PgUp/PgDn scroll • q/ESC close • ${from}-${to} of ${totalLines} lines${arrows}`
    writeAt(io, rows, 1, `${CSI}2m${footer.slice(0, cols)}${CSI}0m`)
  }

  function scroll(delta: number) {
    const newOffset = Math.max(0, Math.min(maxScroll, scrollOffset + delta))
    if (newOffset !== scrollOffset) {
      scrollOffset = newOffset
      render()
    }
  }

  const restore = io.takeOver()
  render()

  let running = true
  while (running) {
    const str = io.readKey()
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

/** Public wrapper using the real terminal. */
export function showFullScreenViewer(title: string, content: string): void {
  runViewer(defaultModalIo(), title, content)
}

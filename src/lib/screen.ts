/**
 * Terminal alternate-screen helpers. Pure I/O via injected Writable + process.
 */
import type { Writable } from 'stream'

const ENTER_ALT_SCREEN = '\x1b[?1049h'
const LEAVE_ALT_SCREEN = '\x1b[?1049l'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

export function enterAltScreen(out: Writable) {
  out.write(ENTER_ALT_SCREEN)
  out.write(HIDE_CURSOR)
}

export function leaveAltScreen(out: Writable) {
  out.write(SHOW_CURSOR)
  out.write(LEAVE_ALT_SCREEN)
}

type SignalProc = Pick<NodeJS.Process, 'on' | 'exit'>

/**
 * Register cleanup so leaveAltScreen runs on `exit`, SIGINT, SIGTERM.
 * SIGINT/SIGTERM also exit the process after cleanup.
 */
export function installSignalCleanup(proc: SignalProc, out: Writable) {
  const cleanup = () => leaveAltScreen(out)
  proc.on('exit', cleanup)
  proc.on('SIGINT', () => { cleanup(); proc.exit(0) })
  proc.on('SIGTERM', () => { cleanup(); proc.exit(0) })
}

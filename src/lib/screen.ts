/**
 * Terminal alternate-screen helpers. Pure I/O via injected Writable.
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

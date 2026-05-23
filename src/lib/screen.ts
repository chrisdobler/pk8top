/**
 * Terminal alternate-screen helpers. Pure I/O via injected Writable.
 */
import type { Writable } from 'stream'

const ENTER_ALT_SCREEN = '\x1b[?1049h'
const LEAVE_ALT_SCREEN = '\x1b[?1049l'
const HOME_CURSOR = '\x1b[H'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

export function enterAltScreen(out: Writable) {
  out.write(ENTER_ALT_SCREEN)
  // ?1049h doesn't reliably home the cursor on every terminal — without this,
  // Ink's first paint can start mid-screen and clip the top row.
  out.write(HOME_CURSOR)
  out.write(HIDE_CURSOR)
}

export function leaveAltScreen(out: Writable) {
  out.write(SHOW_CURSOR)
  out.write(LEAVE_ALT_SCREEN)
}

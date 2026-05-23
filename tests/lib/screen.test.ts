import { describe, it, expect } from 'vitest'
import { enterAltScreen, leaveAltScreen } from '../../src/lib/screen.js'

function makeOut() {
  const writes: string[] = []
  return {
    write: (s: string) => { writes.push(s); return true },
    writes,
  } as unknown as { write: (s: string) => boolean; writes: string[] }
}

describe('enterAltScreen', () => {
  it('writes enter-alt-screen and hide-cursor sequences', () => {
    const out = makeOut()
    enterAltScreen(out as never)
    expect(out.writes).toEqual(['\x1b[?1049h', '\x1b[?25l'])
  })
})

describe('leaveAltScreen', () => {
  it('writes show-cursor and leave-alt-screen sequences', () => {
    const out = makeOut()
    leaveAltScreen(out as never)
    expect(out.writes).toEqual(['\x1b[?25h', '\x1b[?1049l'])
  })
})

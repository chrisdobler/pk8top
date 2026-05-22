import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { enterAltScreen, leaveAltScreen, installSignalCleanup } from '../../src/lib/screen.js'

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

describe('installSignalCleanup', () => {
  it('runs leaveAltScreen on exit', () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process
    ;(proc as unknown as { exit: typeof process.exit }).exit = vi.fn() as never
    const out = makeOut()
    installSignalCleanup(proc as never, out as never)

    proc.emit('exit', 0)
    expect(out.writes).toEqual(['\x1b[?25h', '\x1b[?1049l'])
  })

  it('runs cleanup and exits on SIGINT', () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process
    const exitMock = vi.fn() as never
    ;(proc as unknown as { exit: typeof process.exit }).exit = exitMock
    const out = makeOut()
    installSignalCleanup(proc as never, out as never)

    proc.emit('SIGINT')
    expect(out.writes).toEqual(['\x1b[?25h', '\x1b[?1049l'])
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it('runs cleanup and exits on SIGTERM', () => {
    const proc = new EventEmitter() as unknown as NodeJS.Process
    const exitMock = vi.fn() as never
    ;(proc as unknown as { exit: typeof process.exit }).exit = exitMock
    const out = makeOut()
    installSignalCleanup(proc as never, out as never)

    proc.emit('SIGTERM')
    expect(out.writes).toEqual(['\x1b[?25h', '\x1b[?1049l'])
    expect(exitMock).toHaveBeenCalledWith(0)
  })
})

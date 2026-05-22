import { describe, it, expect } from 'vitest'
import { runActionModal, runViewer, type ModalIo } from '../../src/lib/outputViewer.js'

function makeIo(keys: string[], columns = 100, rows = 30) {
  const writes: string[] = []
  let restoreCalls = 0
  let takeOverCalls = 0
  const io: ModalIo = {
    write: (s) => { writes.push(s) },
    readKey: () => keys.shift() ?? 'q', // safety: if test forgets to end, quit
    columns,
    rows,
    takeOver: () => {
      takeOverCalls++
      return () => { restoreCalls++ }
    },
  }
  return {
    io,
    writes,
    getRestoreCalls: () => restoreCalls,
    getTakeOverCalls: () => takeOverCalls,
  }
}

describe('runActionModal', () => {
  it('returns the first action when user presses Enter immediately', () => {
    const { io } = makeIo(['\r'])
    const r = runActionModal(io, 'pod-a', 'default', ['Describe', 'Logs', 'Cancel'])
    expect(r).toBe('Describe')
  })

  it('returns null on ESC', () => {
    const { io } = makeIo(['\x1b'])
    const r = runActionModal(io, 'pod-a', 'default', ['Describe', 'Cancel'])
    expect(r).toBeNull()
  })

  it('returns null on q', () => {
    const { io } = makeIo(['q'])
    const r = runActionModal(io, 'pod-a', 'default', ['Describe', 'Cancel'])
    expect(r).toBeNull()
  })

  it('moves selection down with arrow and selects', () => {
    const { io } = makeIo(['\x1b[B', '\x1b[B', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B', 'C'])
    expect(r).toBe('C')
  })

  it('moves selection down with j and up with k', () => {
    const { io } = makeIo(['j', 'j', 'k', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B', 'C'])
    expect(r).toBe('B')
  })

  it('clamps selection at top', () => {
    const { io } = makeIo(['k', 'k', 'k', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B'])
    expect(r).toBe('A')
  })

  it('clamps selection at bottom', () => {
    const { io } = makeIo(['j', 'j', 'j', 'j', 'j', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B'])
    expect(r).toBe('B')
  })

  it('ignores unknown keys', () => {
    const { io } = makeIo(['x', 'y', 'z', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B'])
    expect(r).toBe('A')
  })

  it('skips empty key reads (keeps polling)', () => {
    const { io } = makeIo(['', '', 'j', '\r'])
    const r = runActionModal(io, 'pod', 'ns', ['A', 'B'])
    expect(r).toBe('B')
  })

  it('renders the pod name and namespace in writes', () => {
    const { io, writes } = makeIo(['\r'])
    runActionModal(io, 'my-pod', 'my-ns', ['Cancel'])
    const all = writes.join('')
    expect(all).toContain('my-pod')
    expect(all).toContain('my-ns')
  })

  it('renders all action labels', () => {
    const { io, writes } = makeIo(['\r'])
    runActionModal(io, 'p', 'n', ['Describe', 'Logs', 'Delete'])
    const all = writes.join('')
    expect(all).toContain('Describe')
    expect(all).toContain('Logs')
    expect(all).toContain('Delete')
  })

  it('calls takeOver once and restore once', () => {
    const { io, getTakeOverCalls, getRestoreCalls } = makeIo(['\r'])
    runActionModal(io, 'p', 'n', ['A'])
    expect(getTakeOverCalls()).toBe(1)
    expect(getRestoreCalls()).toBe(1)
  })
})

describe('runViewer', () => {
  const fortyLines = Array.from({ length: 40 }, (_, i) => `line-${i}`).join('\n')

  it('exits on q', () => {
    const { io } = makeIo(['q'])
    runViewer(io, 'title', fortyLines)
    // no assertion needed: would hang if it didn't exit
  })

  it('exits on Q', () => {
    const { io } = makeIo(['Q'])
    runViewer(io, 'title', fortyLines)
  })

  it('exits on ESC', () => {
    const { io } = makeIo(['\x1b'])
    runViewer(io, 'title', fortyLines)
  })

  it('renders title and footer line count', () => {
    const { io, writes } = makeIo(['q'], 100, 12)
    runViewer(io, 'my-title', fortyLines)
    const all = writes.join('')
    expect(all).toContain('my-title')
    expect(all).toContain('of 40 lines')
  })

  it('scrolls down with j and re-renders', () => {
    const { io, writes } = makeIo(['j', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    const all = writes.join('')
    // viewport height = rows - 2 = 10. After 1 step we see lines 1-10 -> footer '2-11 of 40'
    expect(all).toContain('2-11 of 40')
  })

  it('scrolls down with arrow down', () => {
    const { io, writes } = makeIo(['\x1b[B', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    expect(writes.join('')).toContain('2-11 of 40')
  })

  it('PgDn scrolls by viewport height', () => {
    const { io, writes } = makeIo(['\x1b[6~', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    // viewport=10, PgDn by 10 -> showing 11-20 of 40
    expect(writes.join('')).toContain('11-20 of 40')
  })

  it('PgUp scrolls back', () => {
    const { io, writes } = makeIo(['\x1b[6~', '\x1b[6~', '\x1b[5~', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    expect(writes.join('')).toContain('11-20 of 40')
  })

  it('G jumps to bottom (clamped)', () => {
    const { io, writes } = makeIo(['G', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    // 40 lines, viewport 10, last viewport shows 31-40
    expect(writes.join('')).toContain('31-40 of 40')
  })

  it('g jumps to top', () => {
    const { io, writes } = makeIo(['G', 'g', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    expect(writes.join('')).toContain('1-10 of 40')
  })

  it('clamps at top (k does nothing when already at top)', () => {
    const { io, writes } = makeIo(['k', 'q'], 100, 12)
    runViewer(io, 't', fortyLines)
    expect(writes.join('')).toContain('1-10 of 40')
  })

  it('handles content shorter than viewport', () => {
    const short = 'a\nb\nc'
    const { io, writes } = makeIo(['q'], 100, 12)
    runViewer(io, 't', short)
    expect(writes.join('')).toContain('of 3 lines')
  })

  it('calls takeOver and restore exactly once', () => {
    const { io, getTakeOverCalls, getRestoreCalls } = makeIo(['q'])
    runViewer(io, 't', fortyLines)
    expect(getTakeOverCalls()).toBe(1)
    expect(getRestoreCalls()).toBe(1)
  })
})

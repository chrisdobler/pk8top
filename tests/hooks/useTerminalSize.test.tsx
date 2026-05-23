import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { useTerminalSize } from '../../src/hooks/useTerminalSize.js'

function Host({ onSize }: { onSize: (s: { rows: number; columns: number }) => void }) {
  const size = useTerminalSize()
  onSize(size)
  return null
}

async function tick() {
  await new Promise((r) => setTimeout(r, 10))
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('useTerminalSize', () => {
  it('returns the test stdout dimensions on initial render', async () => {
    let last: { rows: number; columns: number } = { rows: 0, columns: 0 }
    const { stdout } = render(<Host onSize={(s) => { last = s }} />)
    await tick()
    expect(last.columns).toBe(stdout.columns)
    // ink-testing-library's Stdout doesn't expose rows; falls back to 24
    expect(last.rows).toBe(24)
  })

  it('updates when stdout emits resize with new dimensions', async () => {
    let last: { rows: number; columns: number } = { rows: 0, columns: 0 }
    const { stdout } = render(<Host onSize={(s) => { last = s }} />)
    await tick()

    Object.defineProperty(stdout, 'rows', { value: 50, configurable: true })
    Object.defineProperty(stdout, 'columns', { value: 200, configurable: true })
    stdout.emit('resize')
    await tick()

    expect(last.rows).toBe(50)
    expect(last.columns).toBe(200)
  })

  it('removes its resize listener on unmount', async () => {
    // After mount the hook (and Ink itself) have subscribed; after unmount
    // all listeners attached by the rendered tree must be gone.
    const { stdout, unmount } = render(<Host onSize={() => {}} />)
    await tick()
    expect(stdout.listenerCount('resize')).toBeGreaterThan(0)
    unmount()
    await tick()
    expect(stdout.listenerCount('resize')).toBe(0)
  })
})

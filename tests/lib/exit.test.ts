import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setExitFn, requestExit } from '../../src/lib/exit.js'

beforeEach(() => {
  setExitFn(null)
})

afterEach(() => {
  setExitFn(null)
})

describe('requestExit', () => {
  it('falls back to process.exit(0) when no exit fn is registered', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never) as any
    requestExit()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })

  it('invokes the registered exit fn instead of process.exit', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never) as any
    const fn = vi.fn()
    setExitFn(fn)
    requestExit()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(exitSpy).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  it('setExitFn(null) clears the registry', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never) as any
    const fn = vi.fn()
    setExitFn(fn)
    setExitFn(null)
    requestExit()
    expect(fn).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
    exitSpy.mockRestore()
  })
})

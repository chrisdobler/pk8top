import { describe, it, expect } from 'vitest'
import { parseArgs, HELP_TEXT } from '../../src/lib/cli.js'

describe('parseArgs', () => {
  it('returns defaults for empty argv', () => {
    const r = parseArgs([])
    expect(r.help).toBe(false)
    if (!r.help) {
      expect(r.config.interval).toBe(3.3)
      expect(r.config.historyPoints).toBe(60)
    }
  })

  it('parses --interval', () => {
    const r = parseArgs(['--interval', '5'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(5)
  })

  it('parses -i shortcut', () => {
    const r = parseArgs(['-i', '2.5'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(2.5)
  })

  it('parses --history', () => {
    const r = parseArgs(['--history', '120'])
    if (r.help) throw new Error('expected config')
    expect(r.config.historyPoints).toBe(120)
  })

  it('parses -H shortcut', () => {
    const r = parseArgs(['-H', '30'])
    if (r.help) throw new Error('expected config')
    expect(r.config.historyPoints).toBe(30)
  })

  it('returns help:true for --help', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true })
  })

  it('returns help:true for -h', () => {
    expect(parseArgs(['-h'])).toEqual({ help: true })
  })

  it('ignores unknown flags', () => {
    const r = parseArgs(['--bogus', '99', '-x'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(3.3)
    expect(r.config.historyPoints).toBe(60)
  })

  it('falls back to default on non-numeric --interval', () => {
    const r = parseArgs(['--interval', 'oops'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(3.3)
  })

  it('rejects zero/negative --interval', () => {
    const r = parseArgs(['--interval', '0'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(3.3)
  })

  it('parses both flags in one invocation', () => {
    const r = parseArgs(['--interval', '1', '--history', '200'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(1)
    expect(r.config.historyPoints).toBe(200)
  })

  it('skips the value of consumed flag (no double-parse)', () => {
    const r = parseArgs(['--interval', '5', '--history', '7'])
    if (r.help) throw new Error('expected config')
    expect(r.config.interval).toBe(5)
    expect(r.config.historyPoints).toBe(7)
  })

  it('exports HELP_TEXT mentioning usage', () => {
    expect(HELP_TEXT).toContain('Usage:')
    expect(HELP_TEXT).toContain('--interval')
    expect(HELP_TEXT).toContain('--history')
  })
})

import { describe, it, expect } from 'vitest'
import {
  parseMemoryMi,
  parseCpuCores,
  parseRestartAgeSeconds,
  formatRestartAge,
  createCpuBarChars,
} from '../src/lib/parsers.js'

describe('parseMemoryMi', () => {
  it('parses Ki', () => expect(parseMemoryMi('1024Ki')).toBeCloseTo(1.0))
  it('parses Mi', () => expect(parseMemoryMi('1024Mi')).toBeCloseTo(1024.0))
  it('parses Gi', () => expect(parseMemoryMi('1Gi')).toBeCloseTo(1024.0))
  it('parses Ti', () => expect(parseMemoryMi('1Ti')).toBeCloseTo(1024.0 * 1024.0))
  it('returns 0 for invalid input', () => expect(parseMemoryMi('bad')).toBe(0))
})

describe('parseCpuCores', () => {
  it('parses millicores', () => expect(parseCpuCores('500m')).toBeCloseTo(0.5))
  it('parses full cores', () => expect(parseCpuCores('2')).toBeCloseTo(2.0))
  it('returns 0 for invalid input', () => expect(parseCpuCores('bad')).toBe(0))
})

describe('parseRestartAgeSeconds', () => {
  it('returns Infinity for "never"', () => expect(parseRestartAgeSeconds('never')).toBe(Infinity))
  it('returns Infinity for "?"', () => expect(parseRestartAgeSeconds('?')).toBe(Infinity))
  it('parses seconds', () => expect(parseRestartAgeSeconds('10s')).toBe(10))
  it('parses minutes', () => expect(parseRestartAgeSeconds('5m')).toBe(300))
  it('parses hours', () => expect(parseRestartAgeSeconds('2h')).toBe(7200))
  it('parses days', () => expect(parseRestartAgeSeconds('3d')).toBe(259200))
  it('returns Infinity for unknown format', () => expect(parseRestartAgeSeconds('not-a-time')).toBe(Infinity))
})

describe('formatRestartAge', () => {
  it('returns "never" for Infinity', () => expect(formatRestartAge(Infinity)).toBe('never'))
  it('formats seconds', () => expect(formatRestartAge(45)).toBe('45s'))
  it('formats minutes', () => expect(formatRestartAge(150)).toBe('2m'))
  it('formats hours', () => expect(formatRestartAge(7300)).toBe('2h'))
  it('formats days', () => expect(formatRestartAge(172800)).toBe('2d'))
})

describe('createCpuBarChars', () => {
  it('returns string of correct length', () => {
    expect(createCpuBarChars(50, 20).text.length).toBe(20)
  })
  it('uses green color below 50%', () => {
    expect(createCpuBarChars(10, 20).color).toBe('green')
  })
  it('uses yellow color 50-80%', () => {
    expect(createCpuBarChars(60, 20).color).toBe('yellow')
  })
  it('uses red color above 80%', () => {
    expect(createCpuBarChars(90, 20).color).toBe('red')
  })
  it('clamps percent below 0', () => {
    expect(createCpuBarChars(-10, 20).text.length).toBe(20)
  })
  it('clamps percent above 100', () => {
    expect(createCpuBarChars(200, 20).text.length).toBe(20)
  })
})

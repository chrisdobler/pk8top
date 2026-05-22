import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import TrendPanel from '../../src/components/TrendPanel.js'
import { useNodesStore } from '../../src/store/nodes.js'

describe('TrendPanel', () => {
  it('renders title without crashing when history is empty', () => {
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame()).toContain('Cluster CPU')
  })

  it('displays current CPU percentage', () => {
    useNodesStore.setState({ history: { all: [0, 0, 42.5] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame()).toContain('42.5%')
  })

  it('shows min and max when history has more than one point', () => {
    useNodesStore.setState({ history: { all: [10, 20, 30] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame()).toContain('min:')
    expect(lastFrame()).toContain('max:')
  })

  it('computes correct min and max from history', () => {
    useNodesStore.setState({ history: { all: [55, 99, 12, 77] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame()).toContain('min: 12.0%')
    expect(lastFrame()).toContain('max: 99.0%')
  })

  it('uses red color when CPU is high (>80%)', () => {
    useNodesStore.setState({ history: { all: [95, 95, 95] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame() ?? '').toContain('\x1b[31m') // red
  })

  it('uses yellow color when CPU is mid-range (51-80%)', () => {
    useNodesStore.setState({ history: { all: [70, 70, 70] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame() ?? '').toContain('\x1b[33m') // yellow
  })

  it('uses green color when CPU is low (<=50%)', () => {
    useNodesStore.setState({ history: { all: [10, 10, 10] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    expect(lastFrame() ?? '').toContain('\x1b[32m') // green
  })

  it('renders some braille graph rows', () => {
    useNodesStore.setState({ history: { all: [50, 50, 50] } } as never)
    const { lastFrame } = render(<TrendPanel height={11} />)
    const frame = lastFrame() ?? ''
    // Braille block char range is U+2800..U+28FF
    expect(frame.match(/[⠀-⣿]/)).not.toBeNull()
  })
})

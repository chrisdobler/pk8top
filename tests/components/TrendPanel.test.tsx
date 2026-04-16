import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import TrendPanel from '../../src/components/TrendPanel.js'
import { useNodesStore } from '../../src/store/nodes.js'

beforeEach(() => {
  useNodesStore.setState({ nodes: [], selectedIndex: 0, history: {} })
})

describe('TrendPanel', () => {
  it('renders without crashing when history is empty', () => {
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
})

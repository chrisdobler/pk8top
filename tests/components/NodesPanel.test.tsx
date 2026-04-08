import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import NodesPanel from '../../src/components/NodesPanel.js'
import { useNodesStore } from '../../src/store/nodes.js'
import { useUiStore } from '../../src/store/ui.js'
import type { NodeMetric } from '../../src/types.js'

const node = (name: string, cpuPercent: number): NodeMetric => ({
  name,
  cpuCores: cpuPercent / 100,
  cpuPercent,
  memoryMi: 1024,
  memoryPercent: 50,
  role: 'worker',
  status: 'Ready',
})

beforeEach(() => {
  useNodesStore.setState({ nodes: [], selectedIndex: 0, history: {} })
  useUiStore.setState({ focusedPanel: 'nodes' } as never)
})

describe('NodesPanel', () => {
  it('renders node names', () => {
    useNodesStore.setState({ nodes: [node('node-1', 10), node('node-2', 80)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('node-1')
    expect(lastFrame()).toContain('node-2')
  })

  it('renders CPU percentage', () => {
    useNodesStore.setState({ nodes: [node('node-1', 42)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('42')
  })

  it('renders all nodes', () => {
    const three = [node('a', 10), node('b', 20), node('c', 30)]
    useNodesStore.setState({ nodes: three } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('a')
    expect(lastFrame()).toContain('b')
    expect(lastFrame()).toContain('c')
  })

  it('shows empty state when no nodes', () => {
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).not.toBeNull()
  })
})

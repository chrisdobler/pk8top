import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import NodesPanel from '../../src/components/NodesPanel.js'
import { useNodesStore } from '../../src/store/nodes.js'
import { useUiStore } from '../../src/store/ui.js'
import type { NodeMetric } from '../../src/types.js'

const node = (name: string, cpuPercent: number, overrides: Partial<NodeMetric> = {}): NodeMetric => ({
  name,
  cpuCores: cpuPercent / 100,
  cpuPercent,
  memoryMi: 1024,
  memoryPercent: 50,
  role: 'worker',
  status: 'Ready',
  ...overrides,
})

describe('NodesPanel — basic rendering', () => {
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
    useNodesStore.setState({ nodes: [node('a', 10), node('b', 20), node('c', 30)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('a')
    expect(lastFrame()).toContain('b')
    expect(lastFrame()).toContain('c')
  })

  it('shows waiting message when no nodes', () => {
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('Waiting for node metrics')
  })
})

describe('NodesPanel — "All Nodes" aggregate row', () => {
  it('renders an "all" aggregate row above per-node rows', () => {
    useNodesStore.setState({
      nodes: [node('node-1', 10), node('node-2', 30)],
      selectedIndex: 0,
    } as never)
    const { lastFrame } = render(<NodesPanel />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('all')
  })

  it('highlights "all" row when selectedIndex=0 and nodes panel is focused', () => {
    useNodesStore.setState({
      nodes: [node('node-1', 10)],
      selectedIndex: 0,
    } as never)
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame() ?? '').toContain('\x1b[7m')
  })

  it('highlights node row when selectedIndex points to a node', () => {
    useNodesStore.setState({
      nodes: [node('node-1', 10), node('node-2', 30)],
      selectedIndex: 2, // 1-based skip of "all" row -> node-2
    } as never)
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame() ?? '').toContain('\x1b[7m')
  })
})

describe('NodesPanel — status & coloring', () => {
  it('renders NotReady status when present', () => {
    useNodesStore.setState({
      nodes: [node('bad', 10, { status: 'NotReady' })],
    } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('NotReady')
  })

  it('renders role from node metadata', () => {
    useNodesStore.setState({
      nodes: [node('cp', 10, { role: 'master' })],
    } as never)
    const { lastFrame } = render(<NodesPanel />)
    expect(lastFrame()).toContain('master')
  })

  it('uses red color for nodes above 80% CPU', () => {
    useNodesStore.setState({ nodes: [node('hot', 90)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    // red foreground = \x1b[31m
    expect(lastFrame() ?? '').toContain('\x1b[31m')
  })

  it('uses yellow color for nodes between 51-80% CPU', () => {
    useNodesStore.setState({ nodes: [node('warm', 70)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    // yellow foreground = \x1b[33m
    expect(lastFrame() ?? '').toContain('\x1b[33m')
  })

  it('uses green color for nodes at or below 50% CPU', () => {
    useNodesStore.setState({ nodes: [node('cool', 10)] } as never)
    const { lastFrame } = render(<NodesPanel />)
    // green foreground = \x1b[32m
    expect(lastFrame() ?? '').toContain('\x1b[32m')
  })
})

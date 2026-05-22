import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import PodsPanel from '../../src/components/PodsPanel.js'
import { usePodsStore } from '../../src/store/pods.js'
import { useUiStore } from '../../src/store/ui.js'
import type { PodMetric } from '../../src/types.js'

const pod = (name: string, overrides: Partial<PodMetric> = {}): PodMetric => ({
  name,
  namespace: 'default',
  nodeName: 'node-1',
  cpuCores: 0.1,
  memoryMi: 128,
  status: 'Running',
  lastRestartAgeSeconds: Infinity,
  isVcluster: false,
  ...overrides,
})

describe('PodsPanel — basic rendering', () => {
  it('renders pod names', () => {
    const pods = [pod('frontend'), pod('backend')]
    usePodsStore.setState({ filteredPods: pods } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('frontend')
    expect(lastFrame()).toContain('backend')
  })

  it('respects windowSize — only shows N pods', () => {
    const pods = Array.from({ length: 20 }, (_, i) => pod(`pod-${i}`))
    usePodsStore.setState({ filteredPods: pods } as never)
    const { lastFrame } = render(<PodsPanel windowSize={5} />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('pod-0')
    expect(frame).not.toContain('pod-5')
  })

  it('shows filter input when showFilter is true', () => {
    usePodsStore.setState({ showFilter: true, filteredPods: [] } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('Filter')
  })

  it('shows empty state ("No pods found") when filteredPods is empty', () => {
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('No pods found')
  })
})

describe('PodsPanel — windowing / scroll', () => {
  it('scrolls window forward when selectedIndex exceeds windowSize', () => {
    const pods = Array.from({ length: 20 }, (_, i) => pod(`pod-${i}`))
    usePodsStore.setState({ filteredPods: pods, selectedIndex: 7 } as never)
    const { lastFrame } = render(<PodsPanel windowSize={5} />)
    const frame = lastFrame() ?? ''
    // selectedIndex=7 with windowSize=5 → window covers indices 3-7
    expect(frame).toContain('pod-7')
    expect(frame).toContain('pod-3')
    expect(frame).not.toContain('pod-0')
  })

  it('scrolls window backward when selectedIndex moves above scrollOffset', () => {
    const pods = Array.from({ length: 20 }, (_, i) => pod(`pod-${i}`))
    usePodsStore.setState({
      filteredPods: pods,
      selectedIndex: 0,
      scrollOffset: 10,
    } as never)
    const { lastFrame } = render(<PodsPanel windowSize={5} />)
    expect(lastFrame() ?? '').toContain('pod-0')
  })
})

describe('PodsPanel — sort indicator and node filter', () => {
  it('shows current sort mode in title', () => {
    usePodsStore.setState({ filteredPods: [pod('p')], sortMode: 'memory' } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('Memory')
  })

  it('shows node filter in title when set', () => {
    usePodsStore.setState({
      filteredPods: [pod('p')],
      sortMode: 'cpu',
      nodeFilter: 'node-7',
    } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('node-7')
  })

  it('shows total pod count in title', () => {
    const pods = Array.from({ length: 4 }, (_, i) => pod(`p${i}`))
    usePodsStore.setState({ filteredPods: pods, sortMode: 'cpu' } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).toContain('4 pods')
  })
})

describe('PodsPanel — selected row highlight', () => {
  it('inverse video on selected row when pods is focused', () => {
    usePodsStore.setState({ filteredPods: [pod('me'), pod('other')], selectedIndex: 0 } as never)
    useUiStore.setState({ focusedPanel: 'pods' } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    const frame = lastFrame() ?? ''
    // Ink emits a reverse-video escape (`\x1b[7m`) for inverse text
    expect(frame).toContain('\x1b[7m')
  })

  it('does NOT highlight when nodes panel is focused', () => {
    usePodsStore.setState({ filteredPods: [pod('me')], selectedIndex: 0 } as never)
    useUiStore.setState({ focusedPanel: 'nodes' } as never)
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    const frame = lastFrame() ?? ''
    expect(frame).not.toContain('\x1b[7m')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
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

beforeEach(() => {
  usePodsStore.setState({
    pods: [],
    filteredPods: [],
    filterText: '',
    showFilter: false,
    sortMode: 'cpu',
    selectedIndex: 0,
    scrollOffset: 0,
  })
  useUiStore.setState({ focusedPanel: 'pods' } as never)
})

describe('PodsPanel', () => {
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

  it('shows empty state when no pods', () => {
    const { lastFrame } = render(<PodsPanel windowSize={10} />)
    expect(lastFrame()).not.toBeNull()
  })
})

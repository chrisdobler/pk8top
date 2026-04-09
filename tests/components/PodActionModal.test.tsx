import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import PodActionModal from '../../src/components/PodActionModal.js'
import { useUiStore } from '../../src/store/ui.js'
import type { PodMetric } from '../../src/types.js'

const regularPod: PodMetric = {
  name: 'frontend-abc',
  namespace: 'default',
  nodeName: 'node-1',
  cpuCores: 0.1,
  memoryMi: 128,
  status: 'Running',
  lastRestartAgeSeconds: Infinity,
  isVcluster: false,
}

const vclusterPod: PodMetric = {
  ...regularPod,
  name: 'vcluster-0',
  namespace: 'my-vcluster',
  isVcluster: true,
}

beforeEach(() => {
  useUiStore.setState({
    showModal: true,
    selectedModalAction: 0,
    selectedPodForModal: null,
  } as never)
})

describe('PodActionModal', () => {
  it('renders pod name', () => {
    useUiStore.setState({ selectedPodForModal: regularPod } as never)
    const { lastFrame } = render(<PodActionModal />)
    expect(lastFrame()).toContain('frontend-abc')
  })

  it('shows standard actions for regular pod', () => {
    useUiStore.setState({ selectedPodForModal: regularPod } as never)
    const { lastFrame } = render(<PodActionModal />)
    expect(lastFrame()).toContain('Logs')
    expect(lastFrame()).toContain('Describe')
    expect(lastFrame()).toContain('Delete')
    expect(lastFrame()).not.toContain('Connect to vCluster')
  })

  it('shows Connect to vCluster for vcluster pod', () => {
    useUiStore.setState({ selectedPodForModal: vclusterPod } as never)
    const { lastFrame } = render(<PodActionModal />)
    expect(lastFrame()).toContain('Connect to vCluster')
  })

  it('highlights selected action', () => {
    useUiStore.setState({ selectedPodForModal: regularPod, selectedModalAction: 1 } as never)
    const { lastFrame } = render(<PodActionModal />)
    expect(lastFrame()).not.toBeNull()
  })

  it('renders nothing when no pod selected', () => {
    useUiStore.setState({ selectedPodForModal: null } as never)
    const { lastFrame } = render(<PodActionModal />)
    expect(lastFrame()).toBe('')
  })
})

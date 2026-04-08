import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import ControlsBar from '../../src/components/ControlsBar.js'
import { usePodsStore } from '../../src/store/pods.js'
import { useUiStore } from '../../src/store/ui.js'

beforeEach(() => {
  usePodsStore.setState({ sortMode: 'cpu' } as never)
  useUiStore.setState({ focusedPanel: 'nodes', isVcluster: false, lastError: null } as never)
})

describe('ControlsBar', () => {
  it('shows key hints', () => {
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('q')
    expect(lastFrame()).toContain('/')
  })

  it('shows current sort mode', () => {
    usePodsStore.setState({ sortMode: 'memory' } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('memory')
  })

  it('shows focused panel', () => {
    useUiStore.setState({ focusedPanel: 'pods' } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('pods')
  })

  it('shows vcluster indicator when in vcluster', () => {
    useUiStore.setState({ isVcluster: true } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('vCluster')
  })

  it('shows last error when set', () => {
    useUiStore.setState({ lastError: 'kubectl timed out' } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('kubectl timed out')
  })
})

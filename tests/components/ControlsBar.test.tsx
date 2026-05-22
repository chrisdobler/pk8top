import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import ControlsBar from '../../src/components/ControlsBar.js'
import { usePodsStore } from '../../src/store/pods.js'
import { useUiStore } from '../../src/store/ui.js'

describe('ControlsBar', () => {
  it('shows key hints', () => {
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('q')
    expect(lastFrame()).toContain('/')
  })

  it('shows navigation key hints', () => {
    const { lastFrame } = render(<ControlsBar />)
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/navigate/)
    expect(frame).toMatch(/sort/)
    expect(frame).toMatch(/filter/)
    expect(frame).toMatch(/select/)
    expect(frame).toMatch(/quit/)
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

  it('does NOT show vcluster indicator when isVcluster is false', () => {
    useUiStore.setState({ isVcluster: false } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).not.toContain('vCluster')
  })

  it('shows last error when set', () => {
    useUiStore.setState({ lastError: 'kubectl timed out' } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('kubectl timed out')
  })

  it('shows warning marker before error', () => {
    useUiStore.setState({ lastError: 'oops' } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).toContain('⚠')
  })

  it('does not show error bar when lastError is null', () => {
    useUiStore.setState({ lastError: null } as never)
    const { lastFrame } = render(<ControlsBar />)
    expect(lastFrame()).not.toContain('⚠')
  })
})

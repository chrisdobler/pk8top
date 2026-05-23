import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { formatRestartAge } from '../lib/parsers.js'

interface Props {
  windowSize?: number
  height?: number
}

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w)
}

function rpad(s: string, w: number): string {
  return s.padStart(w).slice(0, w)
}

function restartColor(seconds: number): 'red' | 'yellow' | undefined {
  if (!isFinite(seconds)) return undefined
  if (seconds < 300) return 'red'     // < 5 minutes
  if (seconds < 3600) return 'yellow' // < 1 hour
  return undefined
}

function topBorder(widths: number[]): string {
  return '┏' + widths.map((w) => '━'.repeat(w + 2)).join('┳') + '┓'
}

function headerSep(widths: number[]): string {
  return '┡' + widths.map((w) => '━'.repeat(w + 2)).join('╇') + '┩'
}

function bottomBorder(widths: number[]): string {
  return '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘'
}

export default function PodsPanel({ windowSize = 20, height }: Props) {
  const filteredPods = usePodsStore((s) => s.filteredPods)
  const selectedIndex = usePodsStore((s) => s.selectedIndex)
  const scrollOffset = usePodsStore((s) => s.scrollOffset)
  const showFilter = usePodsStore((s) => s.showFilter)
  const filterText = usePodsStore((s) => s.filterText)
  const setFilterText = usePodsStore((s) => s.setFilterText)
  const sortMode = usePodsStore((s) => s.sortMode)
  const nodeFilter = usePodsStore((s) => s.nodeFilter)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const { columns: termWidth } = useTerminalSize()

  // Auto-scroll to keep selected index visible
  let windowStart = scrollOffset
  if (selectedIndex < windowStart) windowStart = selectedIndex
  if (selectedIndex >= windowStart + windowSize) windowStart = selectedIndex - windowSize + 1
  windowStart = Math.max(0, windowStart)
  const windowedPods = filteredPods.slice(windowStart, windowStart + windowSize)

  // Column widths (content only)
  const innerWidth = termWidth - 4
  const NUM_COLS = 7
  const borderOverhead = (NUM_COLS + 1) + (2 * NUM_COLS) // 8 + 14 = 22

  // Fixed column widths: CPU(14) + Memory(9) + Status(12) + Restarts(8) = 43
  const fixedCols = 14 + 9 + 12 + 8
  const budget = innerWidth - borderOverhead - fixedCols

  // Start with content-fit minimums
  const minNs = Math.max(12, ...windowedPods.map((p) => p.namespace.length))
  const minPod = Math.max(6, ...windowedPods.map((p) => p.name.length))
  const minNode = Math.max(6, ...windowedPods.map((p) => p.nodeName.length))

  // Expand to fill full width (like Rich expand=True)
  let nsW: number, podW: number, nodeW: number
  const remaining = budget - minNs - minPod - minNode
  if (remaining >= 0) {
    // Distribute extra space proportionally, favoring Pod column
    const nsExtra = Math.floor(remaining * 0.25)
    const podExtra = Math.floor(remaining * 0.50)
    const nodeExtra = remaining - nsExtra - podExtra
    nsW = minNs + nsExtra
    podW = minPod + podExtra
    nodeW = minNode + nodeExtra
  } else {
    nsW = Math.max(10, Math.floor(budget * 0.25))
    podW = Math.max(10, Math.floor(budget * 0.50))
    nodeW = Math.max(8, budget - nsW - podW)
  }

  const widths = [nsW, podW, 14, 9, 12, 8, nodeW]

  const title = nodeFilter
    ? ` Pods on ${nodeFilter} by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`
    : ` Top Pods by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={termWidth} height={height}>
      <Text bold>{title}</Text>
      <Text>{topBorder(widths)}</Text>
      <Text bold color="cyan">
        {'┃ ' + pad('Namespace', nsW) + ' ┃ ' + pad('Pod', podW) + ' ┃ ' + rpad('CPU', 14) + ' ┃ ' + rpad('Memory', 9) + ' ┃ ' + pad('Status', 12) + ' ┃ ' + rpad('Restarts', 8) + ' ┃ ' + pad('Node', nodeW) + ' ┃'}
      </Text>
      <Text>{headerSep(widths)}</Text>

      {windowedPods.length === 0 && (
        <Text dimColor>│ No pods found</Text>
      )}

      {windowedPods.map((pod, i) => {
        const actualIndex = windowStart + i
        const isSelected = actualIndex === selectedIndex && focusedPanel === 'pods'
        const restartAge = formatRestartAge(pod.lastRestartAgeSeconds)
        const restartClr = restartColor(pod.lastRestartAgeSeconds)
        return (
          <Text
            key={`${pod.namespace}/${pod.name}/${i}`}
            bold={isSelected}
            inverse={isSelected}
          >
            {'│ '}
            <Text color="cyan">{pad(pod.namespace, nsW)}</Text>
            {' │ '}
            <Text color="cyan">{pad(pod.name, podW)}</Text>
            {' │ '}
            <Text color="magenta">{rpad((pod.cpuCores * 1000).toFixed(0) + 'm', 14)}</Text>
            {' │ '}
            <Text color="green">{rpad(pod.memoryMi.toFixed(0) + 'Mi', 9)}</Text>
            {' │ '}
            <Text color="yellow">{pad(pod.status, 12)}</Text>
            {' │ '}
            <Text color={restartClr ?? 'blue'} bold={restartClr === 'red'}>{rpad(restartAge, 8)}</Text>
            {' │ '}
            <Text color="yellow">{pad(pod.nodeName, nodeW)}</Text>
            {' │'}
          </Text>
        )
      })}
      <Text>{bottomBorder(widths)}</Text>

      {showFilter && (
        <Box marginTop={1}>
          <Text bold color="cyan">Filter: </Text>
          <TextInput
            value={filterText}
            onChange={setFilterText}
            placeholder="type to filter pods…"
          />
        </Box>
      )}
    </Box>
  )
}

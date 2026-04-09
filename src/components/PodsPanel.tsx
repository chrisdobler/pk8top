import React from 'react'
import { Box, Text, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { formatRestartAge } from '../lib/parsers.js'

interface Props {
  windowSize?: number
}

// Fixed-width columns: CPU(10) + Memory(10) + Status(18) + Restarts(10) = 48
const FIXED_COLS = 48

export default function PodsPanel({ windowSize = 20 }: Props) {
  const filteredPods = usePodsStore((s) => s.filteredPods)
  const selectedIndex = usePodsStore((s) => s.selectedIndex)
  const scrollOffset = usePodsStore((s) => s.scrollOffset)
  const showFilter = usePodsStore((s) => s.showFilter)
  const filterText = usePodsStore((s) => s.filterText)
  const setFilterText = usePodsStore((s) => s.setFilterText)
  const sortMode = usePodsStore((s) => s.sortMode)
  const nodeFilter = usePodsStore((s) => s.nodeFilter)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 120

  // Auto-scroll to keep selected index visible
  let windowStart = scrollOffset
  if (selectedIndex < windowStart) windowStart = selectedIndex
  if (selectedIndex >= windowStart + windowSize) windowStart = selectedIndex - windowSize + 1
  windowStart = Math.max(0, windowStart)
  const windowedPods = filteredPods.slice(windowStart, windowStart + windowSize)

  // Compute variable column widths, capped to terminal
  const innerWidth = termWidth - 4  // border(2) + paddingX(2)
  const budget = innerWidth - FIXED_COLS

  const maxNs = Math.max(12, ...windowedPods.map((p) => p.namespace.length)) + 4
  const maxPod = Math.max(6, ...windowedPods.map((p) => p.name.length)) + 2
  const maxNode = Math.max(6, ...windowedPods.map((p) => p.nodeName.length)) + 2

  let nsW: number, podW: number, nodeW: number
  if (maxNs + maxPod + maxNode <= budget) {
    nsW = maxNs
    podW = maxPod
    nodeW = maxNode
  } else {
    nsW = Math.max(10, Math.floor(budget * 0.25))
    podW = Math.max(10, Math.floor(budget * 0.45))
    nodeW = Math.max(8, budget - nsW - podW)
  }

  const title = nodeFilter
    ? ` Pods on ${nodeFilter} by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`
    : ` Top Pods by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="100%">
      <Text bold>{title}</Text>
      <Box overflowX="hidden">
        <Box width={nsW}><Text bold>  Namespace</Text></Box>
        <Box width={podW}><Text bold>Pod</Text></Box>
        <Box width={10}><Text bold>CPU</Text></Box>
        <Box width={10}><Text bold>Memory</Text></Box>
        <Box width={18}><Text bold>Status</Text></Box>
        <Box width={10}><Text bold>Restarts</Text></Box>
        <Box width={nodeW}><Text bold>Node</Text></Box>
      </Box>

      {windowedPods.length === 0 && (
        <Box paddingX={2}>
          <Text dimColor>No pods found</Text>
        </Box>
      )}

      {windowedPods.map((pod, i) => {
        const actualIndex = windowStart + i
        const isSelected = actualIndex === selectedIndex && focusedPanel === 'pods'
        const statusColor =
          pod.status === 'Running' ? 'green'
          : pod.status === 'Pending' ? 'yellow'
          : pod.status === 'Succeeded' ? 'cyan'
          : 'red'

        return (
          <Box key={`${pod.namespace}/${pod.name}/${i}`} overflowX="hidden">
            <Box width={nsW}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined} wrap="truncate">
                {'  '}{pod.namespace}
              </Text>
            </Box>
            <Box width={podW}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined} wrap="truncate">
                {pod.name}
              </Text>
            </Box>
            <Box width={10}><Text>{(pod.cpuCores * 1000).toFixed(0)}m</Text></Box>
            <Box width={10}><Text>{pod.memoryMi.toFixed(0)}Mi</Text></Box>
            <Box width={18}><Text color={statusColor} wrap="truncate">{pod.status}</Text></Box>
            <Box width={10}><Text>{formatRestartAge(pod.lastRestartAgeSeconds)}</Text></Box>
            <Box width={nodeW}><Text dimColor wrap="truncate">{pod.nodeName}</Text></Box>
          </Box>
        )
      })}

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

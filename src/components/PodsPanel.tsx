import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { formatRestartAge } from '../lib/parsers.js'

interface Props {
  windowSize?: number
}

export default function PodsPanel({ windowSize = 20 }: Props) {
  const filteredPods = usePodsStore((s) => s.filteredPods)
  const selectedIndex = usePodsStore((s) => s.selectedIndex)
  const scrollOffset = usePodsStore((s) => s.scrollOffset)
  const showFilter = usePodsStore((s) => s.showFilter)
  const filterText = usePodsStore((s) => s.filterText)
  const setFilterText = usePodsStore((s) => s.setFilterText)
  const focusedPanel = useUiStore((s) => s.focusedPanel)

  // Auto-scroll to keep selected index visible
  let windowStart = scrollOffset
  if (selectedIndex < windowStart) windowStart = selectedIndex
  if (selectedIndex >= windowStart + windowSize) windowStart = selectedIndex - windowSize + 1
  windowStart = Math.max(0, windowStart)
  const windowedPods = filteredPods.slice(windowStart, windowStart + windowSize)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Box width={37}><Text bold>  POD</Text></Box>
        <Box width={22}><Text bold>NS</Text></Box>
        <Box width={8}><Text bold>CPU</Text></Box>
        <Box width={10}><Text bold>MEM(Mi)</Text></Box>
        <Box width={22}><Text bold>STATUS</Text></Box>
        <Box width={8}><Text bold>RESTART</Text></Box>
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
          <Box key={`${pod.namespace}/${pod.name}`}>
            <Box width={37}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined}>
                {'  '}{pod.name.slice(0, 34)}
              </Text>
            </Box>
            <Box width={22}><Text>{pod.namespace.slice(0, 21)}</Text></Box>
            <Box width={8}><Text>{(pod.cpuCores * 1000).toFixed(0)}m</Text></Box>
            <Box width={10}><Text>{pod.memoryMi.toFixed(0)}</Text></Box>
            <Box width={22}><Text color={statusColor}>{pod.status.slice(0, 21)}</Text></Box>
            <Box width={8}><Text>{formatRestartAge(pod.lastRestartAgeSeconds)}</Text></Box>
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

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

  const windowStart = Math.max(0, Math.min(scrollOffset, Math.max(0, selectedIndex - Math.floor(windowSize / 2))))
  const windowedPods = filteredPods.slice(windowStart, windowStart + windowSize)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>{'  POD'.padEnd(35)}</Text>
        <Text bold>{'NS'.padEnd(20)}</Text>
        <Text bold>{'CPU'.padStart(7)}</Text>
        <Text bold>{'MEM(Mi)'.padStart(9)}</Text>
        <Text bold>{'  STATUS'.padEnd(20)}</Text>
        <Text bold>{'RESTART'.padStart(8)}</Text>
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
            <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined}>
              {`  ${pod.name}`.padEnd(35).slice(0, 35)}
            </Text>
            <Text>{pod.namespace.padEnd(20).slice(0, 20)}</Text>
            <Text>{`${(pod.cpuCores * 1000).toFixed(0)}m`.padStart(7)}</Text>
            <Text>{`${pod.memoryMi.toFixed(0)}`.padStart(9)}</Text>
            <Text color={statusColor}>{'  '}{pod.status.padEnd(18).slice(0, 18)}</Text>
            <Text>{formatRestartAge(pod.lastRestartAgeSeconds).padStart(8)}</Text>
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

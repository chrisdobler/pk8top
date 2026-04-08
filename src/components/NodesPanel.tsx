import React from 'react'
import { Box, Text } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { useUiStore } from '../store/ui.js'
import { createCpuBarChars } from '../lib/parsers.js'

const BAR_WIDTH = 20

export default function NodesPanel() {
  const nodes = useNodesStore((s) => s.nodes)
  const selectedIndex = useNodesStore((s) => s.selectedIndex)
  const focusedPanel = useUiStore((s) => s.focusedPanel)

  if (nodes.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Waiting for node metrics…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>{'  NODE'.padEnd(20)}</Text>
        <Text bold>{'CPU%'.padStart(6)}</Text>
        <Text bold>  {'BAR'.padEnd(BAR_WIDTH)}</Text>
        <Text bold>{'MEM%'.padStart(6)}</Text>
        <Text bold>  ROLE</Text>
      </Box>
      {nodes.map((node, i) => {
        const isSelected = i === selectedIndex && focusedPanel === 'nodes'
        const bar = createCpuBarChars(node.cpuPercent, BAR_WIDTH)
        return (
          <Box key={node.name}>
            <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined}>
              {`  ${node.name}`.padEnd(20)}
            </Text>
            <Text color={node.cpuPercent > 80 ? 'red' : node.cpuPercent > 50 ? 'yellow' : 'green'}>
              {`${node.cpuPercent.toFixed(1)}%`.padStart(6)}
            </Text>
            <Text>{'  '}</Text>
            <Text color={bar.color}>{bar.text}</Text>
            <Text color={node.memoryPercent > 80 ? 'red' : node.memoryPercent > 50 ? 'yellow' : 'green'}>
              {`${node.memoryPercent.toFixed(1)}%`.padStart(6)}
            </Text>
            <Text>{'  '}{node.role}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

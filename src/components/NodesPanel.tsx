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
        <Box width={22}><Text bold>  NODE</Text></Box>
        <Box width={8}><Text bold>CPU%</Text></Box>
        <Box width={22}><Text bold>BAR</Text></Box>
        <Box width={8}><Text bold>MEM%</Text></Box>
        <Box><Text bold>ROLE</Text></Box>
      </Box>
      {nodes.map((node, i) => {
        const isSelected = i === selectedIndex && focusedPanel === 'nodes'
        const bar = createCpuBarChars(node.cpuPercent, BAR_WIDTH)
        return (
          <Box key={node.name}>
            <Box width={22}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined}>
                {'  '}{node.name}
              </Text>
            </Box>
            <Box width={8}>
              <Text color={node.cpuPercent > 80 ? 'red' : node.cpuPercent > 50 ? 'yellow' : 'green'}>
                {node.cpuPercent.toFixed(1)}%
              </Text>
            </Box>
            <Box width={22}>
              <Text color={bar.color}>{bar.text}</Text>
            </Box>
            <Box width={8}>
              <Text color={node.memoryPercent > 80 ? 'red' : node.memoryPercent > 50 ? 'yellow' : 'green'}>
                {node.memoryPercent.toFixed(1)}%
              </Text>
            </Box>
            <Box><Text>{node.role}</Text></Box>
          </Box>
        )
      })}
    </Box>
  )
}

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
      <Box borderStyle="round" paddingX={1} width="100%">
        <Text dimColor>Waiting for node metrics…</Text>
      </Box>
    )
  }

  // Compute column widths from data
  const nameW = Math.max(6, ...nodes.map((n) => n.name.length)) + 4
  const roleW = Math.max(6, ...nodes.map((n) => n.role.length)) + 2

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="100%">
      <Text bold> Kubernetes Node Metrics</Text>
      <Box>
        <Box width={nameW}><Text bold>  Node</Text></Box>
        <Box width={roleW}><Text bold>Roles</Text></Box>
        <Box width={10}><Text bold>Status</Text></Box>
        <Box width={8}><Text bold>CPU%</Text></Box>
        <Box width={BAR_WIDTH + 2}><Text bold>CPU</Text></Box>
        <Box width={8}><Text bold>Mem%</Text></Box>
      </Box>
      {nodes.map((node, i) => {
        const isSelected = i === selectedIndex && focusedPanel === 'nodes'
        const bar = createCpuBarChars(node.cpuPercent, BAR_WIDTH)
        return (
          <Box key={node.name}>
            <Box width={nameW}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined}>
                {'  '}{node.name}
              </Text>
            </Box>
            <Box width={roleW}><Text dimColor>{node.role}</Text></Box>
            <Box width={10}>
              <Text color={node.status === 'Ready' ? 'green' : 'red'}>{node.status}</Text>
            </Box>
            <Box width={8}>
              <Text color={node.cpuPercent > 80 ? 'red' : node.cpuPercent > 50 ? 'yellow' : 'green'}>
                {node.cpuPercent.toFixed(1)}%
              </Text>
            </Box>
            <Box width={BAR_WIDTH + 2}>
              <Text color={bar.color}>{bar.text}</Text>
            </Box>
            <Box width={8}>
              <Text color={node.memoryPercent > 80 ? 'red' : node.memoryPercent > 50 ? 'yellow' : 'green'}>
                {node.memoryPercent.toFixed(1)}%
              </Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

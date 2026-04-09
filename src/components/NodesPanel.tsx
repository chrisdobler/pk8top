import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { useUiStore } from '../store/ui.js'
import { createCpuBarChars } from '../lib/parsers.js'

const BAR_WIDTH = 20
// Fixed-width columns: Status(10) + CPU%(8) + BAR(22) + Mem%(8) = 48
const FIXED_COLS = 48

export default function NodesPanel() {
  const nodes = useNodesStore((s) => s.nodes)
  const selectedIndex = useNodesStore((s) => s.selectedIndex)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 120

  if (nodes.length === 0) {
    return (
      <Box borderStyle="round" paddingX={1} width="100%">
        <Text dimColor>Waiting for node metrics…</Text>
      </Box>
    )
  }

  // Compute column widths from data, capped to fit terminal
  const maxName = Math.max(6, ...nodes.map((n) => n.name.length)) + 4
  const maxRole = Math.max(6, ...nodes.map((n) => n.role.length)) + 2
  // Available width inside border (border takes 2 + paddingX 2 = 4 chars)
  const available = termWidth - 4 - FIXED_COLS
  // Split remaining space between name and role, favoring name
  const nameW = Math.min(maxName, Math.floor(available * 0.6))
  const roleW = Math.min(maxRole, available - nameW)

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="100%">
      <Text bold> Kubernetes Node Metrics</Text>
      <Box overflowX="hidden">
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
          <Box key={node.name} overflowX="hidden">
            <Box width={nameW}>
              <Text bold={isSelected} backgroundColor={isSelected ? 'blue' : undefined} wrap="truncate">
                {'  '}{node.name}
              </Text>
            </Box>
            <Box width={roleW}>
              <Text dimColor wrap="truncate">{node.role}</Text>
            </Box>
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

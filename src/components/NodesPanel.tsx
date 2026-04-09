import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { useUiStore } from '../store/ui.js'
import { createCpuBarChars } from '../lib/parsers.js'

const BAR_WIDTH = 20
// Fixed-width portion: indent(2) + Status(10) + CPU%(8) + gap(2) + BAR(20) + Mem%(8) = 50
const FIXED = 2 + 10 + 8 + 2 + BAR_WIDTH + 8

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w)
}

function rpad(s: string, w: number): string {
  return s.padStart(w).slice(0, w)
}

export default function NodesPanel() {
  const nodes = useNodesStore((s) => s.nodes)
  const selectedIndex = useNodesStore((s) => s.selectedIndex)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 120

  if (nodes.length === 0) {
    return (
      <Box borderStyle="round" paddingX={1} width={termWidth}>
        <Text dimColor>Waiting for node metrics…</Text>
      </Box>
    )
  }

  const innerWidth = termWidth - 4
  const budget = innerWidth - FIXED

  const maxName = Math.max(6, ...nodes.map((n) => n.name.length)) + 2
  const maxRole = Math.max(6, ...nodes.map((n) => n.role.length)) + 2

  let nameW: number, roleW: number
  if (maxName + maxRole <= budget) {
    nameW = maxName
    roleW = maxRole
  } else {
    nameW = Math.max(10, Math.floor(budget * 0.55))
    roleW = Math.max(8, budget - nameW)
  }

  const mkRow = (name: string, role: string, status: string, cpu: string, bar: string, mem: string) =>
    '  ' + pad(name, nameW) + pad(role, roleW) + pad(status, 10) + rpad(cpu, 8) + '  ' + bar.padEnd(BAR_WIDTH) + rpad(mem, 8)

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={termWidth}>
      <Text bold> Kubernetes Node Metrics</Text>
      <Text bold>{mkRow('Node', 'Roles', 'Status', 'CPU%', 'CPU', 'Mem%')}</Text>
      {nodes.map((node, i) => {
        const isSelected = i === selectedIndex && focusedPanel === 'nodes'
        const bar = createCpuBarChars(node.cpuPercent, BAR_WIDTH)
        const line = mkRow(
          node.name,
          node.role,
          node.status,
          node.cpuPercent.toFixed(1) + '%',
          bar.text,
          node.memoryPercent.toFixed(1) + '%',
        )
        return (
          <Text
            key={node.name}
            bold={isSelected}
            backgroundColor={isSelected ? 'blue' : undefined}
          >
            {line}
          </Text>
        )
      })}
    </Box>
  )
}

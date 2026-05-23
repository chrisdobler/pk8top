import React from 'react'
import { Box, Text } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { useUiStore } from '../store/ui.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { createCpuBarChars } from '../lib/parsers.js'

const BAR_WIDTH = 20

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w)
}

function rpad(s: string, w: number): string {
  return s.padStart(w).slice(0, w)
}

function cpuPctColor(pct: number): 'red' | 'yellow' | 'green' {
  if (pct > 80) return 'red'
  if (pct > 50) return 'yellow'
  return 'green'
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

export default function NodesPanel() {
  const nodes = useNodesStore((s) => s.nodes)
  const selectedIndex = useNodesStore((s) => s.selectedIndex)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const { columns: termWidth } = useTerminalSize()

  if (nodes.length === 0) {
    return (
      <Box borderStyle="round" paddingX={1} width={termWidth}>
        <Text dimColor>Waiting for node metrics…</Text>
      </Box>
    )
  }

  // 8 columns matching Python: Node, Roles, Status, CPU (cores), CPU %, CPU bar, Mem (Mi), Mem %
  const NUM_COLS = 8
  const innerWidth = termWidth - 4 // Box border + paddingX
  const borderOverhead = (NUM_COLS + 1) + (2 * NUM_COLS) // 9 + 16 = 25

  // Fixed column widths matching Python: Status(10) + CPU cores(10) + CPU%(7) + bar(20) + Mem Mi(10) + Mem%(7) = 64
  const fixedCols = 10 + 10 + 7 + BAR_WIDTH + 10 + 7
  const budget = innerWidth - borderOverhead - fixedCols

  // Start with content-fit minimums
  const minName = Math.max(6, ...nodes.map((n) => n.name.length))
  const minRole = Math.max(6, ...nodes.map((n) => n.role.length))

  // Expand to fill full width (like Rich expand=True), favoring Node column
  const remaining = budget - minName - minRole
  let nameW = minName
  let roleW = minRole
  if (remaining > 0) {
    const nameExtra = Math.floor(remaining * 0.6)
    nameW += nameExtra
    roleW += remaining - nameExtra
  } else {
    nameW = Math.max(10, Math.floor(budget * 0.55))
    roleW = Math.max(8, budget - nameW)
  }

  const widths = [nameW, roleW, 10, 10, 7, BAR_WIDTH, 10, 7]

  // Aggregate stats for "All Nodes"
  const totalCores = nodes.reduce((sum, n) => sum + n.cpuCores, 0)
  const avgCpu = nodes.reduce((sum, n) => sum + n.cpuPercent, 0) / nodes.length
  const totalMem = nodes.reduce((sum, n) => sum + n.memoryMi, 0)
  const avgMem = nodes.reduce((sum, n) => sum + n.memoryPercent, 0) / nodes.length
  const allBar = createCpuBarChars(avgCpu, BAR_WIDTH)
  const allSelected = selectedIndex === 0 && focusedPanel === 'nodes'

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={termWidth}>
      <Text bold> Kubernetes Node Metrics</Text>
      <Text>{topBorder(widths)}</Text>
      <Text bold color="cyan">
        {'┃ ' + pad('Node', nameW) + ' ┃ ' + pad('Roles', roleW) + ' ┃ ' + pad('Status', 10) + ' ┃ ' + rpad('CPU (cores)', 10) + ' ┃ ' + rpad('CPU %', 7) + ' ┃ ' + 'CPU'.padEnd(BAR_WIDTH) + ' ┃ ' + rpad('Mem (Mi)', 10) + ' ┃ ' + rpad('Mem %', 7) + ' ┃'}
      </Text>
      <Text>{headerSep(widths)}</Text>
      <Text bold={allSelected} inverse={allSelected}>
        {'│ '}
        <Text color="cyan">{pad('all', nameW)}</Text>
        {' │ '}
        <Text color="cyan">{pad('-', roleW)}</Text>
        {' │ '}
        <Text color="cyan">{pad('-', 10)}</Text>
        {' │ '}
        <Text color="magenta">{rpad(totalCores.toFixed(2), 10)}</Text>
        {' │ '}
        <Text color={cpuPctColor(avgCpu)}>{rpad(avgCpu.toFixed(1), 7)}</Text>
        {' │ '}
        <Text color={allBar.color}>{allBar.text.padEnd(BAR_WIDTH)}</Text>
        {' │ '}
        <Text color="green">{rpad(totalMem.toFixed(0), 10)}</Text>
        {' │ '}
        <Text color="green">{rpad(avgMem.toFixed(1), 7)}</Text>
        {' │'}
      </Text>
      {nodes.map((node, i) => {
        const isSelected = (i + 1) === selectedIndex && focusedPanel === 'nodes'
        const bar = createCpuBarChars(node.cpuPercent, BAR_WIDTH)
        return (
          <Text
            key={node.name}
            bold={isSelected}
            inverse={isSelected}
          >
            {'│ '}
            <Text color="cyan">{pad(node.name, nameW)}</Text>
            {' │ '}
            <Text color="cyan">{pad(node.role, roleW)}</Text>
            {' │ '}
            <Text color="cyan">{pad(node.status, 10)}</Text>
            {' │ '}
            <Text color="magenta">{rpad(node.cpuCores.toFixed(2), 10)}</Text>
            {' │ '}
            <Text color={cpuPctColor(node.cpuPercent)}>{rpad(node.cpuPercent.toFixed(1), 7)}</Text>
            {' │ '}
            <Text color={bar.color}>{bar.text.padEnd(BAR_WIDTH)}</Text>
            {' │ '}
            <Text color="green">{rpad(node.memoryMi.toFixed(0), 10)}</Text>
            {' │ '}
            <Text color="green">{rpad(node.memoryPercent.toFixed(1), 7)}</Text>
            {' │'}
          </Text>
        )
      })}
      <Text>{bottomBorder(widths)}</Text>
    </Box>
  )
}

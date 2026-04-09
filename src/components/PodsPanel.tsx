import React from 'react'
import { Box, Text, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { formatRestartAge } from '../lib/parsers.js'

interface Props {
  windowSize?: number
  height?: number
}

// Fixed-width portion: indent(2) + CPU(10) + Memory(10) + Status(18) + Restarts(10) = 50
const FIXED = 2 + 10 + 10 + 18 + 10

function pad(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w)
}

function rpad(s: string, w: number): string {
  return s.padStart(w).slice(0, w)
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
  const { stdout } = useStdout()
  const termWidth = stdout?.columns ?? 120

  // Auto-scroll to keep selected index visible
  let windowStart = scrollOffset
  if (selectedIndex < windowStart) windowStart = selectedIndex
  if (selectedIndex >= windowStart + windowSize) windowStart = selectedIndex - windowSize + 1
  windowStart = Math.max(0, windowStart)
  const windowedPods = filteredPods.slice(windowStart, windowStart + windowSize)

  // Compute variable column widths, capped to terminal
  const innerWidth = termWidth - 4
  const budget = innerWidth - FIXED

  const maxNs = Math.max(12, ...windowedPods.map((p) => p.namespace.length)) + 2
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

  const mkRow = (ns: string, name: string, cpu: string, mem: string, status: string, restart: string, node: string) =>
    '  ' + pad(ns, nsW) + pad(name, podW) + rpad(cpu, 10) + rpad(mem, 10) + pad(status, 18) + rpad(restart, 10) + pad(node, nodeW)

  const title = nodeFilter
    ? ` Pods on ${nodeFilter} by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`
    : ` Top Pods by ${sortMode.charAt(0).toUpperCase() + sortMode.slice(1)} • ${filteredPods.length} pods`

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={termWidth} height={height}>
      <Text bold>{title}</Text>
      <Text bold>{mkRow('Namespace', 'Pod', 'CPU', 'Memory', 'Status', 'Restarts', 'Node')}</Text>

      {windowedPods.length === 0 && (
        <Text dimColor>  No pods found</Text>
      )}

      {windowedPods.map((pod, i) => {
        const actualIndex = windowStart + i
        const isSelected = actualIndex === selectedIndex && focusedPanel === 'pods'
        const line = mkRow(
          pod.namespace,
          pod.name,
          (pod.cpuCores * 1000).toFixed(0) + 'm',
          pod.memoryMi.toFixed(0) + 'Mi',
          pod.status,
          formatRestartAge(pod.lastRestartAgeSeconds),
          pod.nodeName,
        )
        return (
          <Text
            key={`${pod.namespace}/${pod.name}/${i}`}
            bold={isSelected}
            backgroundColor={isSelected ? 'blue' : undefined}
          >
            {line}
          </Text>
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

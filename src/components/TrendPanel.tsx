import React from 'react'
import { Box, Text } from 'ink'
import { useNodesStore } from '../store/nodes.js'

const GRAPH_WIDTH = 60
const GRAPH_HEIGHT = 3

function buildTrendRows(history: number[]): Array<Array<{ char: string; color: string }>> {
  const padded = [
    ...Array(Math.max(0, GRAPH_WIDTH - history.length)).fill(0),
    ...history.slice(-GRAPH_WIDTH),
  ]

  const rows: Array<Array<{ char: string; color: string }>> = []
  for (let rowIdx = 0; rowIdx < GRAPH_HEIGHT; rowIdx++) {
    const thresholdBottom = ((GRAPH_HEIGHT - 1 - rowIdx) * 100) / GRAPH_HEIGHT
    const thresholdTop = ((GRAPH_HEIGHT - rowIdx) * 100) / GRAPH_HEIGHT
    const cells: Array<{ char: string; color: string }> = []

    for (const cpu of padded) {
      const pct = Math.min(100, Math.max(0, cpu))
      const color = pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green'
      let char: string
      if (pct >= thresholdTop) {
        char = '\u2588'
      } else if (pct >= thresholdBottom) {
        const position = (pct - thresholdBottom) / (100 / GRAPH_HEIGHT)
        char = position < 0.5 ? '\u2584' : '\u2580'
      } else {
        char = ' '
      }
      cells.push({ char, color })
    }
    rows.push(cells)
  }
  return rows
}

export default function TrendPanel() {
  const history = useNodesStore((s) => s.history)
  const allHistory = history['all'] ?? []

  const current = allHistory.at(-1) ?? 0
  const min = allHistory.length > 1 ? Math.min(...allHistory) : current
  const max = allHistory.length > 1 ? Math.max(...allHistory) : current

  const rows = buildTrendRows(allHistory)

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="100%">
      <Box>
        <Text bold color="cyan"> Cluster CPU: </Text>
        <Text color="yellow">{current.toFixed(1)}%</Text>
        {allHistory.length > 1 && (
          <Text dimColor>  (min: {min.toFixed(1)}%, max: {max.toFixed(1)}%)</Text>
        )}
      </Box>
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((cell, colIdx) => (
            <Text key={colIdx} color={cell.char !== ' ' ? cell.color : undefined}>
              {cell.char}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

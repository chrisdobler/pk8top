import React from 'react'
import { Box, Text } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'

// Braille-based mirrored bar rendering (btop-style)
// 0% baseline sits at the vertical center; CPU usage grows symmetrically up and down.
const BRAILLE_BASE = 0x2800
// Left-column dot bits from top to bottom within a cell: dot1(0x01), dot2(0x02), dot3(0x04), dot7(0x40)
const LEFT_DOTS_TOP_TO_BOTTOM = [0x01, 0x02, 0x04, 0x40]

interface ColorRun {
  text: string
  color: string
}

function buildMirroredGraph(
  history: number[],
  graphWidth: number,
  graphHeight: number,
): ColorRun[][] {
  const padded = [
    ...Array(Math.max(0, graphWidth - history.length)).fill(0),
    ...history.slice(-graphWidth),
  ]

  const halfRows = graphHeight / 2
  const halfDots = Math.floor(halfRows * 4)

  const rows: ColorRun[][] = []

  for (let rowIdx = 0; rowIdx < graphHeight; rowIdx++) {
    // Build characters and colors for this row, then group into runs
    const chars: Array<{ char: string; color: string }> = []

    for (const cpu of padded) {
      const pct = Math.min(100, Math.max(0, cpu))
      const filledDots = Math.round((pct / 100) * halfDots)
      const color = pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green'

      let bits = 0

      for (let dotIdx = 0; dotIdx < 4; dotIdx++) {
        if (rowIdx < halfRows) {
          const globalDotFromCenter = (halfRows - 1 - rowIdx) * 4 + (3 - dotIdx)
          if (globalDotFromCenter < filledDots) {
            bits |= LEFT_DOTS_TOP_TO_BOTTOM[dotIdx]
          }
        } else {
          const globalDotFromCenter = (rowIdx - halfRows) * 4 + dotIdx
          if (globalDotFromCenter < filledDots) {
            bits |= LEFT_DOTS_TOP_TO_BOTTOM[dotIdx]
          }
        }
      }

      const char = String.fromCharCode(BRAILLE_BASE + bits)
      // Empty braille chars get no color
      const effectiveColor = bits === 0 ? '' : color
      chars.push({ char, color: effectiveColor })
    }

    // Collapse adjacent same-color chars into runs for efficient rendering
    const runs: ColorRun[] = []
    for (const { char, color } of chars) {
      const last = runs[runs.length - 1]
      if (last && last.color === color) {
        last.text += char
      } else {
        runs.push({ text: char, color })
      }
    }
    rows.push(runs)
  }
  return rows
}

interface Props {
  height: number
}

export default function TrendPanel({ height }: Props) {
  const history = useNodesStore((s) => s.history)
  const allHistory = history['all'] ?? []
  const { columns: termWidth } = useTerminalSize()

  const current = allHistory.at(-1) ?? 0
  const min = allHistory.length > 1 ? Math.min(...allHistory) : current
  const max = allHistory.length > 1 ? Math.max(...allHistory) : current

  const graphWidth = termWidth - 4
  // height minus: border(2) + title(1) + 1 safety margin for Ink border rendering
  const graphHeight = Math.max(2, height - 4)

  const rows = buildMirroredGraph(allHistory, graphWidth, graphHeight)

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width={termWidth}>
      <Box>
        <Text bold color="cyan"> Cluster CPU: </Text>
        <Text color="yellow">{current.toFixed(1)}%</Text>
        {allHistory.length > 1 && (
          <Text dimColor>  (min: {min.toFixed(1)}%, max: {max.toFixed(1)}%)</Text>
        )}
      </Box>
      {rows.map((runs, rowIdx) => (
        <Text key={rowIdx}>
          {runs.map((run, runIdx) => (
            <Text key={runIdx} color={run.color || undefined}>{run.text}</Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

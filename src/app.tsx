import React, { useEffect } from 'react'
import { Box, useApp, useStdout } from 'ink'
import TrendPanel from './components/TrendPanel.js'
import NodesPanel from './components/NodesPanel.js'
import PodsPanel from './components/PodsPanel.js'
import ControlsBar from './components/ControlsBar.js'
import { useMetricsFetcher } from './hooks/useMetricsFetcher.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useUiStore } from './store/ui.js'
import { useNodesStore } from './store/nodes.js'
import { setExitFn } from './lib/exit.js'
import type { AppConfig } from './types.js'

interface Props {
  config: AppConfig
}

// Panel height overheads (border + chrome lines):
// NodesPanel: border(2) + title(1) + topBorder(1) + header(1) + headerSep(1) + bottomBorder(1) + nodeCount = 7 + nodeCount
// ControlsBar: border(2) + content(1) = 3
const NODES_OVERHEAD = 7
const CONTROLS_HEIGHT = 3

export default function App({ config }: Props) {
  const { stdout } = useStdout()
  const { exit } = useApp()
  const nodeCount = useNodesStore((s) => s.nodes.length)

  useEffect(() => {
    setExitFn(exit)
    return () => setExitFn(null)
  }, [exit])

  useMetricsFetcher(config.interval)
  useKeyboard()

  const termRows = stdout?.rows ?? 24
  const nodesHeight = NODES_OVERHEAD + Math.max(1, nodeCount) + 1 // +1 for "All Nodes" row

  // TrendPanel fills ~30% of remaining space (after nodes + controls), min 6 rows
  const remainingAfterFixed = termRows - nodesHeight - CONTROLS_HEIGHT
  const trendHeight = Math.max(6, Math.floor(remainingAfterFixed * 0.3))
  const podsHeight = remainingAfterFixed - trendHeight
  // podsHeight minus: box border(2) + title(1) + topBorder(1) + header(1) + headerSep(1) + bottomBorder(1) = 7
  const podsWindowSize = Math.max(1, podsHeight - 7)

  return (
    <Box flexDirection="column" height={termRows}>
      <Box height={trendHeight}><TrendPanel height={trendHeight} /></Box>
      <Box height={nodesHeight}><NodesPanel /></Box>
      <Box height={CONTROLS_HEIGHT}><ControlsBar /></Box>
      <Box height={podsHeight}><PodsPanel windowSize={podsWindowSize} height={podsHeight} /></Box>
    </Box>
  )
}

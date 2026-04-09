import React from 'react'
import { Box, useStdout } from 'ink'
import TrendPanel from './components/TrendPanel.js'
import NodesPanel from './components/NodesPanel.js'
import PodsPanel from './components/PodsPanel.js'
import ControlsBar from './components/ControlsBar.js'
import PodActionModal from './components/PodActionModal.js'
import { useMetricsFetcher } from './hooks/useMetricsFetcher.js'
import { useKeyboard } from './hooks/useKeyboard.js'
import { useUiStore } from './store/ui.js'
import { useNodesStore } from './store/nodes.js'
import type { AppConfig } from './types.js'

interface Props {
  config: AppConfig
}

// Exact panel heights (border + content lines):
// TrendPanel: border(2) + title(1) + 3 graph rows = 6
// NodesPanel: border(2) + title(1) + header(1) + nodeCount = 4 + nodeCount
// ControlsBar: border(2) + content(1) = 3
const TREND_HEIGHT = 6
const NODES_OVERHEAD = 4
const CONTROLS_HEIGHT = 3

export default function App({ config }: Props) {
  const { stdout } = useStdout()
  const showModal = useUiStore((s) => s.showModal)
  const nodeCount = useNodesStore((s) => s.nodes.length)

  useMetricsFetcher(config.interval)
  useKeyboard()

  const termRows = stdout?.rows ?? 24
  const nodesHeight = NODES_OVERHEAD + Math.max(1, nodeCount)
  const podsHeight = termRows - TREND_HEIGHT - nodesHeight - CONTROLS_HEIGHT
  const podsWindowSize = Math.max(1, podsHeight - 4)

  return (
    <Box flexDirection="column" height={termRows}>
      <Box height={TREND_HEIGHT}><TrendPanel /></Box>
      <Box height={nodesHeight}><NodesPanel /></Box>
      <Box height={CONTROLS_HEIGHT}><ControlsBar /></Box>
      <Box height={podsHeight}><PodsPanel windowSize={podsWindowSize} height={podsHeight} /></Box>
      {showModal && <PodActionModal />}
    </Box>
  )
}

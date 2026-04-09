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

// Panel heights (including borders + 1 row safety buffer each):
// TrendPanel: border(2) + title(1) + 3 graph rows + buffer = 7
// NodesPanel: border(2) + title(1) + header(1) + nodeCount + buffer = 5 + nodeCount
// ControlsBar: border(2) + content(1-2 with error) + buffer = 5
const TREND_HEIGHT = 7
const NODES_OVERHEAD = 5
const CONTROLS_HEIGHT = 5

export default function App({ config }: Props) {
  const { stdout } = useStdout()
  const showModal = useUiStore((s) => s.showModal)
  const nodeCount = useNodesStore((s) => s.nodes.length)

  useMetricsFetcher(config.interval)
  useKeyboard()

  const totalHeight = stdout?.rows ?? 24
  const nodesHeight = NODES_OVERHEAD + Math.max(1, nodeCount)
  const podsHeight = Math.max(8, totalHeight - TREND_HEIGHT - nodesHeight - CONTROLS_HEIGHT)
  // windowSize = podsHeight minus border(2) + title(1) + header(1) = 4 rows of overhead
  const podsWindowSize = Math.max(3, podsHeight - 4)

  return (
    <Box flexDirection="column" height={totalHeight}>
      <TrendPanel />
      <NodesPanel />
      <ControlsBar />
      <PodsPanel windowSize={podsWindowSize} height={podsHeight} />
      {showModal && <PodActionModal />}
    </Box>
  )
}

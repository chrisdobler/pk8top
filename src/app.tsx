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
import type { AppConfig } from './types.js'

interface Props {
  config: AppConfig
}

export default function App({ config }: Props) {
  const { stdout } = useStdout()
  const showModal = useUiStore((s) => s.showModal)

  useMetricsFetcher(config.interval)
  useKeyboard()

  const totalHeight = stdout?.rows ?? 24
  const podsWindowSize = Math.max(5, totalHeight - 15)

  return (
    <Box flexDirection="column" height={totalHeight}>
      <TrendPanel />
      <NodesPanel />
      <ControlsBar />
      <Box flexGrow={1}>
        <PodsPanel windowSize={podsWindowSize} />
      </Box>
      {showModal && <PodActionModal />}
    </Box>
  )
}

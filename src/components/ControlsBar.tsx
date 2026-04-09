import React from 'react'
import { Box, Text } from 'ink'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'

export default function ControlsBar() {
  const sortMode = usePodsStore((s) => s.sortMode)
  const focusedPanel = useUiStore((s) => s.focusedPanel)
  const isVcluster = useUiStore((s) => s.isVcluster)
  const lastError = useUiStore((s) => s.lastError)

  return (
    <Box borderStyle="round" flexDirection="column" paddingX={1} width="100%">
      <Box>
        <Text dimColor>↑↓/jk </Text>
        <Text dimColor>navigate  </Text>
        <Text dimColor>←→/hl </Text>
        <Text dimColor>sort  </Text>
        <Text dimColor>/ </Text>
        <Text dimColor>filter  </Text>
        <Text dimColor>Enter </Text>
        <Text dimColor>select  </Text>
        <Text dimColor>q </Text>
        <Text dimColor>quit  </Text>
        <Text bold>Sort: </Text>
        <Text color="cyan">{sortMode}</Text>
        <Text>  </Text>
        <Text bold>Focus: </Text>
        <Text color="cyan">{focusedPanel}</Text>
        {isVcluster && (
          <>
            <Text>  </Text>
            <Text color="magenta">⎈ vCluster</Text>
          </>
        )}
      </Box>
      {lastError && (
        <Box>
          <Text color="yellow">⚠ {lastError}</Text>
        </Box>
      )}
    </Box>
  )
}

import React from 'react'
import { Box, Text } from 'ink'
import { useUiStore } from '../store/ui.js'

function getActions(isVcluster: boolean): string[] {
  const base = ['Describe', 'Logs', 'List Namespace Resources']
  if (isVcluster) base.push('Connect to vCluster')
  return [...base, 'Delete', 'Cancel']
}

export default function PodActionModal() {
  const pod = useUiStore((s) => s.selectedPodForModal)
  const selectedAction = useUiStore((s) => s.selectedModalAction)

  if (!pod) return null

  const actions = getActions(pod.isVcluster)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text bold>{pod.name}</Text>
      <Text dimColor>{pod.namespace}</Text>
      {pod.isVcluster && <Text color="magenta">⎈ vCluster pod</Text>}
      <Text>{' '}</Text>
      {actions.map((action, i) => (
        <Text key={action} bold={i === selectedAction} color={i === selectedAction ? 'cyan' : undefined} inverse={i === selectedAction}>
          {i === selectedAction ? '▶ ' : '  '}
          {action}
        </Text>
      ))}
    </Box>
  )
}

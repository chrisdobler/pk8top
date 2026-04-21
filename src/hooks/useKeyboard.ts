import { useInput } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { podLogs, podDescribe, podDelete, listNamespaceResources, vclusterConnect } from '../lib/kubectl.js'
import { showActionModal, showFullScreenViewer } from '../lib/outputViewer.js'

const SORT_MODES = ['cpu', 'memory', 'status', 'namespace', 'restarts'] as const

export function useKeyboard() {
  useInput((input, key) => {
    const ui = useUiStore.getState()
    const pods = usePodsStore.getState()
    const nodes = useNodesStore.getState()

    // q: quit (unless in filter mode)
    if (input === 'q' && !pods.showFilter) {
      process.exit(0)
    }

    // ESC: priority chain
    if (key.escape) {
      ui.handleEsc()
      return
    }

    // Filter input mode
    if (pods.showFilter) {
      if (key.return) {
        pods.setShowFilter(false)
      }
      return
    }

    // / to open filter
    if (input === '/') {
      pods.setShowFilter(true)
      return
    }

    // Panel navigation
    if (ui.focusedPanel === 'nodes') {
      if (key.upArrow || input === 'k') {
        const newIdx = Math.max(0, nodes.selectedIndex - 1)
        nodes.setSelectedIndex(newIdx)
        if (newIdx === 0) {
          pods.setNodeFilter('')
        } else {
          pods.setNodeFilter(nodes.nodes[newIdx - 1]?.name ?? '')
        }
      } else if (key.downArrow || input === 'j') {
        const newIdx = Math.min(nodes.nodes.length, nodes.selectedIndex + 1)
        nodes.setSelectedIndex(newIdx)
        if (newIdx === 0) {
          pods.setNodeFilter('')
        } else {
          pods.setNodeFilter(nodes.nodes[newIdx - 1]?.name ?? '')
        }
      } else if (key.return || input === '\t') {
        ui.setFocusedPanel('pods')
      }
    } else {
      const maxIdx = Math.max(0, pods.filteredPods.length - 1)
      if (key.upArrow || input === 'k') {
        pods.setSelectedIndex(Math.max(0, pods.selectedIndex - 1))
      } else if (key.downArrow || input === 'j') {
        pods.setSelectedIndex(Math.min(maxIdx, pods.selectedIndex + 1))
      } else if (key.leftArrow || input === 'h') {
        const idx = (SORT_MODES.indexOf(pods.sortMode) - 1 + SORT_MODES.length) % SORT_MODES.length
        pods.setSortMode(SORT_MODES[idx])
      } else if (key.rightArrow || input === 'l') {
        const idx = (SORT_MODES.indexOf(pods.sortMode) + 1) % SORT_MODES.length
        pods.setSortMode(SORT_MODES[idx])
      } else if (key.return) {
        const pod = pods.filteredPods[pods.selectedIndex]
        if (!pod) return

        // Show ANSI modal — blocks until user picks or cancels
        const actions = pod.isVcluster
          ? ['Describe', 'Logs', 'List Namespace Resources', 'Connect to vCluster', 'Delete', 'Cancel']
          : ['Describe', 'Logs', 'List Namespace Resources', 'Delete', 'Cancel']

        const action = showActionModal(pod.name, pod.namespace, actions)
        if (!action || action === 'Cancel') return

        if (action === 'Describe') {
          const out = podDescribe(pod.name, pod.namespace)
          showFullScreenViewer(`Describe: ${pod.namespace}/${pod.name}`, out)
        } else if (action === 'Logs') {
          const out = podLogs(pod.name, pod.namespace)
          showFullScreenViewer(`Logs: ${pod.namespace}/${pod.name}`, out)
        } else if (action === 'Delete') {
          podDelete(pod.name, pod.namespace)
        } else if (action === 'List Namespace Resources') {
          const out = listNamespaceResources(pod.namespace)
          showFullScreenViewer(`Resources in ${pod.namespace}`, out)
        } else if (action === 'Connect to vCluster') {
          const ok = vclusterConnect(pod.name, pod.namespace)
          ui.setVclusterConnected(ok)
        }
      }
    }
  })
}

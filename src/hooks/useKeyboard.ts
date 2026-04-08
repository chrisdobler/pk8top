import { useInput } from 'ink'
import { useNodesStore } from '../store/nodes.js'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'
import { podLogs, podDescribe, podDelete, listNamespaceResources, vclusterConnect, vclusterDisconnect } from '../lib/kubectl.js'

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

    // Modal navigation
    if (ui.showModal && ui.selectedPodForModal) {
      const pod = ui.selectedPodForModal
      const actions = pod.isVcluster
        ? ['Describe', 'Logs', 'List Namespace', 'Connect to vCluster', 'Delete', 'Cancel']
        : ['Describe', 'Logs', 'List Namespace', 'Delete', 'Cancel']

      if (key.upArrow || input === 'k') {
        ui.setSelectedModalAction(Math.max(0, ui.selectedModalAction - 1))
        return
      }
      if (key.downArrow || input === 'j') {
        ui.setSelectedModalAction(Math.min(actions.length - 1, ui.selectedModalAction + 1))
        return
      }
      if (key.return) {
        const action = actions[ui.selectedModalAction]
        ui.setShowModal(false)
        if (action === 'Cancel') return
        if (action === 'Describe') {
          const out = podDescribe(pod.name, pod.namespace)
          ui.setLastError(out.slice(0, 200))
        } else if (action === 'Logs') {
          const out = podLogs(pod.name, pod.namespace)
          ui.setLastError(out.slice(0, 200))
        } else if (action === 'Delete') {
          podDelete(pod.name, pod.namespace)
        } else if (action === 'List Namespace') {
          const out = listNamespaceResources(pod.namespace)
          ui.setLastError(out.slice(0, 200))
        } else if (action === 'Connect to vCluster') {
          const ok = vclusterConnect(pod.name, pod.namespace)
          ui.setVclusterConnected(ok)
        }
        return
      }
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
        nodes.setSelectedIndex(Math.max(0, nodes.selectedIndex - 1))
      } else if (key.downArrow || input === 'j') {
        nodes.setSelectedIndex(Math.min(nodes.nodes.length - 1, nodes.selectedIndex + 1))
      } else if (key.return || input === '\t') {
        ui.setFocusedPanel('pods')
      }
    } else {
      const maxIdx = Math.max(0, pods.filteredPods.length - 1)
      if (key.upArrow || input === 'k') {
        pods.setSelectedIndex(Math.max(0, pods.selectedIndex - 1))
        pods.setScrollOffset(Math.min(pods.scrollOffset, pods.selectedIndex - 1))
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
        if (pod) ui.setShowModal(true, pod)
      }
    }
  })
}

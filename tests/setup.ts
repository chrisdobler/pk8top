import { beforeEach } from 'vitest'
import { useNodesStore } from '../src/store/nodes.js'
import { usePodsStore } from '../src/store/pods.js'
import { useUiStore } from '../src/store/ui.js'

// Force chalk to emit ANSI color codes in tests so we can assert on them.
process.env.FORCE_COLOR = '3'

beforeEach(() => {
  useNodesStore.setState({ nodes: [], selectedIndex: 0, history: {} })
  usePodsStore.setState({
    pods: [],
    filteredPods: [],
    filterText: '',
    showFilter: false,
    sortMode: 'cpu',
    nodeFilter: '',
    selectedIndex: 0,
    scrollOffset: 0,
  })
  useUiStore.setState({
    focusedPanel: 'nodes',
    isVcluster: false,
    vclusterConnected: false,
    lastError: null,
  })
})

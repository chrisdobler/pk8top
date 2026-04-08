import { useEffect, useRef } from 'react'
import { topNodes, topPods, getNodes, getPods, detectVcluster } from '../lib/kubectl.js'
import { parseNodeMetrics, parsePodTopAndGet } from '../lib/parsers.js'
import { useNodesStore } from '../store/nodes.js'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'

export function useMetricsFetcher(intervalSeconds: number) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function fetchAll() {
      try {
        const isVcluster = detectVcluster()
        useUiStore.getState().setIsVcluster(isVcluster)

        const nodesTopResult = topNodes()
        const nodesJson = getNodes()
        const podsTopResult = topPods()
        const podsJson = getPods()

        if (nodesTopResult.error && !nodesTopResult.stdout) {
          useUiStore.getState().setLastError(nodesTopResult.error)
        } else {
          useUiStore.getState().setLastError(null)
        }

        const nodes = parseNodeMetrics(nodesTopResult.stdout, nodesJson)
        const pods = parsePodTopAndGet(podsTopResult.stdout, podsJson)

        const historyData: Record<string, number> = {}
        if (nodes.length > 0) {
          for (const node of nodes) {
            historyData[node.name] = node.cpuPercent
          }
          historyData['all'] =
            nodes.reduce((sum, n) => sum + n.cpuPercent, 0) / nodes.length
        }

        useNodesStore.getState().setNodes(nodes)
        useNodesStore.getState().pushHistory(historyData)
        usePodsStore.getState().setPods(pods)
      } catch (e) {
        useUiStore.getState().setLastError(String(e))
      }
    }

    fetchAll()
    timerRef.current = setInterval(fetchAll, intervalSeconds * 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [intervalSeconds])
}

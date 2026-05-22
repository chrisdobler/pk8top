import { useEffect, useRef } from 'react'
import { topNodes, topPods, getNodes, getPods, detectVcluster } from '../lib/kubectl.js'
import { parseNodeMetrics, parsePodTopAndGet } from '../lib/parsers.js'
import { useNodesStore } from '../store/nodes.js'
import { usePodsStore } from '../store/pods.js'
import { useUiStore } from '../store/ui.js'

export function useMetricsFetcher(intervalSeconds: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seededRef = useRef(false)

  useEffect(() => {
    const abort = new AbortController()
    const { signal } = abort
    let inFlight = false
    let cancelled = false

    async function fetchAll() {
      if (inFlight || cancelled) return
      inFlight = true
      try {
        const [isVcluster, nodesTopResult, nodesJson, podsTopResult, podsJson] =
          await Promise.all([
            detectVcluster(signal),
            topNodes(signal),
            getNodes(signal),
            topPods(signal),
            getPods(signal),
          ])

        if (cancelled) return

        useUiStore.getState().setIsVcluster(isVcluster)

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

        // On first successful fetch, seed history so the graph starts full
        if (!seededRef.current && Object.keys(historyData).length > 0) {
          seededRef.current = true
          useNodesStore.getState().seedHistory(historyData, 500)
        }

        usePodsStore.getState().setPods(pods)
      } catch (e) {
        if (!cancelled) {
          useUiStore.getState().setLastError(String(e))
        }
      } finally {
        inFlight = false
        if (!cancelled) {
          timerRef.current = setTimeout(fetchAll, intervalSeconds * 1000)
        }
      }
    }

    fetchAll()

    return () => {
      cancelled = true
      abort.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [intervalSeconds])
}

export interface NodeMetric {
  name: string
  cpuCores: number      // actual cores used (e.g. 0.5)
  cpuPercent: number    // percentage of allocatable (e.g. 10.0)
  memoryMi: number      // MiB used
  memoryPercent: number
  role: string          // "control-plane", "worker", etc.
  status: 'Ready' | 'NotReady'
}

export interface PodMetric {
  name: string
  namespace: string
  nodeName: string       // which node this pod runs on
  cpuCores: number       // actual cores used
  memoryMi: number       // MiB used
  status: string         // "Running", "CrashLoopBackOff", etc.
  lastRestartAgeSeconds: number  // seconds since last restart; Infinity = never
  isVcluster: boolean
}

export type SortMode = 'cpu' | 'memory' | 'status' | 'namespace' | 'restarts'
export type FocusedPanel = 'nodes' | 'pods'
export type ModalAction = 'describe' | 'logs' | 'list-namespace' | 'connect' | 'delete' | 'cancel'

export interface AppConfig {
  interval: number       // seconds between refreshes (default 3.3)
  historyPoints: number  // number of historical data points (default 60)
}

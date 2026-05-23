import { useEffect, useState } from 'react'
import { useStdout } from 'ink'

/**
 * Reactive terminal dimensions. Subscribes to stdout 'resize' so a React
 * state update fires when the user resizes the terminal — necessary because
 * Ink's own resize handler only re-runs yoga layout, not React renders.
 */
export function useTerminalSize(): { rows: number; columns: number } {
  const { stdout } = useStdout()
  const [size, setSize] = useState(() => ({
    rows: stdout?.rows ?? 24,
    columns: stdout?.columns ?? 120,
  }))

  useEffect(() => {
    if (!stdout) return
    const onResize = () => {
      setSize({ rows: stdout.rows ?? 24, columns: stdout.columns ?? 120 })
    }
    stdout.on('resize', onResize)
    return () => { stdout.off('resize', onResize) }
  }, [stdout])

  return size
}

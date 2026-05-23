/**
 * Module-level exit registry. App registers Ink's useApp().exit on mount
 * so non-React callers (keypress handler, zustand store) can request a
 * clean unmount without prop-drilling. Falls back to process.exit(0) when
 * no exit fn is registered (e.g., before Ink mounts or in unit tests).
 */
let exitFn: (() => void) | null = null

export function setExitFn(fn: (() => void) | null): void {
  exitFn = fn
}

export function requestExit(): void {
  if (exitFn) exitFn()
  else process.exit(0)
}

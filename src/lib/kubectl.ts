import { spawn, spawnSync } from 'child_process'

const KUBECTL_TIMEOUT_MS = 15000

type RunResult = { stdout: string; stderr: string; ok: boolean }

function runSync(args: string[]): RunResult {
  const result = spawnSync('kubectl', args, {
    encoding: 'utf8',
    timeout: KUBECTL_TIMEOUT_MS,
    maxBuffer: 50 * 1024 * 1024,
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ok: result.status === 0,
  }
}

function run(args: string[], signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ stdout: '', stderr: 'aborted', ok: false })
      return
    }

    const child = spawn('kubectl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const settle = (r: RunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(r)
    }

    const onAbort = () => {
      child.kill()
      settle({ stdout: '', stderr: 'aborted', ok: false })
    }

    const timer = setTimeout(() => {
      child.kill()
      settle({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: 'kubectl timed out',
        ok: false,
      })
    }, KUBECTL_TIMEOUT_MS)

    signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', (c) => stdoutChunks.push(c))
    child.stderr.on('data', (c) => stderrChunks.push(c))
    child.on('error', (e) => {
      settle({ stdout: '', stderr: e.message, ok: false })
    })
    child.on('close', (code) => {
      settle({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        ok: code === 0,
      })
    })
  })
}

export async function topNodes(signal?: AbortSignal): Promise<{ stdout: string; error: string }> {
  const r = await run(['top', 'nodes', '--no-headers'], signal)
  return { stdout: r.ok ? r.stdout : '', error: r.ok ? '' : r.stderr.trim() }
}

export async function topPods(signal?: AbortSignal): Promise<{ stdout: string; error: string }> {
  const r = await run(['top', 'pods', '-A', '--no-headers', '--containers=false'], signal)
  return { stdout: r.ok ? r.stdout : '', error: r.ok ? '' : r.stderr.trim() }
}

export async function getNodes(signal?: AbortSignal): Promise<string> {
  const r = await run(['get', 'nodes', '-o', 'json'], signal)
  return r.ok ? r.stdout : '{}'
}

export async function getPods(signal?: AbortSignal): Promise<string> {
  const r = await run(['get', 'pods', '-A', '-o', 'json'], signal)
  return r.ok ? r.stdout : '{"items":[]}'
}

export async function detectVcluster(signal?: AbortSignal): Promise<boolean> {
  const r = await run(['config', 'current-context'], signal)
  return r.ok && r.stdout.toLowerCase().includes('vcluster')
}

export function podLogs(name: string, namespace: string): string {
  const r = runSync(['logs', name, '-n', namespace, '--tail=100'])
  return r.ok ? r.stdout : r.stderr
}

export function podDescribe(name: string, namespace: string): string {
  const r = runSync(['describe', 'pod', name, '-n', namespace])
  return r.ok ? r.stdout : r.stderr
}

export function podDelete(name: string, namespace: string): boolean {
  const r = runSync(['delete', 'pod', name, '-n', namespace])
  return r.ok
}

export function listNamespaceResources(namespace: string): string {
  const r = runSync(['get', 'all', '-n', namespace])
  return r.ok ? r.stdout : r.stderr
}

export function vclusterConnect(name: string, namespace: string): boolean {
  const result = spawnSync('vcluster', ['connect', name, '-n', namespace], {
    encoding: 'utf8',
    timeout: 30000,
  })
  return result.status === 0
}

export function vclusterDisconnect(): boolean {
  const result = spawnSync('vcluster', ['disconnect'], {
    encoding: 'utf8',
    timeout: 10000,
  })
  return result.status === 0
}

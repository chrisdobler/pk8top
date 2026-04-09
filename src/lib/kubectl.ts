import { spawnSync } from 'child_process'

function run(args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync('kubectl', args, {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 50 * 1024 * 1024,
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ok: result.status === 0,
  }
}

export function topNodes(): { stdout: string; error: string } {
  const r = run(['top', 'nodes', '--no-headers'])
  return { stdout: r.ok ? r.stdout : '', error: r.ok ? '' : r.stderr.trim() }
}

export function topPods(): { stdout: string; error: string } {
  const r = run(['top', 'pods', '-A', '--no-headers', '--containers=false'])
  return { stdout: r.ok ? r.stdout : '', error: r.ok ? '' : r.stderr.trim() }
}

export function getNodes(): string {
  const r = run(['get', 'nodes', '-o', 'json'])
  return r.ok ? r.stdout : '{}'
}

export function getPods(): string {
  const r = run(['get', 'pods', '-A', '-o', 'json'])
  return r.ok ? r.stdout : '{"items":[]}'
}

export function detectVcluster(): boolean {
  const r = run(['config', 'current-context'])
  return r.ok && r.stdout.toLowerCase().includes('vcluster')
}

export function podLogs(name: string, namespace: string): string {
  const r = run(['logs', name, '-n', namespace, '--tail=100'])
  return r.ok ? r.stdout : r.stderr
}

export function podDescribe(name: string, namespace: string): string {
  const r = run(['describe', 'pod', name, '-n', namespace])
  return r.ok ? r.stdout : r.stderr
}

export function podDelete(name: string, namespace: string): boolean {
  const r = run(['delete', 'pod', name, '-n', namespace])
  return r.ok
}

export function listNamespaceResources(namespace: string): string {
  const r = run(['get', 'all', '-n', namespace])
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

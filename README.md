# pk8top

**htop for Kubernetes.**

Monitor nodes, pods, and cluster resource usage in real time from your terminal.

**No dashboards.**  
**No agents.**  
**No operators.**  
**Just kubectl.**

![pk8top demo](assets/demo.gif)

## Install

### Homebrew (macOS arm64/x64, Linux x86_64)

```bash
brew tap chrisdobler/pk8top
brew install pk8top
pk8top
```

> Note: the formula installs `kubectl` if it is not already present.

### From source

Requires [Bun](https://bun.sh/) to compile the single-file binary.

```bash
git clone https://github.com/chrisdobler/pk8top
cd pk8top
bun install
bun build src/index.tsx --compile --outfile pk8top --external react-devtools-core
./pk8top
```

## Why I built this

I spend most of my time operating Kubernetes clusters.

I found myself constantly bouncing between:

- `kubectl top`
- Grafana dashboards
- Rancher
- Lens
- `kubectl describe`

None of them provided the fast feedback loop that tools like `htop` and `btop` give on a Linux system.

I wanted a terminal-first experience that lets me see cluster health instantly and perform common operational tasks without leaving the keyboard.

So I built **pk8top**.

## What makes pk8top different?

Most Kubernetes monitoring tools are either:

- 🐢 Slow web dashboards
- 🧱 Heavy GUI applications
- 🔍 One-shot CLI commands that must be re-run

pk8top is designed for operators who live in the terminal:

- ⚡ Real-time updates
- 📈 Live resource graphs
- ⌨️ Keyboard-driven navigation
- 🔧 Uses your existing kubectl context
- 🚫 No cluster-side installation

## Features

### 📊 Live cluster view

- Per-node CPU utilization
- Per-node memory utilization
- Historical CPU trend graphs
- Real-time updates
- Windowed pod list sorted by resource usage

### ⌨️ Pod operations

Without leaving the terminal you can:

- Inspect pods
- View pod descriptions
- View logs
- Delete pods (with confirmation)
- Navigate resources entirely with the keyboard

### 🔌 No cluster components required

pk8top uses your existing `kubectl` configuration.

- No agents
- No operators
- No CRDs
- No additional RBAC

Switch contexts before launching:

```bash
kubectl config use-context my-cluster
pk8top
```

## Comparison

| Tool | Live metrics | Terminal UI | Pod operations | Cluster install required |
|---|---:|---:|---:|---:|
| kubectl top | ✓ | ✗ | ✗ | ✗ |
| Grafana | ✓ | ✗ | ✗ | ✓ |
| Lens | ✓ | ✗ | ✓ | ✓ |
| Rancher | ✓ | ✗ | ✓ | ✓ |
| pk8top | ✓ | ✓ | ✓ | ✗ |

## Built for daily use

- 222 automated tests
- 94% line coverage
- Single binary distribution
- MIT licensed
- No cluster-side dependencies

## Usage

```bash
pk8top [--interval <seconds>] [--history <points>]
```

### Flags

| Flag | Description | Default |
|---|---|---:|
| `--interval`, `-i` | Refresh interval in seconds | `3.3` |
| `--history`, `-H` | History points retained for trend graphs | `60` |

## Roadmap

Potential future enhancements:

- Namespace filtering
- Additional resource views
- Enhanced log viewing
- More cluster operations
- Custom dashboards

Contributions and feedback are welcome.

## License

MIT — see LICENSE.

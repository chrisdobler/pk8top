<h1 align="center">pk8top</h1>

<p align="center">
  A terminal UI for monitoring Kubernetes cluster resources.<br/>
  <em>Like <code>top</code>, but for your cluster's nodes and pods.</em>
</p>

<p align="center">
  <img alt="demo" src="./assets/demo.gif" />
</p>

---

## Why pk8top?

Most Kubernetes monitoring tools are either:
- 🐢 Slow web dashboards
- 🧱 Heavy GUI apps
- 🔍 One-shot CLIs you have to re-run

**pk8top is different:**
- ⚡ Runs in your terminal (React Ink)
- 📈 Live CPU/memory graphs per node
- ⌨️ Keyboard-driven pod actions
- 🔧 Just shells out to `kubectl` — no agents, no operators

---

## Features

### 📊 Live Cluster View
- **Node panel** — per-node CPU/memory with btop-style graphs
- **Pod panel** — windowed list with filter, sorted by usage
- **Trend graph** — historical CPU across the cluster

### ⌨️ Pod Actions
- Inspect, describe, delete (with confirmation)
- ANSI-rendered output viewer
- All keyboard-driven

### 🔌 Just kubectl
- Uses your current `kubectl` context
- No CRDs, no operators, no extra RBAC
- Switch contexts before launching to monitor different clusters

---

## Install

### Homebrew (macOS arm64/x64, Linux x86_64)

```
brew tap chrisdobler/pk8top
brew install pk8top
```

The formula declares `kubernetes-cli` as a runtime dependency, so brew installs `kubectl` for you if it isn't already present.

### From source

Requires [Bun](https://bun.sh) to compile the single-file binary.

```
git clone https://github.com/chrisdobler/pk8top
cd pk8top
bun install
bun build src/index.tsx --compile --outfile pk8top --external react-devtools-core
./pk8top
```

---

## Usage

```
pk8top [--interval <seconds>] [--history <points>]
```

Flags:

- `--interval`, `-i` — refresh interval in seconds (default: `3.3`)
- `--history`, `-H` — history points to keep on the trend graph (default: `60`)

`pk8top` uses your current kubeconfig context. Switch with `kubectl config use-context <name>` before launching to monitor a different cluster.

---

## License

MIT — see [LICENSE](LICENSE).

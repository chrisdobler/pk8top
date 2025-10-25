# watch-node-cpu.py - Context & Design Documentation

## Overview
A real-time TUI monitoring tool for Kubernetes node and pod CPU/memory metrics, with special support for vcluster environments. Built with Rich library for terminal UI rendering.

## Key Features

### 1. Dual-Context Support (Host & vCluster)
- **Automatic vCluster Detection**: Checks `kubectl config current-context` for "vcluster" string
- **Graceful Degradation**: In vcluster environments where node metrics aren't available, displays "N/A" placeholders
- **Context Switching**:
  - Connect to vcluster: Select a vcluster pod → Press ENTER → Choose "Connect to vCluster"
  - Disconnect from vcluster: Press ESC twice (once to focus nodes, once to disconnect)
  - All state is cleared on context switch to provide clean view

### 2. Interactive Navigation
- **Two-Panel View**: Nodes (top) and Pods (bottom)
- **Focus Switching**: Press ENTER to toggle between nodes and pods
- **Node Selection**: Arrow keys or h/j/k/l in nodes panel
- **Pod Selection**: Arrow keys or j/k in pods panel
- **Scrolling Window**: Shows 20 pods at a time with automatic scrolling

### 3. Pod Filtering
- **Trigger**: Press `/` in pods view to enter filter mode
- **Live Search**: Results update as you type (non-blocking, async)
- **Filter Behavior**:
  - ESC: Clear filter and exit input mode (fresh start)
  - ENTER: Keep filter and exit input mode (results stay filtered)
  - Ctrl+U: Clear entire filter text
  - Backspace: Remove last character
- **Search Scope**: Searches both pod name and namespace

### 4. Pod Actions Modal
- Press ENTER on a pod to open action modal
- **Standard Actions**: Logs, Describe, Delete
- **vCluster-Specific**: "Connect to vCluster" appears if pod is a vcluster
- **vCluster Detection Logic**: Checks pod labels (`release`, `app.kubernetes.io/instance`, `vcluster.loft.sh/name`) or parses pod name

### 5. Metrics Display
- **CPU History Graphs**: Sparklines showing last 60 data points per node
- **Pod Sorting**: CPU, Memory, Status, Namespace, Restarts (cycle with ←/→ or h/l)
- **Color Coding**:
  - Green: Running pods
  - Yellow: Non-running states
  - Red: Failed/Error states
  - Dim yellow: vCluster limited metrics warning

## Architecture & State Management

### Core State Variables
```python
# Selection & Focus
self.focused_panel: str           # "nodes" or "pods"
self.selected_node_index: int     # Current node selection (0 = "all")
self.selected_pod_index: int      # Current pod selection
self.pod_scroll_offset: int       # Scrolling position in pod list

# Filtering
self.pod_filter_text: str         # Current filter text
self.show_filter_input: bool      # Whether filter input is active

# Modal
self.show_pod_modal: bool         # Whether action modal is shown
self.selected_action_index: int   # Current action selection

# vCluster
self.is_vcluster: bool            # Detected vcluster context
```

### Important: State Reset on Context Switch
When connecting/disconnecting from vcluster, ALL of the following must be cleared:
- Metrics history (`cpu_history`, `pod_metrics`, `node_status`, `node_roles`)
- Render signatures (`_last_nodes_sig`, `_last_pods_sig`, `_last_controls_sig`)
- Selection state (`selected_node_index=0`, `selected_pod_index=0`, `pod_scroll_offset=0`)
- Filter state (`pod_filter_text=""`, `show_filter_input=False`)
- Modal state (`show_pod_modal=False`, `selected_action_index=0`)
- Focus (`focused_panel="nodes"`)

**Why?** Different contexts have different nodes/pods. Keeping old state causes confusion like:
- Filter text from old context showing results from new context
- Selected node index pointing to non-existent node
- Scroll offset out of bounds

### Performance Optimizations

#### 1. Signature-Based Caching
Avoid unnecessary re-renders by computing signatures of table data:
```python
nodes_sig = (self.update_count, selected_node, self.is_vcluster)
if nodes_sig == self._last_nodes_sig:
    return cached_table  # Don't rebuild
```

#### 2. Async Filter Input
**Problem**: Blocking `live.update()` on each keystroke makes typing sluggish.

**Solution**: Set filter state and `break` to let main loop handle rendering:
```python
if key in filter_input:
    self.pod_filter_text += key
    filter_changed = True

if filter_changed:
    break  # Main loop handles refresh async
```

This decouples input from rendering for responsive typing.

#### 3. Pod Filtering in Layout Build
Filtering happens during table construction, not as a separate pre-processing step:
```python
filtered = [
    (p, cpu, ns, nd, status, restart, mem)
    for (p, cpu, ns, nd, status, restart, mem) in self.pod_metrics
    if (selected_node == "all" or nd == selected_node)
    and (not self.pod_filter_text 
         or self.pod_filter_text.lower() in p.lower()
         or self.pod_filter_text.lower() in ns.lower())
]
```

## vCluster-Specific Implementation Details

### Why No Node Metrics in vCluster?
vClusters use **virtual nodes** without real kubelet endpoints. The metrics-server inside a vcluster cannot scrape actual node metrics, so:
- `kubectl top nodes` fails with "Metrics API not available"
- Attempting to install metrics-server in vcluster doesn't help (nodes are virtual)

### Solution: Graceful Degradation
1. **Detection**: `_detect_vcluster()` checks if context name contains "vcluster"
2. **Metrics Fallback**: When `kubectl top nodes` fails in vcluster:
   - Get node names from `kubectl get nodes -o json`
   - Populate metrics with `0.0` placeholders
   - Display "N/A" in UI for CPU/Memory columns
3. **User Feedback**:
   - Title shows `[dim yellow](vcluster - limited metrics)[/dim yellow]`
   - Warning in controls: "⚠ vCluster: Metrics API not available • Press ESC to disconnect"

### vCluster Name Extraction
Getting the correct vcluster name for `vcluster connect` is non-trivial:
1. **Check pod labels** (in order of preference):
   - `release`
   - `app.kubernetes.io/instance`
   - `vcluster.loft.sh/name`
2. **Parse pod name**: Extract from pattern like `rancher-vcluster-0`
3. **Fallback**: Use namespace name

**Why complex?** Different vcluster deployments use different naming conventions (Rancher, Loft, vanilla vcluster).

## Key User Experience Patterns

### Pattern: "Fresh Start" on Context Switch
**Philosophy**: Context switches should feel like restarting the tool in a new cluster.

**Implementation**: Clear ALL state (not just metrics) to avoid carrying over irrelevant selections/filters from previous context.

### Pattern: Non-Blocking Input
**Philosophy**: User typing should never be delayed by rendering.

**Implementation**: Input handlers set state variables and `break`, letting the main refresh loop handle UI updates asynchronously.

### Pattern: "Escape to Safety"
**Philosophy**: ESC should always move you to a "safer" or "broader" state.

**Implementation**:
- In filter mode: Clear filter (fresh start)
- In pod modal: Close modal
- In pods focus: Switch to nodes focus
- In nodes focus (vcluster): Disconnect to host cluster

## Known Limitations

1. **No Pod Metrics in vCluster**: Pod metrics may also be limited in some vcluster configurations (depends on metrics-server setup)
2. **Terminal Size Dependency**: Very small terminals may cause UI clipping
3. **Context Switch Delay**: 1-second sleep after connect/disconnect to show user feedback before reload
4. **Large Pod Lists**: Only first 200 pods used in signature calculation for performance

## Future Enhancement Ideas

- [ ] Support for filtering by namespace (separate from pod name filter)
- [ ] History/sparklines for pod CPU usage (currently only nodes have graphs)
- [ ] Multi-cluster switching (not just vcluster, but other contexts)
- [ ] Resource limits/requests comparison (show pod requests vs actual usage)
- [ ] Export/snapshot feature (save current metrics to file)
- [ ] Custom refresh interval (currently hardcoded at 1 second)
- [ ] Color themes or configuration file

## Debugging Tips

### If Filter Feels "Sticky"
Check that `show_filter_input` flag is properly reset when switching contexts or pressing ESC.

### If Context Switch Shows Wrong Data
Verify all state variables are cleared in the context switch handler. Grep for the variable name to find all usages.

### If Typing is Slow in Filter Mode
Ensure no `live.update()` calls in the key handling loop for filter input - should only set state and `break`.

### If vCluster Not Detected
- Check output of `kubectl config current-context`
- Update `_detect_vcluster()` method if your vcluster uses different naming

## Code Structure

```
watch-node-cpu.py
├── NodeCPUWatcher (main class)
│   ├── __init__              # State initialization
│   ├── _detect_vcluster      # vCluster detection
│   ├── _get_vcluster_name    # Extract vcluster name from pod
│   ├── _is_vcluster_pod      # Check if pod is a vcluster
│   ├── get_node_metrics      # Fetch node CPU (with vcluster fallback)
│   ├── get_pod_metrics       # Fetch pod CPU/memory
│   ├── format_table          # Build nodes table UI
│   ├── format_pods_table     # Build pods table UI
│   ├── create_pod_action_modal  # Build action modal UI
│   └── run                   # Main loop (key handling + refresh)
```

## Dependencies
- `rich`: Terminal UI (Table, Panel, Layout, Live)
- `sparklines`: CPU history graphs
- `kubectl`: All k8s API calls via subprocess
- `vcluster` CLI: For context switching

## Testing Checklist for Changes

- [ ] Test in host cluster context
- [ ] Test in vcluster context
- [ ] Test context switching (host → vcluster → host)
- [ ] Test filter input (type, backspace, ESC, ENTER)
- [ ] Test pod selection and scrolling
- [ ] Test node selection
- [ ] Test sort mode cycling
- [ ] Test action modal (logs, describe, delete)
- [ ] Test vcluster detection with different vcluster types
- [ ] Test with very large pod lists (100+)
- [ ] Test with small terminal size


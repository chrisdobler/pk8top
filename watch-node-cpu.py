#!/usr/bin/env python3
"""
Watch Kubernetes node CPU usage with line graphs.
Similar to htop but for your k8s cluster nodes.
"""

import subprocess
import sys
import time
import select
import termios
import tty
import os
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple
import json

from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
from rich.text import Text
import sparklines


class NodeCPUWatcher:
    def __init__(self, history_points: int = 60):
        self.console = Console()
        self.history_points = history_points
        self.cpu_history: Dict[str, List[float]] = defaultdict(list)
        self.timestamp_history: List[str] = []
        self.update_count = 0
        self.last_error: str = ""
        # cache for pods
        self.pod_metrics: List[
            Tuple[str, float, str, str, str, str, float]
        ] = []  # (pod, cpu_cores, namespace, node, status, last_restart, mem_mib)
        # selection state
        self.selected_node_index: int = 0
        self.nodes_for_selection: List[str] = ["all"]
        # terminal state
        self._orig_term_attrs = None
        # key handling - simple and direct
        # last render signatures to avoid unnecessary updates
        self._last_nodes_sig = None
        self._last_pods_sig = None
        self._last_selected_node = None
        self._last_controls_sig = None
        # cached filtered/sorted pods to avoid re-sorting on every frame
        self._cached_filtered_pods: List[
            Tuple[str, float, str, str, str, str, float]
        ] = []
        # node metadata
        self.node_status: Dict[str, str] = {}
        self.node_roles: Dict[str, str] = {}
        # sort mode for pods table
        self.sort_modes: List[str] = [
            "CPU",
            "Memory",
            "Status",
            "Namespace",
            "Restarts",
        ]
        self.selected_sort_index: int = 0
        # focus and selection
        self.focused_panel: str = "nodes"  # 'nodes' or 'pods'
        self.selected_pod_index: int = 0
        self.pod_scroll_offset: int = 0  # For windowing/scrolling pod list
        self.pod_window_size: int = (
            20  # Number of pods to show at once (dynamically updated)
        )
        # text filter for pods
        self.pod_filter_text: str = ""
        self.show_filter_input: bool = False
        # pod action modal
        self.show_pod_modal: bool = False
        self.selected_pod_for_action: Tuple[str, str, str] = (
            "",
            "",
            "",
        )  # (pod_name, namespace, node)
        self.pod_action_options: List[str] = []  # Dynamically built based on pod type
        self.selected_action_index: int = 0
        # vcluster detection
        self.is_vcluster: bool = self._detect_vcluster()
        self.vcluster_warning_shown: bool = False

    def _detect_vcluster(self) -> bool:
        """
        Detect if we're running against a vcluster context.
        Returns True if the current context appears to be a vcluster.
        """
        try:
            result = subprocess.run(
                ["kubectl", "config", "current-context"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                context = result.stdout.strip()
                # Check if context name contains 'vcluster'
                return "vcluster" in context.lower()
        except Exception:
            pass
        return False

    def _estimate_panel_height_for_table(self, num_rows: int) -> int:
        """
        Estimate the height of a Panel(Table(...), padding=(1,2)).
        Overhead accounts for table title, borders, header, separator, panel borders and padding.
        """
        # Overhead components (approx):
        # table title (1) + top border (1) + header (1) + header separator (1) + bottom border (1)
        # panel top/bottom borders (2) + panel padding top/bottom (2)
        overhead = 9
        return max(5, overhead + num_rows)

    def _calculate_pod_window_size(self, nodes_panel_height: int) -> int:
        """
        Calculate how many pods can fit in the available terminal space.
        Returns the number of pod rows that will fit in the pods panel.
        """
        try:
            terminal_height = self.console.size.height
            # Account for: title (3) + nodes panel + controls (3 or 4 for vcluster) + pod panel overhead (9)
            controls_height = 4 if self.is_vcluster else 3
            used_height = 3 + nodes_panel_height + controls_height + 9
            available_for_pods = terminal_height - used_height
            # Ensure at least 5 rows, cap at reasonable maximum
            return max(5, min(available_for_pods, 100))
        except Exception:
            # Fallback to a reasonable default
            return 20

    def _enable_raw_mode(self):
        try:
            fd = sys.stdin.fileno()
            self._orig_term_attrs = termios.tcgetattr(fd)
            # Use cbreak mode - allows signal processing but immediate char input
            tty.setcbreak(fd)
        except Exception:
            self._orig_term_attrs = None

    def _disable_raw_mode(self):
        try:
            if self._orig_term_attrs is not None:
                termios.tcsetattr(
                    sys.stdin.fileno(), termios.TCSADRAIN, self._orig_term_attrs
                )
        except Exception:
            pass

    def _read_key(self) -> str:
        """Simple non-blocking key read."""
        try:
            fd = sys.stdin.fileno()
            # Check if input available with very short timeout
            rlist, _, _ = select.select([fd], [], [], 0)
            if not rlist:
                return ""

            # Read one character directly from file descriptor
            import os

            ch1 = os.read(fd, 1).decode("utf-8", errors="ignore")
            if ch1 == "q":
                return "q"
            if ch1 in ("k", "K"):
                return "UP"
            if ch1 in ("j", "J"):
                return "DOWN"
            if ch1 in ("h", "H"):
                return "LEFT"
            if ch1 in ("l", "L"):
                return "RIGHT"
            if ch1 in ("\r", "\n"):
                return "ENTER"
            if ch1 == "\x7f" or ch1 == "\x08":
                return ch1  # Backspace
            if ch1 != "\x1b":
                # Return the character itself (for filter input, etc.)
                return ch1

            # Read escape sequence quickly
            import os

            seq = ch1
            for _ in range(2):
                if select.select([fd], [], [], 0.01)[0]:
                    seq += os.read(fd, 1).decode("utf-8", errors="ignore")
                else:
                    break

            if seq == "\x1b[A" or seq == "\x1bOA":
                return "UP"
            elif seq == "\x1b[B" or seq == "\x1bOB":
                return "DOWN"
            elif seq == "\x1b[D" or seq == "\x1bOD":
                return "LEFT"
            elif seq == "\x1b[C" or seq == "\x1bOC":
                return "RIGHT"
            elif seq == "\x1b":
                return "ESC"
            return ""
        except Exception:
            return ""

    def _parse_memory_value_to_mib(self, mem_raw: str) -> float:
        """Parse a Kubernetes memory value like '5947Mi', '8Gi', '1024Ki' to MiB float."""
        try:
            mem_raw = mem_raw.strip()
            units = ["Ki", "Mi", "Gi", "Ti", "Pi", "Ei"]
            for unit in units:
                if mem_raw.endswith(unit):
                    value = float(mem_raw[: -len(unit)])
                    factor = {
                        "Ki": 1.0 / 1024.0,
                        "Mi": 1.0,
                        "Gi": 1024.0,
                        "Ti": 1024.0 * 1024.0,
                        "Pi": 1024.0 * 1024.0 * 1024.0,
                        "Ei": 1024.0 * 1024.0 * 1024.0 * 1024.0,
                    }[unit]
                    return value * factor
            # Fallback: plain bytes? try interpret as Mi directly
            return float(mem_raw)
        except Exception:
            return 0.0

    def _parse_restart_to_seconds(self, restart_str: str) -> float:
        """Convert restart time string like '5m', '2h', '3d' to seconds. Returns infinity for 'never'."""
        if restart_str == "never" or restart_str == "?":
            return float("inf")
        try:
            if restart_str.endswith("s"):
                return float(restart_str[:-1])
            elif restart_str.endswith("m"):
                return float(restart_str[:-1]) * 60
            elif restart_str.endswith("h"):
                return float(restart_str[:-1]) * 3600
            elif restart_str.endswith("d"):
                return float(restart_str[:-1]) * 86400
            return float("inf")
        except Exception:
            return float("inf")

    def get_node_metrics(self) -> Dict[str, Tuple[float, float, float, float]]:
        """
        Fetch node CPU usage using kubectl top.
        Returns dict of {node_name: (cpu_cores, cpu_percentage)}
        """
        try:
            result = subprocess.run(
                ["kubectl", "top", "nodes", "--no-headers"],
                capture_output=True,
                text=True,
                timeout=10,
            )

            metrics: Dict[str, Tuple[float, float, float, float]] = {}
            self.last_error = ""

            if result.returncode != 0:
                self.last_error = result.stderr.strip() or "kubectl top nodes failed"
                return {}

            stdout = result.stdout.strip()
            if not stdout:
                self.last_error = "No output from 'kubectl top nodes'"
                return {}

            if "No resources found" in stdout:
                self.last_error = stdout
                return {}

            for line_text in stdout.split("\n"):
                if not line_text.strip():
                    continue
                parts = line_text.split()
                # Expect at least: NAME CPU(cores) CPU% [...]
                if len(parts) < 3:
                    self.last_error = (
                        f"Unexpected 'kubectl top nodes' format: {line_text}"
                    )
                    continue

                node_name = parts[0]
                tokens = parts[1:]
                # Identify CPU%, MEM% positions
                percent_indices = [
                    i for i, tok in enumerate(tokens) if tok.endswith("%")
                ]
                cpu_pct_raw = tokens[percent_indices[0]] if percent_indices else None
                mem_pct_raw = (
                    tokens[percent_indices[1]] if len(percent_indices) > 1 else None
                )
                if not cpu_pct_raw:
                    self.last_error = f"Could not locate CPU% column in: {line_text}"
                    continue
                # Identify memory bytes token
                mem_units = ("Ki", "Mi", "Gi", "Ti", "Pi", "Ei")
                mem_bytes_idx = next(
                    (i for i, tok in enumerate(tokens) if tok.endswith(mem_units)), None
                )
                # Identify CPU cores token: first non-percent, non-mem token
                cpu_cores_idx = next(
                    (
                        i
                        for i, tok in enumerate(tokens)
                        if not tok.endswith("%") and not tok.endswith(mem_units)
                    ),
                    None,
                )
                if cpu_cores_idx is None:
                    self.last_error = f"Could not locate CPU cores in: {line_text}"
                    continue
                cpu_str_raw = tokens[cpu_cores_idx]

                try:
                    if cpu_str_raw.endswith("m"):
                        cpu_cores = float(cpu_str_raw[:-1]) / 1000.0
                    elif cpu_str_raw.endswith("n"):
                        cpu_cores = float(cpu_str_raw[:-1]) / 1_000_000_000.0
                    else:
                        cpu_cores = float(cpu_str_raw)
                except ValueError:
                    self.last_error = f"Could not parse CPU cores: {cpu_str_raw}"
                    continue

                try:
                    cpu_pct = float(cpu_pct_raw.rstrip("%"))
                except ValueError:
                    self.last_error = f"Could not parse CPU%: {cpu_pct_raw}"
                    continue

                # Memory values
                mem_mib = 0.0
                mem_pct = 0.0
                if mem_bytes_idx is not None:
                    mem_mib = self._parse_memory_value_to_mib(tokens[mem_bytes_idx])
                if mem_pct_raw:
                    try:
                        mem_pct = float(mem_pct_raw.rstrip("%"))
                    except ValueError:
                        mem_pct = 0.0

                metrics[node_name] = (cpu_cores, cpu_pct, mem_mib, mem_pct)

            if not metrics and not self.last_error:
                self.last_error = (
                    "No metrics parsed; ensure metrics-server is installed."
                )
            return metrics
        except subprocess.TimeoutExpired:
            self.last_error = "kubectl command timed out"
            return {}
        except Exception as e:
            self.last_error = f"Error fetching metrics: {e}"
            return {}

    def get_node_metadata(self) -> None:
        """Populate node status and roles from kubectl get nodes -o json."""
        try:
            proc = subprocess.run(
                ["kubectl", "get", "nodes", "-o", "json"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if proc.returncode != 0:
                return
            data = json.loads(proc.stdout)
            self.node_status.clear()
            self.node_roles.clear()
            for item in data.get("items", []):
                meta = item.get("metadata", {})
                status = item.get("status", {})
                node_name = meta.get("name", "")
                # Status: Ready/NotReady
                conds = status.get("conditions", []) or []
                ready = next((c for c in conds if c.get("type") == "Ready"), None)
                node_state = (
                    "Ready" if ready and ready.get("status") == "True" else "NotReady"
                )
                self.node_status[node_name] = node_state
                # Roles from labels like node-role.kubernetes.io/control-plane=""
                labels = meta.get("labels", {}) or {}
                roles = []
                for k, v in labels.items():
                    if k.startswith("node-role.kubernetes.io/"):
                        roles.append(k.split("/", 1)[1])
                if not roles and labels.get("kubernetes.io/role"):
                    roles.append(labels.get("kubernetes.io/role"))
                self.node_roles[node_name] = ",".join(sorted(set(roles))) or "worker"
        except Exception:
            pass

    def get_pod_metrics(self) -> List[Tuple[str, float, str, str, str, str, float]]:
        """
        Fetch pod CPU and node mapping.
        Returns list of (pod_name, cpu_cores, namespace, node_name, status, last_restart, mem_mib)
        """
        try:
            # Get pod CPU from `kubectl top pods -A --containers=false --no-headers`
            pods_top = subprocess.run(
                [
                    "kubectl",
                    "top",
                    "pods",
                    "-A",
                    "--no-headers",
                    "--containers=false",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )

            # Build map of (namespace, pod) -> (cpu cores, mem_mib) from top output
            metrics_by_ns_pod: Dict[Tuple[str, str], Tuple[float, float]] = {}

            # If metrics are available, parse them
            if pods_top.returncode == 0 and pods_top.stdout.strip():
                for line_text in pods_top.stdout.strip().split("\n"):
                    if not line_text.strip():
                        continue
                    # Format: NAMESPACE POD CPU(M) MEMORY(Mi)
                    parts = line_text.split()
                    if len(parts) < 4:
                        continue
                    ns, pod, cpu_raw, mem_raw = parts[0], parts[1], parts[2], parts[3]
                    try:
                        if cpu_raw.endswith("m"):
                            cpu_cores = float(cpu_raw[:-1]) / 1000.0
                        else:
                            cpu_cores = float(cpu_raw)
                        mem_mib = self._parse_memory_value_to_mib(mem_raw)
                    except ValueError:
                        continue
                    metrics_by_ns_pod[(ns, pod)] = (cpu_cores, mem_mib)
            # If metrics not available (e.g., in vcluster), continue anyway to show pods without metrics

            # Get pod -> node mapping
            pods_nodes = subprocess.run(
                [
                    "kubectl",
                    "get",
                    "pods",
                    "-A",
                    "-o",
                    "json",
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if pods_nodes.returncode != 0:
                self.last_error = pods_nodes.stderr.strip() or "kubectl get pods failed"
                return []

            result: List[Tuple[str, float, str, str, str, str, float]] = []
            try:
                data = json.loads(pods_nodes.stdout)
            except Exception as e:
                self.last_error = f"Failed to parse pods JSON: {e}"
                return []

            items = data.get("items", [])
            for item in items:
                meta = item.get("metadata", {})
                status_obj = item.get("status", {})
                spec_obj = item.get("spec", {})

                ns = meta.get("namespace", "")
                pod = meta.get("name", "")
                node = spec_obj.get("nodeName", "")
                phase = status_obj.get("phase", "")

                # Calculate last restart time
                containers = status_obj.get("containerStatuses", []) or []
                last_restart = "never"
                waiting_reason = None
                most_recent_restart_time = None

                for cs in containers:
                    state = cs.get("state", {}) or {}
                    if state.get("waiting") and state["waiting"].get("reason"):
                        waiting_reason = state["waiting"]["reason"]

                    # Check lastState for terminated info (indicates a restart)
                    last_state = cs.get("lastState", {}) or {}
                    if last_state.get("terminated"):
                        finished_at = last_state["terminated"].get("finishedAt")
                        if finished_at:
                            try:
                                from datetime import datetime, timezone

                                restart_time = datetime.fromisoformat(
                                    finished_at.replace("Z", "+00:00")
                                )
                                if (
                                    most_recent_restart_time is None
                                    or restart_time > most_recent_restart_time
                                ):
                                    most_recent_restart_time = restart_time
                            except Exception:
                                pass

                # Format last restart time
                if most_recent_restart_time:
                    try:
                        from datetime import datetime, timezone

                        seconds_since_restart = (
                            datetime.now(timezone.utc) - most_recent_restart_time
                        ).total_seconds()

                        if seconds_since_restart < 60:
                            last_restart = f"{int(seconds_since_restart)}s"
                        elif seconds_since_restart < 3600:
                            last_restart = f"{int(seconds_since_restart / 60)}m"
                        elif seconds_since_restart < 86400:
                            last_restart = f"{int(seconds_since_restart / 3600)}h"
                        else:
                            last_restart = f"{int(seconds_since_restart / 86400)}d"
                    except Exception:
                        last_restart = "?"

                # Determine status
                if waiting_reason:
                    status = waiting_reason
                elif phase == "Running":
                    status = "Running"
                elif phase:
                    status = phase
                else:
                    status = "Unknown"

                cores, mem_mib = metrics_by_ns_pod.get((ns, pod), (0.0, 0.0))
                result.append((pod, cores, ns, node, status, last_restart, mem_mib))

            # Sort by CPU cores descending
            result.sort(key=lambda x: x[1], reverse=True)
            return result
        except subprocess.TimeoutExpired:
            self.last_error = "kubectl command timed out"
            return []
        except Exception as e:
            self.last_error = f"Error fetching pod metrics: {e}"
            return []

    def update_history(self, metrics: Dict[str, Tuple[float, float, float, float]]):
        """Update historical data with new metrics."""
        # Record timestamp
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.timestamp_history.append(timestamp)
        if len(self.timestamp_history) > self.history_points:
            self.timestamp_history.pop(0)

        # Aggregate 'all' CPU percent as average of node percentages
        if metrics:
            avg_pct = sum(v[1] for v in metrics.values()) / max(1, len(metrics))
            self.cpu_history["all"].append(avg_pct)
            if len(self.cpu_history["all"]) > self.history_points:
                self.cpu_history["all"].pop(0)

        # Update CPU history for each node
        for node_name, (cpu_cores, cpu_pct, mem_mib, mem_pct) in metrics.items():
            self.cpu_history[node_name].append(cpu_pct)
            if len(self.cpu_history[node_name]) > self.history_points:
                self.cpu_history[node_name].pop(0)

        # Remove old nodes that are no longer in metrics
        for node_name in list(self.cpu_history.keys()):
            if node_name not in metrics and node_name != "all":
                del self.cpu_history[node_name]

    def format_table(
        self, metrics: Dict[str, Tuple[float, float, float, float]], selected_node: str
    ) -> Table:
        """Create a formatted table with node metrics and sparklines."""
        title = "Kubernetes Node CPU Usage"
        if self.is_vcluster:
            title += " [dim yellow](vcluster - limited metrics)[/dim yellow]"

        table = Table(
            title=title,
            show_header=True,
            header_style="bold cyan",
            expand=True,
        )
        table.add_column("Node", style="cyan", no_wrap=True)
        table.add_column("Roles", style="cyan", width=15)
        table.add_column("Status", style="cyan", width=10)
        table.add_column("CPU (cores)", justify="right", style="magenta", width=10)
        table.add_column("CPU %", justify="right", style="yellow", width=7)
        table.add_column("Mem (Mi)", justify="right", style="green", width=10)
        table.add_column("Mem %", justify="right", style="green", width=7)
        table.add_column("Trend", min_width=30)

        # First add aggregate 'all' row
        total_cores = sum(v[0] for v in metrics.values()) if metrics else 0.0
        total_mem_mib = sum(v[2] for v in metrics.values()) if metrics else 0.0
        avg_pct = (
            sum(v[1] for v in metrics.values()) / max(1, len(metrics))
            if metrics
            else 0.0
        )
        avg_mem_pct = (
            sum(v[3] for v in metrics.values()) / max(1, len(metrics))
            if metrics
            else 0.0
        )

        # In vcluster with zero metrics, show N/A for all row
        if self.is_vcluster and total_cores == 0.0 and avg_pct == 0.0:
            cores_str = "N/A"
            pct_str = "N/A"
            mem_str = "N/A"
            mem_pct_str = "N/A"
        else:
            cores_str = f"{total_cores:.2f}"
            pct_str = f"{avg_pct:.1f}"
            mem_str = f"{total_mem_mib:.0f}"
            mem_pct_str = f"{avg_mem_pct:.1f}"

        all_history = self.cpu_history.get("all", [])
        if all_history and len(all_history) > 1:
            try:
                all_spark = sparklines.sparklines(all_history, minimum=0, maximum=100)[
                    0
                ]
            except Exception:
                all_spark = "─"
        else:
            all_spark = "─"
        all_row_style = "reverse bold" if selected_node == "all" else None
        table.add_row(
            "all",
            "-",
            "-",
            cores_str,
            pct_str,
            mem_str,
            mem_pct_str,
            all_spark,
            style=all_row_style,
        )

        # Sort by node name for consistent ordering
        sorted_nodes = sorted(metrics.keys())

        for node_name in sorted_nodes:
            cpu_cores, cpu_pct, mem_mib, mem_pct = metrics[node_name]
            history = self.cpu_history.get(node_name, [])

            # In vcluster with zero metrics, show as unavailable
            if self.is_vcluster and cpu_cores == 0.0 and cpu_pct == 0.0:
                cpu_cores_str = "N/A"
                cpu_pct_str = "N/A"
                mem_mib_str = "N/A"
                mem_pct_str = "N/A"
                spark = "─"
            else:
                # Determine color based on CPU percentage
                if cpu_pct > 80:
                    color = "red"
                elif cpu_pct > 50:
                    color = "yellow"
                else:
                    color = "green"

                cpu_cores_str = f"{cpu_cores:.2f}"
                cpu_pct_str = f"[{color}]{cpu_pct:.1f}[/{color}]"
                mem_mib_str = f"{mem_mib:.0f}"
                mem_pct_str = f"{mem_pct:.1f}"

                # Create sparkline if we have history
                if history and len(history) > 1:
                    try:
                        spark = sparklines.sparklines(history, minimum=0, maximum=100)[
                            0
                        ]
                    except Exception:
                        spark = "─"
                else:
                    spark = "─"

            row_style = "reverse bold" if selected_node == node_name else None
            table.add_row(
                node_name,
                self.node_roles.get(node_name, ""),
                self.node_status.get(node_name, ""),
                cpu_cores_str,
                cpu_pct_str,
                mem_mib_str,
                mem_pct_str,
                spark,
                style=row_style,
            )

        return table

    def format_pods_table(
        self,
        rows: List[Tuple[str, float, str, str, str, str, float]],
        selected_node: str,
        hottest_node: str,
    ) -> Table:
        total_pods = len(rows)

        # Apply windowing when focused on pods
        if self.focused_panel == "pods" and total_pods > self.pod_window_size:
            # Ensure selected pod is visible in window
            if self.selected_pod_index < self.pod_scroll_offset:
                self.pod_scroll_offset = self.selected_pod_index
            elif (
                self.selected_pod_index >= self.pod_scroll_offset + self.pod_window_size
            ):
                self.pod_scroll_offset = (
                    self.selected_pod_index - self.pod_window_size + 1
                )

            # Window the rows
            visible_rows = rows[
                self.pod_scroll_offset : self.pod_scroll_offset + self.pod_window_size
            ]
            scroll_info = f" [{self.pod_scroll_offset + 1}-{min(self.pod_scroll_offset + self.pod_window_size, total_pods)} of {total_pods}]"
        else:
            visible_rows = rows
            scroll_info = ""

        # Count total running pods across all nodes
        total_running_pods = len(self.pod_metrics)

        title_filter = (
            f" • node: {selected_node}"
            if selected_node and selected_node != "all"
            else ""
        )

        # Text filter indicator
        text_filter_indicator = ""
        if self.pod_filter_text:
            text_filter_indicator = f" • search: '{self.pod_filter_text}'"
        elif self.show_filter_input:
            text_filter_indicator = " • search: _"

        frozen_indicator = " [PAUSED]" if self.focused_panel == "pods" else ""
        vcluster_indicator = (
            " [dim yellow](limited metrics)[/dim yellow]" if self.is_vcluster else ""
        )

        # Show filtered count vs total if filtered
        if selected_node and selected_node != "all":
            pod_counter = f" • {total_pods}/{total_running_pods} pods"
        else:
            pod_counter = f" • {total_running_pods} pods"

        table = Table(
            title=f"Top Pods by CPU (cores){title_filter}{text_filter_indicator}{pod_counter}{scroll_info}{frozen_indicator}{vcluster_indicator}",
            show_header=True,
            header_style="bold cyan",
            expand=True,
        )
        table.add_column("Namespace", style="cyan", no_wrap=True)
        table.add_column("Pod", style="cyan", no_wrap=True)
        table.add_column("CPU", justify="right", style="magenta", width=7)
        table.add_column("Memory", justify="right", style="green", width=9)
        table.add_column("Status", style="yellow", width=12)
        table.add_column("Restarts", justify="right", style="blue", width=8)
        table.add_column("Node", style="yellow", no_wrap=True)

        for index, (pod, cores, ns, node, status, last_restart, mem_mib) in enumerate(
            visible_rows
        ):
            # Calculate the actual index in the full list
            actual_index = index + (
                self.pod_scroll_offset
                if self.focused_panel == "pods" and total_pods > self.pod_window_size
                else 0
            )
            row_style = "red" if node == hottest_node else None
            if self.focused_panel == "pods" and actual_index == self.selected_pod_index:
                row_style = "reverse bold"

            # Color last restart based on recency
            restart_style = "dim"
            if last_restart != "never":
                if last_restart.endswith("s") or (
                    last_restart.endswith("m") and int(last_restart[:-1]) < 5
                ):
                    restart_style = "bold red"
                elif last_restart.endswith("m") or (
                    last_restart.endswith("h") and int(last_restart[:-1]) < 1
                ):
                    restart_style = "yellow"

            # Show N/A for unavailable metrics (vcluster)
            if self.is_vcluster and cores == 0.0 and mem_mib == 0.0:
                cpu_str = "N/A"
                mem_str = "N/A"
            else:
                cpu_str = f"{cores:.3f}"
                mem_str = f"{mem_mib:.0f}Mi"

            table.add_row(
                ns,
                pod,
                cpu_str,
                mem_str,
                status,
                f"[{restart_style}]{last_restart}[/]",
                node,
                style=row_style,
            )

        return table

    def _is_vcluster_pod(self, pod_name: str, namespace: str) -> bool:
        """Check if a pod is a vcluster pod by examining its labels."""
        try:
            result = subprocess.run(
                ["kubectl", "get", "pod", pod_name, "-n", namespace, "-o", "json"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                labels = data.get("metadata", {}).get("labels", {})
                # Check for common vcluster labels
                if (
                    labels.get("app") == "vcluster"
                    or labels.get("app.kubernetes.io/name") == "vcluster"
                    or "vcluster" in namespace.lower()
                ):
                    return True
        except Exception:
            pass
        return False

    def _get_vcluster_name(self, pod_name: str, namespace: str) -> str:
        """Extract the vcluster name from pod metadata."""
        try:
            result = subprocess.run(
                ["kubectl", "get", "pod", pod_name, "-n", namespace, "-o", "json"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                labels = data.get("metadata", {}).get("labels", {})

                # Try to get vcluster name from labels
                vcluster_name = (
                    labels.get("release")
                    or labels.get("app.kubernetes.io/instance")
                    or labels.get("vcluster.loft.sh/name")
                )

                if vcluster_name:
                    return vcluster_name

                # Fallback: try to extract from pod name (remove statefulset suffix like -0, -1, etc.)
                if pod_name.endswith(tuple(f"-{i}" for i in range(10))):
                    return pod_name.rsplit("-", 1)[0]

        except Exception:
            pass

        # Final fallback: use namespace name as vcluster name
        return namespace

    def create_pod_action_modal(self) -> Panel:
        """Create a modal dialog for pod actions."""
        from rich.console import Group

        pod_name, namespace, node = self.selected_pod_for_action

        # Check if this is a vcluster pod
        is_vcluster_pod = self._is_vcluster_pod(pod_name, namespace)

        # Create pod info text
        info_text = Text()
        info_text.append(f"Node: {node}\n", style="dim")
        if is_vcluster_pod:
            info_text.append("Type: vCluster\n", style="cyan")
        info_text.append("\n")

        # Build action options based on pod type
        actions = ["Describe", "Logs"]
        if is_vcluster_pod:
            actions.append("Connect to vCluster")
        actions.extend(["Delete", "Cancel"])

        # Store actions for navigation
        self.pod_action_options = actions

        # Create the action menu
        menu_table = Table(show_header=False, box=None, padding=(0, 0))
        menu_table.add_column("Action", style="bold")

        for index, action in enumerate(actions):
            if index == self.selected_action_index:
                menu_table.add_row(f"▶ {action}", style="reverse bold cyan")
            else:
                menu_table.add_row(f"  {action}")

        # Create panel with pod info and menu
        title = f"Pod Actions: {namespace}/{pod_name}"

        return Panel(
            Group(info_text, menu_table),
            title=title,
            border_style="bold yellow",
            padding=(1, 2),
        )

    def run(self, refresh_interval: float = 3.3):
        """Main loop - continuously update and display metrics."""
        self.console.clear()

        try:
            # Build a persistent layout once to reduce blinking
            layout = Layout()
            with Live(
                layout, refresh_per_second=1, screen=False, auto_refresh=False
            ) as live:
                self._enable_raw_mode()
                metrics = {}  # Initialize outside loop
                while True:
                    # Skip expensive metrics collection when in filter input mode for responsiveness
                    if not self.show_filter_input:
                        metrics = self.get_node_metrics()
                    # else: reuse previous metrics for fast filtering

                    # If no metrics and NOT vcluster, show error and continue
                    if not metrics and not self.is_vcluster:
                        error_msg = self.last_error or "Failed to fetch metrics"
                        live.update(
                            Panel(f"[red]{error_msg}[/red]", title="Error"),
                            refresh=True,
                        )
                        time.sleep(refresh_interval)
                        continue

                    # In vcluster with no metrics, create placeholder metrics to show nodes structure
                    if not metrics and self.is_vcluster:
                        # Try to get nodes from kubectl get nodes to show virtual nodes
                        try:
                            result = subprocess.run(
                                ["kubectl", "get", "nodes", "-o", "json"],
                                capture_output=True,
                                text=True,
                                timeout=10,
                            )
                            if result.returncode == 0:
                                data = json.loads(result.stdout)
                                metrics = {}
                                for item in data.get("items", []):
                                    node_name = item.get("metadata", {}).get("name", "")
                                    if node_name:
                                        # Use placeholder values (0.0 for unavailable metrics)
                                        metrics[node_name] = (0.0, 0.0, 0.0, 0.0)
                        except Exception:
                            pass

                    # If still no metrics, skip this cycle
                    if not metrics:
                        time.sleep(refresh_interval)
                        continue

                    self.update_history(metrics)

                    # Selection list
                    self.nodes_for_selection = ["all"] + sorted(metrics.keys())
                    if self.selected_node_index >= len(self.nodes_for_selection):
                        self.selected_node_index = max(
                            0, len(self.nodes_for_selection) - 1
                        )
                    selected_node = self.nodes_for_selection[self.selected_node_index]

                    # Dynamically size nodes panel based on number of nodes
                    num_nodes = len(metrics) + 1  # +1 for 'all' row
                    nodes_panel_height = self._estimate_panel_height_for_table(
                        num_nodes
                    )

                    # Update pod window size based on available terminal space
                    self.pod_window_size = self._calculate_pod_window_size(
                        nodes_panel_height
                    )

                    # Build or update structure
                    controls_panel_size = 4 if self.is_vcluster else 3
                    if not layout.children:
                        layout.split_column(
                            Layout(name="title", size=3),
                            Layout(name="nodes", size=nodes_panel_height),
                            Layout(name="controls", size=controls_panel_size),
                            Layout(name="pods"),
                        )
                    else:
                        layout["nodes"].size = nodes_panel_height
                        layout["controls"].size = controls_panel_size

                    # Title (static to reduce flicker)
                    if not layout["title"].renderable:
                        title_text = "Node CPU Monitor"
                        if self.is_vcluster:
                            title_text += " - vcluster mode"
                        title = Text(
                            title_text,
                            style="bold cyan",
                            justify="center",
                        )
                        layout["title"].update(Panel(title))
                    # Controls table (sorting) - only update if changed
                    controls_sig = (
                        self.selected_sort_index,
                        self.focused_panel,
                        self.show_filter_input,
                        self.pod_filter_text,
                        self.is_vcluster,
                    )
                    if controls_sig != self._last_controls_sig:
                        controls_table = Table(show_header=False, box=None)
                        controls_table.add_column("Sort", style="bold")
                        controls_table.add_column("Mode")
                        current_mode = self.sort_modes[self.selected_sort_index]
                        focus_hint = (
                            "Nodes" if self.focused_panel == "nodes" else "Pods"
                        )

                        # Show vcluster warning first if in vcluster mode
                        if self.is_vcluster:
                            controls_table.add_row(
                                "⚠ vCluster:",
                                "Metrics API not available • Press ESC to disconnect",
                                style="bold yellow",
                            )

                        # Show filter input if active
                        if self.show_filter_input:
                            filter_display = f"Search: {self.pod_filter_text}_"
                            controls_table.add_row(
                                "Filter:",
                                f"{filter_display} (Enter=keep, ESC=clear, Ctrl+U=clear)",
                                style="bold yellow",
                            )
                        elif self.pod_filter_text:
                            esc_hint = (
                                "ESC=disconnect"
                                if self.is_vcluster and focus_hint == "Nodes"
                                else "ESC"
                            )
                            controls_table.add_row(
                                "Sort:",
                                f"←/→ or h/l • {current_mode} • Focus: {focus_hint} (Enter/{esc_hint}) • Filter: '{self.pod_filter_text}' (/=edit)",
                            )
                        else:
                            esc_hint = (
                                "ESC=disconnect"
                                if self.is_vcluster and focus_hint == "Nodes"
                                else "ESC"
                            )
                            controls_table.add_row(
                                "Sort:",
                                f"←/→ or h/l • {current_mode} • Focus: {focus_hint} (Enter/{esc_hint}) • /=filter",
                            )
                        layout["controls"].update(Panel(controls_table, padding=(0, 2)))
                        self._last_controls_sig = controls_sig

                    # Nodes table - update only if signature changed
                    # refresh node metadata periodically (cheap)
                    self.get_node_metadata()
                    nodes_sig = (
                        selected_node,
                        tuple(
                            sorted(
                                (
                                    node,
                                    self.node_roles.get(node, ""),
                                    self.node_status.get(node, ""),
                                    round(vals[0], 2),
                                    round(vals[1], 1),
                                    int(vals[2]),
                                    round(vals[3], 1),
                                )
                                for node, vals in metrics.items()
                            )
                        ),
                        tuple(sorted(self.cpu_history.keys())),
                    )
                    if (
                        nodes_sig != self._last_nodes_sig
                        or selected_node != self._last_selected_node
                    ):
                        layout["nodes"].update(
                            Panel(
                                self.format_table(metrics, selected_node),
                                padding=(1, 2),
                            )
                        )
                        self._last_nodes_sig = nodes_sig

                    # Compute hottest node by Usage %
                    hottest_node = None
                    if metrics:
                        hottest_node = max(metrics.items(), key=lambda kv: kv[1][1])[0]

                    # Update pods metrics ONLY when not focused on pods (to keep list stable)
                    # Also skip when in filter input mode for responsiveness
                    if (
                        self.focused_panel != "pods"
                        and not self.show_pod_modal
                        and not self.show_filter_input
                    ):
                        self.pod_metrics = self.get_pod_metrics()

                    # Compute pods signature (filtered by selection and text search)
                    filtered = [
                        (p, round(c, 3), nsp, nd, st, lr, mem)
                        for (p, c, nsp, nd, st, lr, mem) in self.pod_metrics
                        if (selected_node == "all" or nd == selected_node)
                        and (
                            not self.pod_filter_text
                            or self.pod_filter_text.lower() in p.lower()
                            or self.pod_filter_text.lower() in nsp.lower()
                        )
                    ]
                    # Apply sorting based on selected mode
                    mode = self.sort_modes[self.selected_sort_index]
                    if mode == "CPU":
                        filtered.sort(key=lambda x: x[1], reverse=True)
                    elif mode == "Memory":
                        filtered.sort(key=lambda x: x[6], reverse=True)
                    elif mode == "Status":
                        filtered.sort(key=lambda x: (x[4], x[0]))
                    elif mode == "Namespace":
                        filtered.sort(key=lambda x: (x[2], -x[1]))
                    elif mode == "Restarts":
                        filtered.sort(
                            key=lambda x: self._parse_restart_to_seconds(x[5])
                        )

                    # Cache filtered/sorted result
                    self._cached_filtered_pods = filtered

                    pods_sig = (
                        selected_node,
                        self.selected_sort_index,
                        self.focused_panel,
                        self.selected_pod_index if self.focused_panel == "pods" else -1,
                        self.pod_scroll_offset if self.focused_panel == "pods" else -1,
                        self.pod_filter_text,
                        self.show_filter_input,
                        tuple(filtered[:200]),  # cap for signature size
                    )
                    if (
                        pods_sig != self._last_pods_sig
                        or selected_node != self._last_selected_node
                    ):
                        layout["pods"].update(
                            Panel(
                                self.format_pods_table(
                                    filtered, selected_node, hottest_node or ""
                                ),
                                padding=(1, 2),
                            )
                        )
                        self._last_pods_sig = pods_sig

                    # Only call live.update if something actually changed
                    needs_update = (
                        nodes_sig != self._last_nodes_sig
                        or pods_sig != self._last_pods_sig
                        or controls_sig != self._last_controls_sig
                        or selected_node != self._last_selected_node
                    )
                    # Force update periodically even if nothing changed (for sparklines, etc.)
                    if needs_update or self.update_count % 1 == 0:
                        live.update(layout, refresh=True)
                    self._last_selected_node = selected_node

                    self.update_count += 1

                    # Responsive key handling during sleep window
                    # Use shorter interval in filter mode for instant response
                    current_interval = (
                        0.05 if self.show_filter_input else refresh_interval
                    )
                    end_time = time.time() + current_interval
                    while time.time() < end_time:
                        key = self._read_key()
                        if key:
                            if key == "q" and not self.show_filter_input:
                                raise KeyboardInterrupt()
                            elif self.show_filter_input:
                                # Filter input mode - handle text input
                                filter_changed = False

                                if key == "ESC":
                                    # Exit filter input mode and clear the filter (fresh start)
                                    self.show_filter_input = False
                                    self.pod_filter_text = ""
                                    self.selected_pod_index = 0
                                    self.pod_scroll_offset = 0
                                    filter_changed = True
                                elif key == "ENTER":
                                    # Just exit input mode (filter stays applied)
                                    self.show_filter_input = False
                                    filter_changed = True
                                elif len(key) == 1 and key.isprintable():
                                    # Add character to filter (no blocking update)
                                    self.pod_filter_text += key
                                    self.selected_pod_index = 0
                                    self.pod_scroll_offset = 0
                                    filter_changed = True
                                elif key == "\x7f" or key == "\x08":  # Backspace
                                    # Remove last character (no blocking update)
                                    if self.pod_filter_text:
                                        self.pod_filter_text = self.pod_filter_text[:-1]
                                        self.selected_pod_index = 0
                                        self.pod_scroll_offset = 0
                                        filter_changed = True
                                elif key == "\x15":  # Ctrl+U - clear entire line
                                    # Clear filter text (no blocking update)
                                    self.pod_filter_text = ""
                                    self.selected_pod_index = 0
                                    self.pod_scroll_offset = 0
                                    filter_changed = True

                                # If filter changed, just break to let main loop handle refresh
                                if filter_changed:
                                    break
                            elif self.show_pod_modal:
                                # Modal is active - handle modal navigation
                                if key in ("UP", "k", "K"):
                                    self.selected_action_index = max(
                                        0, self.selected_action_index - 1
                                    )
                                    live.update(
                                        self.create_pod_action_modal(), refresh=True
                                    )
                                elif key in ("DOWN", "j", "J"):
                                    self.selected_action_index = min(
                                        len(self.pod_action_options) - 1,
                                        self.selected_action_index + 1,
                                    )
                                    live.update(
                                        self.create_pod_action_modal(), refresh=True
                                    )
                                elif key == "ENTER":
                                    # Execute the selected action
                                    action = self.pod_action_options[
                                        self.selected_action_index
                                    ]
                                    pod_name, namespace, node = (
                                        self.selected_pod_for_action
                                    )
                                    self.show_pod_modal = False

                                    if action == "Cancel":
                                        # Just close modal and go back to layout
                                        live.update(layout, refresh=True)
                                    elif action == "Describe":
                                        # Run kubectl describe pod
                                        self._disable_raw_mode()
                                        self.console.clear()
                                        self.console.print(
                                            f"[cyan]Describing pod {namespace}/{pod_name}...[/cyan]\n"
                                        )
                                        subprocess.run(
                                            [
                                                "kubectl",
                                                "describe",
                                                "pod",
                                                "-n",
                                                namespace,
                                                pod_name,
                                            ]
                                        )
                                        self.console.print(
                                            "\n[yellow]Press Enter to continue...[/yellow]"
                                        )
                                        input()
                                        self._enable_raw_mode()
                                        live.update(layout, refresh=True)
                                    elif action == "Logs":
                                        # Run kubectl logs with less, starting at the end
                                        self._disable_raw_mode()

                                        # Get all logs and use less -R (colors) with no tail limit
                                        # Press G in less to jump to end, or use --follow-name to tail
                                        cmd = f"kubectl logs -n {namespace} {pod_name} 2>&1"

                                        # Create temp file to enable +G to work properly
                                        result = os.system(
                                            f"{cmd} > /tmp/k8s-logs-{pod_name}.txt && less -R +G /tmp/k8s-logs-{pod_name}.txt; rm -f /tmp/k8s-logs-{pod_name}.txt"
                                        )

                                        # If that didn't work, try with --previous for completed pods
                                        if result != 0:
                                            cmd_prev = f"kubectl logs -n {namespace} {pod_name} --previous 2>&1"
                                            os.system(
                                                f"{cmd_prev} > /tmp/k8s-logs-{pod_name}.txt && less -R +G /tmp/k8s-logs-{pod_name}.txt; rm -f /tmp/k8s-logs-{pod_name}.txt || echo 'No logs available' | less -R"
                                            )

                                        self._enable_raw_mode()
                                        live.update(layout, refresh=True)
                                    elif action == "Delete":
                                        # Confirm and delete
                                        self._disable_raw_mode()
                                        os.system("clear")
                                        print(
                                            f"\033[1;31m⚠ WARNING: Delete pod {namespace}/{pod_name}?\033[0m\n"
                                        )
                                        print(
                                            "\033[33mType 'yes' to confirm:\033[0m ",
                                            end="",
                                        )
                                        sys.stdout.flush()
                                        confirm = input()
                                        if confirm.lower() == "yes":
                                            print("\nDeleting pod...")
                                            # Use os.system so output is visible
                                            result = os.system(
                                                f"kubectl delete pod -n {namespace} {pod_name}"
                                            )
                                            if result == 0:
                                                print("✓ Pod deleted successfully")
                                            else:
                                                print(
                                                    f"✗ Error: kubectl returned exit code {result}"
                                                )
                                        else:
                                            print("Cancelled")

                                        print("\nPress Enter to continue...")
                                        input()
                                        self._enable_raw_mode()
                                        live.update(layout, refresh=True)
                                    elif action == "Connect to vCluster":
                                        # Connect to the vcluster
                                        # Extract vcluster name from pod metadata
                                        vcluster_name = self._get_vcluster_name(
                                            pod_name, namespace
                                        )

                                        # Show connection message
                                        temp_panel = Panel(
                                            f"[cyan]Connecting to vcluster '{vcluster_name}' in namespace '{namespace}'...[/cyan]",
                                            title="vCluster",
                                            border_style="cyan",
                                        )
                                        live.update(temp_panel, refresh=True)

                                        result = subprocess.run(
                                            [
                                                "vcluster",
                                                "connect",
                                                vcluster_name,
                                                "-n",
                                                namespace,
                                            ],
                                            capture_output=True,
                                            text=True,
                                        )

                                        if result.returncode == 0:
                                            # Update vcluster state
                                            self.is_vcluster = True

                                            # Clear history and cached data
                                            self.cpu_history.clear()
                                            self.timestamp_history.clear()
                                            self.pod_metrics.clear()
                                            self.node_status.clear()
                                            self.node_roles.clear()
                                            self._last_nodes_sig = None
                                            self._last_pods_sig = None
                                            self._last_controls_sig = None

                                            # Clear ALL filter-related state and selection
                                            self.pod_filter_text = ""
                                            self.show_filter_input = False
                                            self.selected_node_index = (
                                                0  # Reset to "all"
                                            )
                                            self.selected_pod_index = 0
                                            self.pod_scroll_offset = 0
                                            self.show_pod_modal = False
                                            self.selected_action_index = 0
                                            self.focused_panel = (
                                                "nodes"  # Return to nodes view
                                            )

                                            # Show success message briefly
                                            live.update(
                                                Panel(
                                                    f"[green]✓ Connected to vcluster '{vcluster_name}'[/green]\n[cyan]Loading vcluster data...[/cyan]",
                                                    title="vCluster",
                                                    border_style="green",
                                                ),
                                                refresh=True,
                                            )
                                            time.sleep(1)

                                            # Reset layout to force rebuild
                                            layout = Layout()
                                            # Break out of key handling loop to reload metrics
                                            break
                                        else:
                                            # Connection failed
                                            self._disable_raw_mode()
                                            self.console.clear()
                                            self.console.print(
                                                f"[red]✗ Failed to connect to vcluster[/red]\n"
                                            )
                                            self.console.print(
                                                f"[yellow]{result.stderr}[/yellow]"
                                            )
                                            self.console.print(
                                                "\n[yellow]Press Enter to continue...[/yellow]"
                                            )
                                            input()
                                            self._enable_raw_mode()
                                            live.update(layout, refresh=True)
                                elif key == "ESC":
                                    # Close modal
                                    self.show_pod_modal = False
                                    live.update(layout, refresh=True)
                            elif key in ("UP", "DOWN"):
                                if self.focused_panel == "nodes":
                                    if key == "UP":
                                        self.selected_node_index = max(
                                            0, self.selected_node_index - 1
                                        )
                                    else:
                                        self.selected_node_index = min(
                                            len(self.nodes_for_selection) - 1,
                                            self.selected_node_index + 1,
                                        )
                                    selected_node = self.nodes_for_selection[
                                        self.selected_node_index
                                    ]
                                    # Update node table IMMEDIATELY for instant feedback
                                    layout["nodes"].update(
                                        Panel(
                                            self.format_table(metrics, selected_node),
                                            padding=(1, 2),
                                        )
                                    )
                                    # Refresh screen NOW - don't wait for pod table
                                    live.update(layout, refresh=True)

                                    # THEN update pods (user already sees node selection change)
                                    filtered = [
                                        (p, round(c, 3), nsp, nd, st, lr, mem)
                                        for (
                                            p,
                                            c,
                                            nsp,
                                            nd,
                                            st,
                                            lr,
                                            mem,
                                        ) in self.pod_metrics
                                        if (
                                            selected_node == "all"
                                            or nd == selected_node
                                        )
                                    ]
                                    mode = self.sort_modes[self.selected_sort_index]
                                    if mode == "CPU":
                                        filtered.sort(key=lambda x: x[1], reverse=True)
                                    elif mode == "Memory":
                                        filtered.sort(key=lambda x: x[6], reverse=True)
                                    elif mode == "Status":
                                        filtered.sort(key=lambda x: (x[4], x[0]))
                                    elif mode == "Namespace":
                                        filtered.sort(key=lambda x: (x[2], -x[1]))
                                    elif mode == "Restarts":
                                        filtered.sort(
                                            key=lambda x: self._parse_restart_to_seconds(
                                                x[5]
                                            )
                                        )
                                    layout["pods"].update(
                                        Panel(
                                            self.format_pods_table(
                                                filtered,
                                                selected_node,
                                                hottest_node or "",
                                            ),
                                            padding=(1, 2),
                                        )
                                    )
                                    # Second refresh with updated pods
                                    live.update(layout, refresh=True)
                                else:  # focused on pods
                                    # Navigate within filtered pods list (apply text filter!)
                                    filtered = [
                                        (p, round(c, 3), nsp, nd, st, lr, mem)
                                        for (
                                            p,
                                            c,
                                            nsp,
                                            nd,
                                            st,
                                            lr,
                                            mem,
                                        ) in self.pod_metrics
                                        if (
                                            selected_node == "all"
                                            or nd == selected_node
                                        )
                                        and (
                                            not self.pod_filter_text
                                            or self.pod_filter_text.lower() in p.lower()
                                            or self.pod_filter_text.lower()
                                            in nsp.lower()
                                        )
                                    ]
                                    mode = self.sort_modes[self.selected_sort_index]
                                    if mode == "CPU":
                                        filtered.sort(key=lambda x: x[1], reverse=True)
                                    elif mode == "Memory":
                                        filtered.sort(key=lambda x: x[6], reverse=True)
                                    elif mode == "Status":
                                        filtered.sort(key=lambda x: (x[4], x[0]))
                                    elif mode == "Namespace":
                                        filtered.sort(key=lambda x: (x[2], -x[1]))
                                    elif mode == "Restarts":
                                        filtered.sort(
                                            key=lambda x: self._parse_restart_to_seconds(
                                                x[5]
                                            )
                                        )
                                    if len(filtered) == 0:
                                        pass  # no pods to navigate
                                    elif key == "UP":
                                        self.selected_pod_index = max(
                                            0, self.selected_pod_index - 1
                                        )
                                    else:
                                        self.selected_pod_index = min(
                                            len(filtered) - 1,
                                            self.selected_pod_index + 1,
                                        )
                                    # Update pods table to show highlight
                                    if len(filtered) > 0:
                                        layout["pods"].update(
                                            Panel(
                                                self.format_pods_table(
                                                    filtered,
                                                    selected_node,
                                                    hottest_node or "",
                                                ),
                                                padding=(1, 2),
                                            )
                                        )
                                    live.update(layout, refresh=True)
                            elif key in ("LEFT", "RIGHT"):
                                if key == "LEFT":
                                    self.selected_sort_index = (
                                        self.selected_sort_index - 1
                                    ) % len(self.sort_modes)
                                else:
                                    self.selected_sort_index = (
                                        self.selected_sort_index + 1
                                    ) % len(self.sort_modes)
                                # Update controls and pods immediately
                                controls_table = Table(show_header=False, box=None)
                                controls_table.add_column("Sort", style="bold")
                                controls_table.add_column("Mode")
                                current_mode = self.sort_modes[self.selected_sort_index]
                                controls_table.add_row(
                                    "Sort:",
                                    f"←/→ or h/l • {current_mode} • Focus: {'Nodes' if self.focused_panel == 'nodes' else 'Pods'} (Enter/Esc)",
                                )
                                layout["controls"].update(
                                    Panel(controls_table, padding=(0, 2))
                                )
                                # Recompute filtered/sorted and update pods (apply text filter!)
                                filtered = [
                                    (p, round(c, 3), nsp, nd, st, lr, mem)
                                    for (p, c, nsp, nd, st, lr, mem) in self.pod_metrics
                                    if (selected_node == "all" or nd == selected_node)
                                    and (
                                        not self.pod_filter_text
                                        or self.pod_filter_text.lower() in p.lower()
                                        or self.pod_filter_text.lower() in nsp.lower()
                                    )
                                ]
                                mode = self.sort_modes[self.selected_sort_index]
                                if mode == "CPU":
                                    filtered.sort(key=lambda x: x[1], reverse=True)
                                elif mode == "Memory":
                                    filtered.sort(key=lambda x: x[6], reverse=True)
                                elif mode == "Status":
                                    filtered.sort(key=lambda x: (x[4], x[0]))
                                elif mode == "Namespace":
                                    filtered.sort(key=lambda x: (x[2], -x[1]))
                                elif mode == "Restarts":
                                    filtered.sort(
                                        key=lambda x: self._parse_restart_to_seconds(
                                            x[5]
                                        )
                                    )
                                layout["pods"].update(
                                    Panel(
                                        self.format_pods_table(
                                            filtered, selected_node, hottest_node or ""
                                        ),
                                        padding=(1, 2),
                                    )
                                )
                                live.update(layout, refresh=True)
                            elif key == "ENTER":
                                if self.focused_panel == "nodes":
                                    # Switch focus from nodes to pods (apply text filter!)
                                    self.focused_panel = "pods"
                                    filtered = [
                                        (p, round(c, 3), nsp, nd, st, lr, mem)
                                        for (
                                            p,
                                            c,
                                            nsp,
                                            nd,
                                            st,
                                            lr,
                                            mem,
                                        ) in self.pod_metrics
                                        if (
                                            selected_node == "all"
                                            or nd == selected_node
                                        )
                                        and (
                                            not self.pod_filter_text
                                            or self.pod_filter_text.lower() in p.lower()
                                            or self.pod_filter_text.lower()
                                            in nsp.lower()
                                        )
                                    ]
                                    if len(filtered) > 0:
                                        self.selected_pod_index = min(
                                            self.selected_pod_index, len(filtered) - 1
                                        )
                                    else:
                                        self.selected_pod_index = 0
                                    controls_table = Table(show_header=False, box=None)
                                    controls_table.add_column("Sort", style="bold")
                                    controls_table.add_column("Mode")
                                    current_mode = self.sort_modes[
                                        self.selected_sort_index
                                    ]
                                    controls_table.add_row(
                                        "Sort:",
                                        f"←/→ or h/l • {current_mode} • Focus: Pods (Enter/Esc)",
                                    )
                                    layout["controls"].update(
                                        Panel(controls_table, padding=(0, 2))
                                    )
                                    mode = self.sort_modes[self.selected_sort_index]
                                    if mode == "CPU":
                                        filtered.sort(key=lambda x: x[1], reverse=True)
                                    elif mode == "Memory":
                                        filtered.sort(key=lambda x: x[6], reverse=True)
                                    elif mode == "Status":
                                        filtered.sort(key=lambda x: (x[4], x[0]))
                                    elif mode == "Namespace":
                                        filtered.sort(key=lambda x: (x[2], -x[1]))
                                    elif mode == "Restarts":
                                        filtered.sort(
                                            key=lambda x: self._parse_restart_to_seconds(
                                                x[5]
                                            )
                                        )
                                    layout["pods"].update(
                                        Panel(
                                            self.format_pods_table(
                                                filtered,
                                                selected_node,
                                                hottest_node or "",
                                            ),
                                            padding=(1, 2),
                                        )
                                    )
                                    live.update(layout, refresh=True)
                                else:
                                    # Already focused on pods - show action modal (apply text filter!)
                                    filtered = [
                                        (p, round(c, 3), nsp, nd, st, lr, mem)
                                        for (
                                            p,
                                            c,
                                            nsp,
                                            nd,
                                            st,
                                            lr,
                                            mem,
                                        ) in self.pod_metrics
                                        if (
                                            selected_node == "all"
                                            or nd == selected_node
                                        )
                                        and (
                                            not self.pod_filter_text
                                            or self.pod_filter_text.lower() in p.lower()
                                            or self.pod_filter_text.lower()
                                            in nsp.lower()
                                        )
                                    ]
                                    mode = self.sort_modes[self.selected_sort_index]
                                    if mode == "CPU":
                                        filtered.sort(key=lambda x: x[1], reverse=True)
                                    elif mode == "Memory":
                                        filtered.sort(key=lambda x: x[6], reverse=True)
                                    elif mode == "Status":
                                        filtered.sort(key=lambda x: (x[4], x[0]))
                                    elif mode == "Namespace":
                                        filtered.sort(key=lambda x: (x[2], -x[1]))
                                    elif mode == "Restarts":
                                        filtered.sort(
                                            key=lambda x: self._parse_restart_to_seconds(
                                                x[5]
                                            )
                                        )

                                    if len(filtered) > 0:
                                        pod_name, _, namespace, node, _, _, _ = (
                                            filtered[self.selected_pod_index]
                                        )
                                        self.selected_pod_for_action = (
                                            pod_name,
                                            namespace,
                                            node,
                                        )
                                        self.show_pod_modal = True
                                        self.selected_action_index = 0
                                        # Overlay modal on top of layout
                                        live.update(
                                            self.create_pod_action_modal(), refresh=True
                                        )
                            elif key == "/":
                                # Activate filter input mode (keep existing text for editing)
                                self.show_filter_input = True
                                break  # Let main loop handle refresh asynchronously
                            elif key == "ESC":
                                # If already in nodes focus and in vcluster, disconnect
                                if self.focused_panel == "nodes" and self.is_vcluster:
                                    # Show temporary message
                                    temp_panel = Panel(
                                        "[cyan]Disconnecting from vcluster...[/cyan]",
                                        title="vCluster",
                                        border_style="cyan",
                                    )
                                    live.update(temp_panel, refresh=True)

                                    result = subprocess.run(
                                        ["vcluster", "disconnect"],
                                        capture_output=True,
                                        text=True,
                                    )

                                    # Update vcluster state
                                    self.is_vcluster = False

                                    # Clear history and cached data
                                    self.cpu_history.clear()
                                    self.timestamp_history.clear()
                                    self.pod_metrics.clear()
                                    self.node_status.clear()
                                    self.node_roles.clear()
                                    self._last_nodes_sig = None
                                    self._last_pods_sig = None
                                    self._last_controls_sig = None

                                    # Clear ALL filter-related state and selection
                                    self.pod_filter_text = ""
                                    self.show_filter_input = False
                                    self.selected_node_index = 0  # Reset to "all"
                                    self.selected_pod_index = 0
                                    self.pod_scroll_offset = 0
                                    self.show_pod_modal = False
                                    self.selected_action_index = 0
                                    self.focused_panel = "nodes"  # Return to nodes view

                                    # Show success message briefly
                                    success_text = "[green]✓ Disconnected from vcluster[/green]\n[cyan]Reconnecting to host cluster...[/cyan]"
                                    if result.returncode != 0 and result.stderr:
                                        success_text = f"[yellow]{result.stderr.strip()}[/yellow]\n[cyan]Switching to host cluster...[/cyan]"

                                    live.update(
                                        Panel(
                                            success_text,
                                            title="vCluster",
                                            border_style="green",
                                        ),
                                        refresh=True,
                                    )
                                    time.sleep(1)

                                    # Reset layout to force rebuild
                                    layout = Layout()
                                    # Break out of key handling loop to reload metrics
                                    break
                                else:
                                    # Normal ESC behavior - return to nodes focus
                                    self.focused_panel = "nodes"
                                    controls_table = Table(show_header=False, box=None)
                                    controls_table.add_column("Sort", style="bold")
                                    controls_table.add_column("Mode")
                                    current_mode = self.sort_modes[
                                        self.selected_sort_index
                                    ]
                                    controls_table.add_row(
                                        "Sort:",
                                        f"←/→ or h/l • {current_mode} • Focus: Nodes (Enter/Esc)",
                                    )
                                    layout["controls"].update(
                                        Panel(controls_table, padding=(0, 2))
                                    )
                                    live.update(layout, refresh=True)
                        # Small sleep to avoid busy loop
                        else:
                            time.sleep(0.01)

        except KeyboardInterrupt:
            self.console.print("\n[yellow]Exiting...[/yellow]")
            sys.exit(0)
        finally:
            self._disable_raw_mode()


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Watch Kubernetes node CPU usage with line graphs"
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=3.3,
        help="Refresh interval in seconds (default: 3.3)",
    )
    parser.add_argument(
        "--history",
        type=int,
        default=60,
        help="Number of historical data points to keep (default: 60)",
    )

    args = parser.parse_args()

    watcher = NodeCPUWatcher(history_points=args.history)
    watcher.run(refresh_interval=args.interval)


if __name__ == "__main__":
    main()

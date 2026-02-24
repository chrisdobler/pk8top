import importlib.util
import math
import pathlib
from types import SimpleNamespace

import pytest


PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "watch-node-cpu.py"


spec = importlib.util.spec_from_file_location("watch_node_cpu", MODULE_PATH)
watch_node_cpu = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(watch_node_cpu)  # type: ignore[arg-type]

NodeCPUWatcher = watch_node_cpu.NodeCPUWatcher


class DummyCompleted:
    def __init__(self, returncode: int = 0, stdout: str = "", stderr: str = ""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def watcher(monkeypatch) -> NodeCPUWatcher:
    """Default watcher with vcluster detection disabled so tests don't shell out."""

    monkeypatch.setattr(
        NodeCPUWatcher, "_detect_vcluster", lambda self: False, raising=False
    )
    return NodeCPUWatcher()


def test_parse_memory_value_to_mib_units(watcher: NodeCPUWatcher) -> None:
    parse = watcher._parse_memory_value_to_mib

    assert parse("1024Mi") == pytest.approx(1024.0)
    assert parse("1Gi") == pytest.approx(1024.0)
    assert parse("1Ti") == pytest.approx(1024.0 * 1024.0)
    assert parse("1024Ki") == pytest.approx(1.0)
    # Fallback / invalid
    assert parse("bad") == 0.0


def test_parse_restart_to_seconds(watcher: NodeCPUWatcher) -> None:
    parse = watcher._parse_restart_to_seconds

    assert math.isinf(parse("never"))
    assert math.isinf(parse("?"))
    assert parse("10s") == pytest.approx(10.0)
    assert parse("5m") == pytest.approx(5 * 60.0)
    assert parse("2h") == pytest.approx(2 * 3600.0)
    assert parse("3d") == pytest.approx(3 * 86400.0)
    # Invalid falls back to infinity
    assert math.isinf(parse("not-a-time"))


def test_create_cpu_bar_colors_and_width(watcher: NodeCPUWatcher) -> None:
    bar_low = watcher._create_cpu_bar(10.0, width=20)
    bar_mid = watcher._create_cpu_bar(60.0, width=20)
    bar_high = watcher._create_cpu_bar(90.0, width=20)

    assert "[green]" in bar_low
    assert "[yellow]" in bar_mid
    assert "[red]" in bar_high

    # Bar content (between color tags) should have the requested width
    def inner_length(markup: str) -> int:
        inner = markup.split("]", 1)[1].rsplit("[", 1)[0]
        return len(inner)

    assert inner_length(bar_low) == 20
    assert inner_length(bar_mid) == 20
    assert inner_length(bar_high) == 20


def test_detect_vcluster_true(monkeypatch) -> None:
    def fake_run(args, capture_output, text, timeout):
        assert args == ["kubectl", "config", "current-context"]
        return DummyCompleted(returncode=0, stdout="my-vcluster-context\n")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    watcher = NodeCPUWatcher()
    assert watcher.is_vcluster is True


def test_detect_vcluster_false(monkeypatch) -> None:
    def fake_run(args, capture_output, text, timeout):
        return DummyCompleted(returncode=0, stdout="prod-cluster\n")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    watcher = NodeCPUWatcher()
    assert watcher.is_vcluster is False


def test_get_node_metrics_parses_normal(monkeypatch, watcher: NodeCPUWatcher) -> None:
    stdout = "\n".join(
        [
            "node1 1000m 50% 1024Mi 25%",
            "node2 2 75% 2Gi 50%",
            "node3 500000000n 10% 512Mi 5%",
        ]
    )

    def fake_run(args, capture_output, text, timeout):
        assert args[:3] == ["kubectl", "top", "nodes"]
        return DummyCompleted(returncode=0, stdout=stdout)

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    metrics = watcher.get_node_metrics()

    assert set(metrics.keys()) == {"node1", "node2", "node3"}
    assert metrics["node1"] == pytest.approx((1.0, 50.0, 1024.0, 25.0))
    assert metrics["node2"] == pytest.approx((2.0, 75.0, 2048.0, 50.0))
    assert metrics["node3"] == pytest.approx((0.5, 10.0, 512.0, 5.0))


def test_get_node_metrics_handles_errors(monkeypatch, watcher: NodeCPUWatcher) -> None:
    def fake_run_error(args, capture_output, text, timeout):
        return DummyCompleted(returncode=1, stdout="", stderr="boom")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run_error)
    metrics = watcher.get_node_metrics()
    assert metrics == {}
    assert "boom" in watcher.last_error


def test_get_node_metrics_no_resources(monkeypatch, watcher: NodeCPUWatcher) -> None:
    def fake_run(args, capture_output, text, timeout):
        return DummyCompleted(returncode=0, stdout="No resources found")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)
    metrics = watcher.get_node_metrics()
    assert metrics == {}
    assert "No resources found" in watcher.last_error


def test_get_node_metrics_timeout(monkeypatch, watcher: NodeCPUWatcher) -> None:
    def fake_run(*_args, **_kwargs):
        raise watch_node_cpu.subprocess.TimeoutExpired(cmd="kubectl", timeout=10)

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)
    metrics = watcher.get_node_metrics()
    assert metrics == {}
    assert "timed out" in watcher.last_error


def test_get_node_metadata_populates_status_and_roles(monkeypatch, watcher: NodeCPUWatcher) -> None:
    nodes_json = {
        "items": [
            {
                "metadata": {
                    "name": "node1",
                    "labels": {
                        "node-role.kubernetes.io/control-plane": "",
                        "foo": "bar",
                    },
                },
                "status": {
                    "conditions": [
                        {"type": "Ready", "status": "True"},
                    ]
                },
            },
            {
                "metadata": {
                    "name": "node2",
                    "labels": {
                        "kubernetes.io/role": "worker",
                    },
                },
                "status": {
                    "conditions": [
                        {"type": "Ready", "status": "False"},
                    ]
                },
            },
        ]
    }

    def fake_run(args, capture_output, text, timeout):
        assert args[:3] == ["kubectl", "get", "nodes"]
        return DummyCompleted(returncode=0, stdout=watch_node_cpu.json.dumps(nodes_json))

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    watcher.get_node_metadata()

    assert watcher.node_status["node1"] == "Ready"
    assert watcher.node_status["node2"] == "NotReady"
    assert watcher.node_roles["node1"] == "control-plane"
    assert watcher.node_roles["node2"] == "worker"


def test_get_pod_metrics_with_and_without_top(monkeypatch, watcher: NodeCPUWatcher) -> None:
    pods_top_stdout = "\n".join(
        [
            "ns1 pod-a 100m 512Mi",
            "ns2 pod-b 200m 256Mi",
        ]
    )

    pods_json = {
        "items": [
            {
                "metadata": {"namespace": "ns1", "name": "pod-a"},
                "spec": {"nodeName": "node1"},
                "status": {
                    "phase": "Running",
                    "containerStatuses": [],
                },
            },
            {
                "metadata": {"namespace": "ns2", "name": "pod-b"},
                "spec": {"nodeName": "node2"},
                "status": {
                    "phase": "Pending",
                    "containerStatuses": [],
                },
            },
        ]
    }

    def fake_run(args, capture_output, text, timeout):
        if args[:3] == ["kubectl", "top", "pods"]:
            return DummyCompleted(returncode=0, stdout=pods_top_stdout)
        if args[:3] == ["kubectl", "get", "pods"]:
            return DummyCompleted(
                returncode=0, stdout=watch_node_cpu.json.dumps(pods_json)
            )
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    result = watcher.get_pod_metrics()
    # Sorted by CPU desc, so pod-b should be first
    assert len(result) == 2
    assert result[0][0] == "pod-b"
    assert result[0][1] == pytest.approx(0.2)  # cores
    assert result[1][0] == "pod-a"
    assert result[1][1] == pytest.approx(0.1)


def test_get_pod_metrics_handles_missing_top(monkeypatch, watcher: NodeCPUWatcher) -> None:
    pods_json = {
        "items": [
            {
                "metadata": {"namespace": "ns1", "name": "pod-a"},
                "spec": {"nodeName": "node1"},
                "status": {"phase": "Running", "containerStatuses": []},
            }
        ]
    }

    def fake_run(args, capture_output, text, timeout):
        if args[:3] == ["kubectl", "top", "pods"]:
            return DummyCompleted(returncode=1, stdout="", stderr="metrics-server down")
        if args[:3] == ["kubectl", "get", "pods"]:
            return DummyCompleted(
                returncode=0, stdout=watch_node_cpu.json.dumps(pods_json)
            )
        raise AssertionError(f"Unexpected args: {args}")

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    result = watcher.get_pod_metrics()
    assert len(result) == 1
    pod_name, cores, ns, node, status, last_restart, mem_mib = result[0]
    assert pod_name == "pod-a"
    assert cores == 0.0
    assert mem_mib == 0.0
    assert status == "Running"
    assert last_restart in ("never", "?")


def test_update_history_tracks_nodes_and_all(watcher: NodeCPUWatcher) -> None:
    metrics1 = {
        "node1": (1.0, 50.0, 100.0, 10.0),
        "node2": (2.0, 75.0, 200.0, 20.0),
    }
    watcher.update_history(metrics1)

    assert watcher.timestamp_history
    assert watcher.cpu_history["all"] == pytest.approx(
        [(50.0 + 75.0) / 2.0]
    )
    assert watcher.cpu_history["node1"] == [50.0]
    assert watcher.cpu_history["node2"] == [75.0]

    # Second update drops node2
    metrics2 = {
        "node1": (1.0, 10.0, 50.0, 5.0),
    }
    watcher.update_history(metrics2)

    assert "node2" not in watcher.cpu_history
    assert watcher.cpu_history["node1"] == [50.0, 10.0]


def test_format_table_builds_rows(watcher: NodeCPUWatcher) -> None:
    watcher.node_roles["node1"] = "worker"
    watcher.node_status["node1"] = "Ready"

    metrics = {
        "node1": (1.0, 50.0, 100.0, 10.0),
    }

    table = watcher.format_table(metrics, selected_node="all")
    # 1 aggregate row + 1 node row
    assert table.row_count == 2


def test_calculate_pod_window_size_uses_console_height(watcher: NodeCPUWatcher) -> None:
    # Patch console.size.height while preserving expected (width, height) behavior
    original_size = watcher.console.size

    class FakeSize(SimpleNamespace):
        @property
        def height(self):  # type: ignore[override]
            return 80

        def __iter__(self):
            # rich.Console expects size to unpack as (width, height)
            return iter((original_size[0], self.height))

    watcher.console.size = FakeSize()

    size = watcher._calculate_pod_window_size(nodes_panel_height=10)

    # Restore original size to avoid side effects if other tests ever touch it
    watcher.console.size = original_size
    # Should be at least 5 and less than terminal height
    assert size >= 5
    assert size <= 100


def test_format_pods_table_windowing(watcher: NodeCPUWatcher) -> None:
    watcher.focused_panel = "pods"
    watcher.pod_window_size = 2
    watcher.pod_metrics = [
        ("pod-1", 0.1, "ns", "node", "Running", "never", 10.0),
        ("pod-2", 0.2, "ns", "node", "Running", "never", 20.0),
        ("pod-3", 0.3, "ns", "node", "Running", "never", 30.0),
    ]

    rows = watcher.pod_metrics.copy()
    table = watcher.format_pods_table(rows, selected_node="all", hottest_node="node")
    # Only window_size rows should be visible
    assert table.row_count == 2


def test_is_vcluster_pod_and_get_vcluster_name(monkeypatch, watcher: NodeCPUWatcher) -> None:
    pod_json = {
        "metadata": {
            "labels": {
                "app.kubernetes.io/name": "vcluster",
                "app.kubernetes.io/instance": "my-vcluster",
            }
        }
    }

    def fake_run(args, capture_output, text, timeout):
        assert args[:3] == ["kubectl", "get", "pod"]
        return DummyCompleted(returncode=0, stdout=watch_node_cpu.json.dumps(pod_json))

    monkeypatch.setattr(watch_node_cpu.subprocess, "run", fake_run)

    assert watcher._is_vcluster_pod("pod-0", "ns") is True
    assert watcher._get_vcluster_name("pod-0", "ns") == "my-vcluster"


def test_create_pod_action_modal_builds_actions(monkeypatch, watcher: NodeCPUWatcher) -> None:
    watcher.selected_pod_for_action = ("pod-0", "ns", "node-1")

    # Pretend this is a vcluster pod so we get the extra action
    monkeypatch.setattr(
        watcher, "_is_vcluster_pod", lambda pod, ns: True, raising=False
    )

    panel = watcher.create_pod_action_modal()
    assert panel is not None
    assert "Connect to vCluster" in watcher.pod_action_options


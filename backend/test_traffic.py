"""
Automated Test Suite for Module 2: Smart Traffic Signal Preemption
LifeLine AI — InnoHacks 2.0
"""

import pytest
from fastapi.testclient import TestClient
from database import init_db
from main import app
from traffic_preemption import (
    simulation_engine,
    STATE_NORMAL,
    STATE_CLEARANCE_YELLOW,
    STATE_ALL_RED_HOLD,
    STATE_PREEMPTION_GREEN,
    STATE_RESTORATION_YELLOW,
    STATE_RESTORATION_ALL_RED,
    IntersectionSignalController,
    GREEN,
    RED,
    YELLOW
)

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def setup_module_db():
    init_db()


@pytest.fixture(autouse=True)
def reset_engine():
    simulation_engine.reset_simulation("svims_critical")
    yield
    simulation_engine.reset_simulation("svims_critical")


def test_traffic_state_endpoint():
    """Verify /api/traffic/state returns full simulation topology and metrics."""
    response = client.get("/api/traffic/state")
    assert response.status_code == 200
    data = response.json()
    assert "intersections" in data
    assert "ambulances" in data
    assert "metrics" in data
    assert len(data["intersections"]) >= 6
    assert any(i["intersection_id"] == "INT-101" for i in data["intersections"])


def test_intersections_list_and_detail():
    """Verify intersections list and individual controller details."""
    response = client.get("/api/traffic/intersections")
    assert response.status_code == 200
    intersections = response.json()
    assert len(intersections) == 6

    # Test single intersection retrieval
    int_id = intersections[0]["intersection_id"]
    res_single = client.get(f"/api/traffic/intersections/{int_id}")
    assert res_single.status_code == 200
    data_single = res_single.json()
    assert data_single["intersection_id"] == int_id
    assert "signals" in data_single
    assert "N" in data_single["signals"]
    assert "E" in data_single["signals"]


def test_safety_invariant_no_conflicting_greens():
    """
    CRITICAL SAFETY TEST:
    Verify that under NO circumstances can opposing directions (NS vs EW) both have GREEN signals.
    """
    for ctrl in simulation_engine.intersections.values():
        colors = ctrl.get_signal_colors()
        # If N or S is GREEN, E and W MUST NOT be GREEN
        if colors["N"] == GREEN or colors["S"] == GREEN:
            assert colors["E"] != GREEN
            assert colors["W"] != GREEN
        if colors["E"] == GREEN or colors["W"] == GREEN:
            assert colors["N"] != GREEN
            assert colors["S"] != GREEN


def test_preemption_safe_clearance_lifecycle():
    """
    Verify full clearance transition cycle:
    1. Normal cycle -> Clearance Yellow (3s)
    2. Clearance Yellow -> All-Red Hold (2s)
    3. All-Red Hold -> Preemption Green
    4. Ambulance passes -> Restoration Yellow (3s) -> Restoration All-Red (2s) -> Normal
    """
    ctrl = simulation_engine.intersections["INT-102"]
    # Ensure starting in NS normal phase
    ctrl.state = STATE_NORMAL
    ctrl.normal_phase = "NS"

    # 1. Request preemption on EW axis (conflicting with active NS)
    res = ctrl.request_preemption(
        ambulance_code="AMB-101",
        emergency_id=1,
        severity="critical",
        direction="EW",
        distance_meters=350.0,
        eta_seconds=22.0
    )
    assert res["accepted"] is True
    assert ctrl.state == STATE_CLEARANCE_YELLOW
    colors = ctrl.get_signal_colors()
    assert colors["N"] == YELLOW
    assert colors["E"] == RED  # Opposing is RED during clearance!

    # 2. Advance through yellow duration (3s)
    ctrl.tick(3)
    assert ctrl.state == STATE_ALL_RED_HOLD
    colors_all_red = ctrl.get_signal_colors()
    assert colors_all_red["N"] == RED
    assert colors_all_red["S"] == RED
    assert colors_all_red["E"] == RED
    assert colors_all_red["W"] == RED  # All directions locked RED for safety

    # 3. Advance through all-red duration (2s)
    ctrl.tick(2)
    assert ctrl.state == STATE_PREEMPTION_GREEN
    colors_green = ctrl.get_signal_colors()
    assert colors_green["E"] == GREEN
    assert colors_green["W"] == GREEN
    assert colors_green["N"] == RED
    assert colors_green["S"] == RED

    # 4. Ambulance passes intersection
    ctrl.clear_preemption("AMB-101")
    assert ctrl.state == STATE_RESTORATION_YELLOW
    ctrl.tick(3)
    assert ctrl.state == STATE_RESTORATION_ALL_RED
    ctrl.tick(2)
    assert ctrl.state == STATE_NORMAL


def test_multiple_ambulance_conflict_arbitration():
    """
    Verify multiple ambulance conflict arbitration:
    When two ambulances approach the same intersection from conflicting directions (EW vs NS),
    the higher priority ambulance (CRITICAL) receives green first, while the lower priority (HIGH) is safely queued.
    """
    ctrl = simulation_engine.intersections["INT-102"]
    ctrl.state = STATE_NORMAL

    # Ambulance A: AMB-101 (CRITICAL, EW)
    res1 = ctrl.request_preemption(
        ambulance_code="AMB-101",
        emergency_id=1,
        severity="critical",
        direction="EW",
        distance_meters=200.0,
        eta_seconds=14.0
    )
    assert res1["accepted"] is True
    assert res1["queued"] is False

    # Ambulance B: AMB-103 (MEDIUM, NS - Conflicting Direction!)
    res2 = ctrl.request_preemption(
        ambulance_code="AMB-103",
        emergency_id=3,
        severity="medium",
        direction="NS",
        distance_meters=250.0,
        eta_seconds=20.0
    )
    # Must be safely queued, NOT causing conflicting green!
    assert res2["accepted"] is True
    assert res2["queued"] is True
    assert len(ctrl.queued_preemptions) == 1
    assert ctrl.queued_preemptions[0]["ambulance_code"] == "AMB-103"


def test_simulation_tick_and_progress():
    """Verify simulation step moves ambulance and updates metrics."""
    initial_state = client.get("/api/traffic/state").json()
    amb_init = initial_state["ambulances"][0]
    init_lat = amb_init["latitude"]
    init_lon = amb_init["longitude"]

    # Step simulation forward by 5 seconds
    res = client.post("/api/traffic/simulation/tick?dt=5")
    assert res.status_code == 200
    stepped_state = res.json()
    assert stepped_state["simulation_time"] == 5
    amb_after = stepped_state["ambulances"][0]
    # Coordinates must have progressed along route
    assert (amb_after["latitude"] != init_lat) or (amb_after["longitude"] != init_lon)


def test_scenario_switching():
    """Verify switching between demo scenarios."""
    res = client.post("/api/traffic/simulation/reset", json={"scenario_id": "dual_conflict"})
    assert res.status_code == 200
    data = res.json()
    assert data["scenario_id"] == "dual_conflict"
    assert len(data["ambulances"]) == 2

    # Switch to multi_fleet
    res2 = client.post("/api/traffic/simulation/reset", json={"scenario_id": "multi_fleet"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["scenario_id"] == "multi_fleet"
    assert len(data2["ambulances"]) == 3


def test_manual_preemption_request_endpoint():
    """Verify manual preemption request endpoint."""
    payload = {
        "intersection_id": "INT-103",
        "ambulance_code": "AMB-101",
        "direction": "EW",
        "severity": "critical"
    }
    response = client.post("/api/traffic/preemption/request", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Clear preemption
    clear_payload = {
        "intersection_id": "INT-103",
        "ambulance_code": "AMB-101"
    }
    res_clear = client.post("/api/traffic/preemption/clear", json=clear_payload)
    assert res_clear.status_code == 200
    assert res_clear.json()["success"] is True


def test_module1_sync_endpoint():
    """Verify Module 1 to Module 2 integration bridge endpoint."""
    res = client.post("/api/traffic/sync-module1")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "synced_ambulances" in data

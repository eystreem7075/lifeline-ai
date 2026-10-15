import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
from main import app, seed_demo_data

# Use a separate test SQLite database
TEST_DATABASE_URL = "sqlite:///./test_lifeline.db"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def setup_test_db():
    # Create tables
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    # Teardown
    Base.metadata.drop_all(bind=test_engine)


def test_1_backend_starts_and_health_check():
    """Verify backend starts and health endpoint responds."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "LifeLine AI" in data["service"]


def test_2_seed_demo_ambulances_and_tables_exist():
    """Verify demo ambulances can be seeded and database tables work."""
    db = TestingSessionLocal()
    try:
        seed_demo_data(db, force_reset=False)
        amb_count = db.query(models.Ambulance).count()
        assert amb_count >= 5
    finally:
        db.close()

    response = client.get("/api/ambulances")
    assert response.status_code == 200
    ambulances = response.json()
    assert len(ambulances) >= 5
    assert any(a["vehicle_code"] == "AMB-101" for a in ambulances)


def test_3_create_emergency_valid():
    """Verify emergency can be created with valid fields and severity."""
    payload = {
        "caller_name": "R. Ramanujam",
        "contact_number": "+91 98490 99887",
        "emergency_type": "Severe Chest Pain",
        "severity": "critical",
        "pickup_location": "Tirupati Railway Station Platform 1",
        "destination_hospital": "SVIMS Hospital, Tirupati",
        "notes": "Patient conscious but clammy and experiencing left arm radiation."
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["caller_name"] == "R. Ramanujam"
    assert data["severity"] == "critical"
    assert data["status"] == "pending"
    assert data["incident_id"].startswith("INC-2026-")
    assert data["assigned_ambulance_id"] is None


def test_4_create_emergency_invalid_severity():
    """Verify backend strictly rejects invalid severity."""
    payload = {
        "caller_name": "Invalid Person",
        "contact_number": "+91 99999 88888",
        "emergency_type": "Fever",
        "severity": "extreme_danger",  # Invalid
        "pickup_location": "Somewhere",
        "destination_hospital": "Hospital"
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 422  # Pydantic validation error


def test_5_assign_available_ambulance_to_emergency():
    """Verify an available ambulance can be successfully assigned."""
    # Create emergency
    payload = {
        "caller_name": "K. Balaji",
        "contact_number": "+91 98490 11223",
        "emergency_type": "Stroke Symptoms",
        "severity": "critical",
        "pickup_location": "Bhavani Nagar, Tirupati",
        "destination_hospital": "RUIA Hospital"
    }
    res_em = client.post("/api/emergencies", json=payload)
    assert res_em.status_code == 201
    emergency_id = res_em.json()["id"]

    # Get available ambulance
    res_amb = client.get("/api/ambulances?status=available")
    assert res_amb.status_code == 200
    available_ambs = res_amb.json()
    assert len(available_ambs) > 0
    ambulance_id = available_ambs[0]["id"]
    vehicle_code = available_ambs[0]["vehicle_code"]

    # Assign
    res_assign = client.post(f"/api/emergencies/{emergency_id}/assign/{ambulance_id}")
    assert res_assign.status_code == 200
    data = res_assign.json()
    assert data["status"] == "assigned"
    assert data["assigned_ambulance_id"] == ambulance_id

    # Verify ambulance is now busy
    res_amb_busy = client.get("/api/ambulances")
    amb_record = next(a for a in res_amb_busy.json() if a["id"] == ambulance_id)
    assert amb_record["status"] == "busy"
    assert amb_record["current_incident_id"] == emergency_id


def test_6_cannot_assign_busy_ambulance_twice():
    """Verify that a busy ambulance cannot be assigned to another emergency."""
    # Find a busy ambulance from previous test
    res_amb = client.get("/api/ambulances?status=busy")
    busy_ambs = res_amb.json()
    assert len(busy_ambs) > 0
    busy_ambulance_id = busy_ambs[0]["id"]

    # Create a new emergency
    payload = {
        "caller_name": "T. Padmavathi",
        "contact_number": "+91 98490 33445",
        "emergency_type": "Fall Injury",
        "severity": "medium",
        "pickup_location": "Chandragiri Bypass",
        "destination_hospital": "SVIMS Hospital"
    }
    res_em = client.post("/api/emergencies", json=payload)
    new_em_id = res_em.json()["id"]

    # Attempt to assign the busy ambulance
    res_assign = client.post(f"/api/emergencies/{new_em_id}/assign/{busy_ambulance_id}")
    assert res_assign.status_code == 409  # Conflict: ambulance busy


def test_7_invalid_ids_return_404():
    """Verify that invalid emergency or ambulance IDs return proper 404 errors."""
    # Non-existent emergency
    res1 = client.get("/api/emergencies/999999")
    assert res1.status_code == 404

    # Non-existent ambulance in assignment
    res2 = client.post("/api/emergencies/1/assign/999999")
    assert res2.status_code == 404


def test_8_invalid_status_transitions_are_rejected():
    """Verify that jumping statuses (e.g., pending -> arrived directly) is rejected."""
    # Create emergency (pending)
    payload = {
        "caller_name": "M. Venkat",
        "contact_number": "+91 98490 55667",
        "emergency_type": "Fracture",
        "severity": "low",
        "pickup_location": "KT Road, Tirupati",
        "destination_hospital": "BIRRD Hospital"
    }
    res_em = client.post("/api/emergencies", json=payload)
    em_id = res_em.json()["id"]

    # Try invalid jump: pending -> arrived
    res_invalid = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "arrived"})
    assert res_invalid.status_code == 400

    # Try transition to assigned without assigned ambulance
    res_no_amb = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "assigned"})
    assert res_no_amb.status_code == 400


def test_9_emergency_complete_lifecycle_and_ambulance_release():
    """Verify valid progression: pending -> assigned -> en_route -> arrived -> completed, timestamp recording, and ambulance release."""
    # 1. Create emergency
    payload = {
        "caller_name": "S. Nagaraju",
        "contact_number": "+91 98490 77889",
        "emergency_type": "Asthma Attack",
        "severity": "high",
        "pickup_location": "SV University Gate, Tirupati",
        "destination_hospital": "SVIMS Hospital"
    }
    res_em = client.post("/api/emergencies", json=payload)
    em_id = res_em.json()["id"]

    # 2. Assign available ambulance
    avail_ambs = client.get("/api/ambulances?status=available").json()
    assert len(avail_ambs) > 0
    amb_id = avail_ambs[0]["id"]

    res_assign = client.post(f"/api/emergencies/{em_id}/assign/{amb_id}")
    assert res_assign.status_code == 200
    assert res_assign.json()["status"] == "assigned"

    # 3. Progress to en_route
    res_en_route = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "en_route"})
    assert res_en_route.status_code == 200
    assert res_en_route.json()["status"] == "en_route"

    # 4. Progress to arrived
    res_arrived = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "arrived"})
    assert res_arrived.status_code == 200
    assert res_arrived.json()["status"] == "arrived"

    # 5. Progress to completed
    res_completed = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "completed"})
    assert res_completed.status_code == 200
    comp_data = res_completed.json()
    assert comp_data["status"] == "completed"
    assert comp_data["completed_at"] is not None

    # Verify ambulance is now released back to 'available'
    res_amb = client.get(f"/api/ambulances")
    amb = next(a for a in res_amb.json() if a["id"] == amb_id)
    assert amb["status"] == "available"
    assert amb["current_incident_id"] is None

    # Verify cannot modify completed emergency
    res_reopen = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "en_route"})
    assert res_reopen.status_code == 400


def test_10_dashboard_statistics_update():
    """Verify dashboard endpoint counts are dynamically derived from database records."""
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    stats = response.json()
    assert "total_emergencies" in stats
    assert "active_emergencies" in stats
    assert "available_ambulances" in stats
    assert "busy_ambulances" in stats
    assert "completed_emergencies" in stats
    assert stats["total_emergencies"] >= stats["active_emergencies"]
    assert stats["completed_emergencies"] >= 1


def test_11_incident_activity_history():
    """Verify incident audit log records all transitions."""
    # Pick first emergency
    emergencies = client.get("/api/emergencies").json()
    em_id = emergencies[0]["id"]

    res_history = client.get(f"/api/emergencies/{em_id}/history")
    assert res_history.status_code == 200
    history = res_history.json()
    assert len(history) > 0
    assert any(log["action"] in ["CREATED", "ASSIGNED", "STATUS_CHANGE", "COMPLETED"] for log in history)


def test_12_register_new_ambulance():
    """Verify new ambulance vehicle registration and duplicate prevention."""
    payload = {
        "vehicle_code": "AMB-999",
        "driver_name": "New Test Driver",
        "contact_number": "+91 99999 12345",
        "current_location": "Tirumala Ghat Road Depot"
    }
    response = client.post("/api/ambulances", json=payload)
    assert response.status_code == 201
    assert response.json()["vehicle_code"] == "AMB-999"

    # Duplicate vehicle code must fail
    res_dup = client.post("/api/ambulances", json=payload)
    assert res_dup.status_code == 409

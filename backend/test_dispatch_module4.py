import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
import models
from main import app, seed_demo_data

# Use a separate test SQLite database
TEST_DB_URL = "sqlite:///./test_lifeline.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        seed_demo_data(db, force_reset=False)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def test_m4_hospitals_seeded_and_listed():
    """Verify sample hospitals are configured with coordinates and ER capacity."""
    response = client.get("/api/hospitals")
    assert response.status_code == 200
    hospitals = response.json()
    assert len(hospitals) >= 5
    svims = next((h for h in hospitals if "SVIMS" in h["name"]), None)
    assert svims is not None
    assert svims["latitude"] is not None
    assert svims["longitude"] is not None
    assert svims["trauma_level"] == "Level 1"
    assert svims["total_er_bays"] > 0


def test_m4_nearby_hospitals_ranked():
    """Verify proximity search returns hospitals ordered by road distance and travel time."""
    # Location near Alipiri (13.6521, 79.4002)
    response = client.get("/api/hospitals/nearby?lat=13.6521&lon=79.4002&radius_km=20")
    assert response.status_code == 200
    nearby = response.json()
    assert len(nearby) > 0
    # Must be ordered by distance
    distances = [h["distance_km"] for h in nearby]
    assert distances == sorted(distances)
    assert all("eta_minutes" in h for h in nearby)


def test_m4_emergency_creation_with_gps():
    """Verify patient emergency creation stores GPS coords and resolves landmarks."""
    payload = {
        "caller_name": "S. Rajesh Kumar",
        "contact_number": "+91 98490 88776",
        "emergency_type": "Accident or injury",
        "severity": "critical",
        "pickup_location": "Alipiri Gateway Circle, Tirupati",
        "destination_hospital": "SVIMS Super Specialty Hospital",
        "latitude": 13.6521,
        "longitude": 79.4002,
        "location_description": "Near Entrance Arch, Westbound Lane",
        "notes": "Two-wheeler collision with traumatic leg injury.",
        "auto_assign": False
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["incident_id"].startswith("INC-2026-")
    assert data["latitude"] == 13.6521
    assert data["longitude"] == 79.4002
    assert data["location_description"] == "Near Entrance Arch, Westbound Lane"
    assert data["status"] == "pending"


def test_m4_emergency_manual_location_fallback():
    """Verify coordinates are automatically resolved when GPS coordinates are omitted."""
    payload = {
        "caller_name": "P. Lakshmi",
        "contact_number": "+91 98490 66554",
        "emergency_type": "Breathing difficulty",
        "severity": "high",
        "pickup_location": "Kapila Theertham Temple, Tirupati",
        "destination_hospital": "RUIA Government General Hospital",
        "notes": "Acute bronchial asthma."
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 201
    data = response.json()
    # Coordinates should be resolved from Kapila Theertham landmark
    assert data["latitude"] is not None
    assert data["longitude"] is not None
    assert round(data["latitude"], 2) == 13.65


def test_m4_smart_ambulance_auto_allocation():
    """Verify Smart Ambulance Allocation engine ranks and selects optimal unit."""
    # Create emergency with auto_assign=True
    payload = {
        "caller_name": "M. Chandrasekhar",
        "contact_number": "+91 98490 44332",
        "emergency_type": "Cardiac emergency",
        "severity": "critical",
        "pickup_location": "Kapila Theertham Temple",
        "destination_hospital": "SVIMS Super Specialty Hospital",
        "latitude": 13.6480,
        "longitude": 79.4230,
        "auto_assign": True
    }
    response = client.post("/api/emergencies", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "assigned"
    assert data["assigned_ambulance_id"] is not None

    # Check assigned ambulance is busy
    amb_res = client.get(f"/api/ambulances/{data['assigned_ambulance_id']}")
    assert amb_res.status_code == 200
    amb_data = amb_res.json()
    assert amb_data["status"] == "busy"
    assert amb_data["current_incident_id"] == data["id"]


def test_m4_tracking_endpoint():
    """Verify tracking endpoint returns complete telemetry, waypoints, and ETA."""
    # Find an assigned emergency
    emergencies = client.get("/api/emergencies?status=assigned").json()
    assert len(emergencies) > 0
    em_id = emergencies[0]["id"]

    response = client.get(f"/api/emergencies/{em_id}/tracking")
    assert response.status_code == 200
    tracking = response.json()
    assert tracking["emergency_id"] == em_id
    assert tracking["pickup_coords"] is not None
    assert len(tracking["pickup_coords"]) == 2
    assert tracking["hospital_coords"] is not None
    assert tracking["assigned_ambulance"] is not None
    assert tracking["ambulance_coords"] is not None
    assert len(tracking["route_waypoints"]) > 0
    assert tracking["distance_km"] is not None
    assert tracking["eta_minutes"] is not None
    assert tracking["routing_source"] in ["OSRM", "GEODESIC_FALLBACK"]


def test_m4_status_workflow_progression():
    """Verify extended lifecycle: assigned -> en_route -> arrived_at_scene -> patient_picked_up -> en_route_to_hospital -> arrived_at_hospital -> completed."""
    # 1. Create a fresh incident
    payload = {
        "caller_name": "K. Venkataramana",
        "contact_number": "+91 98490 22110",
        "emergency_type": "Stroke symptoms",
        "severity": "critical",
        "pickup_location": "RTC Central Bus Station",
        "destination_hospital": "SVIMS Super Specialty Hospital",
        "latitude": 13.6288,
        "longitude": 79.4215,
        "auto_assign": False
    }
    em = client.post("/api/emergencies", json=payload).json()
    em_id = em["id"]

    # 2. Auto-assign via POST /api/emergencies/{id}/auto-assign
    auto_res = client.post(f"/api/emergencies/{em_id}/auto-assign")
    assert auto_res.status_code == 200
    assert auto_res.json()["assigned"] is True
    amb_id = auto_res.json()["ambulance_id"]

    # 3. en_route
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "en_route"})
    assert r.status_code == 200
    assert r.json()["status"] == "en_route"

    # 4. arrived_at_scene
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "arrived_at_scene"})
    assert r.status_code == 200
    assert r.json()["status"] == "arrived_at_scene"

    # 5. patient_picked_up
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "patient_picked_up"})
    assert r.status_code == 200
    assert r.json()["status"] == "patient_picked_up"

    # 6. en_route_to_hospital
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "en_route_to_hospital"})
    assert r.status_code == 200
    assert r.json()["status"] == "en_route_to_hospital"

    # 7. arrived_at_hospital
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "arrived_at_hospital"})
    assert r.status_code == 200
    assert r.json()["status"] == "arrived_at_hospital"

    # 8. completed
    r = client.patch(f"/api/emergencies/{em_id}/status", json={"status": "completed", "notes": "Handover to ER Trauma Team"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] is not None

    # Check ambulance was released back to available
    amb = client.get(f"/api/ambulances/{amb_id}").json()
    assert amb["status"] == "available"
    assert amb["current_incident_id"] is None


def test_m4_emergency_cancellation_releases_ambulance():
    """Verify cancellation marks request cancelled and releases assigned ambulance."""
    # 1. Create incident and auto-assign
    payload = {
        "caller_name": "T. Anusha",
        "contact_number": "+91 98490 11998",
        "emergency_type": "Other emergency",
        "severity": "low",
        "pickup_location": "Bhavani Nagar",
        "destination_hospital": "Apollo Hospitals",
        "latitude": 13.6350,
        "longitude": 79.4180,
        "auto_assign": True
    }
    res = client.post("/api/emergencies", json=payload)
    assert res.status_code == 201
    em_data = res.json()
    em_id = em_data["id"]
    amb_id = em_data["assigned_ambulance_id"]

    # 2. Cancel incident
    cancel_res = client.post(f"/api/emergencies/{em_id}/cancel", json={"reason": "False alarm / patient recovered"})
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "cancelled"
    assert cancel_res.json()["cancellation_reason"] == "False alarm / patient recovered"

    # 3. Check ambulance is released
    if amb_id:
        amb = client.get(f"/api/ambulances/{amb_id}").json()
        assert amb["status"] == "available"
        assert amb["current_incident_id"] is None


def test_m4_ambulance_location_update():
    """Verify updating ambulance real-time GPS coordinates via authorized endpoint."""
    ambs = client.get("/api/ambulances").json()
    amb_id = ambs[0]["id"]

    update_payload = {
        "latitude": 13.6400,
        "longitude": 79.4100,
        "current_location": "Approaching SVIMS Circle"
    }
    res = client.patch(f"/api/ambulances/{amb_id}/location", json=update_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["latitude"] == 13.6400
    assert data["longitude"] == 79.4100
    assert data["current_location"] == "Approaching SVIMS Circle"


def test_m4_select_hospital():
    """Verify associating/updating destination hospital for an emergency."""
    # Create an emergency
    payload = {
        "caller_name": "G. Murali",
        "contact_number": "+91 98490 33221",
        "emergency_type": "General medical emergency",
        "severity": "medium",
        "pickup_location": "Renigunta Road",
        "destination_hospital": "Unknown Clinic",
        "auto_assign": False
    }
    em = client.post("/api/emergencies", json=payload).json()
    em_id = em["id"]

    # Select RUIA hospital
    hospitals = client.get("/api/hospitals").json()
    ruia = next(h for h in hospitals if "RUIA" in h["name"])

    res = client.post(f"/api/emergencies/{em_id}/select-hospital?hospital_id={ruia['id']}")
    assert res.status_code == 200
    updated = res.json()
    assert updated["selected_hospital_id"] == ruia["id"]
    assert ruia["name"] in updated["destination_hospital"]

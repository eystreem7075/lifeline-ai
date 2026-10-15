import os
import random
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import schemas
from database import engine, get_db, init_db, SessionLocal
from traffic_preemption import simulation_engine

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lifeline-backend")

# Allowed status transitions
ALLOWED_TRANSITIONS = {
    "pending": ["assigned"],
    "assigned": ["en_route"],
    "en_route": ["arrived"],
    "arrived": ["completed"],
    "completed": []
}

DEMO_AMBULANCES = [
    {
        "vehicle_code": "AMB-101",
        "driver_name": "K. Ramesh Naidu",
        "contact_number": "+91 98480 12345",
        "current_location": "SVIMS Emergency Hub, Tirupati",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-102",
        "driver_name": "V. Siva Prasad",
        "contact_number": "+91 98480 23456",
        "current_location": "RUIA Hospital Dispatch Bay, Tirupati",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-103",
        "driver_name": "M. Suresh Babu",
        "contact_number": "+91 98480 34567",
        "current_location": "Alipiri Gateway Rapid Response, Tirupati",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-104",
        "driver_name": "P. Lakshmi Narayana",
        "contact_number": "+91 98480 45678",
        "current_location": "Tirupati Central Bus Station Hub",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-105",
        "driver_name": "G. Venkat Ramana",
        "contact_number": "+91 98480 56789",
        "current_location": "Chandragiri Emergency Depot",
        "status": "available"
    }
]

DEMO_EMERGENCIES = [
    {
        "caller_name": "A. Krishna Murthy",
        "contact_number": "+91 94401 11223",
        "emergency_type": "Cardiac Arrest",
        "severity": "critical",
        "pickup_location": "Near Kapila Theertham Temple, Tirupati",
        "destination_hospital": "SVIMS Hospital, Tirupati",
        "notes": "Patient collapsed suddenly with chest pain. CPR administered by bystander."
    },
    {
        "caller_name": "S. Sunitha Reddy",
        "contact_number": "+91 94402 33445",
        "emergency_type": "Road Traffic Accident",
        "severity": "high",
        "pickup_location": "Renigunta Road Highway Junction, Tirupati",
        "destination_hospital": "RUIA Government General Hospital",
        "notes": "Two-wheeler collision with multiple soft tissue lacerations."
    },
    {
        "caller_name": "D. Madhava Rao",
        "contact_number": "+91 94403 55667",
        "emergency_type": "Respiratory Distress",
        "severity": "medium",
        "pickup_location": "Bhavani Nagar 3rd Cross, Tirupati",
        "destination_hospital": "Apollo Hospitals, Tirupati",
        "notes": "Severe asthma exacerbation, oxygen saturation dropping."
    }
]


def seed_demo_data(db: Session, force_reset: bool = False):
    """Seed synthetic ambulances and initial demo incidents idempotently."""
    if force_reset:
        logger.warning("Force resetting database tables for clean test seed...")
        models.IncidentActivityLog.__table__.drop(engine, checkfirst=True)
        models.Emergency.__table__.drop(engine, checkfirst=True)
        models.Ambulance.__table__.drop(engine, checkfirst=True)
        init_db()

    # Seed ambulances if none exist
    existing_amb_count = db.query(models.Ambulance).count()
    if existing_amb_count == 0:
        logger.info("Seeding synthetic ambulance fleet into SQLite database...")
        for amb_data in DEMO_AMBULANCES:
            amb = models.Ambulance(**amb_data)
            db.add(amb)
        db.commit()
        logger.info("Seeded 5 synthetic ambulances.")

    # Seed demo emergencies if none exist
    existing_em_count = db.query(models.Emergency).count()
    if existing_em_count == 0:
        logger.info("Seeding initial synthetic emergency incidents...")
        for i, em_data in enumerate(DEMO_EMERGENCIES, start=1):
            inc_id = f"INC-2026-{1000 + i}"
            em = models.Emergency(
                incident_id=inc_id,
                caller_name=em_data["caller_name"],
                contact_number=em_data["contact_number"],
                emergency_type=em_data["emergency_type"],
                severity=em_data["severity"],
                pickup_location=em_data["pickup_location"],
                destination_hospital=em_data["destination_hospital"],
                notes=em_data.get("notes"),
                status="pending"
            )
            db.add(em)
            db.flush()

            # Add activity log
            log = models.IncidentActivityLog(
                emergency_id=em.id,
                action="CREATED",
                new_status="pending",
                description=f"Incident {inc_id} registered with {em.severity.upper()} severity ({em.emergency_type}) at {em.pickup_location}.",
                actor="DISPATCH_COMMAND"
            )
            db.add(log)
        db.commit()
        logger.info("Seeded 3 initial synthetic emergency incidents.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables exist and seed demo data idempotently
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db, force_reset=False)
    finally:
        db.close()
    logger.info("LifeLine AI Backend started successfully.")
    yield
    logger.info("LifeLine AI Backend shutting down.")


app = FastAPI(
    title="LifeLine AI — Emergency Command Center",
    version="1.0.0",
    description="Intelligent Ambulance Dispatch, Smart Traffic Preemption & Emergency Coordination Platform — Module 1",
    lifespan=lifespan
)

# CORS setup
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"  # In development, allow broad access for easy testing
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": "LifeLine AI Command Center API",
        "version": "1.0.0",
        "module": "Module 1: Emergency Command Center",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/dashboard", response_model=schemas.DashboardStatsResponse, tags=["Dashboard"])
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Summary counts derived directly from database records."""
    total_emergencies = db.query(models.Emergency).count()
    active_emergencies = db.query(models.Emergency).filter(models.Emergency.status != "completed").count()
    available_ambulances = db.query(models.Ambulance).filter(models.Ambulance.status == "available").count()
    busy_ambulances = db.query(models.Ambulance).filter(models.Ambulance.status == "busy").count()
    completed_emergencies = db.query(models.Emergency).filter(models.Emergency.status == "completed").count()
    pending_emergencies = db.query(models.Emergency).filter(models.Emergency.status == "pending").count()
    critical_emergencies = db.query(models.Emergency).filter(
        models.Emergency.severity == "critical",
        models.Emergency.status != "completed"
    ).count()
    high_emergencies = db.query(models.Emergency).filter(
        models.Emergency.severity == "high",
        models.Emergency.status != "completed"
    ).count()

    return schemas.DashboardStatsResponse(
        total_emergencies=total_emergencies,
        active_emergencies=active_emergencies,
        available_ambulances=available_ambulances,
        busy_ambulances=busy_ambulances,
        completed_emergencies=completed_emergencies,
        pending_emergencies=pending_emergencies,
        critical_emergencies=critical_emergencies,
        high_emergencies=high_emergencies
    )


@app.get("/api/emergencies", response_model=List[schemas.EmergencyResponse], tags=["Emergencies"])
def list_emergencies(
    status: Optional[str] = Query(None, description="Filter by status"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List all emergency incidents with optional status and severity filtering."""
    query = db.query(models.Emergency)
    if status:
        query = query.filter(models.Emergency.status == status.lower())
    if severity:
        query = query.filter(models.Emergency.severity == severity.lower())

    emergencies = query.order_by(models.Emergency.created_at.desc()).offset(offset).limit(limit).all()
    return emergencies


@app.post("/api/emergencies", response_model=schemas.EmergencyResponse, status_code=status.HTTP_201_CREATED, tags=["Emergencies"])
def create_emergency(payload: schemas.EmergencyCreate, db: Session = Depends(get_db)):
    """Register a new emergency incident. Initial status is 'pending'."""
    # Generate unique incident ID: INC-2026-XXXX
    count = db.query(models.Emergency).count() + 1
    random_suffix = random.randint(100, 999)
    incident_id = f"INC-2026-{count:03d}{random_suffix}"

    emergency = models.Emergency(
        incident_id=incident_id,
        caller_name=payload.caller_name,
        contact_number=payload.contact_number,
        emergency_type=payload.emergency_type,
        severity=payload.severity,
        pickup_location=payload.pickup_location,
        destination_hospital=payload.destination_hospital,
        notes=payload.notes,
        status="pending",
        created_at=datetime.utcnow()
    )
    db.add(emergency)
    db.flush()

    # Mask contact number in public log
    masked_contact = payload.contact_number[:3] + "****" + payload.contact_number[-3:] if len(payload.contact_number) >= 6 else "***"
    log = models.IncidentActivityLog(
        emergency_id=emergency.id,
        action="CREATED",
        new_status="pending",
        description=f"Emergency incident {incident_id} registered with {payload.severity.upper()} severity for {payload.emergency_type} at {payload.pickup_location}. Caller: {payload.caller_name} ({masked_contact}).",
        actor="DISPATCH_COMMAND"
    )
    db.add(log)
    db.commit()
    db.refresh(emergency)

    logger.info(f"Registered new emergency incident: {incident_id} (Severity: {emergency.severity})")
    return emergency


@app.get("/api/emergencies/{emergency_id}", response_model=schemas.EmergencyDetailResponse, tags=["Emergencies"])
def get_emergency(emergency_id: int, db: Session = Depends(get_db)):
    """Retrieve complete incident details, assigned ambulance, and audit activity history."""
    emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident with ID {emergency_id} was not found."
        )
    return emergency


@app.post("/api/emergencies/{emergency_id}/assign/{ambulance_id}", response_model=schemas.EmergencyResponse, tags=["Dispatch"])
def assign_ambulance(emergency_id: int, ambulance_id: int, db: Session = Depends(get_db)):
    """
    Assign an available ambulance to an active emergency.
    Enforces strict assignment rules & transactional consistency:
    - Emergency must exist and not be completed
    - Ambulance must exist and be currently available
    - Emergency cannot have another active ambulance without explicit reassignment
    - Concurrency-safe atomic update
    """
    with db.begin():
        # 1. Fetch Emergency with row-level check
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident with ID {emergency_id} does not exist."
            )

        if emergency.status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign ambulance to incident {emergency.incident_id} because it is already completed."
            )

        if emergency.assigned_ambulance_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Emergency {emergency.incident_id} already has an assigned ambulance. Reassignment requires explicit dispatch override."
            )

        # 2. Fetch Ambulance with row-level check
        ambulance = db.query(models.Ambulance).filter(models.Ambulance.id == ambulance_id).with_for_update().first()
        if not ambulance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ambulance with ID {ambulance_id} does not exist."
            )

        if ambulance.status != "available":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ambulance {ambulance.vehicle_code} is currently {ambulance.status.upper()} and cannot be assigned."
            )

        # 3. Perform atomic assignment
        now = datetime.utcnow()
        previous_status = emergency.status
        emergency.assigned_ambulance_id = ambulance.id
        emergency.status = "assigned"
        emergency.assigned_at = now

        ambulance.status = "busy"
        ambulance.current_incident_id = emergency.id

        # 4. Activity log entry
        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="ASSIGNED",
            previous_status=previous_status,
            new_status="assigned",
            description=f"Ambulance {ambulance.vehicle_code} (Driver: {ambulance.driver_name}) dispatched and assigned to incident {emergency.incident_id}.",
            actor="DISPATCH_COMMAND"
        )
        db.add(log)

    # Refresh after commit
    db.refresh(emergency)
    logger.info(f"Assigned ambulance {ambulance.vehicle_code} to emergency {emergency.incident_id}")
    return emergency


@app.patch("/api/emergencies/{emergency_id}/status", response_model=schemas.EmergencyResponse, tags=["Emergencies"])
def update_emergency_status(emergency_id: int, payload: schemas.EmergencyStatusUpdate, db: Session = Depends(get_db)):
    """
    Progress emergency incident status across valid lifecycle transitions:
    pending -> assigned -> en_route -> arrived -> completed
    """
    with db.begin():
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident with ID {emergency_id} was not found."
            )

        current_status = emergency.status
        target_status = payload.status.lower()

        # Completed emergencies cannot be modified
        if current_status == "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Completed emergencies cannot be altered or reopened."
            )

        # Check if ambulance assigned before entering assigned/en_route/arrived
        if target_status in ["assigned", "en_route", "arrived"] and emergency.assigned_ambulance_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition to '{target_status}' without an assigned ambulance. Please assign an ambulance first."
            )

        # Enforce valid forward progression
        valid_targets = ALLOWED_TRANSITIONS.get(current_status, [])
        if target_status not in valid_targets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition from '{current_status}' to '{target_status}'. Allowed progression: {valid_targets}"
            )

        now = datetime.utcnow()
        emergency.status = target_status

        # If completed: record completion timestamp and release assigned ambulance
        ambulance_released_code = None
        if target_status == "completed":
            emergency.completed_at = now
            if emergency.assigned_ambulance_id:
                amb = db.query(models.Ambulance).filter(models.Ambulance.id == emergency.assigned_ambulance_id).first()
                if amb:
                    ambulance_released_code = amb.vehicle_code
                    amb.status = "available"
                    amb.current_incident_id = None

        # Build activity description
        desc = f"Incident status progressed from '{current_status.upper()}' to '{target_status.upper()}'."
        if ambulance_released_code:
            desc += f" Assigned ambulance {ambulance_released_code} was released back to AVAILABLE fleet."
        if payload.notes:
            desc += f" Note: {payload.notes}"

        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="STATUS_CHANGE" if target_status != "completed" else "COMPLETED",
            previous_status=current_status,
            new_status=target_status,
            description=desc,
            actor="DISPATCH_COMMAND"
        )
        db.add(log)

    db.refresh(emergency)
    logger.info(f"Updated emergency {emergency.incident_id} status from {current_status} to {target_status}")
    return emergency


@app.get("/api/ambulances", response_model=List[schemas.AmbulanceResponse], tags=["Ambulances"])
def list_ambulances(
    status: Optional[str] = Query(None, description="Filter by status: available or busy"),
    db: Session = Depends(get_db)
):
    """List ambulance fleet members, their driver, location, and availability."""
    query = db.query(models.Ambulance)
    if status:
        query = query.filter(models.Ambulance.status == status.lower())
    return query.order_by(models.Ambulance.vehicle_code.asc()).all()


@app.post("/api/ambulances", response_model=schemas.AmbulanceResponse, status_code=status.HTTP_201_CREATED, tags=["Ambulances"])
def register_ambulance(payload: schemas.AmbulanceCreate, db: Session = Depends(get_db)):
    """Register a new vehicle into the ambulance fleet."""
    existing = db.query(models.Ambulance).filter(models.Ambulance.vehicle_code == payload.vehicle_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ambulance with vehicle code '{payload.vehicle_code}' already exists."
        )

    ambulance = models.Ambulance(
        vehicle_code=payload.vehicle_code,
        driver_name=payload.driver_name,
        contact_number=payload.contact_number,
        current_location=payload.current_location,
        status="available",
        created_at=datetime.utcnow()
    )
    db.add(ambulance)
    db.commit()
    db.refresh(ambulance)
    logger.info(f"Registered new ambulance: {ambulance.vehicle_code} (Driver: {ambulance.driver_name})")
    return ambulance


@app.get("/api/emergencies/{emergency_id}/history", response_model=List[schemas.ActivityLogResponse], tags=["Emergencies"])
def get_emergency_history(emergency_id: int, db: Session = Depends(get_db)):
    """Audit log of all actions and status changes for this emergency incident."""
    emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency incident with ID {emergency_id} was not found."
        )
    return emergency.activity_logs


@app.get("/api/activity-logs", response_model=List[schemas.ActivityLogResponse], tags=["System"])
def get_all_recent_activity(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Global feed of recent dispatch operations across all incidents."""
    logs = db.query(models.IncidentActivityLog).order_by(models.IncidentActivityLog.timestamp.desc()).limit(limit).all()
    return logs


@app.post("/api/seed", tags=["System"])
def seed_database(reset: bool = Query(False, description="Whether to drop existing tables and re-seed clean data"), db: Session = Depends(get_db)):
    """Seed synthetic demo ambulances and emergency incidents for hackathon demonstration."""
    seed_demo_data(db, force_reset=reset)
    return {"status": "success", "message": "Demo data successfully seeded."}


# =====================================================================
# MODULE 2: SMART TRAFFIC SIGNAL PREEMPTION ENDPOINTS
# =====================================================================

@app.get("/api/traffic/state", tags=["Traffic Preemption (Module 2)"])
def get_traffic_state():
    """Retrieve complete snapshot of intersection signal states, ambulances, and metrics."""
    return simulation_engine.get_state()


@app.get("/api/traffic/intersections", tags=["Traffic Preemption (Module 2)"])
def list_intersections():
    """List all traffic signal controllers with live 4-way colors, timers, and preemption status."""
    state = simulation_engine.get_state()
    return state["intersections"]


@app.get("/api/traffic/intersections/{intersection_id}", tags=["Traffic Preemption (Module 2)"])
def get_intersection(intersection_id: str):
    """Retrieve detailed state and local event logs for a specific traffic intersection."""
    if intersection_id not in simulation_engine.intersections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic intersection '{intersection_id}' was not found."
        )
    return simulation_engine.intersections[intersection_id].to_dict()


@app.get("/api/traffic/ambulances", tags=["Traffic Preemption (Module 2)"])
def list_traffic_ambulances():
    """List all simulated ambulances in transit, GPS coords, routes, and upcoming intersections."""
    state = simulation_engine.get_state()
    return state["ambulances"]


@app.post("/api/traffic/preemption/request", tags=["Traffic Preemption (Module 2)"])
def request_preemption(payload: schemas.PreemptionRequestSchema):
    """
    Trigger emergency signal preemption at a specified intersection.
    Enforces safe clearance transitions (Yellow -> All-Red Hold -> Green) and priority arbitration.
    """
    if payload.intersection_id not in simulation_engine.intersections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic intersection '{payload.intersection_id}' was not found."
        )

    res = simulation_engine.manual_preemption_request(
        intersection_id=payload.intersection_id,
        ambulance_code=payload.ambulance_code,
        direction=payload.direction or "EW"
    )
    return res


@app.post("/api/traffic/preemption/clear", tags=["Traffic Preemption (Module 2)"])
def clear_preemption(payload: schemas.PreemptionClearSchema):
    """
    Simulate ambulance passage or clear preemption state.
    Restores normal cyclic operation after safe yellow/all-red clearance intervals.
    """
    if payload.intersection_id not in simulation_engine.intersections:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Traffic intersection '{payload.intersection_id}' was not found."
        )

    res = simulation_engine.manual_clear_intersection(payload.intersection_id)
    return res


@app.post("/api/traffic/simulation/tick", tags=["Traffic Preemption (Module 2)"])
def simulation_tick(dt: int = Query(1, ge=1, le=10, description="Step duration in seconds")):
    """Advance simulation clock by dt seconds, moving ambulances and updating signals."""
    return simulation_engine.tick(dt=dt)


@app.post("/api/traffic/simulation/control", tags=["Traffic Preemption (Module 2)"])
def control_simulation(payload: schemas.SimulationControlSchema):
    """Control simulation playback (running/paused, speed, auto-preemption detection)."""
    if payload.is_running is not None:
        simulation_engine.is_running = payload.is_running
    if payload.speed is not None:
        simulation_engine.simulation_speed = payload.speed
    if payload.auto_preemption is not None:
        simulation_engine.auto_preemption = payload.auto_preemption

    return simulation_engine.get_state()


@app.post("/api/traffic/simulation/reset", tags=["Traffic Preemption (Module 2)"])
def reset_simulation(payload: Optional[schemas.SimulationResetSchema] = None):
    """Reset the traffic simulation to initial positions with selected scenario."""
    scenario_id = payload.scenario_id if payload and payload.scenario_id else "svims_critical"
    simulation_engine.reset_simulation(scenario_id=scenario_id)
    return simulation_engine.get_state()


@app.get("/api/traffic/logs", tags=["Traffic Preemption (Module 2)"])
def get_traffic_logs(limit: int = Query(25, ge=1, le=100)):
    """Retrieve chronological audit log of traffic preemption, clearance intervals, and arbitration."""
    return simulation_engine.global_logs[:limit]


@app.post("/api/traffic/sync-module1", tags=["Traffic Preemption (Module 2)"])
def sync_module1_emergencies(db: Session = Depends(get_db)):
    """
    Seamless Integration Bridge:
    Inspect active Module 1 assigned/en_route emergencies and integrate them directly into Module 2 traffic simulation.
    """
    try:
        active_incidents = db.query(models.Emergency).filter(
            models.Emergency.status.in_(["assigned", "en_route"]),
            models.Emergency.assigned_ambulance_id.isnot(None)
        ).all()
    except Exception as e:
        logger.warning(f"Could not query emergencies for sync: {e}")
        active_incidents = []

    synced_count = 0
    for em in active_incidents:
        amb = em.assigned_ambulance
        if amb:
            # Check if ambulance already exists in simulation
            existing = next((a for a in simulation_engine.ambulances if a.ambulance_code == amb.vehicle_code), None)
            if not existing:
                # Add to simulation using SVIMS or RUIA corridor based on destination
                is_svims = "svims" in (em.destination_hospital or "").lower()
                from traffic_preemption import ROUTE_SVIMS_CORRIDOR, ROUTE_RUIA_CORRIDOR, SimulatedAmbulance
                route_pts = list(ROUTE_SVIMS_CORRIDOR if is_svims else ROUTE_RUIA_CORRIDOR)

                new_amb = SimulatedAmbulance(
                    ambulance_code=amb.vehicle_code,
                    driver_name=amb.driver_name,
                    emergency_id=em.id,
                    incident_id=em.incident_id,
                    emergency_type=em.emergency_type,
                    severity=em.severity,
                    route_name=f"{'SVIMS' if is_svims else 'RUIA'} Live Incident Corridor",
                    origin_name=em.pickup_location,
                    destination_name=em.destination_hospital,
                    waypoints=route_pts,
                    speed_kmh=48.0
                )
                simulation_engine.ambulances.append(new_amb)
                synced_count += 1
                simulation_engine.add_log(
                    "MODULE1_SYNC",
                    f"Imported active Module 1 incident {em.incident_id} (Ambulance {amb.vehicle_code}, {em.severity.upper()}) into traffic preemption corridor."
                )

    return {
        "status": "success",
        "synced_ambulances": synced_count,
        "total_active_sim_ambulances": len(simulation_engine.ambulances)
    }

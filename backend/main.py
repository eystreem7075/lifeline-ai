import os
import random
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Query, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func

import models
import schemas
from database import engine, get_db, init_db, SessionLocal
from traffic_preemption import simulation_engine
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    check_rate_limit,
    record_login_failure,
    reset_login_failures,
    generate_reset_token,
    DEFAULT_EXPIRE_MINUTES,
    REMEMBER_ME_EXPIRE_MINUTES
)

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lifeline-backend")

from allocation_engine import (
    haversine_distance,
    get_route_geometry,
    rank_ambulances_for_emergency,
    resolve_coordinates
)

# Allowed status transitions
ALLOWED_TRANSITIONS = {
    "pending": ["assigned", "assignment_pending", "no_ambulance_available", "cancelled"],
    "requested": ["assigned", "assignment_pending", "no_ambulance_available", "cancelled"],
    "assignment_pending": ["assigned", "no_ambulance_available", "cancelled"],
    "no_ambulance_available": ["assignment_pending", "assigned", "cancelled"],
    "assigned": ["en_route", "cancelled"],
    "en_route": ["arrived", "arrived_at_scene", "cancelled"],
    "arrived": ["patient_picked_up", "en_route_to_hospital", "completed", "cancelled"],
    "arrived_at_scene": ["patient_picked_up", "en_route_to_hospital", "completed", "cancelled"],
    "patient_picked_up": ["en_route_to_hospital", "arrived_at_hospital", "completed", "cancelled"],
    "en_route_to_hospital": ["arrived_at_hospital", "completed", "cancelled"],
    "arrived_at_hospital": ["completed", "cancelled"],
    "completed": [],
    "cancelled": [],
    "assignment_failed": ["assignment_pending", "assigned", "cancelled"]
}

DEMO_AMBULANCES = [
    {
        "vehicle_code": "AMB-101",
        "driver_name": "K. Ramesh Naidu",
        "contact_number": "+91 98480 12345",
        "current_location": "SVIMS Emergency Hub, Tirupati",
        "latitude": 13.6365,
        "longitude": 79.4090,
        "capability": "Advanced Life Support (ALS)",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-102",
        "driver_name": "V. Siva Prasad",
        "contact_number": "+91 98480 23456",
        "current_location": "RUIA Hospital Dispatch Bay, Tirupati",
        "latitude": 13.6415,
        "longitude": 79.4250,
        "capability": "Advanced Life Support (ALS)",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-103",
        "driver_name": "M. Suresh Babu",
        "contact_number": "+91 98480 34567",
        "current_location": "Alipiri Gateway Rapid Response, Tirupati",
        "latitude": 13.6525,
        "longitude": 79.4005,
        "capability": "Basic Life Support (BLS)",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-104",
        "driver_name": "P. Lakshmi Narayana",
        "contact_number": "+91 98480 45678",
        "current_location": "Tirupati Central Bus Station Hub",
        "latitude": 13.6285,
        "longitude": 79.4220,
        "capability": "Advanced Life Support (ALS)",
        "status": "available"
    },
    {
        "vehicle_code": "AMB-105",
        "driver_name": "G. Venkat Ramana",
        "contact_number": "+91 98480 56789",
        "current_location": "Chandragiri Emergency Depot",
        "latitude": 13.6180,
        "longitude": 79.3180,
        "capability": "Basic Life Support (BLS)",
        "status": "available"
    }
]

DEMO_HOSPITALS = [
    {
        "hospital_code": "HOSP-001",
        "name": "SVIMS Super Specialty Hospital",
        "address": "Alipiri Road, Tirupati, AP 517507",
        "latitude": 13.6360,
        "longitude": 79.4085,
        "contact_number": "+91 877 228 7777",
        "trauma_level": "Level 1",
        "available_services": "Cardiology, Neurology, Trauma ICU, Burn Center, 24/7 Cath Lab",
        "operational_status": "operational",
        "total_er_bays": 24,
        "available_er_bays": 7
    },
    {
        "hospital_code": "HOSP-002",
        "name": "RUIA Government General Hospital",
        "address": "Renigunta Road, Tirupati, AP 517501",
        "latitude": 13.6410,
        "longitude": 79.4260,
        "contact_number": "+91 877 228 6666",
        "trauma_level": "Level 1",
        "available_services": "Emergency Medicine, Polytrauma, Pediatric ER, Blood Bank",
        "operational_status": "operational",
        "total_er_bays": 30,
        "available_er_bays": 12
    },
    {
        "hospital_code": "HOSP-003",
        "name": "Apollo Hospitals, Tirupati",
        "address": "Old Tirchanoor Road, Tirupati, AP 517501",
        "latitude": 13.6265,
        "longitude": 79.4290,
        "contact_number": "+91 877 228 8888",
        "trauma_level": "Level 2",
        "available_services": "Interventional Cardiology, Stroke Care, Emergency Resuscitation",
        "operational_status": "operational",
        "total_er_bays": 16,
        "available_er_bays": 4
    },
    {
        "hospital_code": "HOSP-004",
        "name": "BIRRD Orthopedic & Trauma Center",
        "address": "TTD Administrative Area, Tirupati, AP 517507",
        "latitude": 13.6340,
        "longitude": 79.4060,
        "contact_number": "+91 877 228 5555",
        "trauma_level": "Specialized Trauma",
        "available_services": "Orthopedic Surgery, Spinal Trauma, Rehabilitation, Limb Salvage",
        "operational_status": "operational",
        "total_er_bays": 18,
        "available_er_bays": 6
    },
    {
        "hospital_code": "HOSP-005",
        "name": "Amara Hospital, Karakambadi",
        "address": "Karakambadi Road, Tirupati, AP 517520",
        "latitude": 13.6450,
        "longitude": 79.4500,
        "contact_number": "+91 877 228 9999",
        "trauma_level": "Level 2",
        "available_services": "Critical Care, Acute Surgery, Poisoning Management",
        "operational_status": "operational",
        "total_er_bays": 14,
        "available_er_bays": 5
    }
]

DEMO_EMERGENCIES = [
    {
        "caller_name": "A. Krishna Murthy",
        "contact_number": "+91 94401 11223",
        "emergency_type": "Cardiac Arrest",
        "severity": "critical",
        "pickup_location": "Near Kapila Theertham Temple, Tirupati",
        "destination_hospital": "SVIMS Super Specialty Hospital",
        "latitude": 13.6480,
        "longitude": 79.4230,
        "notes": "Patient collapsed suddenly with chest pain. CPR administered by bystander."
    },
    {
        "caller_name": "S. Sunitha Reddy",
        "contact_number": "+91 94402 33445",
        "emergency_type": "Road Traffic Accident",
        "severity": "high",
        "pickup_location": "Renigunta Road Highway Junction, Tirupati",
        "destination_hospital": "RUIA Government General Hospital",
        "latitude": 13.6290,
        "longitude": 79.4420,
        "notes": "Two-wheeler collision with multiple soft tissue lacerations."
    },
    {
        "caller_name": "D. Madhava Rao",
        "contact_number": "+91 94403 55667",
        "emergency_type": "Respiratory Distress",
        "severity": "medium",
        "pickup_location": "Bhavani Nagar 3rd Cross, Tirupati",
        "destination_hospital": "Apollo Hospitals, Tirupati",
        "latitude": 13.6350,
        "longitude": 79.4180,
        "notes": "Severe asthma exacerbation, oxygen saturation dropping."
    }
]

DEMO_USERS = [
    {
        "email": "admin@lifeline.ai",
        "full_name": "Dr. A. Srinivasulu",
        "phone_number": "+91 98480 11223",
        "role": "admin",
        "password": "Admin@123"
    },
    {
        "email": "operator@lifeline.ai",
        "full_name": "K. Ramesh Naidu",
        "phone_number": "+91 98480 12345",
        "role": "operator",
        "password": "Operator@123"
    },
    {
        "email": "hospital@lifeline.ai",
        "full_name": "Dr. P. Madhavi",
        "phone_number": "+91 98480 55667",
        "role": "hospital",
        "password": "Hospital@123"
    },
    {
        "email": "patient@lifeline.ai",
        "full_name": "V. Ananya Sharma",
        "phone_number": "+91 98480 99887",
        "role": "patient",
        "password": "Patient@123"
    }
]


def seed_demo_data(db: Session, force_reset: bool = False):
    """Seed synthetic ambulances, initial incidents, hospitals, and role-based demo accounts idempotently."""
    if force_reset:
        logger.warning("Force resetting database tables for clean test seed...")
        models.PasswordResetToken.__table__.drop(engine, checkfirst=True)
        models.User.__table__.drop(engine, checkfirst=True)
        models.IncidentActivityLog.__table__.drop(engine, checkfirst=True)
        models.Emergency.__table__.drop(engine, checkfirst=True)
        models.Ambulance.__table__.drop(engine, checkfirst=True)
        models.Hospital.__table__.drop(engine, checkfirst=True)
        init_db()

    # Seed demo users if none exist
    existing_user_count = db.query(models.User).count()
    if existing_user_count == 0:
        logger.info("Seeding synthetic verified users for LifeLine AI...")
        for u_data in DEMO_USERS:
            user = models.User(
                email=u_data["email"].lower(),
                full_name=u_data["full_name"],
                phone_number=u_data["phone_number"],
                role=u_data["role"],
                password_hash=hash_password(u_data["password"]),
                is_active=True
            )
            db.add(user)
        db.commit()
        logger.info("Seeded 4 synthetic role-based users.")

    # Seed hospitals if none exist
    existing_hosp_count = db.query(models.Hospital).count()
    if existing_hosp_count == 0:
        logger.info("Seeding synthetic hospitals into SQLite database...")
        for hosp_data in DEMO_HOSPITALS:
            hosp = models.Hospital(**hosp_data)
            db.add(hosp)
        db.commit()
        logger.info("Seeded 5 synthetic hospitals.")

    # Seed ambulances if none exist
    existing_amb_count = db.query(models.Ambulance).count()
    if existing_amb_count == 0:
        logger.info("Seeding synthetic ambulance fleet into SQLite database...")
        for amb_data in DEMO_AMBULANCES:
            amb = models.Ambulance(**amb_data)
            db.add(amb)
        db.commit()
        logger.info("Seeded 5 synthetic ambulances.")
    else:
        # Ensure existing ambulances have coordinates
        ambs = db.query(models.Ambulance).all()
        coords_map = {
            "AMB-101": (13.6365, 79.4090, "Advanced Life Support (ALS)"),
            "AMB-102": (13.6415, 79.4250, "Advanced Life Support (ALS)"),
            "AMB-103": (13.6525, 79.4005, "Basic Life Support (BLS)"),
            "AMB-104": (13.6285, 79.4220, "Advanced Life Support (ALS)"),
            "AMB-105": (13.6180, 79.3180, "Basic Life Support (BLS)"),
        }
        for amb in ambs:
            if amb.latitude is None and amb.vehicle_code in coords_map:
                lat, lon, cap = coords_map[amb.vehicle_code]
                amb.latitude = lat
                amb.longitude = lon
                amb.capability = cap
        db.commit()

    # Seed demo emergencies if none exist
    existing_em_count = db.query(models.Emergency).count()
    if existing_em_count == 0:
        logger.info("Seeding initial synthetic emergency incidents...")
        # Get hospitals map for linking
        hosp_map = {h.name: h.id for h in db.query(models.Hospital).all()}
        patient_user = db.query(models.User).filter(models.User.role == "patient").first()
        patient_id = patient_user.id if patient_user else None

        for i, em_data in enumerate(DEMO_EMERGENCIES, start=1):
            inc_id = f"INC-2026-{1000 + i}"
            selected_hosp_id = hosp_map.get(em_data["destination_hospital"])
            em = models.Emergency(
                incident_id=inc_id,
                caller_name=em_data["caller_name"],
                contact_number=em_data["contact_number"],
                emergency_type=em_data["emergency_type"],
                severity=em_data["severity"],
                pickup_location=em_data["pickup_location"],
                destination_hospital=em_data["destination_hospital"],
                selected_hospital_id=selected_hosp_id,
                latitude=em_data.get("latitude"),
                longitude=em_data.get("longitude"),
                patient_id=patient_id,
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
cors_env = os.getenv("CORS_ORIGINS", "")
configured_origins = [o.strip() for o in cors_env.split(",") if o.strip()]
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "*"  # In development, allow broad access for easy testing
]
if configured_origins:
    origins.extend(configured_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["System"])
def root():
    return {
        "status": "online",
        "service": "LifeLine AI — Smart Emergency Coordination API",
        "documentation": "/docs",
        "frontend_url": "http://localhost:5173",
        "version": "1.0.0"
    }


@app.get("/api/health", tags=["System"])
def health_check():
    return {
        "status": "healthy",
        "service": "LifeLine AI Command Center API",
        "version": "1.0.0",
        "module": "Module 3: Authentication & Emergency Command",
        "timestamp": datetime.utcnow().isoformat()
    }


# =========================================================================
# SECURITY & ROLE-BASED ACCESS CONTROL DEPENDENCIES
# =========================================================================

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    """Validate Bearer JWT token and return authenticated user."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or token is invalid. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user = db.query(models.User).filter(models.User.email == email.lower()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token was not found.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact support."
        )

    return user


def require_role(allowed_roles: List[str]):
    """Enforce role-based access control. Admins always bypass role checks."""
    def role_checker(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role != "admin" and current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker


# =========================================================================
# MODULE 3: AUTHENTICATION & ACCESS CONTROL ENDPOINTS
# =========================================================================

@app.post("/api/auth/register", response_model=schemas.LoginResponse, tags=["Authentication"])
def register_user(data: schemas.UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Self-register a new account.
    Restricted to 'patient', 'operator', or 'hospital' roles.
    'admin' role self-registration is strictly rejected with 403.
    """
    clean_email = data.email.strip().lower()

    # Re-verify admin self-registration block
    if data.role.strip().lower() == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator accounts cannot be self-registered. Administrative provisioning required."
        )

    # Check duplicate email
    existing = db.query(models.User).filter(models.User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address is already registered."
        )

    # Hash password securely with bcrypt
    hashed_pw = hash_password(data.password)

    new_user = models.User(
        email=clean_email,
        full_name=data.full_name.strip(),
        phone_number=data.phone_number.strip() if data.phone_number else None,
        password_hash=hashed_pw,
        role=data.role.strip().lower(),
        is_active=True,
        created_at=datetime.utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(f"Registered new {new_user.role} user: {new_user.email}")

    # Create access token immediately
    token, expires_in = create_access_token({
        "sub": new_user.email,
        "user_id": new_user.id,
        "role": new_user.role
    })

    return schemas.LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user=new_user
    )


@app.post("/api/auth/login", response_model=schemas.LoginResponse, tags=["Authentication"])
def login_user(data: schemas.UserLoginRequest, request: Request, db: Session = Depends(get_db)):
    """
    Authenticate user credentials, check brute-force rate limit, and issue JWT session.
    """
    clean_email = data.email.strip().lower()

    # Rate limiting key: combine client host and email
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"{client_ip}:{clean_email}"

    is_allowed, wait_secs = check_rate_limit(rate_limit_key)
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please wait {wait_secs} seconds before trying again."
        )

    user = db.query(models.User).filter(models.User.email == clean_email).first()
    if not user or not verify_password(data.password, user.password_hash):
        record_login_failure(rate_limit_key)
        # Avoid user enumeration with generic credential message
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact administrator."
        )

    # Successful login: reset brute-force tracking & record timestamp
    reset_login_failures(rate_limit_key)
    user.last_login = datetime.utcnow()
    db.commit()

    # Determine token lifespan based on remember_me
    delta = timedelta(minutes=REMEMBER_ME_EXPIRE_MINUTES if data.remember_me else DEFAULT_EXPIRE_MINUTES)
    token, expires_in = create_access_token({
        "sub": user.email,
        "user_id": user.id,
        "role": user.role
    }, expires_delta=delta)

    logger.info(f"User logged in successfully: {user.email} (Role: {user.role})")

    return schemas.LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        user=user
    )


@app.get("/api/auth/me", response_model=schemas.UserResponse, tags=["Authentication"])
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    """Return currently authenticated user's profile and verified role."""
    return current_user


@app.post("/api/auth/logout", tags=["Authentication"])
def logout_user():
    """Client clears auth token; server acknowledgment response."""
    return {"message": "Successfully signed out. Client session cleared."}


@app.post("/api/auth/forgot-password", response_model=schemas.ForgotPasswordResponse, tags=["Authentication"])
def forgot_password(data: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Generate a time-limited (15m), single-use reset token.
    In development mode, the reset token is returned directly with a clear explanation.
    """
    clean_email = data.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == clean_email).first()

    raw_token = None
    if user:
        raw_token = generate_reset_token()
        reset_entry = models.PasswordResetToken(
            user_id=user.id,
            token=raw_token,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
            used=False
        )
        db.add(reset_entry)
        db.commit()
        logger.info(f"Password reset token issued for user {clean_email}")

    # Standard security practice: return success message regardless of existence to prevent enumeration
    return schemas.ForgotPasswordResponse(
        message="If an account exists with this email address, password reset instructions have been generated.",
        reset_token=raw_token,
        is_dev_mode=True
    )


@app.post("/api/auth/reset-password", tags=["Authentication"])
def reset_password(data: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    """Verify reset token and update account password."""
    token_entry = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == data.token,
        models.PasswordResetToken.used == False
    ).first()

    if not token_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token is invalid or has already been used."
        )

    if token_entry.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired. Please request a new password reset."
        )

    user = db.query(models.User).filter(models.User.id == token_entry.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User associated with token not found."
        )

    # Update password and invalidate token
    user.password_hash = hash_password(data.new_password)
    token_entry.used = True
    db.commit()

    logger.info(f"Password successfully reset for user {user.email}")
    return {"message": "Password successfully reset. You may now sign in with your new credentials."}


@app.get("/api/auth/users", response_model=List[schemas.UserResponse], tags=["Authentication"])
def list_system_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"]))
):
    """Admin-only endpoint to inspect registered system users and their active roles."""
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


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
    patient_id: Optional[int] = Query(None, description="Filter by patient user ID"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List emergency incidents with optional filtering by status, severity, or patient ID."""
    query = db.query(models.Emergency)
    if status:
        query = query.filter(models.Emergency.status == status.lower())
    if severity:
        query = query.filter(models.Emergency.severity == severity.lower())
    if patient_id is not None:
        query = query.filter(models.Emergency.patient_id == patient_id)

    emergencies = query.order_by(models.Emergency.created_at.desc()).offset(offset).limit(limit).all()
    return emergencies


@app.post("/api/emergencies", response_model=schemas.EmergencyResponse, status_code=status.HTTP_201_CREATED, tags=["Emergencies"])
def create_emergency(payload: schemas.EmergencyCreate, db: Session = Depends(get_db)):
    """
    Register a new emergency incident.
    - Captures GPS coordinates or resolves them from pickup landmark.
    - Optionally triggers Smart Ambulance Allocation Engine immediately.
    """
    count = db.query(models.Emergency).count() + 1
    random_suffix = random.randint(100, 999)
    incident_id = f"INC-2026-{count:03d}{random_suffix}"

    # 1. Resolve coordinates
    lat = payload.latitude
    lon = payload.longitude
    if lat is None or lon is None:
        lat, lon = resolve_coordinates(payload.pickup_location)

    # 2. Match or link hospital
    hospital_id = payload.selected_hospital_id
    dest_hospital_name = payload.destination_hospital
    if not hospital_id and dest_hospital_name:
        match_hosp = db.query(models.Hospital).filter(
            func.lower(models.Hospital.name).contains(dest_hospital_name.lower().split()[0])
        ).first()
        if match_hosp:
            hospital_id = match_hosp.id
            dest_hospital_name = match_hosp.name

    emergency = models.Emergency(
        incident_id=incident_id,
        caller_name=payload.caller_name,
        contact_number=payload.contact_number,
        emergency_type=payload.emergency_type,
        severity=payload.severity,
        pickup_location=payload.pickup_location,
        destination_hospital=dest_hospital_name,
        selected_hospital_id=hospital_id,
        latitude=lat,
        longitude=lon,
        location_description=payload.location_description,
        patient_id=payload.patient_id,
        notes=payload.notes,
        status="pending",
        created_at=datetime.utcnow()
    )
    db.add(emergency)
    db.flush()

    masked_contact = payload.contact_number[:3] + "****" + payload.contact_number[-3:] if len(payload.contact_number) >= 6 else "***"
    log = models.IncidentActivityLog(
        emergency_id=emergency.id,
        action="CREATED",
        new_status="pending",
        description=f"Emergency incident {incident_id} registered with {payload.severity.upper()} severity for {payload.emergency_type} at {payload.pickup_location}. Caller: {payload.caller_name} ({masked_contact}).",
        actor="DISPATCH_COMMAND"
    )
    db.add(log)

    # 3. Optional Auto-Allocation
    if payload.auto_assign:
        available_ambs = db.query(models.Ambulance).filter(models.Ambulance.status == "available").all()
        if available_ambs:
            ranked = rank_ambulances_for_emergency(lat, lon, emergency.severity, available_ambs)
            if ranked:
                best = ranked[0]
                best_amb = db.query(models.Ambulance).filter(models.Ambulance.id == best["ambulance_id"]).with_for_update().first()
                if best_amb and best_amb.status == "available":
                    now = datetime.utcnow()
                    emergency.assigned_ambulance_id = best_amb.id
                    emergency.status = "assigned"
                    emergency.assigned_at = now
                    best_amb.status = "busy"
                    best_amb.current_incident_id = emergency.id

                    assign_log = models.IncidentActivityLog(
                        emergency_id=emergency.id,
                        action="ASSIGNED",
                        previous_status="pending",
                        new_status="assigned",
                        description=f"Smart Allocation: Unit {best_amb.vehicle_code} assigned automatically (Est. distance: {best['distance_km']} km, ETA: {best['eta_minutes']} min).",
                        actor="SMART_ALLOCATION_ENGINE"
                    )
                    db.add(assign_log)
        else:
            emergency.status = "no_ambulance_available"
            wait_log = models.IncidentActivityLog(
                emergency_id=emergency.id,
                action="WAITING",
                previous_status="pending",
                new_status="no_ambulance_available",
                description="Smart Allocation: No ambulances currently available in fleet. Request queued for dispatcher assignment.",
                actor="SMART_ALLOCATION_ENGINE"
            )
            db.add(wait_log)

    db.commit()
    db.refresh(emergency)
    logger.info(f"Registered emergency {incident_id} (Status: {emergency.status})")
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
    Assign an available ambulance to an active emergency (Path parameter interface).
    Enforces atomic concurrency safety and prevents double-booking.
    """
    with db.begin():
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Emergency incident with ID {emergency_id} does not exist."
            )

        if emergency.status in ["completed", "cancelled"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot assign ambulance to incident {emergency.incident_id} because it is already {emergency.status}."
            )

        if emergency.assigned_ambulance_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Emergency {emergency.incident_id} already has an assigned ambulance. Reassignment requires explicit dispatch override."
            )

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

        now = datetime.utcnow()
        previous_status = emergency.status
        emergency.assigned_ambulance_id = ambulance.id
        emergency.status = "assigned"
        emergency.assigned_at = now

        ambulance.status = "busy"
        ambulance.current_incident_id = emergency.id

        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="ASSIGNED",
            previous_status=previous_status,
            new_status="assigned",
            description=f"Ambulance {ambulance.vehicle_code} (Driver: {ambulance.driver_name}) dispatched and assigned to incident {emergency.incident_id}.",
            actor="DISPATCH_COMMAND"
        )
        db.add(log)

    db.refresh(emergency)
    logger.info(f"Assigned ambulance {ambulance.vehicle_code} to emergency {emergency.incident_id}")
    return emergency


@app.post("/api/emergencies/{emergency_id}/assign", response_model=schemas.EmergencyResponse, tags=["Dispatch"])
def assign_ambulance_manual(
    emergency_id: int,
    payload: schemas.EmergencyManualAssignRequest,
    db: Session = Depends(get_db)
):
    """
    Manual ambulance assignment with optional dispatcher override capability.
    Records manual assignment identity and reason in audit trail.
    """
    with db.begin():
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(status_code=404, detail="Emergency incident not found.")

        if emergency.status in ["completed", "cancelled"]:
            raise HTTPException(status_code=400, detail=f"Cannot assign to a {emergency.status} incident.")

        ambulance = db.query(models.Ambulance).filter(models.Ambulance.id == payload.ambulance_id).with_for_update().first()
        if not ambulance:
            raise HTTPException(status_code=404, detail="Ambulance unit not found.")

        if ambulance.status != "available" and not payload.override:
            raise HTTPException(
                status_code=409,
                detail=f"Ambulance {ambulance.vehicle_code} is currently {ambulance.status.upper()}. Set override=true to force assignment."
            )

        # If previous ambulance was assigned, release it
        if emergency.assigned_ambulance_id and emergency.assigned_ambulance_id != ambulance.id:
            old_amb = db.query(models.Ambulance).filter(models.Ambulance.id == emergency.assigned_ambulance_id).first()
            if old_amb:
                old_amb.status = "available"
                old_amb.current_incident_id = None

        now = datetime.utcnow()
        previous_status = emergency.status
        emergency.assigned_ambulance_id = ambulance.id
        emergency.status = "assigned"
        emergency.assigned_at = now

        ambulance.status = "busy"
        ambulance.current_incident_id = emergency.id

        actor = "DISPATCHER_OVERRIDE" if payload.override else "DISPATCH_COMMAND"
        desc = f"Ambulance {ambulance.vehicle_code} assigned manually."
        if payload.override:
            desc += " (Manual override applied by dispatcher)"
        if payload.notes:
            desc += f" Note: {payload.notes}"

        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="ASSIGNED",
            previous_status=previous_status,
            new_status="assigned",
            description=desc,
            actor=actor
        )
        db.add(log)

    db.refresh(emergency)
    return emergency


@app.post("/api/emergencies/{emergency_id}/auto-assign", response_model=schemas.AutoAssignResponse, tags=["Dispatch"])
def auto_assign_emergency(emergency_id: int, db: Session = Depends(get_db)):
    """
    Run Smart Ambulance Allocation Engine on an unassigned or waiting emergency incident.
    Ranks available units by estimated response time and capability.
    """
    with db.begin():
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(status_code=404, detail="Emergency incident not found.")

        if emergency.status in ["completed", "cancelled"]:
            raise HTTPException(status_code=400, detail=f"Incident is already {emergency.status}.")

        if emergency.assigned_ambulance_id is not None:
            amb = db.query(models.Ambulance).filter(models.Ambulance.id == emergency.assigned_ambulance_id).first()
            return schemas.AutoAssignResponse(
                assigned=True,
                ambulance_id=amb.id if amb else None,
                vehicle_code=amb.vehicle_code if amb else None,
                driver_name=amb.driver_name if amb else None,
                status=emergency.status,
                message=f"Incident already has assigned ambulance: {amb.vehicle_code if amb else 'Unit'}.",
                candidates_evaluated=0
            )

        lat = emergency.latitude
        lon = emergency.longitude
        if lat is None or lon is None:
            lat, lon = resolve_coordinates(emergency.pickup_location)

        available_ambs = db.query(models.Ambulance).filter(models.Ambulance.status == "available").all()
        if not available_ambs:
            emergency.status = "no_ambulance_available"
            log = models.IncidentActivityLog(
                emergency_id=emergency.id,
                action="WAITING",
                new_status="no_ambulance_available",
                description="Auto-allocation: No available ambulances within fleet. Request queued for dispatcher retry.",
                actor="SMART_ALLOCATION_ENGINE"
            )
            db.add(log)
            return schemas.AutoAssignResponse(
                assigned=False,
                status="no_ambulance_available",
                message="No ambulances currently available in the emergency fleet. Request placed in waiting queue.",
                candidates_evaluated=0
            )

        ranked = rank_ambulances_for_emergency(lat, lon, emergency.severity, available_ambs)
        best = ranked[0]
        best_amb = db.query(models.Ambulance).filter(models.Ambulance.id == best["ambulance_id"]).with_for_update().first()

        now = datetime.utcnow()
        previous_status = emergency.status
        emergency.assigned_ambulance_id = best_amb.id
        emergency.status = "assigned"
        emergency.assigned_at = now

        best_amb.status = "busy"
        best_amb.current_incident_id = emergency.id

        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="ASSIGNED",
            previous_status=previous_status,
            new_status="assigned",
            description=f"Smart Allocation: Unit {best_amb.vehicle_code} assigned (Est. distance: {best['distance_km']} km, ETA: {best['eta_minutes']} min, Capability: {best['capability']}).",
            actor="SMART_ALLOCATION_ENGINE"
        )
        db.add(log)

    db.refresh(emergency)
    return schemas.AutoAssignResponse(
        assigned=True,
        ambulance_id=best_amb.id,
        vehicle_code=best_amb.vehicle_code,
        driver_name=best_amb.driver_name,
        distance_km=best["distance_km"],
        eta_minutes=best["eta_minutes"],
        status="assigned",
        message=f"Unit {best_amb.vehicle_code} successfully allocated with estimated arrival in {best['eta_minutes']} minutes.",
        candidates_evaluated=len(available_ambs)
    )


@app.post("/api/emergencies/{emergency_id}/cancel", response_model=schemas.EmergencyResponse, tags=["Emergencies"])
def cancel_emergency(
    emergency_id: int,
    payload: Optional[schemas.EmergencyCancelRequest] = None,
    db: Session = Depends(get_db)
):
    """
    Cancel an emergency incident request.
    Releases assigned ambulance back to available status and records cancellation reason.
    """
    with db.begin():
        emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).with_for_update().first()
        if not emergency:
            raise HTTPException(status_code=404, detail="Emergency incident not found.")

        if emergency.status == "completed":
            raise HTTPException(status_code=400, detail="Completed emergencies cannot be cancelled.")

        if emergency.status == "cancelled":
            return emergency

        previous_status = emergency.status
        emergency.status = "cancelled"
        reason = payload.reason if payload and payload.reason else "Cancelled by requester or dispatcher"
        emergency.cancellation_reason = reason

        # Release ambulance if assigned
        amb_released_code = None
        if emergency.assigned_ambulance_id:
            amb = db.query(models.Ambulance).filter(models.Ambulance.id == emergency.assigned_ambulance_id).first()
            if amb:
                amb_released_code = amb.vehicle_code
                amb.status = "available"
                amb.current_incident_id = None

        desc = f"Incident {emergency.incident_id} cancelled. Reason: {reason}."
        if amb_released_code:
            desc += f" Unit {amb_released_code} returned to AVAILABLE fleet."

        log = models.IncidentActivityLog(
            emergency_id=emergency.id,
            action="CANCELLED",
            previous_status=previous_status,
            new_status="cancelled",
            description=desc,
            actor="DISPATCH_COMMAND"
        )
        db.add(log)

    db.refresh(emergency)
    logger.info(f"Emergency {emergency.incident_id} cancelled. Reason: {reason}")
    return emergency


@app.patch("/api/emergencies/{emergency_id}/status", response_model=schemas.EmergencyResponse, tags=["Emergencies"])
def update_emergency_status(emergency_id: int, payload: schemas.EmergencyStatusUpdate, db: Session = Depends(get_db)):
    """
    Progress emergency incident status across valid lifecycle transitions:
    pending -> assigned -> en_route -> arrived / arrived_at_scene -> patient_picked_up -> en_route_to_hospital -> arrived_at_hospital -> completed
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
        if current_status in ["completed", "cancelled"] and target_status not in ["completed", "cancelled"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{current_status.capitalize()} emergencies cannot be altered or reopened."
            )

        # Check if ambulance assigned before entering transit states
        if target_status in ["assigned", "en_route", "arrived", "arrived_at_scene", "patient_picked_up", "en_route_to_hospital"] and emergency.assigned_ambulance_id is None:
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
        emergency.updated_at = now

        # If completed or cancelled: record completion timestamp and release assigned ambulance
        ambulance_released_code = None
        if target_status in ["completed", "cancelled"]:
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


@app.get("/api/emergencies/{emergency_id}/tracking", response_model=schemas.EmergencyTrackingResponse, tags=["Tracking"])
def get_emergency_tracking(emergency_id: int, db: Session = Depends(get_db)):
    """
    Retrieve real-time tracking telemetry for an incident:
    - Pickup coordinates & landmark
    - Hospital destination coordinates & ER status
    - Assigned ambulance telemetry & current GPS
    - Route waypoints, distance (km), and ETA (mins)
    """
    emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency incident not found.")

    # 1. Resolve Pickup Coords
    p_lat = emergency.latitude
    p_lon = emergency.longitude
    if p_lat is None or p_lon is None:
        p_lat, p_lon = resolve_coordinates(emergency.pickup_location)

    # 2. Resolve Hospital Coords & Info
    h_lat, h_lon = 13.6360, 79.4085
    hosp_name = emergency.destination_hospital
    hosp_address = "Tirupati Emergency Network"
    hosp_contact = "+91 877 228 7777"
    hosp_id = emergency.selected_hospital_id

    if emergency.selected_hospital:
        hosp = emergency.selected_hospital
        h_lat = hosp.latitude
        h_lon = hosp.longitude
        hosp_name = hosp.name
        hosp_address = hosp.address
        hosp_contact = hosp.contact_number
        hosp_id = hosp.id
    elif emergency.destination_hospital:
        match_hosp = db.query(models.Hospital).filter(
            func.lower(models.Hospital.name).contains(emergency.destination_hospital.lower().split()[0])
        ).first()
        if match_hosp:
            h_lat = match_hosp.latitude
            h_lon = match_hosp.longitude
            hosp_name = match_hosp.name
            hosp_address = match_hosp.address
            hosp_contact = match_hosp.contact_number
            hosp_id = match_hosp.id
        else:
            h_lat, h_lon = resolve_coordinates(emergency.destination_hospital, fallback_lat=13.6360, fallback_lon=79.4085)

    # 3. Resolve Assigned Ambulance Info & Route
    amb = emergency.assigned_ambulance
    amb_coords = None
    route_waypoints = []
    hospital_route_waypoints = []
    distance_km = None
    eta_minutes = None
    routing_source = "OSRM"

    if amb:
        a_lat = amb.latitude
        a_lon = amb.longitude
        if a_lat is None or a_lon is None:
            a_lat, a_lon = resolve_coordinates(amb.current_location, fallback_lat=13.6365, fallback_lon=79.4090)
        amb_coords = [a_lat, a_lon]

        # Route from Ambulance to Pickup Location
        route_data = get_route_geometry(a_lat, a_lon, p_lat, p_lon)
        route_waypoints = route_data["waypoints"]
        distance_km = route_data["distance_km"]
        eta_minutes = route_data["eta_minutes"]
        routing_source = route_data["source"]

    # Route from Pickup Location to Hospital
    h_route = get_route_geometry(p_lat, p_lon, h_lat, h_lon)
    hospital_route_waypoints = h_route["waypoints"]

    if distance_km is None:
        distance_km = h_route["distance_km"]
        eta_minutes = h_route["eta_minutes"]
        routing_source = h_route["source"]

    return schemas.EmergencyTrackingResponse(
        emergency_id=emergency.id,
        incident_id=emergency.incident_id,
        status=emergency.status,
        severity=emergency.severity,
        emergency_type=emergency.emergency_type,
        caller_name=emergency.caller_name,
        contact_number=emergency.contact_number,
        pickup_location=emergency.pickup_location,
        pickup_coords=[p_lat, p_lon],
        destination_hospital=hosp_name,
        hospital_coords=[h_lat, h_lon],
        hospital_id=hosp_id,
        hospital_name=hosp_name,
        hospital_address=hosp_address,
        hospital_contact=hosp_contact,
        assigned_ambulance=amb,
        ambulance_coords=amb_coords,
        route_waypoints=route_waypoints,
        hospital_route_waypoints=hospital_route_waypoints,
        distance_km=distance_km,
        eta_minutes=eta_minutes,
        routing_source=routing_source,
        is_simulation_active=False,
        activity_logs=emergency.activity_logs or [],
        created_at=emergency.created_at,
        assigned_at=emergency.assigned_at,
        completed_at=emergency.completed_at
    )


# =========================================================================
# MODULE 4: HOSPITALS ENDPOINTS
# =========================================================================

@app.get("/api/hospitals", response_model=List[schemas.HospitalResponse], tags=["Hospitals"])
def list_hospitals(db: Session = Depends(get_db)):
    """List all registered and configured hospital facilities."""
    return db.query(models.Hospital).order_by(models.Hospital.name.asc()).all()


@app.get("/api/hospitals/nearby", response_model=List[schemas.HospitalNearbyResponse], tags=["Hospitals"])
def get_nearby_hospitals(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    radius_km: float = Query(25.0, ge=1.0, le=100.0),
    db: Session = Depends(get_db)
):
    """Find hospitals within geographical radius, ranked by road travel distance and ETA."""
    hospitals = db.query(models.Hospital).all()
    results = []
    for h in hospitals:
        dist = haversine_distance(lat, lon, h.latitude, h.longitude)
        if dist <= radius_km:
            road_dist = round(dist * 1.3, 2)
            eta = round(max(1.0, (road_dist / 40.0) * 60.0), 1)
            results.append({
                "id": h.id,
                "hospital_code": h.hospital_code,
                "name": h.name,
                "address": h.address,
                "latitude": h.latitude,
                "longitude": h.longitude,
                "contact_number": h.contact_number,
                "trauma_level": h.trauma_level,
                "available_services": h.available_services,
                "operational_status": h.operational_status,
                "total_er_bays": h.total_er_bays,
                "available_er_bays": h.available_er_bays,
                "created_at": h.created_at,
                "distance_km": road_dist,
                "eta_minutes": eta,
                "route_geometry": None
            })
    results.sort(key=lambda x: x["distance_km"])
    return results


@app.post("/api/emergencies/{emergency_id}/select-hospital", response_model=schemas.EmergencyResponse, tags=["Dispatch"])
def select_emergency_hospital(
    emergency_id: int,
    hospital_id: int = Query(..., description="Target Hospital ID"),
    db: Session = Depends(get_db)
):
    """Associate or update the destination hospital for an active emergency incident."""
    emergency = db.query(models.Emergency).filter(models.Emergency.id == emergency_id).first()
    if not emergency:
        raise HTTPException(status_code=404, detail="Emergency incident not found.")
    hospital = db.query(models.Hospital).filter(models.Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")

    emergency.selected_hospital_id = hospital.id
    emergency.destination_hospital = hospital.name
    log = models.IncidentActivityLog(
        emergency_id=emergency.id,
        action="HOSPITAL_SELECTED",
        new_status=emergency.status,
        description=f"Destination facility set to {hospital.name} ({hospital.trauma_level}).",
        actor="DISPATCH_COMMAND"
    )
    db.add(log)
    db.commit()
    db.refresh(emergency)
    return emergency


# =========================================================================
# AMBULANCES ENDPOINTS
# =========================================================================

@app.get("/api/ambulances", response_model=List[schemas.AmbulanceResponse], tags=["Ambulances"])
def list_ambulances(
    status: Optional[str] = Query(None, description="Filter by status: available or busy"),
    db: Session = Depends(get_db)
):
    """List ambulance fleet members, driver, location, and availability."""
    query = db.query(models.Ambulance)
    if status:
        query = query.filter(models.Ambulance.status == status.lower())
    return query.order_by(models.Ambulance.vehicle_code.asc()).all()


@app.get("/api/ambulances/available", response_model=List[schemas.AmbulanceResponse], tags=["Ambulances"])
def list_available_ambulances(db: Session = Depends(get_db)):
    """List only available emergency units in fleet."""
    return db.query(models.Ambulance).filter(models.Ambulance.status == "available").all()


@app.get("/api/ambulances/{ambulance_id}", response_model=schemas.AmbulanceResponse, tags=["Ambulances"])
def get_ambulance(ambulance_id: int, db: Session = Depends(get_db)):
    """Retrieve details and live telemetry for a specific ambulance unit."""
    amb = db.query(models.Ambulance).filter(models.Ambulance.id == ambulance_id).first()
    if not amb:
        raise HTTPException(status_code=404, detail="Ambulance unit not found.")
    return amb


@app.patch("/api/ambulances/{ambulance_id}/location", response_model=schemas.AmbulanceResponse, tags=["Ambulances"])
def update_ambulance_location(
    ambulance_id: int,
    payload: schemas.AmbulanceLocationUpdate,
    db: Session = Depends(get_db)
):
    """Update real-time GPS coordinates and landmark location for an ambulance."""
    amb = db.query(models.Ambulance).filter(models.Ambulance.id == ambulance_id).first()
    if not amb:
        raise HTTPException(status_code=404, detail="Ambulance unit not found.")
    amb.latitude = payload.latitude
    amb.longitude = payload.longitude
    if payload.current_location:
        amb.current_location = payload.current_location
    amb.last_location_update = datetime.utcnow()
    db.commit()
    db.refresh(amb)
    return amb


@app.patch("/api/ambulances/{ambulance_id}/status", response_model=schemas.AmbulanceResponse, tags=["Ambulances"])
def update_ambulance_status(
    ambulance_id: int,
    payload: schemas.AmbulanceStatusUpdate,
    db: Session = Depends(get_db)
):
    """Update ambulance operational availability status."""
    amb = db.query(models.Ambulance).filter(models.Ambulance.id == ambulance_id).first()
    if not amb:
        raise HTTPException(status_code=404, detail="Ambulance unit not found.")
    target_status = payload.status.lower()
    amb.status = target_status
    if target_status == "available":
        amb.current_incident_id = None
    db.commit()
    db.refresh(amb)
    return amb


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
        latitude=payload.latitude,
        longitude=payload.longitude,
        capability=payload.capability or "Advanced Life Support (ALS)",
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

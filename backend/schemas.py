from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SeverityEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class EmergencyStatusEnum(str, Enum):
    REQUESTED = "requested"
    PENDING = "pending"
    ASSIGNMENT_PENDING = "assignment_pending"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ARRIVED = "arrived"
    ARRIVED_AT_SCENE = "arrived_at_scene"
    PATIENT_PICKED_UP = "patient_picked_up"
    EN_ROUTE_TO_HOSPITAL = "en_route_to_hospital"
    ARRIVED_AT_HOSPITAL = "arrived_at_hospital"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_AMBULANCE_AVAILABLE = "no_ambulance_available"
    ASSIGNMENT_FAILED = "assignment_failed"


class AmbulanceStatusEnum(str, Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    AT_SCENE = "at_scene"
    TRANSPORTING = "transporting"
    AT_HOSPITAL = "at_hospital"
    OUT_OF_SERVICE = "out_of_service"


# --- Hospital Schemas ---

class HospitalBase(BaseModel):
    hospital_code: str = Field(..., min_length=2, max_length=32, description="Unique hospital code e.g. HOSP-001")
    name: str = Field(..., min_length=2, max_length=150, description="Full hospital facility name")
    address: str = Field(..., min_length=2, max_length=255, description="Street address")
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    contact_number: Optional[str] = Field(None, max_length=30)
    trauma_level: str = Field("Level 1", max_length=20)
    available_services: Optional[str] = Field(None)
    operational_status: str = Field("operational", max_length=20)
    total_er_bays: int = Field(20, ge=0)
    available_er_bays: int = Field(5, ge=0)


class HospitalCreate(HospitalBase):
    pass


class HospitalResponse(HospitalBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HospitalNearbyResponse(HospitalResponse):
    distance_km: float
    eta_minutes: float
    route_geometry: Optional[List[List[float]]] = None


# --- Ambulance Schemas ---

class AmbulanceBase(BaseModel):
    vehicle_code: str = Field(..., min_length=2, max_length=32, description="Unique vehicle code, e.g. AMB-101")
    driver_name: str = Field(..., min_length=2, max_length=100, description="Driver's full name")
    contact_number: Optional[str] = Field(None, max_length=30, description="Driver phone number")
    current_location: Optional[str] = Field(None, max_length=255, description="Station or landmark location")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capability: Optional[str] = "Advanced Life Support (ALS)"
    last_location_update: Optional[datetime] = None

    @field_validator("vehicle_code")
    @classmethod
    def clean_vehicle_code(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Vehicle code cannot be empty")
        return cleaned


class AmbulanceCreate(AmbulanceBase):
    pass


class AmbulanceResponse(AmbulanceBase):
    id: int
    status: str
    current_incident_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AmbulanceLocationUpdate(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Current latitude")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Current longitude")
    current_location: Optional[str] = Field(None, max_length=255, description="Address or landmark")


class AmbulanceStatusUpdate(BaseModel):
    status: str = Field(..., description="Target status: available, busy, assigned, en_route, at_scene, transporting, at_hospital, out_of_service")
    notes: Optional[str] = None


# --- Activity Log Schemas ---

class ActivityLogResponse(BaseModel):
    id: int
    emergency_id: int
    timestamp: datetime
    action: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    description: str
    actor: str

    model_config = ConfigDict(from_attributes=True)


# --- Emergency Schemas ---

class EmergencyCreate(BaseModel):
    caller_name: str = Field(..., min_length=2, max_length=100, description="Patient or caller name")
    contact_number: str = Field(..., min_length=7, max_length=30, description="Contact phone number")
    emergency_type: str = Field(..., min_length=2, max_length=100, description="Cardiac, Trauma, Respiratory, etc.")
    severity: str = Field(..., description="low, medium, high, critical")
    pickup_location: str = Field(..., min_length=3, max_length=255, description="Pickup address or landmark")
    destination_hospital: str = Field(..., min_length=3, max_length=255, description="Hospital destination")
    notes: Optional[str] = Field(None, max_length=1000, description="Optional triage notes or caller remarks")
    latitude: Optional[float] = Field(None, description="GPS Latitude")
    longitude: Optional[float] = Field(None, description="GPS Longitude")
    location_description: Optional[str] = Field(None, max_length=255, description="Building, landmark or floor")
    patient_id: Optional[int] = None
    selected_hospital_id: Optional[int] = None
    auto_assign: Optional[bool] = False

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if v_clean == "moderate":
            return "medium"
        valid = [s.value for s in SeverityEnum]
        if v_clean not in valid:
            raise ValueError(f"Invalid severity '{v}'. Must be one of: {', '.join(valid)}")
        return v_clean

    @field_validator("caller_name", "pickup_location", "destination_hospital", "emergency_type")
    @classmethod
    def strip_strings(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty or blank")
        return s


class EmergencyStatusUpdate(BaseModel):
    status: str = Field(..., description="Target status: assigned, en_route, arrived, completed, etc.")
    notes: Optional[str] = Field(None, max_length=500, description="Optional status transition remark")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v_clean = v.strip().lower()
        valid = [s.value for s in EmergencyStatusEnum]
        if v_clean not in valid:
            raise ValueError(f"Invalid status '{v}'. Must be one of: {', '.join(valid)}")
        return v_clean


class EmergencyCancelRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500, description="Optional cancellation reason")


class EmergencyManualAssignRequest(BaseModel):
    ambulance_id: int = Field(..., description="Target ambulance ID")
    override: Optional[bool] = Field(False, description="Dispatcher override flag")
    notes: Optional[str] = Field(None, max_length=500, description="Dispatcher reason or note")


class EmergencyResponse(BaseModel):
    id: int
    incident_id: str
    caller_name: str
    contact_number: str
    emergency_type: str
    severity: str
    pickup_location: str
    destination_hospital: str
    notes: Optional[str] = None
    status: str
    assigned_ambulance_id: Optional[int] = None
    assigned_ambulance: Optional[AmbulanceResponse] = None
    patient_id: Optional[int] = None
    selected_hospital_id: Optional[int] = None
    selected_hospital: Optional[HospitalResponse] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_description: Optional[str] = None
    cancellation_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmergencyDetailResponse(EmergencyResponse):
    activity_logs: List[ActivityLogResponse] = []
    model_config = ConfigDict(from_attributes=True)


class AutoAssignResponse(BaseModel):
    assigned: bool
    ambulance_id: Optional[int] = None
    vehicle_code: Optional[str] = None
    driver_name: Optional[str] = None
    distance_km: Optional[float] = None
    eta_minutes: Optional[float] = None
    status: str
    message: str
    candidates_evaluated: int = 0


class EmergencyTrackingResponse(BaseModel):
    emergency_id: int
    incident_id: str
    status: str
    severity: str
    emergency_type: str
    caller_name: str
    contact_number: str
    pickup_location: str
    pickup_coords: Optional[List[float]] = None
    destination_hospital: str
    hospital_coords: Optional[List[float]] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    hospital_address: Optional[str] = None
    hospital_contact: Optional[str] = None
    assigned_ambulance: Optional[AmbulanceResponse] = None
    ambulance_coords: Optional[List[float]] = None
    route_waypoints: List[List[float]] = []
    hospital_route_waypoints: List[List[float]] = []
    distance_km: Optional[float] = None
    eta_minutes: Optional[float] = None
    routing_source: str = "OSRM"
    is_simulation_active: bool = False
    activity_logs: List[ActivityLogResponse] = []
    created_at: datetime
    assigned_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# --- Dashboard Stats Schemas ---

class DashboardStatsResponse(BaseModel):
    total_emergencies: int
    active_emergencies: int
    available_ambulances: int
    busy_ambulances: int
    completed_emergencies: int
    pending_emergencies: int
    critical_emergencies: int
    high_emergencies: int


# --- Module 2: Traffic Preemption Schemas ---

class PreemptionRequestSchema(BaseModel):
    intersection_id: str = Field(..., description="Target intersection ID, e.g. INT-101")
    ambulance_code: str = Field(..., description="Requesting vehicle code, e.g. AMB-101")
    direction: Optional[str] = Field("EW", description="Approach direction axis: NS or EW")
    severity: Optional[str] = Field("critical", description="Emergency severity for arbitration")


class PreemptionClearSchema(BaseModel):
    intersection_id: str = Field(..., description="Intersection ID to clear preemption")
    ambulance_code: Optional[str] = Field(None, description="Optional ambulance code that passed")


class SimulationControlSchema(BaseModel):
    is_running: Optional[bool] = Field(None, description="Start/pause simulation clock")
    speed: Optional[int] = Field(None, ge=1, le=10, description="Speed multiplier: 1x, 2x, 5x")
    auto_preemption: Optional[bool] = Field(None, description="Enable automatic distance-based trigger")


class SimulationResetSchema(BaseModel):
    scenario_id: Optional[str] = Field("svims_critical", description="Scenario: svims_critical, dual_conflict, multi_fleet")


# --- Module 3: Authentication Schemas ---

class UserRoleEnum(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    HOSPITAL = "hospital"
    PATIENT = "patient"


class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100, description="Full legal name")
    email: str = Field(..., min_length=5, max_length=255, description="Valid email address")
    phone_number: Optional[str] = Field(None, max_length=30, description="Phone contact")
    password: str = Field(..., min_length=6, max_length=128, description="Account password (min 6 chars)")
    role: str = Field("patient", description="User role: patient, operator, or hospital")
    terms_accepted: bool = Field(True, description="Terms acceptance status")

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("Invalid email format.")
        return cleaned

    @field_validator("full_name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Full name cannot be empty.")
        return cleaned

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        role_clean = v.strip().lower()
        # Self-registration is strictly restricted to patient, operator, or hospital
        allowed_self_roles = ["patient", "operator", "hospital"]
        if role_clean == "admin":
            raise ValueError("Administrator accounts cannot be self-registered. Please contact system admin.")
        if role_clean not in allowed_self_roles:
            raise ValueError(f"Role must be one of: {', '.join(allowed_self_roles)}")
        return role_clean


class UserLoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)
    remember_me: Optional[bool] = False

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone_number: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return v.strip().lower()


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_token: Optional[str] = None
    is_dev_mode: bool = True


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6, max_length=128)


from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator


class SeverityEnum(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EmergencyStatusEnum(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    EN_ROUTE = "en_route"
    ARRIVED = "arrived"
    COMPLETED = "completed"


class AmbulanceStatusEnum(str, Enum):
    AVAILABLE = "available"
    BUSY = "busy"


# --- Ambulance Schemas ---

class AmbulanceBase(BaseModel):
    vehicle_code: str = Field(..., min_length=2, max_length=32, description="Unique vehicle code, e.g. AMB-101")
    driver_name: str = Field(..., min_length=2, max_length=100, description="Driver's full name")
    contact_number: Optional[str] = Field(None, max_length=30, description="Driver phone number")
    current_location: Optional[str] = Field(None, max_length=255, description="Station or landmark location")

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
    status: AmbulanceStatusEnum
    current_incident_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        v_clean = v.strip().lower()
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
    status: str = Field(..., description="Target status: assigned, en_route, arrived, completed")
    notes: Optional[str] = Field(None, max_length=500, description="Optional status transition remark")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        v_clean = v.strip().lower()
        valid = [s.value for s in EmergencyStatusEnum]
        if v_clean not in valid:
            raise ValueError(f"Invalid status '{v}'. Must be one of: {', '.join(valid)}")
        return v_clean


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
    created_at: datetime
    assigned_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EmergencyDetailResponse(EmergencyResponse):
    activity_logs: List[ActivityLogResponse] = []
    model_config = ConfigDict(from_attributes=True)


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

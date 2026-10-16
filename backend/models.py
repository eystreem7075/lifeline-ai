from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship

from database import Base


class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    hospital_code = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    contact_number = Column(String(30), nullable=True)
    trauma_level = Column(String(20), default="Level 1", nullable=False)  # Level 1, Level 2, General
    available_services = Column(Text, nullable=True)  # e.g. Cardiology, Neuro, Trauma ICU, Burn Unit
    operational_status = Column(String(20), default="operational", nullable=False)  # operational, capacity_warning, divert
    total_er_bays = Column(Integer, default=20)
    available_er_bays = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    emergencies = relationship("Emergency", back_populates="selected_hospital")


class Emergency(Base):
    __tablename__ = "emergencies"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(String(32), unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    caller_name = Column(String(100), nullable=False)
    contact_number = Column(String(30), nullable=False)
    emergency_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)  # 'low', 'medium', 'high', 'critical'
    pickup_location = Column(String(255), nullable=False)
    destination_hospital = Column(String(255), nullable=False)
    selected_hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="SET NULL"), nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_description = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(30), default="pending", nullable=False)  # pending, assigned, en_route, arrived_at_scene, patient_picked_up, en_route_to_hospital, arrived_at_hospital, completed, cancelled, no_ambulance_available
    assigned_ambulance_id = Column(Integer, ForeignKey("ambulances.id", ondelete="SET NULL"), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    assigned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    patient = relationship("User", foreign_keys=[patient_id])
    selected_hospital = relationship("Hospital", foreign_keys=[selected_hospital_id], back_populates="emergencies")
    assigned_ambulance = relationship("Ambulance", foreign_keys=[assigned_ambulance_id], back_populates="emergencies")
    activity_logs = relationship(
        "IncidentActivityLog",
        back_populates="emergency",
        cascade="all, delete-orphan",
        order_by="desc(IncidentActivityLog.timestamp)"
    )


class Ambulance(Base):
    __tablename__ = "ambulances"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_code = Column(String(32), unique=True, index=True, nullable=False)
    driver_name = Column(String(100), nullable=False)
    contact_number = Column(String(30), nullable=True)
    status = Column(String(30), default="available", nullable=False)  # available, assigned, en_route, at_scene, transporting, at_hospital, busy, out_of_service
    current_location = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    capability = Column(String(60), default="Advanced Life Support (ALS)", nullable=False)
    last_location_update = Column(DateTime, default=datetime.utcnow, nullable=False)
    current_incident_id = Column(Integer, ForeignKey("emergencies.id", ondelete="SET NULL", use_alter=True, name="fk_ambulance_incident"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    emergencies = relationship("Emergency", foreign_keys=[Emergency.assigned_ambulance_id], back_populates="assigned_ambulance")
    current_incident = relationship("Emergency", foreign_keys=[current_incident_id], post_update=True)


class IncidentActivityLog(Base):
    __tablename__ = "incident_activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    emergency_id = Column(Integer, ForeignKey("emergencies.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    action = Column(String(50), nullable=False)  # CREATED, ASSIGNED, STATUS_CHANGE, COMPLETED
    previous_status = Column(String(20), nullable=True)
    new_status = Column(String(20), nullable=True)
    description = Column(Text, nullable=False)
    actor = Column(String(50), default="DISPATCH_COMMAND", nullable=False)

    # Relationships
    emergency = relationship("Emergency", back_populates="activity_logs")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    phone_number = Column(String(30), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(30), default="patient", nullable=False)  # admin, operator, hospital, patient
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    reset_tokens = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(PasswordResetToken.created_at)"
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(128), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="reset_tokens")


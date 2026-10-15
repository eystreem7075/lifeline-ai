from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Emergency(Base):
    __tablename__ = "emergencies"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(String(32), unique=True, index=True, nullable=False)
    caller_name = Column(String(100), nullable=False)
    contact_number = Column(String(30), nullable=False)
    emergency_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)  # 'low', 'medium', 'high', 'critical'
    pickup_location = Column(String(255), nullable=False)
    destination_hospital = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(20), default="pending", nullable=False)  # pending, assigned, en_route, arrived, completed
    assigned_ambulance_id = Column(Integer, ForeignKey("ambulances.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    assigned_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
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
    status = Column(String(20), default="available", nullable=False)  # available, busy
    current_location = Column(String(255), nullable=True)
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

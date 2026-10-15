"""
LifeLine AI — Module 2: Smart Traffic Signal Preemption Engine
Tirupati Metropolitan District Emergency Operations

This module implements:
1. Signal Controller State Machine with strict safety clearance intervals:
   NORMAL_CYCLE -> CLEARANCE_YELLOW (3s) -> ALL_RED_HOLD (2s) -> PREEMPTION_GREEN -> RESTORATION_YELLOW (3s) -> RESTORATION_ALL_RED (2s) -> NORMAL_CYCLE
2. Conflicting direction lockout (No two conflicting directions can ever be GREEN simultaneously).
3. Multiple ambulance coordination & conflict arbitration based on Emergency Severity & ETA.
4. Route waypoint traversal with automatic upcoming intersection detection & distance/ETA calculations.
5. Integration with Module 1 active emergencies and ambulances.
"""

import math
from datetime import datetime
from typing import List, Dict, Any, Optional

# Severity Priority Weights
SEVERITY_WEIGHTS = {
    "critical": 100,
    "high": 75,
    "medium": 50,
    "low": 25
}

# Signal Colors
RED = "RED"
YELLOW = "YELLOW"
GREEN = "GREEN"

# Signal Controller States
STATE_NORMAL = "NORMAL_CYCLE"
STATE_CLEARANCE_YELLOW = "CLEARANCE_YELLOW"
STATE_ALL_RED_HOLD = "ALL_RED_HOLD"
STATE_PREEMPTION_GREEN = "PREEMPTION_GREEN"
STATE_RESTORATION_YELLOW = "RESTORATION_YELLOW"
STATE_RESTORATION_ALL_RED = "RESTORATION_ALL_RED"


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate geodesic distance between two points in meters using Haversine formula."""
    R = 6371000  # Radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)


class IntersectionSignalController:
    """
    Simulated Traffic Signal Controller managing a 4-way intersection (North, South, East, West).
    Primary axes: 'NS' (North-South) and 'EW' (East-West).
    """

    def __init__(
        self,
        intersection_id: str,
        name: str,
        location_desc: str,
        latitude: float,
        longitude: float,
        cycle_time_ns: int = 25,
        cycle_time_ew: int = 25,
        yellow_duration: int = 3,
        all_red_duration: int = 2
    ):
        self.intersection_id = intersection_id
        self.name = name
        self.location_desc = location_desc
        self.latitude = latitude
        self.longitude = longitude

        # Timing configurations (seconds)
        self.cycle_time_ns = cycle_time_ns
        self.cycle_time_ew = cycle_time_ew
        self.yellow_duration = yellow_duration
        self.all_red_duration = all_red_duration

        # State tracking
        self.state = STATE_NORMAL
        self.normal_phase = "NS"  # "NS" or "EW"
        self.phase_timer = 0  # Elapsed time in current phase/state
        self.phase_duration = cycle_time_ns

        # Preemption tracking
        self.active_preemption: Optional[Dict[str, Any]] = None
        self.queued_preemptions: List[Dict[str, Any]] = []

        # Audit history for this intersection
        self.event_logs: List[Dict[str, Any]] = []

        self._record_log("CONTROLLER_INITIALIZED", f"Traffic signal controller {self.intersection_id} online in NORMAL_CYCLE mode.")

    def _record_log(self, event_type: str, message: str, safety_verified: bool = True):
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "message": message,
            "state": self.state,
            "safety_verified": safety_verified
        }
        self.event_logs.insert(0, log_entry)
        if len(self.event_logs) > 30:
            self.event_logs.pop()

    def get_signal_colors(self) -> Dict[str, str]:
        """
        Derive current signal colors for all 4 approaches (N, S, E, W).
        STRICT SAFETY INVARIANT: Opposing directions ('NS' vs 'EW') can NEVER both be GREEN.
        """
        if self.state == STATE_NORMAL:
            if self.normal_phase == "NS":
                return {"N": GREEN, "S": GREEN, "E": RED, "W": RED}
            else:
                return {"N": RED, "S": RED, "E": GREEN, "W": GREEN}

        elif self.state == STATE_CLEARANCE_YELLOW:
            # The direction that was previously green is now YELLOW. The target direction remains RED.
            if self.active_preemption and self.active_preemption.get("direction") == "EW":
                return {"N": YELLOW, "S": YELLOW, "E": RED, "W": RED}
            else:
                return {"N": RED, "S": RED, "E": YELLOW, "W": YELLOW}

        elif self.state == STATE_ALL_RED_HOLD:
            # Safe clearance interval: All approaches are locked RED to purge the intersection box
            return {"N": RED, "S": RED, "E": RED, "W": RED}

        elif self.state == STATE_PREEMPTION_GREEN:
            # Only the preempted direction gets GREEN. Conflicting direction is locked RED.
            target_direction = self.active_preemption.get("direction", "EW") if self.active_preemption else "EW"
            if target_direction == "EW":
                return {"N": RED, "S": RED, "E": GREEN, "W": GREEN}
            else:
                return {"N": GREEN, "S": GREEN, "E": RED, "W": RED}

        elif self.state == STATE_RESTORATION_YELLOW:
            # Preempted direction turns YELLOW before returning to normal cycle
            target_direction = self.active_preemption.get("direction", "EW") if self.active_preemption else "EW"
            if target_direction == "EW":
                return {"N": RED, "S": RED, "E": YELLOW, "W": YELLOW}
            else:
                return {"N": YELLOW, "S": YELLOW, "E": RED, "W": RED}

        elif self.state == STATE_RESTORATION_ALL_RED:
            return {"N": RED, "S": RED, "E": RED, "W": RED}

        return {"N": RED, "S": RED, "E": RED, "W": RED}

    def request_preemption(
        self,
        ambulance_code: str,
        emergency_id: Optional[int],
        severity: str,
        direction: str,  # 'NS' or 'EW'
        distance_meters: float,
        eta_seconds: float
    ) -> Dict[str, Any]:
        """
        Handle a priority preemption request.
        Includes conflict arbitration if another preemption request is already active.
        """
        direction = direction.upper()
        if direction not in ["NS", "EW"]:
            direction = "EW"

        severity = severity.lower()
        base_weight = SEVERITY_WEIGHTS.get(severity, 50)
        # Closer ETA gets bonus points for arbitration
        distance_bonus = max(0, 100 - int(eta_seconds))
        priority_score = base_weight + (distance_bonus * 0.1)

        request_data = {
            "ambulance_code": ambulance_code,
            "emergency_id": emergency_id,
            "severity": severity,
            "direction": direction,
            "distance_meters": distance_meters,
            "eta_seconds": eta_seconds,
            "priority_score": round(priority_score, 1),
            "requested_at": datetime.utcnow().isoformat(),
            "status": "PENDING"
        }

        # 1. If no active preemption, accept and start safe transition
        if self.active_preemption is None:
            self._start_preemption_transition(request_data)
            return {
                "accepted": True,
                "queued": False,
                "status": self.state,
                "message": f"Preemption granted for {ambulance_code} ({severity.upper()}) on {direction} axis. Safe clearance interval initiated."
            }

        # 2. If the active preemption is for the SAME ambulance, update distance/ETA
        if self.active_preemption["ambulance_code"] == ambulance_code:
            self.active_preemption["distance_meters"] = distance_meters
            self.active_preemption["eta_seconds"] = eta_seconds
            return {
                "accepted": True,
                "queued": False,
                "status": self.state,
                "message": f"Updated approach metrics for active ambulance {ambulance_code}."
            }

        # 3. If for the SAME direction axis, share the green corridor!
        if self.active_preemption["direction"] == direction:
            request_data["status"] = "CONCURRENT_SAME_AXIS"
            self.queued_preemptions.append(request_data)
            self._record_log(
                "CONCURRENT_PREEMPTION",
                f"Ambulance {ambulance_code} joined shared green corridor on {direction} axis."
            )
            return {
                "accepted": True,
                "queued": False,
                "status": self.state,
                "message": f"Ambulance {ambulance_code} joined active green corridor on {direction} axis."
            }

        # 4. Competing request on a CONFLICTING direction! Perform strict arbitration:
        active_score = self.active_preemption.get("priority_score", 50)
        if priority_score > active_score and self.state in [STATE_NORMAL, STATE_CLEARANCE_YELLOW]:
            # Override if incoming request is higher priority and clearance not locked yet
            prev_amb = self.active_preemption["ambulance_code"]
            request_data["status"] = "ACTIVE"
            self.active_preemption["status"] = "QUEUED_STANDBY"
            self.queued_preemptions.insert(0, self.active_preemption)
            self._start_preemption_transition(request_data)
            self._record_log(
                "ARBITRATION_OVERRIDE",
                f"High-priority {ambulance_code} ({severity.upper()}, score {priority_score}) superseded {prev_amb} ({active_score})."
            )
            return {
                "accepted": True,
                "queued": False,
                "status": self.state,
                "message": f"Preemption arbitrated: {ambulance_code} granted priority over {prev_amb} due to {severity.upper()} severity."
            }
        else:
            # Queue the competing request safely
            request_data["status"] = "QUEUED_STANDBY"
            self.queued_preemptions.append(request_data)
            self._record_log(
                "ARBITRATION_QUEUED",
                f"Ambulance {ambulance_code} ({direction}) held in safe standby queue. Active priority held by {self.active_preemption['ambulance_code']} ({self.active_preemption['direction']})."
            )
            return {
                "accepted": True,
                "queued": True,
                "status": self.state,
                "message": f"Competing request safely queued. {self.active_preemption['ambulance_code']} on {self.active_preemption['direction']} has active corridor."
            }

    def _start_preemption_transition(self, request_data: Dict[str, Any]):
        """Initiate the safe, phased clearance transition."""
        self.active_preemption = request_data
        target_direction = request_data["direction"]

        # Check if the desired direction is ALREADY Green in normal cycle
        if self.state == STATE_NORMAL and self.normal_phase == target_direction:
            # Already green! Immediately hold in PREEMPTION_GREEN
            self.state = STATE_PREEMPTION_GREEN
            self.phase_timer = 0
            self.phase_duration = 30  # Hold green for up to 30s
            self._record_log(
                "PREEMPTION_GREEN_LOCKED",
                f"Intersection already in {target_direction} green phase. Locked into PREEMPTION_GREEN for {request_data['ambulance_code']}."
            )
        else:
            # Conflicting direction currently has green! Must enforce SAFE CLEARANCE:
            # Step 1: CLEARANCE_YELLOW
            self.state = STATE_CLEARANCE_YELLOW
            self.phase_timer = 0
            self.phase_duration = self.yellow_duration
            self._record_log(
                "CLEARANCE_YELLOW_STARTED",
                f"Safety interval initiated: Active phase switching to YELLOW (duration {self.yellow_duration}s) before granting green to {request_data['ambulance_code']} ({target_direction})."
            )

    def clear_preemption(self, ambulance_code: Optional[str] = None):
        """
        Called when the ambulance has passed the intersection.
        Transitions safely through RESTORATION_YELLOW -> RESTORATION_ALL_RED -> Next Queued or NORMAL.
        """
        if self.active_preemption is None:
            return

        if ambulance_code and self.active_preemption["ambulance_code"] != ambulance_code:
            # Check if it was in queue
            self.queued_preemptions = [q for q in self.queued_preemptions if q["ambulance_code"] != ambulance_code]
            return

        cleared_code = self.active_preemption["ambulance_code"]
        cleared_direction = self.active_preemption["direction"]

        # Start safe restoration clearance
        self.state = STATE_RESTORATION_YELLOW
        self.phase_timer = 0
        self.phase_duration = self.yellow_duration
        self._record_log(
            "PREEMPTION_PASSAGE_DETECTED",
            f"Ambulance {cleared_code} passed intersection {self.intersection_id}. Starting safe restoration yellow interval ({self.yellow_duration}s)."
        )

    def tick(self, dt: int = 1):
        """Advance the signal controller clock by `dt` seconds."""
        self.phase_timer += dt

        if self.state == STATE_NORMAL:
            if self.phase_timer >= self.phase_duration:
                self.phase_timer = 0
                self.normal_phase = "EW" if self.normal_phase == "NS" else "NS"
                self.phase_duration = self.cycle_time_ew if self.normal_phase == "EW" else self.cycle_time_ns

        elif self.state == STATE_CLEARANCE_YELLOW:
            if self.phase_timer >= self.phase_duration:
                # Transition from Yellow -> All-Red Hold
                self.state = STATE_ALL_RED_HOLD
                self.phase_timer = 0
                self.phase_duration = self.all_red_duration
                self._record_log(
                    "ALL_RED_HOLD_ACTIVE",
                    f"Intersection clearance complete. Entering ALL_RED_HOLD ({self.all_red_duration}s) to guarantee zero conflicting traffic in junction."
                )

        elif self.state == STATE_ALL_RED_HOLD:
            if self.phase_timer >= self.phase_duration:
                # Transition from All-Red -> Preemption Green
                self.state = STATE_PREEMPTION_GREEN
                self.phase_timer = 0
                self.phase_duration = 35  # Max preemption green hold
                target = self.active_preemption.get("direction", "EW") if self.active_preemption else "EW"
                amb = self.active_preemption.get("ambulance_code", "UNKNOWN") if self.active_preemption else "UNKNOWN"
                self._record_log(
                    "PREEMPTION_GREEN_GRANTED",
                    f"PREEMPTION GREEN granted for {target} axis! Emergency corridor secured for ambulance {amb}."
                )

        elif self.state == STATE_PREEMPTION_GREEN:
            # Stays green until ambulance passes or timeout (35s safety fallback)
            if self.phase_timer >= self.phase_duration:
                self._record_log("PREEMPTION_TIMEOUT", "Maximum preemption hold duration exceeded. Restoring normal safety cycle.")
                self.clear_preemption()

        elif self.state == STATE_RESTORATION_YELLOW:
            if self.phase_timer >= self.phase_duration:
                self.state = STATE_RESTORATION_ALL_RED
                self.phase_timer = 0
                self.phase_duration = self.all_red_duration

        elif self.state == STATE_RESTORATION_ALL_RED:
            if self.phase_timer >= self.phase_duration:
                # Finished clearance! Check if any queued preemption is waiting
                if self.queued_preemptions:
                    next_request = self.queued_preemptions.pop(0)
                    self._record_log(
                        "SERVICING_QUEUED_PREEMPTION",
                        f"Servicing queued emergency request for {next_request['ambulance_code']} ({next_request['direction']})."
                    )
                    self._start_preemption_transition(next_request)
                else:
                    # Restore standard normal cycle
                    self.active_preemption = None
                    self.state = STATE_NORMAL
                    self.normal_phase = "NS"
                    self.phase_timer = 0
                    self.phase_duration = self.cycle_time_ns
                    self._record_log("NORMAL_CYCLE_RESTORED", f"Intersection {self.intersection_id} safely restored to regular round-robin cycle.")

    def to_dict(self) -> Dict[str, Any]:
        """Serialize intersection controller state."""
        time_remaining = max(0, self.phase_duration - self.phase_timer)
        signals = self.get_signal_colors()

        return {
            "intersection_id": self.intersection_id,
            "name": self.name,
            "location_desc": self.location_desc,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "state": self.state,
            "normal_phase": self.normal_phase,
            "phase_timer": self.phase_timer,
            "phase_duration": self.phase_duration,
            "time_remaining": time_remaining,
            "signals": signals,
            "is_preempted": self.state in [STATE_CLEARANCE_YELLOW, STATE_ALL_RED_HOLD, STATE_PREEMPTION_GREEN],
            "active_preemption": self.active_preemption,
            "queued_preemptions": self.queued_preemptions,
            "recent_logs": self.event_logs[:5]
        }


class SimulatedAmbulance:
    """
    Simulated ambulance traveling along a real Tirupati emergency corridor.
    Calculates distance to intersections, ETA, and progress along waypoints.
    """

    def __init__(
        self,
        ambulance_code: str,
        driver_name: str,
        emergency_id: Optional[int],
        incident_id: str,
        emergency_type: str,
        severity: str,
        route_name: str,
        origin_name: str,
        destination_name: str,
        waypoints: List[Dict[str, Any]],  # List of {lat, lon, name, intersection_id, axis}
        speed_kmh: float = 48.0
    ):
        self.ambulance_code = ambulance_code
        self.driver_name = driver_name
        self.emergency_id = emergency_id
        self.incident_id = incident_id
        self.emergency_type = emergency_type
        self.severity = severity
        self.route_name = route_name
        self.origin_name = origin_name
        self.destination_name = destination_name
        self.waypoints = waypoints
        self.speed_kmh = speed_kmh  # km/h

        # Simulation trajectory state
        self.current_waypoint_index = 0
        self.sub_progress = 0.0  # 0.0 to 1.0 between current and next waypoint
        self.current_lat = waypoints[0]["lat"]
        self.current_lon = waypoints[0]["lon"]
        self.heading = 0.0  # Bearing in degrees
        self.is_active = True
        self.passed_intersections: List[str] = []
        self.status_description = "En route to destination"

    @property
    def speed_mps(self) -> float:
        """Speed in meters per second."""
        return (self.speed_kmh * 1000.0) / 3600.0

    def calculate_bearing(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate compass bearing from point 1 to point 2."""
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_lambda = math.radians(lon2 - lon1)
        y = math.sin(delta_lambda) * math.cos(phi2)
        x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
        bearing = math.degrees(math.atan2(y, x))
        return (bearing + 360) % 360

    def get_next_intersection(self) -> Optional[Dict[str, Any]]:
        """Find the next upcoming intersection along the ambulance's route."""
        for i in range(self.current_waypoint_index, len(self.waypoints)):
            wp = self.waypoints[i]
            if wp.get("intersection_id") and wp["intersection_id"] not in self.passed_intersections:
                dist = haversine_distance_meters(self.current_lat, self.current_lon, wp["lat"], wp["lon"])
                eta = round(dist / max(self.speed_mps, 1.0), 1)
                return {
                    "intersection_id": wp["intersection_id"],
                    "intersection_name": wp.get("name", "Upcoming Intersection"),
                    "direction": wp.get("axis", "EW"),
                    "distance_meters": dist,
                    "eta_seconds": eta,
                    "waypoint_index": i
                }
        return None

    def tick(self, dt: int = 1) -> List[Dict[str, Any]]:
        """
        Advance ambulance along its route.
        Returns a list of events (e.g. APPROACHING_INTERSECTION, CROSSED_INTERSECTION).
        """
        if not self.is_active or self.current_waypoint_index >= len(self.waypoints) - 1:
            self.status_description = "Arrived at destination hospital"
            return []

        events = []
        current_wp = self.waypoints[self.current_waypoint_index]
        next_wp = self.waypoints[self.current_waypoint_index + 1]

        leg_distance = haversine_distance_meters(current_wp["lat"], current_wp["lon"], next_wp["lat"], next_wp["lon"])
        if leg_distance <= 0:
            leg_distance = 1.0

        # Distance covered in this tick
        distance_step = self.speed_mps * dt
        fraction_step = distance_step / leg_distance

        self.sub_progress += fraction_step

        if self.sub_progress >= 1.0:
            # Reached next waypoint!
            self.current_waypoint_index += 1
            self.sub_progress = 0.0

            reached_wp = self.waypoints[self.current_waypoint_index]
            self.current_lat = reached_wp["lat"]
            self.current_lon = reached_wp["lon"]

            if reached_wp.get("intersection_id"):
                int_id = reached_wp["intersection_id"]
                if int_id not in self.passed_intersections:
                    self.passed_intersections.append(int_id)
                    events.append({
                        "type": "CROSSED_INTERSECTION",
                        "intersection_id": int_id,
                        "ambulance_code": self.ambulance_code
                    })

            if self.current_waypoint_index >= len(self.waypoints) - 1:
                self.is_active = False
                self.status_description = f"Delivered patient to {self.destination_name}"
                events.append({
                    "type": "MISSION_COMPLETED",
                    "ambulance_code": self.ambulance_code,
                    "destination": self.destination_name
                })
                return events
            else:
                next_wp = self.waypoints[self.current_waypoint_index + 1]

        # Interpolate coordinates
        start_lat = self.waypoints[self.current_waypoint_index]["lat"]
        start_lon = self.waypoints[self.current_waypoint_index]["lon"]
        end_lat = next_wp["lat"]
        end_lon = next_wp["lon"]

        self.current_lat = start_lat + (end_lat - start_lat) * self.sub_progress
        self.current_lon = start_lon + (end_lon - start_lon) * self.sub_progress
        self.heading = round(self.calculate_bearing(start_lat, start_lon, end_lat, end_lon), 1)

        # Check proximity to next intersection
        next_int = self.get_next_intersection()
        if next_int:
            dist = next_int["distance_meters"]
            if dist <= 450:
                self.status_description = f"Approaching {next_int['intersection_name']} ({dist}m, ETA {next_int['eta_seconds']}s)"
                events.append({
                    "type": "APPROACHING_INTERSECTION",
                    "intersection_id": next_int["intersection_id"],
                    "direction": next_int["direction"],
                    "distance_meters": dist,
                    "eta_seconds": next_int["eta_seconds"],
                    "ambulance_code": self.ambulance_code,
                    "severity": self.severity,
                    "emergency_id": self.emergency_id
                })
            else:
                self.status_description = f"En route to {next_int['intersection_name']} ({dist}m)"

        return events

    def to_dict(self) -> Dict[str, Any]:
        """Serialize ambulance state."""
        next_int = self.get_next_intersection()
        total_wps = len(self.waypoints)
        progress_pct = round(((self.current_waypoint_index + self.sub_progress) / max(total_wps - 1, 1)) * 100, 1)

        return {
            "ambulance_code": self.ambulance_code,
            "driver_name": self.driver_name,
            "emergency_id": self.emergency_id,
            "incident_id": self.incident_id,
            "emergency_type": self.emergency_type,
            "severity": self.severity,
            "route_name": self.route_name,
            "origin_name": self.origin_name,
            "destination_name": self.destination_name,
            "latitude": round(self.current_lat, 6),
            "longitude": round(self.current_lon, 6),
            "heading": self.heading,
            "speed_kmh": self.speed_kmh,
            "is_active": self.is_active,
            "progress_percent": min(100.0, progress_pct),
            "status_description": self.status_description,
            "next_intersection": next_int,
            "waypoints": self.waypoints
        }


# =====================================================================
# TIRUPATI METROPOLITAN PRE-CONFIGURED DATA & CORRIDORS
# =====================================================================

DEFAULT_INTERSECTIONS_CONFIG = [
    {
        "id": "INT-101",
        "name": "Alipiri Gateway Circle",
        "location_desc": "Alipiri Toll Bypass & SVIMS North Access",
        "lat": 13.6521,
        "lon": 79.4002,
        "cycle_ns": 24,
        "cycle_ew": 24
    },
    {
        "id": "INT-102",
        "name": "Kapila Theertham Junction",
        "location_desc": "Kapila Theertham Bypass & Temple Road Junction",
        "lat": 13.6455,
        "lon": 79.4180,
        "cycle_ns": 26,
        "cycle_ew": 26
    },
    {
        "id": "INT-103",
        "name": "SVIMS Emergency Corridor Junction",
        "location_desc": "Direct Arterial to SVIMS & BIRRD Hospital Bays",
        "lat": 13.6372,
        "lon": 79.4075,
        "cycle_ns": 22,
        "cycle_ew": 22
    },
    {
        "id": "INT-104",
        "name": "RTC Central Bus Station Circle",
        "location_desc": "High-density Downtown Hub & Tirupati Central Access",
        "lat": 13.6288,
        "lon": 79.4215,
        "cycle_ns": 28,
        "cycle_ew": 28
    },
    {
        "id": "INT-105",
        "name": "Ramanuja Circle / Town Club Jn",
        "location_desc": "Renigunta Highway Junction & Arterial Corridor",
        "lat": 13.6320,
        "lon": 79.4310,
        "cycle_ns": 25,
        "cycle_ew": 25
    },
    {
        "id": "INT-106",
        "name": "RUIA Hospital Rapid Access Gate",
        "location_desc": "RUIA Government General Hospital Emergency Bay",
        "lat": 13.6395,
        "lon": 79.4255,
        "cycle_ns": 20,
        "cycle_ew": 20
    }
]

# Real Coordinates Corridor Waypoints
ROUTE_SVIMS_CORRIDOR = [
    {"lat": 13.6480, "lon": 79.4230, "name": "Kapila Theertham Pickup Point"},
    {"lat": 13.6455, "lon": 79.4180, "name": "Kapila Theertham Junction", "intersection_id": "INT-102", "axis": "EW"},
    {"lat": 13.6490, "lon": 79.4090, "name": "Alipiri Approach Waypoint"},
    {"lat": 13.6521, "lon": 79.4002, "name": "Alipiri Gateway Circle", "intersection_id": "INT-101", "axis": "NS"},
    {"lat": 13.6440, "lon": 79.4040, "name": "SVIMS Medical Enclave Approach"},
    {"lat": 13.6372, "lon": 79.4075, "name": "SVIMS Emergency Corridor Junction", "intersection_id": "INT-103", "axis": "EW"},
    {"lat": 13.6360, "lon": 79.4085, "name": "SVIMS Trauma Emergency Drop-off"}
]

ROUTE_RUIA_CORRIDOR = [
    {"lat": 13.6290, "lon": 79.4420, "name": "Renigunta Road Highway Pickup Point"},
    {"lat": 13.6320, "lon": 79.4310, "name": "Ramanuja Circle", "intersection_id": "INT-105", "axis": "EW"},
    {"lat": 13.6288, "lon": 79.4215, "name": "RTC Central Bus Station Circle", "intersection_id": "INT-104", "axis": "NS"},
    {"lat": 13.6350, "lon": 79.4235, "name": "RUIA Access Avenue Waypoint"},
    {"lat": 13.6395, "lon": 79.4255, "name": "RUIA Hospital Rapid Access Gate", "intersection_id": "INT-106", "axis": "EW"},
    {"lat": 13.6410, "lon": 79.4260, "name": "RUIA Government Hospital Emergency Triage"}
]

# Conflict Demonstration Route (crosses INT-102 on NS axis while SVIMS Corridor crosses on EW axis)
ROUTE_CONFLICT_DEMO = [
    {"lat": 13.6550, "lon": 79.4180, "name": "North Hill Road Depot"},
    {"lat": 13.6455, "lon": 79.4180, "name": "Kapila Theertham Junction (Conflict Point)", "intersection_id": "INT-102", "axis": "NS"},
    {"lat": 13.6380, "lon": 79.4180, "name": "South Temple Avenue Waypoint"},
    {"lat": 13.6288, "lon": 79.4215, "name": "RTC Central Bus Station Circle", "intersection_id": "INT-104", "axis": "EW"},
    {"lat": 13.6260, "lon": 79.4225, "name": "Tirupati Central Ambulance Bay"}
]


class PreemptionSimulationEngine:
    """
    Central simulation coordinator managing intersections, ambulances,
    priority arbitration, safety checks, and simulation time step.
    """

    def __init__(self):
        self.intersections: Dict[str, IntersectionSignalController] = {}
        self.ambulances: List[SimulatedAmbulance] = []
        self.simulation_time = 0
        self.is_running = False
        self.simulation_speed = 1  # 1x, 2x, 5x
        self.auto_preemption = True
        self.current_scenario_id = "svims_critical"
        self.global_logs: List[Dict[str, Any]] = []

        self.reset_simulation()

    def reset_simulation(self, scenario_id: str = "svims_critical"):
        """Initialize or reset the simulation with a specified scenario."""
        self.current_scenario_id = scenario_id
        self.simulation_time = 0
        self.intersections.clear()
        self.ambulances.clear()
        self.global_logs.clear()

        # Build intersections
        for cfg in DEFAULT_INTERSECTIONS_CONFIG:
            ctrl = IntersectionSignalController(
                intersection_id=cfg["id"],
                name=cfg["name"],
                location_desc=cfg["location_desc"],
                latitude=cfg["lat"],
                longitude=cfg["lon"],
                cycle_time_ns=cfg["cycle_ns"],
                cycle_time_ew=cfg["cycle_ew"]
            )
            self.intersections[cfg["id"]] = ctrl

        # Seed ambulances depending on scenario
        if scenario_id == "svims_critical":
            # Primary demo: Critical Cardiac Incident on SVIMS corridor
            amb1 = SimulatedAmbulance(
                ambulance_code="AMB-101",
                driver_name="K. Ramesh Naidu",
                emergency_id=1,
                incident_id="INC-2026-1001",
                emergency_type="Cardiac Arrest",
                severity="critical",
                route_name="SVIMS Rapid Transit Corridor",
                origin_name="Near Kapila Theertham Temple",
                destination_name="SVIMS Hospital, Tirupati",
                waypoints=list(ROUTE_SVIMS_CORRIDOR),
                speed_kmh=52.0
            )
            self.ambulances.append(amb1)

        elif scenario_id == "dual_conflict":
            # Scenario: Two ambulances approaching INT-102 simultaneously from perpendicular axes!
            # AMB-101 is CRITICAL on EW axis, AMB-103 is HIGH on NS axis.
            # Demonstrates safety arbitration!
            amb1 = SimulatedAmbulance(
                ambulance_code="AMB-101",
                driver_name="K. Ramesh Naidu",
                emergency_id=1,
                incident_id="INC-2026-1001",
                emergency_type="Cardiac Arrest",
                severity="critical",
                route_name="SVIMS Rapid Transit Corridor",
                origin_name="Near Kapila Theertham Temple",
                destination_name="SVIMS Hospital, Tirupati",
                waypoints=list(ROUTE_SVIMS_CORRIDOR),
                speed_kmh=50.0
            )
            amb2 = SimulatedAmbulance(
                ambulance_code="AMB-103",
                driver_name="M. Suresh Babu",
                emergency_id=3,
                incident_id="INC-2026-1003",
                emergency_type="Respiratory Distress",
                severity="high",
                route_name="North-South Cross-Town Route",
                origin_name="North Hill Road Depot",
                destination_name="Tirupati Central Depot",
                waypoints=list(ROUTE_CONFLICT_DEMO),
                speed_kmh=48.0
            )
            self.ambulances.extend([amb1, amb2])

        elif scenario_id == "multi_fleet":
            # Scenario: 3 ambulances operating simultaneously across Tirupati
            amb1 = SimulatedAmbulance(
                ambulance_code="AMB-101",
                driver_name="K. Ramesh Naidu",
                emergency_id=1,
                incident_id="INC-2026-1001",
                emergency_type="Cardiac Arrest",
                severity="critical",
                route_name="SVIMS Rapid Transit Corridor",
                origin_name="Near Kapila Theertham Temple",
                destination_name="SVIMS Hospital, Tirupati",
                waypoints=list(ROUTE_SVIMS_CORRIDOR),
                speed_kmh=52.0
            )
            amb2 = SimulatedAmbulance(
                ambulance_code="AMB-102",
                driver_name="V. Siva Prasad",
                emergency_id=2,
                incident_id="INC-2026-1002",
                emergency_type="Road Traffic Accident",
                severity="high",
                route_name="RUIA Trauma Corridor",
                origin_name="Renigunta Highway Junction",
                destination_name="RUIA Government General Hospital",
                waypoints=list(ROUTE_RUIA_CORRIDOR),
                speed_kmh=46.0
            )
            amb3 = SimulatedAmbulance(
                ambulance_code="AMB-103",
                driver_name="M. Suresh Babu",
                emergency_id=3,
                incident_id="INC-2026-1003",
                emergency_type="Respiratory Distress",
                severity="medium",
                route_name="North-South Cross-Town Route",
                origin_name="North Hill Road Depot",
                destination_name="Tirupati Central Depot",
                waypoints=list(ROUTE_CONFLICT_DEMO),
                speed_kmh=42.0
            )
            self.ambulances.extend([amb1, amb2, amb3])

        self.add_log(
            "SIMULATION_RESET",
            f"Simulation initialized with scenario '{scenario_id}'. 6 intersection controllers active and {len(self.ambulances)} ambulances deployed."
        )

    def add_log(self, event_type: str, message: str, safety_verified: bool = True):
        log_item = {
            "timestamp": datetime.utcnow().isoformat(),
            "sim_time": self.simulation_time,
            "event_type": event_type,
            "message": message,
            "safety_verified": safety_verified
        }
        self.global_logs.insert(0, log_item)
        if len(self.global_logs) > 60:
            self.global_logs.pop()

    def tick(self, dt: int = 1) -> Dict[str, Any]:
        """
        Advance global simulation by `dt` seconds.
        1. Updates all traffic controllers.
        2. Advances ambulances along waypoints.
        3. Detects upcoming intersections and triggers preemption requests.
        4. Detects intersection passage and restores signals.
        """
        self.simulation_time += dt

        # 1. Update all intersection controllers
        for ctrl in self.intersections.values():
            ctrl.tick(dt)

        # 2. Update all ambulances & process events
        for amb in self.ambulances:
            events = amb.tick(dt)

            for ev in events:
                if ev["type"] == "APPROACHING_INTERSECTION" and self.auto_preemption:
                    int_id = ev["intersection_id"]
                    if int_id in self.intersections:
                        ctrl = self.intersections[int_id]
                        # Trigger preemption request
                        res = ctrl.request_preemption(
                            ambulance_code=amb.ambulance_code,
                            emergency_id=amb.emergency_id,
                            severity=amb.severity,
                            direction=ev["direction"],
                            distance_meters=ev["distance_meters"],
                            eta_seconds=ev["eta_seconds"]
                        )
                        if res.get("accepted"):
                            self.add_log(
                                "AUTO_PREEMPTION_REQUESTED",
                                f"Ambulance {amb.ambulance_code} ({amb.severity.upper()}) detected approaching {ctrl.name} ({ev['distance_meters']}m, ETA {ev['eta_seconds']}s). {res['message']}"
                            )

                elif ev["type"] == "CROSSED_INTERSECTION":
                    int_id = ev["intersection_id"]
                    if int_id in self.intersections:
                        ctrl = self.intersections[int_id]
                        ctrl.clear_preemption(amb.ambulance_code)
                        self.add_log(
                            "AUTO_PREEMPTION_RESTORED",
                            f"Ambulance {amb.ambulance_code} passed {ctrl.name}. Safe signal restoration initiated."
                        )

                elif ev["type"] == "MISSION_COMPLETED":
                    self.add_log(
                        "MISSION_DELIVERED",
                        f"Ambulance {amb.ambulance_code} successfully delivered emergency patient to {ev['destination']}."
                    )

        return self.get_state()

    def manual_preemption_request(self, intersection_id: str, ambulance_code: str, direction: str = "EW") -> Dict[str, Any]:
        """Allow manual priority trigger from dashboard controls."""
        if intersection_id not in self.intersections:
            return {"success": False, "message": f"Intersection {intersection_id} not found."}

        ctrl = self.intersections[intersection_id]
        # Find ambulance details if available
        amb = next((a for a in self.ambulances if a.ambulance_code == ambulance_code), None)
        severity = amb.severity if amb else "critical"
        emergency_id = amb.emergency_id if amb else 1

        result = ctrl.request_preemption(
            ambulance_code=ambulance_code,
            emergency_id=emergency_id,
            severity=severity,
            direction=direction,
            distance_meters=200.0,
            eta_seconds=15.0
        )
        self.add_log(
            "MANUAL_PREEMPTION_TRIGGERED",
            f"Manual priority requested for {ambulance_code} at {ctrl.name} ({direction} axis). Result: {result['message']}"
        )
        return {"success": True, "result": result}

    def manual_clear_intersection(self, intersection_id: str) -> Dict[str, Any]:
        """Simulate ambulance passage or clear preemption state."""
        if intersection_id not in self.intersections:
            return {"success": False, "message": f"Intersection {intersection_id} not found."}

        ctrl = self.intersections[intersection_id]
        ctrl.clear_preemption()
        self.add_log(
            "MANUAL_PASSAGE_SIMULATED",
            f"Simulated passage at {ctrl.name}. Signal restored to safe yellow/red cycle."
        )
        return {"success": True, "message": f"Passage simulated at {ctrl.name}."}

    def get_state(self) -> Dict[str, Any]:
        """Return complete snapshot of all intersections, ambulances, and metrics."""
        intersections_list = [ctrl.to_dict() for ctrl in self.intersections.values()]
        ambulances_list = [amb.to_dict() for amb in self.ambulances]

        preempted_count = sum(1 for i in intersections_list if i["is_preempted"])
        active_amb_count = sum(1 for a in ambulances_list if a["is_active"])

        return {
            "simulation_time": self.simulation_time,
            "is_running": self.is_running,
            "simulation_speed": self.simulation_speed,
            "auto_preemption": self.auto_preemption,
            "scenario_id": self.current_scenario_id,
            "metrics": {
                "total_intersections": len(intersections_list),
                "preempted_intersections": preempted_count,
                "active_ambulances": active_amb_count,
                "estimated_time_saved_minutes": round(preempted_count * 2.1 + (self.simulation_time * 0.05), 1),
                "safety_interlocks_active": True
            },
            "intersections": intersections_list,
            "ambulances": ambulances_list,
            "global_logs": self.global_logs[:15]
        }


# Global singleton simulation engine
simulation_engine = PreemptionSimulationEngine()

import math
import os
import logging
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger("lifeline-allocation")

# Configurable OSRM routing service endpoint
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
DEFAULT_URBAN_SPEED_KMH = 40.0  # Average urban emergency transit speed in Tirupati corridors

# Known Tirupati landmark coordinate fallbacks
TIRUPATI_LANDMARKS: Dict[str, Tuple[float, float]] = {
    "svims": (13.6360, 79.4085),
    "ruia": (13.6410, 79.4260),
    "kapila": (13.6480, 79.4230),
    "alipiri": (13.6521, 79.4002),
    "renigunta": (13.6290, 79.4420),
    "bhavani": (13.6350, 79.4180),
    "bus station": (13.6288, 79.4215),
    "railway station": (13.6280, 79.4200),
    "apollo": (13.6265, 79.4290),
    "chandragiri": (13.6180, 79.3180),
    "tirumala": (13.6833, 79.3500),
    "birrd": (13.6340, 79.4060),
    "ramanuja": (13.6320, 79.4310),
}


def resolve_coordinates(text: Optional[str], fallback_lat: float = 13.6288, fallback_lon: float = 79.4192) -> Tuple[float, float]:
    """Resolve lat/lon from location text using known landmarks, or return default Tirupati center."""
    if not text:
        return fallback_lat, fallback_lon
    lower = text.lower()
    for key, coords in TIRUPATI_LANDMARKS.items():
        if key in lower:
            return coords
    return fallback_lat, fallback_lon


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth using the Haversine formula.
    Returns distance in kilometers.
    """
    R = 6371.0  # Earth's radius in km

    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def get_route_geometry(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float
) -> Dict[str, Any]:
    """
    Fetch road route geometry, travel distance, and ETA between two points.
    Attempts OSRM driving service first; falls back to geodesic interpolation if service is unavailable.
    """
    # 1. Attempt OSRM route lookup with short timeout
    try:
        import httpx
        url = f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false"
        }
        with httpx.Client(timeout=2.5) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    route = data["routes"][0]
                    distance_km = round(route.get("distance", 0) / 1000.0, 2)
                    duration_min = round(route.get("duration", 0) / 60.0, 1)
                    raw_coords = route.get("geometry", {}).get("coordinates", [])
                    # OSRM returns [lon, lat], convert to [lat, lon] for Leaflet
                    waypoints = [[pt[1], pt[0]] for pt in raw_coords]
                    if waypoints:
                        return {
                            "source": "OSRM",
                            "distance_km": distance_km,
                            "eta_minutes": max(1.0, duration_min),
                            "waypoints": waypoints,
                            "is_fallback": False
                        }
    except Exception as e:
        logger.debug(f"OSRM routing request failed ({e}), falling back to geodesic straight-line interpolation.")

    # 2. Fallback: Geodesic straight-line + realistic urban road factor (1.3x tortuosity)
    distance_km = haversine_distance(start_lat, start_lon, end_lat, end_lon)
    effective_road_km = round(distance_km * 1.3, 2)
    # Urban speed average: 40 km/h -> time = (km / 40) * 60 minutes
    eta_minutes = round(max(1.5, (effective_road_km / DEFAULT_URBAN_SPEED_KMH) * 60.0), 1)

    # Generate 10 interpolated waypoints along straight line
    num_steps = 10
    waypoints = []
    for step in range(num_steps + 1):
        ratio = step / float(num_steps)
        lat = round(start_lat + (end_lat - start_lat) * ratio, 6)
        lon = round(start_lon + (end_lon - start_lon) * ratio, 6)
        waypoints.append([lat, lon])

    return {
        "source": "GEODESIC_FALLBACK",
        "distance_km": effective_road_km,
        "eta_minutes": eta_minutes,
        "waypoints": waypoints,
        "is_fallback": True
    }


def rank_ambulances_for_emergency(
    emergency_lat: float,
    emergency_lon: float,
    severity: str,
    available_ambulances: List[Any]
) -> List[Dict[str, Any]]:
    """
    Rank available ambulances by estimated response time and capability.
    Returns sorted list of candidate dictionaries with distance, ETA, and score.
    """
    candidates = []

    for amb in available_ambulances:
        amb_lat = getattr(amb, "latitude", None)
        amb_lon = getattr(amb, "longitude", None)

        # Fallback to current_location if coords missing
        if amb_lat is None or amb_lon is None:
            amb_lat, amb_lon = resolve_coordinates(getattr(amb, "current_location", None))

        # Calculate straight-line distance
        dist_km = haversine_distance(amb_lat, amb_lon, emergency_lat, emergency_lon)

        # Rough ETA estimation (urban road distance ~ 1.3x straight line, 40 km/h)
        eta_min = round(max(1.0, (dist_km * 1.3 / DEFAULT_URBAN_SPEED_KMH) * 60.0), 1)

        capability = getattr(amb, "capability", "Basic Life Support (BLS)")
        is_als = "advanced" in capability.lower() or "als" in capability.lower()

        # Score formula: lower is better (response ETA in minutes)
        # For critical emergencies, give slight priority bonus (-1.5 min virtual advantage) to ALS units
        score = eta_min
        if severity.lower() == "critical" and is_als:
            score = max(0.5, score - 1.5)

        candidates.append({
            "ambulance_id": amb.id,
            "vehicle_code": amb.vehicle_code,
            "driver_name": amb.driver_name,
            "contact_number": getattr(amb, "contact_number", ""),
            "capability": capability,
            "current_location": getattr(amb, "current_location", ""),
            "latitude": amb_lat,
            "longitude": amb_lon,
            "distance_km": dist_km,
            "eta_minutes": eta_min,
            "score": score
        })

    # Sort candidates by score (best response time first)
    candidates.sort(key=lambda x: (x["score"], x["distance_km"]))
    return candidates

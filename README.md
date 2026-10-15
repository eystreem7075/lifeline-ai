# LifeLine AI — Emergency Command & Smart Traffic Preemption (Modules 1 & 2)

> **InnoHacks 2.0 Hackathon Project**  
> **Full Title:** *LifeLine AI — Intelligent Ambulance Dispatch, Smart Traffic Preemption & Emergency Coordination Platform*  
> **Location:** Tirupati Metropolitan District Emergency Operations

---

## 1. Project Overview

**LifeLine AI** is an emergency coordination platform engineered to reduce emergency response times and streamline ambulance dispatch workflows. The full platform encompasses modular subsystems:

1. **Module 1: Emergency Command Center** *(Fully implemented)*
2. **Module 2: Smart Traffic Signal Preemption Simulator** *(Fully implemented)*
3. **Module 3: Multi-Depot Fleet Optimization & Dynamic Rerouting** *(Planned)*
4. **Module 4: Patient and Family Communication Portal** *(Planned)*

### Scope of Module 1: Emergency Command Center
Module 1 serves as the mission-critical foundation for dispatch operators. It provides:
- **Real-Time Emergency Registration:** Rapid triage recording of patient details, emergency nature, severity classification, pickup location, and destination hospital.
- **Ambulance Fleet Status Tracking:** Live tracking of unit availability, driver assignments, contact information, and station depots.
- **Concurrency-Safe Dispatch Logic:** Atomic database transactions that prevent double-booking of emergency units.
- **Strict Incident Lifecycle Management:** Validated progression through `pending → assigned → en_route → arrived → completed` with automatic timestamping and resource deallocation.
- **Incident Audit Trail:** Immutable activity logs documenting every dispatch action, state change, and operator instruction.
- **Dynamic KPI Dashboard:** Derived operational metrics (total incidents, active cases, fleet readiness, resolved missions).

### Scope of Module 2: Smart Traffic Signal Preemption
Module 2 creates an intelligent traffic priority corridor for in-transit emergency ambulances:
- **Smart Signal Controller State Machine:** 4-way signal controllers (N, S, E, W) enforcing strict safety intervals: `NORMAL_CYCLE → CLEARANCE_YELLOW (3s) → ALL_RED_HOLD (2s) → PREEMPTION_GREEN → RESTORATION_YELLOW (3s) → RESTORATION_ALL_RED (2s) → NORMAL_CYCLE`.
- **Zero-Collision Safety Invariant:** Opposing directions can never receive GREEN simultaneously. Conflicting lanes are safely held in RED.
- **Multi-Ambulance Conflict Arbitration:** When multiple ambulances approach an intersection, prioritizes using Emergency Severity (`critical` > `high` > `medium` > `low`) and ETA/distance, safely queueing competing requests.
- **Interactive SVG Radar Map:** Real-time GIS map of Tirupati Metropolitan corridors with glowing traffic signals, directional heading rotation, siren pulse animation, and preemption corridor wave highlighting.
- **Full Simulation Controls:** Play, pause, speed multipliers (1x, 2x, 5x), step forward (+2s), scenario switcher, manual priority override, and passage simulation.
- **Module 1 Seamless Integration:** Direct synchronization bridge to import active Module 1 assigned/en-route ambulances and emergencies into traffic corridors.

---

## 2. Technology Stack

- **Frontend:**
  - **Framework:** React 18 with Vite
  - **Styling:** Tailwind CSS (Dark navy palette `#070B14` with restrained emergency blue, amber, and emerald accents)
  - **Icons:** Lucide React
  - **Networking:** Native `fetch` with centralized error handling in `src/api.js`
- **Backend:**
  - **Framework:** Python 3.11 with FastAPI
  - **Schema Validation:** Pydantic v2
  - **ORM & Database:** SQLAlchemy 2.0 with SQLite (WAL mode, relational integrity)
  - **API Documentation:** Interactive Swagger UI at `http://localhost:8000/docs`
- **Testing & Quality Assurance:**
  - **Test Suite:** pytest with FastAPI `TestClient` and an isolated test database

---

## 3. Project Structure

```
lifeline-ai/
├── backend/
│   ├── main.py              # FastAPI application, lifecycle hooks & REST endpoints
│   ├── database.py          # SQLAlchemy engine, session maker & Base definition
│   ├── models.py            # Relational models: Emergency, Ambulance, IncidentActivityLog
│   ├── schemas.py           # Pydantic validation schemas & response contracts
│   ├── test_backend.py      # Automated pytest suite covering all lifecycle requirements
│   ├── requirements.txt     # Python backend dependencies
│   └── .env.example         # Environment configuration template
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main Command Center UI, queue table, fleet grid & modals
│   │   ├── api.js           # Reusable REST client with structured error handling
│   │   ├── main.jsx         # React application bootstrap
│   │   └── index.css        # Tailwind directives and custom animation styles
│   ├── index.html           # HTML5 shell with Google Inter font
│   ├── package.json         # Frontend dependencies and scripts
│   ├── tailwind.config.js   # Custom dark navy emergency palette configuration
│   ├── postcss.config.js    # PostCSS plugins
│   └── vite.config.js       # Vite development server and build settings
├── README.md                # Comprehensive project documentation
└── .gitignore               # Ignored environments, databases, and build artifacts
```

---

## 4. Prerequisites

- **Python:** Version 3.10 or higher
- **Node.js:** Version 18 or higher (LTS recommended)
- **Package Managers:** `pip` and `npm`

---

## 5. Installation & Setup

### Clone or Access Directory
```bash
cd lifeline-ai
```

### Backend Setup
1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. (Optional) Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows PowerShell:
   .\venv\Scripts\Activate.ps1
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy the environment configuration:
   ```bash
   cp .env.example .env
   ```

### Frontend Setup
1. Open a new terminal and navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```

---

## 6. Running the Application

### Start the Backend Server
From `backend/`:
```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
- API Base URL: `http://127.0.0.1:8000`
- Interactive OpenAPI / Swagger Docs: `http://127.0.0.1:8000/docs`

> *Note: On initial boot, the backend automatically seeds synthetic Tirupati ambulances (`AMB-101` to `AMB-105`) and initial test emergencies idempotently without creating duplicate records on restarts.*

### Start the Frontend Server
From `frontend/`:
```bash
npm run dev
```
- Local Dashboard URL: `http://localhost:5173`

---

## 7. Automated Testing

The backend includes a comprehensive test suite in `backend/test_backend.py` executing against a separate, isolated test database (`test_lifeline.db`).

To execute tests:
```bash
cd backend
python -m pytest test_backend.py -v
```

### Test Coverage Highlights
- [x] Backend startup & health check endpoint (`/api/health`)
- [x] Database table initialization & synthetic ambulance seeding
- [x] Valid emergency creation and strict rejection of invalid severity values
- [x] Atomic ambulance assignment & status transitions
- [x] Prevention of double-booking busy ambulances (concurrency safety)
- [x] Proper 404 handling for invalid incident/ambulance IDs
- [x] Rejection of invalid status progressions (e.g. jumping from `pending` directly to `arrived`)
- [x] Emergency completion: timestamp recording, ambulance release back to available fleet, and locking of completed records
- [x] Dynamic calculation of dashboard summary KPI statistics
- [x] Dynamic calculation of dashboard summary KPI statistics
- [x] Full incident activity audit trail logging
- [x] **Module 2 Safety Invariant:** Guaranteed prevention of simultaneous conflicting green signals
- [x] **Module 2 Clearance Progression:** Strict `Yellow (3s) → All-Red (2s) → Preemption Green` validation
- [x] **Module 2 Signal Restoration:** Clean transition back to cyclic round-robin after passage
- [x] **Module 2 Multi-Ambulance Arbitration:** Priority-based resolution of cross-intersection conflicts
- [x] **Module 2 Route & Telemetry:** Dynamic distance & ETA calculation along Tirupati corridors
- [x] **Module 1 & 2 Integration Bridge:** Automatic sync of active en-route emergencies into signal corridors

---

## 8. REST API Documentation

### Module 1: Emergency Command Center
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `GET` | `/api/dashboard` | Aggregated KPI statistics derived from SQLite records |
| `GET` | `/api/emergencies` | List all emergencies (supports `status` and `severity` filters) |
| `POST` | `/api/emergencies` | Register new emergency incident (initial status `pending`) |
| `GET` | `/api/emergencies/{id}` | Detailed incident view with assigned ambulance and audit log |
| `PATCH` | `/api/emergencies/{id}/status` | Validated lifecycle progression (`pending → assigned → en_route → arrived → completed`) |
| `POST` | `/api/emergencies/{emergency_id}/assign/{ambulance_id}` | Concurrency-safe ambulance assignment |
| `GET` | `/api/emergencies/{id}/history` | Audit log of all actions for a specific incident |
| `GET` | `/api/ambulances` | List ambulance fleet with real-time availability |
| `POST` | `/api/ambulances` | Register a new vehicle into the ambulance fleet |
| `GET` | `/api/activity-logs` | Global chronological feed of recent dispatch operations |
| `POST` | `/api/seed` | Development seed endpoint to populate or reset demo data |

### Module 2: Smart Traffic Signal Preemption
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/traffic/state` | Complete snapshot of all 6 intersection controllers, ambulances, metrics & logs |
| `GET` | `/api/traffic/intersections` | List all intersection controllers with 4-way signal colors, timers & preemption status |
| `GET` | `/api/traffic/intersections/{id}` | Detailed state, 4-way approach lights, and audit logs for a single intersection |
| `GET` | `/api/traffic/ambulances` | List all simulated emergency ambulances, GPS coords, routes & approaching intersection ETA |
| `POST` | `/api/traffic/preemption/request` | Request signal preemption priority (initiates safe clearance yellow and all-red hold) |
| `POST` | `/api/traffic/preemption/clear` | Simulate ambulance passage and safely restore cyclic round-robin |
| `POST` | `/api/traffic/simulation/tick` | Advance simulation clock by `dt` seconds (advances vehicle position and controller phases) |
| `POST` | `/api/traffic/simulation/control` | Control playback state (`is_running`, `speed`, `auto_preemption`) |
| `POST` | `/api/traffic/simulation/reset` | Reset simulation state or switch demo scenarios (`svims_critical`, `dual_conflict`, `multi_fleet`) |
| `GET` | `/api/traffic/logs` | Real-time audit log of priority triggers, safety clearance intervals & arbitration events |
| `POST` | `/api/traffic/sync-module1` | Seamless integration bridge: import active Module 1 dispatched emergencies into traffic simulator |

---

## 9. Security & Prototype Disclaimer

> [!WARNING]
> **Hackathon Prototype Notice:**  
> This application is built as a competition prototype for **InnoHacks 2.0**. It is **not** connected to actual government emergency dispatch systems, live municipal traffic lights, or actual hospital IT systems.
> 
> Production deployment in a municipal emergency setting strictly requires:
> 1. Role-based authentication and authorization (RBAC) with OAuth2 / JWT.
> 2. End-to-end data encryption in transit (HTTPS / TLS 1.3) and at rest (AES-256).
> 3. Strict HIPAA / DISHA patient privacy review and PII redaction.
> 4. Fault-tolerant multi-zone database replication.

---

## 10. Future Integration Roadmap

- **Module 3 (Multi-Depot Fleet Optimization & Dynamic Rerouting):** Graph-based hospital load balancing, dynamic congestion rerouting, and predictive dispatch placement.
- **Module 4 (Patient & Family Communication Portal):** Public-facing SMS / web tracking link allowing family to monitor ambulance arrival without calling the emergency room.

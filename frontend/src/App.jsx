import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Ambulance,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  HeartPulse,
  Layers,
  MapPin,
  Navigation,
  Phone,
  PlusCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
  User,
  Users,
  X,
  Zap,
  LogOut,
  KeyRound,
  Shield,
  ShieldCheck
} from 'lucide-react';
import api from './api';
import TrafficPreemptionDashboard from './TrafficPreemptionDashboard';
import AuthView from './components/AuthView';
import PatientPortal from './components/PatientPortal';
import OperatorDashboard from './components/OperatorDashboard';
import HospitalDashboard from './components/HospitalDashboard';
import UserManagementView from './components/UserManagementView';

export default function App() {
  // Authentication & Role State
  const [currentUser, setCurrentUser] = useState(() => api.getStoredUser());
  const [authChecking, setAuthChecking] = useState(true);
  const [previewRole, setPreviewRole] = useState(null); // Allows Admin to preview other roles

  const effectiveRole = previewRole || currentUser?.role || 'admin';

  const getDefaultSection = (role) => {
    switch (role?.toLowerCase()) {
      case 'patient':
        return 'patient-portal';
      case 'operator':
        return 'operator-dashboard';
      case 'hospital':
        return 'hospital-dashboard';
      case 'admin':
      default:
        return 'command-center';
    }
  };

  // Global & Data States
  const [backendConnected, setBackendConnected] = useState(false);
  const [stats, setStats] = useState({
    total_emergencies: 0,
    active_emergencies: 0,
    available_ambulances: 0,
    busy_ambulances: 0,
    completed_emergencies: 0,
    pending_emergencies: 0,
    critical_emergencies: 0,
    high_emergencies: 0,
  });
  const [emergencies, setEmergencies] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Navigation & Filtering
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const sectionParam = urlParams.get('section');
      if (sectionParam) return sectionParam;
      const user = api.getStoredUser();
      if (user) return getDefaultSection(user.role);
    } catch {}
    return 'command-center';
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fleetFilter, setFleetFilter] = useState('all');

  // Modals & Drawers
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [assigningEmergency, setAssigningEmergency] = useState(null);
  const [showAddAmbulanceModal, setShowAddAmbulanceModal] = useState(false);
  const [inspectingEmergency, setInspectingEmergency] = useState(null);
  const [emergencyHistory, setEmergencyHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = (type, message) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // 1. Session verification on initial load
  useEffect(() => {
    const verifySession = async () => {
      const token = api.getStoredToken();
      if (!token) {
        setAuthChecking(false);
        return;
      }
      try {
        const user = await api.getMe();
        setCurrentUser(user);
        // Default section if needed
        setActiveSection((prev) => {
          if (user.role === 'patient' && prev !== 'patient-portal') return 'patient-portal';
          if (user.role === 'operator' && !['operator-dashboard', 'traffic-preemption', 'activity'].includes(prev)) return 'operator-dashboard';
          if (user.role === 'hospital' && !['hospital-dashboard', 'queue', 'activity'].includes(prev)) return 'hospital-dashboard';
          return prev;
        });
      } catch (err) {
        console.warn('Session verification failed, resetting auth state:', err);
        api.clearAuthSession();
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    verifySession();
  }, []);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setPreviewRole(null);
    setActiveSection(getDefaultSection(user.role));
    loadDashboardData(true);
  };

  const handleSignOut = () => {
    api.clearAuthSession();
    setCurrentUser(null);
    setPreviewRole(null);
    addToast('info', 'You have been safely signed out.');
  };

  const handleRolePreviewChange = (newRole) => {
    setPreviewRole(newRole === 'admin' ? null : newRole);
    setActiveSection(getDefaultSection(newRole));
    addToast('info', `Switched dashboard preview to: ${newRole.toUpperCase()}`);
  };

  // Primary Data Fetcher
  const loadDashboardData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // 1. Health check
      await api.checkHealth();
      setBackendConnected(true);

      // 2. Parallel data fetching
      const [statsData, emergenciesData, ambulancesData, activityData] = await Promise.all([
        api.getDashboardStats(),
        api.getEmergencies(),
        api.getAmbulances(),
        api.getRecentActivity(15),
      ]);

      setStats(statsData);
      setEmergencies(emergenciesData);
      setAmbulances(ambulancesData);
      setRecentActivity(activityData);
    } catch (err) {
      setBackendConnected(false);
      console.error('Failed to load dashboard data:', err);
      addToast('error', err.message || 'Could not communicate with backend service.');
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    // Auto-refresh every 20 seconds
    const interval = setInterval(() => {
      loadDashboardData();
    }, 20000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  // Open incident history
  const handleOpenHistory = async (emergency) => {
    setInspectingEmergency(emergency);
    setHistoryLoading(true);
    try {
      const history = await api.getEmergencyHistory(emergency.id);
      setEmergencyHistory(history);
    } catch (err) {
      addToast('error', 'Failed to retrieve incident audit history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Status Progression Handler
  const handleStatusTransition = async (emergency, targetStatus) => {
    try {
      await api.updateEmergencyStatus(emergency.id, targetStatus);
      addToast('success', `Incident ${emergency.incident_id} progressed to ${targetStatus.toUpperCase()}`);
      await loadDashboardData();
      if (inspectingEmergency && inspectingEmergency.id === emergency.id) {
        const updated = await api.getEmergency(emergency.id);
        setInspectingEmergency(updated);
        setEmergencyHistory(updated.activity_logs || []);
      }
    } catch (err) {
      addToast('error', err.message || `Failed to transition to ${targetStatus}`);
    }
  };

  // Dispatch Assignment Handler
  const handleAssignAmbulance = async (ambulanceId) => {
    if (!assigningEmergency) return;
    try {
      await api.assignAmbulance(assigningEmergency.id, ambulanceId);
      addToast('success', `Ambulance assigned to incident ${assigningEmergency.incident_id}`);
      setAssigningEmergency(null);
      await loadDashboardData();
    } catch (err) {
      addToast('error', err.message || 'Ambulance assignment failed');
    }
  };

  // Filtered Emergencies
  const filteredEmergencies = emergencies.filter((em) => {
    if (statusFilter !== 'all' && em.status !== statusFilter) return false;
    if (severityFilter !== 'all' && em.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = em.incident_id?.toLowerCase().includes(q);
      const matchCaller = em.caller_name?.toLowerCase().includes(q);
      const matchType = em.emergency_type?.toLowerCase().includes(q);
      const matchLoc = em.pickup_location?.toLowerCase().includes(q);
      const matchHosp = em.destination_hospital?.toLowerCase().includes(q);
      return matchId || matchCaller || matchType || matchLoc || matchHosp;
    }
    return true;
  });

  // Filtered Fleet
  const filteredAmbulances = ambulances.filter((amb) => {
    if (fleetFilter !== 'all' && amb.status !== fleetFilter) return false;
    return true;
  });

  // Severity style helper
  const getSeverityBadge = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-700/60 animate-radar-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
            CRITICAL
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/70 text-orange-400 border border-orange-700/50">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-700/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/50 text-blue-300 border border-blue-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            LOW
          </span>
        );
    }
  };

  // Status style helper
  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" />
            Pending Dispatch
          </span>
        );
      case 'assigned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Truck className="w-3.5 h-3.5" />
            Ambulance Assigned
          </span>
        );
      case 'en_route':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Navigation className="w-3.5 h-3.5 animate-pulse" />
            En Route
          </span>
        );
      case 'arrived':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <MapPin className="w-3.5 h-3.5" />
            Arrived on Scene
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Incident Resolved
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getSectionInfo = (section) => {
    switch (section) {
      case 'patient-portal':
        return {
          title: 'Emergency Assistance Portal',
          tag: 'Patient SOS Portal',
          desc: 'Request immediate ambulance dispatch, monitor live ETA, and follow emergency first-aid protocols'
        };
      case 'operator-dashboard':
        return {
          title: 'Ambulance Fleet Operations',
          tag: 'Vehicle Telemetry',
          desc: 'Assigned incident navigation, route status progression, and arterial signal preemption link'
        };
      case 'hospital-dashboard':
        return {
          title: 'Hospital Emergency Coordination',
          tag: 'Inbound Patient Triage',
          desc: 'Real-time inbound ambulance queue, trauma bay readiness, and patient handover admissions'
        };
      case 'users':
        return {
          title: 'System Authorized Accounts',
          tag: 'Module 3: Security & Access',
          desc: 'Manage verified user accounts, cryptographic password credentials, and role privileges'
        };
      case 'traffic-preemption':
        return {
          title: 'Smart Traffic Signal Preemption',
          tag: 'Module 2: Arterial Corridors',
          desc: 'Dynamic arterial green corridors, safe clearance intervals & multi-ambulance arbitration'
        };
      case 'queue':
        return {
          title: 'Emergency Incident Queue',
          tag: 'Dispatch Queue',
          desc: 'Active incident triage and real-time ambulance assignment'
        };
      case 'fleet':
        return {
          title: 'Ambulance Fleet Status',
          tag: 'Vehicle Readiness',
          desc: 'Emergency vehicle readiness, driver allocation, and depot stations'
        };
      case 'activity':
        return {
          title: 'Incident Audit Dossier',
          tag: 'Activity Ledger',
          desc: 'Immutable chronological audit trail of all dispatch events and status transitions'
        };
      case 'command-center':
      default:
        return {
          title: 'Emergency Command Operations',
          tag: 'Central Dispatch Center',
          desc: 'Real-time incident response, triage, and ambulance fleet coordination'
        };
    }
  };

  const getUserRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-mono uppercase">
            <Shield className="w-3 h-3 text-indigo-400" />
            ADMINISTRATOR
          </span>
        );
      case 'operator':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60 font-mono uppercase">
            <Truck className="w-3 h-3 text-amber-400" />
            OPERATOR
          </span>
        );
      case 'hospital':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono uppercase">
            <Building2 className="w-3 h-3 text-cyan-400" />
            HOSPITAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono uppercase">
            <Users className="w-3 h-3 text-emerald-400" />
            PATIENT
          </span>
        );
    }
  };

  // 1. Session verification loading screen
  if (authChecking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-navy-950 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <HeartPulse className="w-10 h-10 text-blue-400 animate-pulse" />
          <span className="text-xs text-slate-400 font-medium tracking-wide">
            Verifying LifeLine AI secure session...
          </span>
        </div>
      </div>
    );
  }

  // 2. Authentication view if user is not logged in
  if (!currentUser) {
    return (
      <>
        <AuthView onAuthSuccess={handleAuthSuccess} onAddToast={addToast} />
        {/* Global Toast Notifications */}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3 rounded-xl border text-xs shadow-xl animate-in slide-in-from-bottom-2 ${
                toast.type === 'error'
                  ? 'bg-red-950/95 border-red-700 text-red-200'
                  : toast.type === 'success'
                  ? 'bg-emerald-950/95 border-emerald-700 text-emerald-200'
                  : 'bg-navy-900/95 border-blue-700 text-blue-200'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      </>
    );
  }

  const currentSectionInfo = getSectionInfo(activeSection);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-navy-950 text-slate-100 antialiased font-sans">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-navy-900/95 backdrop-blur z-20">
        {/* Brand Branding */}
        <div className="p-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <HeartPulse className="w-6 h-6 text-blue-400 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-navy-900"></div>
            </div>
            <div>
              <h1 className="font-bold tracking-tight text-lg text-white flex items-center gap-1.5">
                LifeLine <span className="text-blue-400 font-extrabold text-sm px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-500/30">AI</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">Emergency Command System</p>
            </div>
          </div>

          <div className="mt-3 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">InnoHacks 2.0</span>
            <span className="text-[10px] font-medium text-emerald-400">Tirupati District</span>
          </div>
        </div>

        {/* Dynamic Role-Based Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {/* A. PATIENT NAVIGATION */}
          {effectiveRole === 'patient' && (
            <>
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Patient Emergency Services
              </div>
              <button
                onClick={() => setActiveSection('patient-portal')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'patient-portal'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HeartPulse className="w-4 h-4 text-red-400" />
                  <span>Emergency SOS Portal</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              </button>

              <div className="mt-6 p-3 rounded-xl bg-navy-950/80 border border-slate-800 text-xs space-y-1.5">
                <span className="text-slate-400 text-[10px] uppercase font-bold block">Emergency Helpline</span>
                <div className="text-white font-mono font-bold text-sm flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>108 / 112 Free SOS</span>
                </div>
                <p className="text-slate-400 text-[10px] leading-tight">
                  Tirupati District Central Emergency Medical Response Line
                </p>
              </div>
            </>
          )}

          {/* B. AMBULANCE OPERATOR NAVIGATION */}
          {effectiveRole === 'operator' && (
            <>
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Fleet Operations
              </div>
              <button
                onClick={() => setActiveSection('operator-dashboard')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'operator-dashboard'
                    ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>Assigned Vehicle Ops</span>
                </div>
              </button>

              <div className="pt-3 px-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Module 2 — Traffic AI
              </div>
              <button
                onClick={() => setActiveSection('traffic-preemption')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeSection === 'traffic-preemption'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Radio className={`w-4 h-4 ${activeSection === 'traffic-preemption' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="font-semibold">Arterial Green Wave</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              </button>

              <button
                onClick={() => setActiveSection('activity')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'activity'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Dispatch Audit Logs</span>
                </div>
              </button>
            </>
          )}

          {/* C. HOSPITAL COORDINATOR NAVIGATION */}
          {effectiveRole === 'hospital' && (
            <>
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Emergency Department
              </div>
              <button
                onClick={() => setActiveSection('hospital-dashboard')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'hospital-dashboard'
                    ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span>Inbound ER Triage</span>
                </div>
              </button>

              <button
                onClick={() => setActiveSection('queue')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'queue'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Emergency Queue</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">{emergencies.length}</span>
              </button>

              <button
                onClick={() => setActiveSection('activity')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'activity'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Incident Audit Logs</span>
                </div>
              </button>
            </>
          )}

          {/* D. ADMINISTRATOR (FULL ACCESS) */}
          {effectiveRole === 'admin' && (
            <>
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Module 1 — Dispatch Operations
              </div>

              <button
                onClick={() => setActiveSection('command-center')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'command-center'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4" />
                  <span>Command Center</span>
                </div>
                {stats.active_emergencies > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    {stats.active_emergencies}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveSection('queue')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'queue'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Emergency Queue</span>
                </div>
                <span className="text-xs text-slate-400 font-mono">{emergencies.length}</span>
              </button>

              <button
                onClick={() => setActiveSection('fleet')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'fleet'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Ambulance className="w-4 h-4" />
                  <span>Ambulance Fleet</span>
                </div>
                <span className="text-xs text-emerald-400 font-mono">{stats.available_ambulances} Free</span>
              </button>

              <button
                onClick={() => setActiveSection('activity')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'activity'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Incident Audit Logs</span>
                </div>
              </button>

              {/* Module 2: Smart Traffic Signal Preemption Navigation */}
              <div className="pt-4 px-3 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Module 2 — Traffic AI</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-700/50">
                  ACTIVE
                </span>
              </div>

              <button
                onClick={() => setActiveSection('traffic-preemption')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeSection === 'traffic-preemption'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Radio className={`w-4 h-4 ${activeSection === 'traffic-preemption' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="font-semibold">Smart Traffic Preemption</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              </button>

              {/* Module 3: Security & Authorized Accounts */}
              <div className="pt-4 px-3 pb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Module 3 — Security</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-950 text-indigo-400 border border-indigo-700/50">
                  NEW
                </span>
              </div>

              <button
                onClick={() => setActiveSection('users')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === 'users'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Authorized Accounts</span>
                </div>
              </button>

              {/* Role Dashboards Preview for Hackathon Demonstrations */}
              <div className="pt-4 px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Demo Role Views
              </div>

              <button
                onClick={() => setActiveSection('patient-portal')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeSection === 'patient-portal'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Patient Emergency Portal</span>
                </div>
              </button>

              <button
                onClick={() => setActiveSection('operator-dashboard')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeSection === 'operator-dashboard'
                    ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ambulance Operator View</span>
                </div>
              </button>

              <button
                onClick={() => setActiveSection('hospital-dashboard')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  activeSection === 'hospital-dashboard'
                    ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Hospital Triage View</span>
                </div>
              </button>
            </>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-navy-950/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">System Connection</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}
              ></span>
              <span className={`text-xs font-medium ${backendConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {backendConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                await api.seedDatabase(false);
                addToast('success', 'Demo fleet and incidents refreshed.');
                loadDashboardData();
              } catch (err) {
                addToast('error', 'Failed to seed demo data.');
              }
            }}
            className="w-full text-center text-[11px] py-1.5 px-2 rounded border border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            Re-verify Demo Fleet
          </button>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-navy-950">
        {/* Header Bar */}
        <header className="h-16 px-6 border-b border-slate-800/80 bg-navy-900/80 backdrop-blur flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                {currentSectionInfo.title}
                <span className="text-xs font-normal px-2 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-700/40">
                  {currentSectionInfo.tag}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {currentSectionInfo.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* System Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-navy-950/70 text-xs">
              <div className={`w-2 h-2 rounded-full ${backendConnected ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`}></div>
              <span className="text-slate-300 font-mono text-[11px]">
                {backendConnected ? 'FastAPI :8000 (Active)' : 'Backend Disconnected'}
              </span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Admin Role Switcher (Preview role for demo) */}
            {currentUser?.role === 'admin' && (
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-navy-950 border border-slate-700 text-xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Preview View:</span>
                <select
                  value={previewRole || 'admin'}
                  onChange={(e) => handleRolePreviewChange(e.target.value)}
                  className="bg-transparent text-white font-medium text-xs focus:outline-none cursor-pointer"
                >
                  <option value="admin" className="bg-navy-900">Administrator (All)</option>
                  <option value="patient" className="bg-navy-900">Patient / Requester</option>
                  <option value="operator" className="bg-navy-900">Ambulance Operator</option>
                  <option value="hospital" className="bg-navy-900">Hospital Coordinator</option>
                </select>
              </div>
            )}

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-navy-950 border border-slate-700/80">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">
                {currentUser?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold text-white leading-tight truncate max-w-[120px]">
                  {currentUser?.full_name}
                </div>
                <div className="mt-0.5">
                  {getUserRoleBadge(effectiveRole)}
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg border border-slate-700 bg-slate-850 hover:bg-red-950/60 hover:border-red-700/60 text-slate-300 hover:text-red-300 transition-colors"
              title="Sign Out of LifeLine AI"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dashboard Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Module 3 Role Dashboards */}
          {activeSection === 'patient-portal' && (
            <PatientPortal currentUser={currentUser} onAddToast={addToast} />
          )}

          {activeSection === 'operator-dashboard' && (
            <OperatorDashboard
              currentUser={currentUser}
              onAddToast={addToast}
              onNavigateToPreemption={() => setActiveSection('traffic-preemption')}
            />
          )}

          {activeSection === 'hospital-dashboard' && (
            <HospitalDashboard currentUser={currentUser} onAddToast={addToast} />
          )}

          {activeSection === 'users' && (
            <UserManagementView onAddToast={addToast} />
          )}

          {/* Module 2: Smart Traffic Preemption Dashboard */}
          {activeSection === 'traffic-preemption' && (
            <TrafficPreemptionDashboard onAddToast={addToast} />
          )}

          {/* Module 1: Dispatch Operations & Command Center */}
          {(activeSection === 'command-center' || activeSection === 'queue' || activeSection === 'fleet' || activeSection === 'activity') && (
            <>
              {/* KPI CARDS SECTION */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* 1. Total Incidents */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-navy-900/60 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Emergencies</span>
                <Activity className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-white font-mono tracking-tight">
                {stats.total_emergencies}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                <span className="text-blue-400">{stats.critical_emergencies} Critical</span>
                <span>•</span>
                <span>{stats.high_emergencies} High</span>
              </div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* 2. Active Incidents */}
            <div className="p-4 rounded-xl border border-amber-900/30 bg-navy-900/60 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Active Incidents</span>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                </span>
              </div>
              <div className="mt-2 text-2xl font-extrabold text-amber-400 font-mono tracking-tight">
                {stats.active_emergencies}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                <span className="text-amber-400 font-medium">{stats.pending_emergencies} Pending Dispatch</span>
              </div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* 3. Available Ambulances */}
            <div className="p-4 rounded-xl border border-emerald-900/30 bg-navy-900/60 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Available Units</span>
                <Ambulance className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-emerald-400 font-mono tracking-tight">
                {stats.available_ambulances}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                <span>Fleet Ready to Dispatch</span>
              </div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* 4. Busy Ambulances */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-navy-900/60 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Dispatched Units</span>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-blue-400 font-mono tracking-tight">
                {stats.busy_ambulances}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                <span>Currently on Missions</span>
              </div>
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* 5. Completed Incidents */}
            <div className="p-4 rounded-xl border border-slate-800/80 bg-navy-900/60 shadow-sm relative overflow-hidden group col-span-2 md:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Resolved Incidents</span>
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-200 font-mono tracking-tight">
                {stats.completed_emergencies}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                <span>Safely Delivered & Closed</span>
              </div>
            </div>
          </div>

          {/* MAIN VIEW TABS: COMMAND CENTER / QUEUE / FLEET / ACTIVITY */}
          {(activeSection === 'command-center' || activeSection === 'queue') && (
            <section className="space-y-4">
              {/* Emergency Queue Header & Filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-navy-900/70 border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Emergency Incident Queue
                      <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {filteredEmergencies.length}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">Real-time incident status and ambulance assignment dispatch</p>
                  </div>
                </div>

                {/* Filter Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search incident, location..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-navy-950 border border-slate-700/80 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-44 md:w-56"
                    />
                  </div>

                  {/* Status Dropdown */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="py-1.5 px-2.5 rounded-lg text-xs bg-navy-950 border border-slate-700/80 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending Dispatch</option>
                    <option value="assigned">Ambulance Assigned</option>
                    <option value="en_route">En Route</option>
                    <option value="arrived">Arrived Scene</option>
                    <option value="completed">Completed</option>
                  </select>

                  {/* Severity Dropdown */}
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="py-1.5 px-2.5 rounded-lg text-xs bg-navy-950 border border-slate-700/80 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Incidents Table */}
              <div className="rounded-xl border border-slate-800/90 bg-navy-900/60 overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Incident ID</th>
                        <th className="py-3 px-4">Patient / Caller</th>
                        <th className="py-3 px-4">Type & Severity</th>
                        <th className="py-3 px-4">Pickup Location & Hospital</th>
                        <th className="py-3 px-4">Assigned Unit</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Available Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {loading ? (
                        <tr>
                          <td colSpan="7" className="py-12 text-center text-slate-400">
                            <div className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                              <span>Loading emergency dispatch records...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredEmergencies.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-12 text-center">
                            <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                              <ShieldAlert className="w-10 h-10 text-slate-400 opacity-40" />
                              <p className="text-sm font-medium text-slate-300">No emergency incidents found</p>
                              <p className="text-xs text-slate-400">
                                {searchQuery || statusFilter !== 'all' || severityFilter !== 'all'
                                  ? 'Try adjusting your search or filters'
                                  : 'Click "+ New Emergency" to register the first incident'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredEmergencies.map((em) => (
                          <tr
                            key={em.id}
                            className={`hover:bg-slate-800/30 transition-colors ${
                              em.severity === 'critical' && em.status !== 'completed' ? 'bg-red-950/10' : ''
                            }`}
                          >
                            {/* Incident ID */}
                            <td className="py-3 px-4 font-mono font-medium text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <span className="text-blue-400 font-semibold">{em.incident_id}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {new Date(em.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </td>

                            {/* Patient / Caller */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-200 flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <span>{em.caller_name}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{em.contact_number}</span>
                              </div>
                            </td>

                            {/* Type & Severity */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-200 mb-1">{em.emergency_type}</div>
                              {getSeverityBadge(em.severity)}
                            </td>

                            {/* Location */}
                            <td className="py-3 px-4 max-w-xs">
                              <div className="flex items-start gap-1.5 text-slate-300">
                                <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <span className="truncate" title={em.pickup_location}>
                                  {em.pickup_location}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                                <Building2 className="w-3 h-3 text-blue-400 flex-shrink-0" />
                                <span className="truncate" title={em.destination_hospital}>
                                  {em.destination_hospital}
                                </span>
                              </div>
                            </td>

                            {/* Assigned Unit */}
                            <td className="py-3 px-4">
                              {em.assigned_ambulance ? (
                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-950/60 border border-blue-700/40 text-blue-300">
                                  <Truck className="w-3.5 h-3.5 text-blue-400" />
                                  <span className="font-mono font-bold">{em.assigned_ambulance.vehicle_code}</span>
                                  <span className="text-[10px] text-slate-400">({em.assigned_ambulance.driver_name})</span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700/50">
                                  Unassigned
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4">{getStatusBadge(em.status)}</td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Workflow step buttons */}
                                {em.status === 'pending' && (
                                  <button
                                    onClick={() => setAssigningEmergency(em)}
                                    className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1 transition-colors shadow-sm"
                                  >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>Dispatch</span>
                                  </button>
                                )}

                                {em.status === 'assigned' && (
                                  <button
                                    onClick={() => handleStatusTransition(em, 'en_route')}
                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-300 hover:text-white font-medium text-xs flex items-center gap-1 transition-colors"
                                  >
                                    <Navigation className="w-3.5 h-3.5" />
                                    <span>En Route</span>
                                  </button>
                                )}

                                {em.status === 'en_route' && (
                                  <button
                                    onClick={() => handleStatusTransition(em, 'arrived')}
                                    className="px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600 border border-purple-500/40 text-purple-300 hover:text-white font-medium text-xs flex items-center gap-1 transition-colors"
                                  >
                                    <MapPin className="w-3.5 h-3.5" />
                                    <span>Arrived</span>
                                  </button>
                                )}

                                {em.status === 'arrived' && (
                                  <button
                                    onClick={() => handleStatusTransition(em, 'completed')}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1 transition-colors shadow-sm"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Complete</span>
                                  </button>
                                )}

                                {/* Audit / Details Button */}
                                <button
                                  onClick={() => handleOpenHistory(em)}
                                  className="p-1.5 rounded-lg border border-slate-700/80 bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                                  title="View Incident Audit History"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* AMBULANCE FLEET SECTION */}
          {(activeSection === 'command-center' || activeSection === 'fleet') && (
            <section className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-navy-900/70 border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                    <Ambulance className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      Ambulance Fleet Status
                      <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {ambulances.length} Units
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">Emergency vehicle readiness, driver allocation, and depot stations</p>
                  </div>
                </div>

                {/* Fleet filter tabs */}
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg p-1 bg-navy-950 border border-slate-800 text-xs">
                    <button
                      onClick={() => setFleetFilter('all')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors ${
                        fleetFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({ambulances.length})
                    </button>
                    <button
                      onClick={() => setFleetFilter('available')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors ${
                        fleetFilter === 'available' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Available ({stats.available_ambulances})
                    </button>
                    <button
                      onClick={() => setFleetFilter('busy')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors ${
                        fleetFilter === 'busy' ? 'bg-amber-950 text-amber-300 border border-amber-700/40' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Busy ({stats.busy_ambulances})
                    </button>
                  </div>

                  <button
                    onClick={() => setShowAddAmbulanceModal(true)}
                    className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
                    title="Add Ambulance"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Fleet Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAmbulances.map((amb) => (
                  <div
                    key={amb.id}
                    className={`p-4 rounded-xl border transition-all ${
                      amb.status === 'available'
                        ? 'border-emerald-900/40 bg-navy-900/50 hover:border-emerald-700/60'
                        : 'border-slate-800 bg-navy-900/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-sm ${
                            amb.status === 'available'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
                              : 'bg-amber-950/80 text-amber-400 border border-amber-700/50'
                          }`}
                        >
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-sm text-white">{amb.vehicle_code}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{amb.driver_name}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status Pill */}
                      {amb.status === 'available' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-700/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          AVAILABLE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-400 border border-amber-700/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          ON MISSION
                        </span>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          Station
                        </span>
                        <span className="text-slate-200 font-medium truncate max-w-[180px]">
                          {amb.current_location || 'Emergency Bay'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Phone className="w-3 h-3 text-slate-400" />
                          Phone
                        </span>
                        <span className="text-slate-300 font-mono text-[11px]">
                          {amb.contact_number || 'N/A'}
                        </span>
                      </div>

                      {amb.current_incident_id && (
                        <div className="mt-2 p-2 rounded-lg bg-amber-950/30 border border-amber-800/30 flex items-center justify-between">
                          <span className="text-[11px] text-amber-300 font-medium">Active Incident:</span>
                          <span className="font-mono text-xs font-bold text-amber-400">
                            INC-ID #{amb.current_incident_id}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AUDIT LOG & RECENT ACTIVITY SECTION */}
          {(activeSection === 'command-center' || activeSection === 'activity') && (
            <section className="space-y-4 pt-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-navy-900/70 border border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    <Activity className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Live Incident Audit & Activity Stream</h3>
                    <p className="text-xs text-slate-400">Immutable ledger of dispatch transitions, assignments, and completions</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-400">Auto-updating</span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-navy-900/50 p-4">
                <div className="space-y-3">
                  {recentActivity.length === 0 ? (
                    <p className="text-center py-6 text-xs text-slate-400">No activity logged yet.</p>
                  ) : (
                    recentActivity.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 p-3 rounded-lg bg-navy-950/60 border border-slate-800/80 text-xs hover:border-slate-700/80 transition-colors"
                      >
                        <div className="p-1.5 rounded bg-blue-950 text-blue-400 border border-blue-800/40 flex-shrink-0 mt-0.5">
                          <Radio className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-200">{log.action}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-slate-300 mt-1">{log.description}</p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span>Actor: {log.actor}</span>
                            {log.previous_status && log.new_status && (
                              <span>
                                Transition: {log.previous_status} → {log.new_status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
            </>
          )}
        </main>
      </div>

      {/* 3. MODAL: REGISTER NEW EMERGENCY */}
      {showRegisterModal && (
        <RegisterEmergencyModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={async () => {
            setShowRegisterModal(false);
            addToast('success', 'Emergency incident successfully registered!');
            await loadDashboardData();
          }}
        />
      )}

      {/* 4. MODAL: ASSIGN AMBULANCE */}
      {assigningEmergency && (
        <AssignAmbulanceModal
          emergency={assigningEmergency}
          ambulances={ambulances.filter((a) => a.status === 'available')}
          onClose={() => setAssigningEmergency(null)}
          onAssign={handleAssignAmbulance}
        />
      )}

      {/* 5. MODAL: REGISTER AMBULANCE */}
      {showAddAmbulanceModal && (
        <RegisterAmbulanceModal
          onClose={() => setShowAddAmbulanceModal(false)}
          onSuccess={async () => {
            setShowAddAmbulanceModal(false);
            addToast('success', 'New ambulance successfully added to fleet!');
            await loadDashboardData();
          }}
        />
      )}

      {/* 6. MODAL: INCIDENT AUDIT HISTORY */}
      {inspectingEmergency && (
        <IncidentAuditModal
          emergency={inspectingEmergency}
          history={emergencyHistory}
          loading={historyLoading}
          onClose={() => setInspectingEmergency(null)}
          onStatusTransition={handleStatusTransition}
        />
      )}

      {/* 7. TOAST NOTIFICATIONS STACK */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl shadow-2xl border text-xs flex items-start gap-2.5 backdrop-blur transition-all transform animate-in slide-in-from-right-4 ${
              toast.type === 'error'
                ? 'bg-red-950/95 border-red-700/80 text-red-200'
                : 'bg-emerald-950/95 border-emerald-700/80 text-emerald-200'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{toast.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// CHILD COMPONENT: REGISTER EMERGENCY MODAL
// -------------------------------------------------------------
function RegisterEmergencyModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    caller_name: '',
    contact_number: '',
    emergency_type: 'Cardiac Arrest',
    severity: 'critical',
    pickup_location: '',
    destination_hospital: 'SVIMS Hospital, Tirupati',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Common Tirupati presets
  const tirupatiLocations = [
    'Near Kapila Theertham Temple, Tirupati',
    'Alipiri Tollgate / Bypass Rd, Tirupati',
    'Tirupati Central Railway Station',
    'Bhavani Nagar 2nd Street, Tirupati',
    'Renigunta Highway Junction, Tirupati',
    'Chandragiri Fort Road, Tirupati',
    'SV University Main Gate, Tirupati',
  ];

  const tirupatiHospitals = [
    'SVIMS Hospital, Tirupati',
    'RUIA Government General Hospital, Tirupati',
    'BIRRD Orthopedic Hospital, Tirupati',
    'Apollo Hospitals, Tirupati',
    'Maternity Hospital (Government), Tirupati',
  ];

  const emergencyTypes = [
    'Cardiac Arrest',
    'Severe Trauma',
    'Road Traffic Accident',
    'Respiratory Distress',
    'Stroke / Paralysis',
    'Obstetric / Labor Complication',
    'Burn / Electrocution',
    'Pediatric Emergency',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    // Frontend validation
    if (!formData.caller_name.trim()) {
      setErrorMsg('Caller or patient name is required.');
      return;
    }
    if (!formData.contact_number.trim() || formData.contact_number.length < 7) {
      setErrorMsg('A valid contact phone number is required (min 7 digits).');
      return;
    }
    if (!formData.pickup_location.trim()) {
      setErrorMsg('Pickup location is required.');
      return;
    }
    if (!formData.destination_hospital.trim()) {
      setErrorMsg('Destination hospital is required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.createEmergency(formData);
      onSuccess();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to create emergency record.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-navy-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Register Emergency Incident</h3>
              <p className="text-xs text-slate-400">Direct dispatch registration & triage assessment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/80 border border-red-700 text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Caller Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Patient / Caller Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.caller_name}
                onChange={(e) => setFormData({ ...formData, caller_name: e.target.value })}
                placeholder="e.g. R. Koteswara Rao"
                className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Contact Phone Number <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                required
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                placeholder="e.g. +91 98480 12345"
                className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          {/* Severity Selector */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Severity Level <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'critical', label: 'CRITICAL', color: 'border-red-600 bg-red-950/50 text-red-400' },
                { id: 'high', label: 'HIGH', color: 'border-orange-600 bg-orange-950/50 text-orange-400' },
                { id: 'medium', label: 'MEDIUM', color: 'border-amber-600 bg-amber-950/50 text-amber-300' },
                { id: 'low', label: 'LOW', color: 'border-blue-600 bg-blue-950/50 text-blue-300' },
              ].map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setFormData({ ...formData, severity: s.id })}
                  className={`py-2 px-2 rounded-lg border text-center font-bold transition-all ${
                    formData.severity === s.id
                      ? `${s.color} ring-2 ring-offset-1 ring-offset-navy-900 ring-blue-500`
                      : 'border-slate-800 bg-navy-950/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Emergency Type */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Emergency Nature / Category <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.emergency_type}
              onChange={(e) => setFormData({ ...formData, emergency_type: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            >
              {emergencyTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Pickup Location */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Pickup Location / Address <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.pickup_location}
              onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
              placeholder="e.g. Alipiri Gate, Tirupati"
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
            {/* Location quick chips */}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-[10px] text-slate-400 mr-1 py-0.5">Presets:</span>
              {tirupatiLocations.slice(0, 4).map((loc) => (
                <button
                  type="button"
                  key={loc}
                  onClick={() => setFormData({ ...formData, pickup_location: loc })}
                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {loc.split(',')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Hospital */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Destination Hospital <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.destination_hospital}
              onChange={(e) => setFormData({ ...formData, destination_hospital: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            >
              {tirupatiHospitals.map((hosp) => (
                <option key={hosp} value={hosp}>
                  {hosp}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">Dispatcher / Triage Notes (Optional)</label>
            <textarea
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Initial vitals, landmark directions, caller remarks..."
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none"
            ></textarea>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Registering...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Register & Queue Incident</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// CHILD COMPONENT: ASSIGN AMBULANCE MODAL
// -------------------------------------------------------------
function AssignAmbulanceModal({ emergency, ambulances, onClose, onAssign }) {
  const [selectedAmbId, setSelectedAmbId] = useState(ambulances[0]?.id || null);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedAmbId) return;
    setSubmitting(true);
    await onAssign(selectedAmbId);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-navy-900 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Truck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Dispatch Ambulance</h3>
              <p className="text-xs text-slate-400">Assign available unit to Incident {emergency.incident_id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Incident Summary Card */}
        <div className="p-5 bg-navy-950/50 border-b border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Caller:</span>
            <span className="font-medium text-white">{emergency.caller_name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Emergency Type:</span>
            <span className="font-medium text-white">{emergency.emergency_type}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Pickup:</span>
            <span className="font-medium text-slate-300 truncate max-w-[240px]">{emergency.pickup_location}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Destination:</span>
            <span className="font-medium text-blue-300 truncate max-w-[240px]">{emergency.destination_hospital}</span>
          </div>
        </div>

        {/* Ambulance Selector */}
        <div className="p-6 space-y-4">
          <label className="block text-xs font-semibold text-slate-300">
            Select Available Ambulance Unit ({ambulances.length} available)
          </label>

          {ambulances.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-red-900/40 bg-red-950/20 text-red-300 text-xs">
              <AlertTriangle className="w-6 h-6 mx-auto text-red-400 mb-2" />
              <p className="font-bold">No available ambulances in fleet!</p>
              <p className="mt-1 text-slate-400">All units are currently deployed or busy. Please wait for an active mission to complete.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {ambulances.map((amb) => (
                <div
                  key={amb.id}
                  onClick={() => setSelectedAmbId(amb.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all ${
                    selectedAmbId === amb.id
                      ? 'border-blue-500 bg-blue-950/40 ring-1 ring-blue-500'
                      : 'border-slate-800 bg-navy-950/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="selected_ambulance"
                      checked={selectedAmbId === amb.id}
                      onChange={() => setSelectedAmbId(amb.id)}
                      className="text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-mono font-bold text-white text-sm">{amb.vehicle_code}</span>
                      <span className="text-slate-400 block text-[11px]">
                        Driver: {amb.driver_name} {amb.contact_number && `• ${amb.contact_number}`}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-emerald-400 font-medium block">AVAILABLE</span>
                    <span className="text-[10px] text-slate-400">{amb.current_location || 'Depot'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 text-xs">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || ambulances.length === 0 || !selectedAmbId}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Truck className="w-3.5 h-3.5" />
                  <span>Confirm Dispatch</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// CHILD COMPONENT: REGISTER AMBULANCE MODAL
// -------------------------------------------------------------
function RegisterAmbulanceModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    vehicle_code: '',
    driver_name: '',
    contact_number: '',
    current_location: 'SVIMS Emergency Bay, Tirupati',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.vehicle_code.trim()) {
      setErrorMsg('Vehicle code is required (e.g. AMB-106).');
      return;
    }
    if (!formData.driver_name.trim()) {
      setErrorMsg('Driver name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.registerAmbulance(formData);
      onSuccess();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to register ambulance.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-navy-900 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Add Fleet Ambulance</h3>
              <p className="text-xs text-slate-400">Register vehicle & assign driver</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-950/80 border border-red-700 text-red-200">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Vehicle Code <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. AMB-106"
              value={formData.vehicle_code}
              onChange={(e) => setFormData({ ...formData, vehicle_code: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white font-mono uppercase focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Driver Full Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. C. Subramanyam"
              value={formData.driver_name}
              onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Driver Phone Number</label>
            <input
              type="tel"
              placeholder="e.g. +91 98480 67890"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Depot / Station Landmark</label>
            <input
              type="text"
              placeholder="e.g. RUIA Dispatch Depot, Tirupati"
              value={formData.current_location}
              onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all shadow-md"
            >
              {submitting ? 'Registering...' : 'Register Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// CHILD COMPONENT: INCIDENT AUDIT MODAL
// -------------------------------------------------------------
function IncidentAuditModal({ emergency, history, loading, onClose, onStatusTransition }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-navy-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Incident Audit Dossier
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  {emergency.incident_id}
                </span>
              </h3>
              <p className="text-xs text-slate-400">Complete incident parameters and chronological audit trail</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Incident Summary Card */}
        <div className="p-5 border-b border-slate-800 bg-navy-950/40 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Caller</span>
            <span className="font-medium text-white">{emergency.caller_name}</span>
            <span className="font-mono text-slate-400 block text-[11px]">{emergency.contact_number}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Severity & Type</span>
            <span className="font-bold text-red-400 uppercase">{emergency.severity}</span>
            <span className="text-slate-300 block truncate">{emergency.emergency_type}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Assigned Unit</span>
            {emergency.assigned_ambulance ? (
              <span className="font-mono font-bold text-blue-400">
                {emergency.assigned_ambulance.vehicle_code}
              </span>
            ) : (
              <span className="text-amber-400">Pending Dispatch</span>
            )}
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Current Status</span>
            <span className="font-semibold text-emerald-400 uppercase">{emergency.status}</span>
          </div>
        </div>

        {/* Timeline Log */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>Audit Event Log</span>
          </h4>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-blue-400" />
              <span>Fetching audit history...</span>
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">No audit records found.</p>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {history.map((log) => (
                <div key={log.id} className="relative">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-navy-900"></div>
                  <div className="p-3 rounded-lg bg-navy-950/80 border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span className="font-semibold text-slate-200">{log.action}</span>
                      <span className="font-mono text-[10px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-300">{log.description}</p>
                    <div className="mt-1 text-[10px] text-slate-400 font-mono">
                      Actor: {log.actor}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with status progression actions */}
        <div className="p-4 border-t border-slate-800 bg-navy-950/60 flex items-center justify-between text-xs">
          <div className="text-slate-400">
            {emergency.completed_at ? (
              <span className="text-emerald-400 font-medium">
                Resolved on {new Date(emergency.completed_at).toLocaleTimeString()}
              </span>
            ) : (
              <span>Quick Status Transition:</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {emergency.status === 'assigned' && (
              <button
                onClick={() => onStatusTransition(emergency, 'en_route')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Mark En Route
              </button>
            )}
            {emergency.status === 'en_route' && (
              <button
                onClick={() => onStatusTransition(emergency, 'arrived')}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium"
              >
                Mark Arrived
              </button>
            )}
            {emergency.status === 'arrived' && (
              <button
                onClick={() => onStatusTransition(emergency, 'completed')}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                Complete Incident
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

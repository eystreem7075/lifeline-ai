import React, { useState, useEffect } from 'react';
import {
  Truck,
  Navigation,
  MapPin,
  Building2,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Clock,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Zap,
  Activity
} from 'lucide-react';
import api from '../api';

export default function OperatorDashboard({ currentUser, onAddToast, onNavigateToPreemption }) {
  const [ambulances, setAmbulances] = useState([]);
  const [assignedEmergency, setAssignedEmergency] = useState(null);
  const [myAmbulance, setMyAmbulance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Load ambulance fleet and active assignment
  const loadOperatorData = async () => {
    try {
      const [ambData, emData] = await Promise.all([
        api.getAmbulances(),
        api.getEmergencies(),
      ]);
      setAmbulances(ambData);

      // Match operator vehicle or default to AMB-101
      const foundAmb = ambData.find(
        (a) => a.driver_name.toLowerCase().includes(currentUser.full_name.toLowerCase()) || a.vehicle_code === 'AMB-101'
      ) || ambData[0];
      setMyAmbulance(foundAmb);

      if (foundAmb) {
        const activeEm = emData.find(
          (e) => e.assigned_ambulance_id === foundAmb.id && e.status !== 'completed'
        );
        setAssignedEmergency(activeEm || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperatorData();
    const interval = setInterval(loadOperatorData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusTransition = async (targetStatus) => {
    if (!assignedEmergency) return;
    setUpdating(true);
    try {
      await api.updateEmergencyStatus(assignedEmergency.id, targetStatus);
      onAddToast('success', `Mission status updated to: ${targetStatus.toUpperCase()}`);
      await loadOperatorData();
    } catch (err) {
      onAddToast('error', err.message || 'Status transition failed.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Operator Telemetry Card */}
      <div className="rounded-2xl border border-slate-800 bg-navy-900/80 p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
            <Truck className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                {myAmbulance ? myAmbulance.vehicle_code : 'AMB-101'}
              </h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-amber-950 text-amber-400 border border-amber-700/50">
                ACTIVE VEHICLE
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Operator: <span className="text-white font-medium">{currentUser.full_name}</span> • Station: {myAmbulance?.current_location || 'SVIMS Hub'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-navy-950 border border-slate-800 text-xs text-right">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Duty Status</span>
            <span className={`font-bold uppercase ${assignedEmergency ? 'text-amber-400' : 'text-emerald-400'}`}>
              {assignedEmergency ? 'ON ACTIVE MISSION' : 'AVAILABLE FOR DISPATCH'}
            </span>
          </div>

          <button
            onClick={onNavigateToPreemption}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/20 flex items-center gap-2"
          >
            <Radio className="w-4 h-4 text-emerald-200 animate-pulse" />
            <span>Open Preemption Corridor</span>
          </button>
        </div>
      </div>

      {/* 2. Active Mission Control */}
      {assignedEmergency ? (
        <div className="rounded-2xl border border-blue-500/40 bg-navy-900/90 shadow-2xl p-6 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-950 text-red-400 border border-red-700 mb-2 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                ACTIVE EMERGENCY DISPATCH ASSIGNMENT
              </div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Incident: {assignedEmergency.incident_id}</span>
                <span className="text-xs font-normal text-slate-400">({assignedEmergency.emergency_type})</span>
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-blue-950 text-blue-400 border border-blue-800 uppercase">
                Status: {assignedEmergency.status.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Incident Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-5 text-xs">
            <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Caller & Contact</span>
              <div className="text-white font-medium mt-1">{assignedEmergency.caller_name}</div>
              <a
                href={`tel:${assignedEmergency.contact_number}`}
                className="text-blue-400 hover:underline flex items-center gap-1 font-mono text-xs mt-0.5"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{assignedEmergency.contact_number}</span>
              </a>
            </div>

            <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pickup Location</span>
              <div className="text-amber-400 font-medium flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{assignedEmergency.pickup_location}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-navy-950/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Destination Facility</span>
              <div className="text-emerald-400 font-medium flex items-center gap-1.5 mt-1">
                <Building2 className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{assignedEmergency.destination_hospital}</span>
              </div>
            </div>
          </div>

          {/* Quick Mission Actions */}
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              {assignedEmergency.notes && (
                <span><strong className="text-slate-300">Triage Notes:</strong> {assignedEmergency.notes}</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {assignedEmergency.status === 'assigned' && (
                <button
                  onClick={() => handleStatusTransition('en_route')}
                  disabled={updating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Mark En Route</span>
                </button>
              )}

              {assignedEmergency.status === 'en_route' && (
                <button
                  onClick={() => handleStatusTransition('arrived')}
                  disabled={updating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  <span>Mark Arrived on Scene</span>
                </button>
              )}

              {assignedEmergency.status === 'arrived' && (
                <button
                  onClick={() => handleStatusTransition('completed')}
                  disabled={updating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Patient Handover</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-navy-900/50 p-8 text-center space-y-2">
          <Truck className="w-10 h-10 text-emerald-400 mx-auto opacity-70" />
          <h3 className="text-base font-bold text-white">Standby for Incident Dispatch</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Your vehicle is currently in <span className="text-emerald-400 font-semibold">AVAILABLE</span> status. When Central Command or a patient registers a critical emergency, the assignment details and route will appear here automatically.
          </p>
        </div>
      )}

      {/* 3. Arterial Corridor Preemption Quick Link */}
      <div className="p-5 rounded-2xl border border-slate-800 bg-navy-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-600/20 text-teal-400 border border-teal-500/30">
            <Radio className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Module 2: Arterial Green Wave Preemption</h4>
            <p className="text-xs text-slate-400">View real-time intersection preemption along Alipiri to SVIMS arterial corridor</p>
          </div>
        </div>

        <button
          onClick={onNavigateToPreemption}
          className="px-4 py-2 rounded-xl bg-navy-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
        >
          <span>Open Live Simulator</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

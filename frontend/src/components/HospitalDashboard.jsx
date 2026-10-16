import React, { useState, useEffect } from 'react';
import {
  Building2,
  HeartPulse,
  Truck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Bed,
  Activity,
  Phone,
  FileText,
  Search,
  RefreshCw,
  PlusCircle,
  X
} from 'lucide-react';
import api from '../api';

const HOSPITALS = [
  'SVIMS Super Specialty Hospital',
  'RUIA Government General Hospital',
  'Apollo Hospitals, Tirupati',
];

export default function HospitalDashboard({ currentUser, onAddToast }) {
  const [selectedHospital, setSelectedHospital] = useState(HOSPITALS[0]);
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [handoverModal, setHandoverModal] = useState(null);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  // ER Capacity state
  const [erCapacity, setErCapacity] = useState({
    trauma_bays: 4,
    icu_beds: 3,
    triage_status: 'Code Amber — High Readiness',
  });

  const loadHospitalData = async () => {
    try {
      const data = await api.getEmergencies();
      setEmergencies(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitalData();
    const interval = setInterval(loadHospitalData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter emergencies headed to or at this hospital
  const inboundCases = emergencies.filter(
    (em) =>
      em.destination_hospital.toLowerCase().includes(selectedHospital.toLowerCase().split(' ')[0]) &&
      em.status !== 'completed'
  );

  const completedToday = emergencies.filter(
    (em) =>
      em.destination_hospital.toLowerCase().includes(selectedHospital.toLowerCase().split(' ')[0]) &&
      em.status === 'completed'
  );

  const handleCompleteHandover = async (e) => {
    e.preventDefault();
    if (!handoverModal) return;
    setUpdating(true);
    try {
      await api.updateEmergencyStatus(handoverModal.id, 'completed', handoverNotes || 'Patient admitted to ER');
      onAddToast('success', `Incident ${handoverModal.incident_id} successfully admitted & completed.`);
      setHandoverModal(null);
      setHandoverNotes('');
      await loadHospitalData();
    } catch (err) {
      onAddToast('error', err.message || 'Failed to complete handover.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Facility Selector */}
      <div className="rounded-2xl border border-slate-800 bg-navy-900/80 p-5 sm:p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
            <Building2 className="w-8 h-8 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">{selectedHospital}</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-700/50">
                TRIAGE ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Coordinator: <span className="text-white font-medium">{currentUser.full_name}</span> • Emergency Department Command
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedHospital}
            onChange={(e) => setSelectedHospital(e.target.value)}
            className="py-2 px-3 rounded-xl bg-navy-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium"
          >
            {HOSPITALS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. ER Capacity KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-red-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Inbound Ambulances</span>
          <div className="text-2xl font-bold text-red-400 mt-1 font-mono">{inboundCases.length}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Critical & Urgent Incoming</span>
        </div>

        <div className="p-4 rounded-xl border border-emerald-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Available Trauma Bays</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{erCapacity.trauma_bays}</div>
          <span className="text-[11px] text-emerald-400/80 mt-0.5 block">Staffed & Ready</span>
        </div>

        <div className="p-4 rounded-xl border border-blue-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">ICU Beds Available</span>
          <div className="text-2xl font-bold text-blue-400 mt-1 font-mono">{erCapacity.icu_beds}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Ventilator Equipped</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Handover Closed Today</span>
          <div className="text-2xl font-bold text-slate-200 mt-1 font-mono">{completedToday.length}</div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Safely Admitted</span>
        </div>
      </div>

      {/* 3. Inbound Patients Queue */}
      <div className="rounded-2xl border border-slate-800 bg-navy-900/70 overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">Inbound Emergency Inflow Queue</h3>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
              {inboundCases.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">Real-time triage telemetry from dispatch ambulances</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Incident ID</th>
                <th className="py-3 px-4">Patient / Caller</th>
                <th className="py-3 px-4">Condition & Triage</th>
                <th className="py-3 px-4">Pickup Point</th>
                <th className="py-3 px-4">Assigned Unit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Intake Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {inboundCases.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                    <p className="text-sm font-semibold text-slate-300">No incoming emergency transports right now</p>
                    <p className="text-xs text-slate-400">All emergency admissions are up to date.</p>
                  </td>
                </tr>
              ) : (
                inboundCases.map((em) => (
                  <tr key={em.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400">{em.incident_id}</td>
                    <td className="py-3 px-4 font-medium text-white">
                      <div>{em.caller_name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{em.contact_number}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-200">{em.emergency_type}</div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800">
                        {em.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-slate-300">{em.pickup_location}</td>
                    <td className="py-3 px-4">
                      {em.assigned_ambulance ? (
                        <span className="font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/40">
                          {em.assigned_ambulance.vehicle_code}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Assigning Unit...</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[11px] font-semibold text-blue-400">
                        {em.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setHandoverModal(em)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors shadow-sm"
                      >
                        Patient Handover
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Handover Modal */}
      {handoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-cyan-700/60 bg-navy-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-cyan-950/40">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Patient Intake & Handover</h3>
              </div>
              <button onClick={() => setHandoverModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteHandover} className="p-6 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-navy-950 border border-slate-800">
                <div className="font-semibold text-white">{handoverModal.caller_name} ({handoverModal.emergency_type})</div>
                <div className="text-slate-400 text-[11px] mt-0.5">Incident ID: {handoverModal.incident_id}</div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">ER Admission Notes / Ward Assigned</label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Admitted to Trauma Bay 2. Vitals stable. Handover received from driver."
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setHandoverModal(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-md flex items-center gap-2"
                >
                  {updating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Confirm Handover & Admit</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

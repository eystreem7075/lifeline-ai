import React, { useState, useEffect } from 'react';
import {
  HeartPulse,
  AlertTriangle,
  MapPin,
  Building2,
  Phone,
  Shield,
  Clock,
  Truck,
  CheckCircle2,
  PlusCircle,
  HelpCircle,
  Info,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';
import api from '../api';

export default function PatientPortal({ currentUser, onAddToast }) {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form for requesting ambulance
  const [formData, setFormData] = useState({
    caller_name: currentUser?.full_name || '',
    contact_number: currentUser?.phone_number || '',
    emergency_type: 'Cardiac Emergency',
    severity: 'critical',
    pickup_location: 'Alipiri Gateway, Tirupati',
    destination_hospital: 'SVIMS Super Specialty Hospital',
    notes: 'Severe chest tightness, breathing difficulty.',
  });

  const fetchMyEmergencies = async () => {
    try {
      const data = await api.getEmergencies();
      // Match caller name or show active incidents
      const userIncidents = data.filter(
        (em) => em.caller_name.toLowerCase().includes(currentUser.full_name.toLowerCase()) || em.status !== 'completed'
      );
      setEmergencies(userIncidents.length > 0 ? userIncidents : data.slice(0, 3));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyEmergencies();
    const interval = setInterval(fetchMyEmergencies, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const newInc = await api.createEmergency(formData);
      onAddToast('success', `Emergency SOS dispatched! Incident ID: ${newInc.incident_id}`);
      setShowRequestModal(false);
      await fetchMyEmergencies();
    } catch (err) {
      onAddToast('error', err.message || 'Failed to request emergency assistance.');
    } finally {
      setSubmitting(false);
    }
  };

  // Find most recent active emergency
  const activeIncident = emergencies.find((em) => em.status !== 'completed');

  return (
    <div className="space-y-6">
      {/* 1. Hero Emergency Action Banner */}
      <div className="relative rounded-3xl border border-red-700/50 bg-gradient-to-r from-red-950/80 via-navy-900 to-navy-900 p-6 sm:p-8 overflow-hidden shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-600/20 text-red-400 border border-red-500/30 mb-3 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              24/7 EMERGENCY RESPONSE HELPLINE
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Emergency Medical Assistance Portal
            </h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              If someone is in immediate medical danger, trigger a high-priority dispatch with automatic GPS location broadcast and dynamic traffic signal preemption.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => setShowRequestModal(true)}
              className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-sm uppercase tracking-wider transition-all shadow-xl shadow-red-600/30 flex items-center justify-center gap-3 transform active:scale-95 animate-radar-pulse"
            >
              <HeartPulse className="w-5 h-5 text-white animate-bounce" />
              <span>REQUEST AMBULANCE (SOS)</span>
            </button>
            <a
              href="tel:108"
              className="w-full sm:w-auto px-5 py-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-white font-bold text-sm flex items-center justify-center gap-2 font-mono transition-colors"
            >
              <Phone className="w-4 h-4 text-emerald-400" />
              <span>Call 108 Direct</span>
            </a>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* 2. Active Incident Live Status Tracker */}
      {activeIncident ? (
        <div className="p-6 rounded-2xl border border-blue-500/40 bg-navy-900/80 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Truck className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Active Dispatch Tracking</h3>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                    {activeIncident.incident_id}
                  </span>
                </div>
                <p className="text-xs text-slate-400">Real-time status updates from Tirupati Central Dispatch</p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-semibold uppercase px-2.5 py-1 rounded-full bg-red-950/80 text-red-400 border border-red-800/60">
                Severity: {activeIncident.severity.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Progress Milestones */}
          <div className="py-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { id: 'pending', label: '1. Incident Registered', done: true },
              { id: 'assigned', label: '2. Unit Assigned', done: ['assigned', 'en_route', 'arrived', 'completed'].includes(activeIncident.status) },
              { id: 'en_route', label: '3. En Route to You', done: ['en_route', 'arrived', 'completed'].includes(activeIncident.status) },
              { id: 'arrived', label: '4. Arrived on Scene', done: ['arrived', 'completed'].includes(activeIncident.status) },
            ].map((step, idx) => (
              <div key={step.id} className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs mb-2 transition-all ${
                    step.done
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {step.done ? <CheckCircle2 className="w-5 h-5 text-white" /> : idx + 1}
                </div>
                <span className={`text-xs font-semibold ${step.done ? 'text-white' : 'text-slate-400'}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Incident Details Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
            <div className="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pickup Location</span>
              <div className="text-slate-200 font-medium flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span className="truncate">{activeIncident.pickup_location}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Destination Facility</span>
              <div className="text-slate-200 font-medium flex items-center gap-1.5 mt-1">
                <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <span className="truncate">{activeIncident.destination_hospital}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-navy-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Assigned Ambulance Unit</span>
              <div className="text-slate-200 font-medium flex items-center gap-1.5 mt-1">
                <Truck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  {activeIncident.assigned_ambulance
                    ? `${activeIncident.assigned_ambulance.vehicle_code} (${activeIncident.assigned_ambulance.driver_name})`
                    : 'Dispatching nearest available unit...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-2xl border border-slate-800 bg-navy-900/40 text-center py-8">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
          <h3 className="text-sm font-bold text-white">No Active Emergency Incidents</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            You do not currently have an ongoing emergency dispatch request. Click the SOS button above if you require medical assistance.
          </p>
        </div>
      )}

      {/* 3. Emergency First Aid & Safety Instructions Guide */}
      <div className="rounded-2xl border border-slate-800 bg-navy-900/60 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-teal-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Critical First-Aid Protocols While Ambulance Is En Route
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-navy-950/80 border border-slate-800 space-y-2">
            <div className="font-bold text-red-400 flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4" />
              <span>Suspected Cardiac Arrest</span>
            </div>
            <ul className="text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed text-[11px]">
              <li>Check for responsiveness and regular breathing.</li>
              <li>Place hands in center of chest and push hard & fast (100–120 bpm).</li>
              <li>Keep phone on speaker to relay instructions to dispatch.</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-navy-950/80 border border-slate-800 space-y-2">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Severe Trauma & Bleeding</span>
            </div>
            <ul className="text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed text-[11px]">
              <li>Apply firm, continuous direct pressure with a clean cloth.</li>
              <li>Do NOT remove foreign objects lodged in the body.</li>
              <li>Keep the patient warm and lying still to prevent shock.</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-navy-950/80 border border-slate-800 space-y-2">
            <div className="font-bold text-blue-400 flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              <span>Respiratory Difficulty / Asthma</span>
            </div>
            <ul className="text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed text-[11px]">
              <li>Help patient sit upright to ease airway expansion.</li>
              <li>Loosen tight clothing around neck and chest.</li>
              <li>Assist with prescribed inhaler if conscious and oriented.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-red-700/60 bg-navy-900 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-red-950/40">
              <div className="flex items-center gap-2.5">
                <HeartPulse className="w-5 h-5 text-red-400 animate-pulse" />
                <div>
                  <h3 className="text-base font-bold text-white">Emergency Assistance Request</h3>
                  <p className="text-xs text-red-300">Tirupati District Medical Dispatch System</p>
                </div>
              </div>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Patient Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.caller_name}
                    onChange={(e) => setFormData({ ...formData, caller_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Contact Phone *</label>
                  <input
                    type="tel"
                    required
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Emergency Nature *</label>
                  <select
                    value={formData.emergency_type}
                    onChange={(e) => setFormData({ ...formData, emergency_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                  >
                    <option value="Cardiac Emergency">Cardiac Emergency</option>
                    <option value="Road Traffic Accident">Road Traffic Accident</option>
                    <option value="Respiratory Distress">Respiratory Distress</option>
                    <option value="Severe Trauma / Stroke">Severe Trauma / Stroke</option>
                    <option value="Maternal / Pediatric">Maternal / Pediatric</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Severity Priority *</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white font-bold text-red-400"
                  >
                    <option value="critical">CRITICAL (Immediate Life Threat)</option>
                    <option value="high">HIGH (Urgent Medical Attention)</option>
                    <option value="medium">MEDIUM (Stable / Acute)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Pickup Location / Landmark *</label>
                <input
                  type="text"
                  required
                  value={formData.pickup_location}
                  onChange={(e) => setFormData({ ...formData, pickup_location: e.target.value })}
                  placeholder="e.g. Alipiri Gateway, Tirupati"
                  className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Hospital *</label>
                <select
                  value={formData.destination_hospital}
                  onChange={(e) => setFormData({ ...formData, destination_hospital: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                >
                  <option value="SVIMS Super Specialty Hospital">SVIMS Super Specialty Hospital, Tirupati</option>
                  <option value="RUIA Government General Hospital">RUIA Government General Hospital, Tirupati</option>
                  <option value="Apollo Hospitals, Tirupati">Apollo Hospitals, Tirupati</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Symptoms / Caller Notes</label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-slate-700 text-white"
                ></textarea>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-lg shadow-red-600/30 flex items-center gap-2"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <HeartPulse className="w-4 h-4" />}
                  <span>Broadcast Emergency SOS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

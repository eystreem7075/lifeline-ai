import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Ambulance,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  FastForward,
  Filter,
  Flame,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Split,
  Timer,
  Truck,
  Wifi,
  Zap,
  X
} from 'lucide-react';
import api from './api';

export default function TrafficPreemptionDashboard({ onAddToast }) {
  // Simulation State
  const [trafficState, setTrafficState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [selectedScenario, setSelectedScenario] = useState('svims_critical');
  const [autoPreemption, setAutoPreemption] = useState(true);
  const [selectedIntersection, setSelectedIntersection] = useState(null);
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'preempted', 'normal'
  const [syncingModule1, setSyncingModule1] = useState(false);
  const [stepping, setStepping] = useState(false);

  // Map display settings
  const [showZones, setShowZones] = useState(true);
  const [showCorridors, setShowCorridors] = useState(true);

  // Simulation timer loop ref
  const timerRef = useRef(null);

  // Fetch full state
  const fetchState = useCallback(async () => {
    try {
      const data = await api.getTrafficState();
      setTrafficState(data);
      if (data.is_running !== isPlaying) {
        setIsPlaying(data.is_running);
      }
      if (data.simulation_speed !== simSpeed) {
        setSimSpeed(data.simulation_speed);
      }
      if (data.scenario_id && data.scenario_id !== selectedScenario) {
        setSelectedScenario(data.scenario_id);
      }
    } catch (err) {
      console.error('Failed to fetch traffic state:', err);
    } finally {
      setLoading(false);
    }
  }, [isPlaying, simSpeed, selectedScenario]);

  // Initial load & polling
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Playback loop
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(300, 1000 / simSpeed);
      timerRef.current = setInterval(async () => {
        try {
          const updated = await api.stepSimulation(1);
          setTrafficState(updated);
        } catch (err) {
          console.error('Simulation step error:', err);
        }
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, simSpeed]);

  // Toggle Play / Pause
  const handleTogglePlay = async () => {
    const nextRunning = !isPlaying;
    setIsPlaying(nextRunning);
    try {
      await api.controlSimulation({ is_running: nextRunning });
      if (onAddToast) {
        onAddToast(
          nextRunning ? 'success' : 'info',
          nextRunning ? 'Simulation started (Auto-tick active)' : 'Simulation paused'
        );
      }
    } catch (err) {
      console.error('Control error:', err);
    }
  };

  // Speed change
  const handleChangeSpeed = async (speed) => {
    setSimSpeed(speed);
    try {
      await api.controlSimulation({ speed });
    } catch (err) {
      console.error('Speed error:', err);
    }
  };

  // Step forward manually
  const handleStep = async (dt = 2) => {
    setStepping(true);
    try {
      const updated = await api.stepSimulation(dt);
      setTrafficState(updated);
    } catch (err) {
      console.error('Step error:', err);
    } finally {
      setStepping(false);
    }
  };

  // Reset simulation
  const handleReset = async (scenario = selectedScenario) => {
    try {
      const updated = await api.resetSimulation(scenario);
      setTrafficState(updated);
      setSelectedScenario(scenario);
      if (onAddToast) {
        onAddToast('success', `Traffic simulation reset to scenario: ${scenario}`);
      }
    } catch (err) {
      console.error('Reset error:', err);
    }
  };

  // Toggle Auto-Preemption
  const handleToggleAuto = async () => {
    const nextAuto = !autoPreemption;
    setAutoPreemption(nextAuto);
    try {
      await api.controlSimulation({ auto_preemption: nextAuto });
      if (onAddToast) {
        onAddToast('info', `Automatic Preemption Detection ${nextAuto ? 'Enabled' : 'Disabled'}`);
      }
    } catch (err) {
      console.error('Auto preemption error:', err);
    }
  };

  // Manual Trigger Preemption
  const handleManualTrigger = async (intersectionId, ambulanceCode, direction = 'EW') => {
    try {
      const res = await api.requestPreemption({
        intersection_id: intersectionId,
        ambulance_code: ambulanceCode,
        direction: direction,
        severity: 'critical'
      });
      await fetchState();
      if (onAddToast) {
        onAddToast('success', `Priority Preemption requested at ${intersectionId} for ${ambulanceCode}`);
      }
    } catch (err) {
      if (onAddToast) {
        onAddToast('error', err.message || 'Failed to request preemption');
      }
    }
  };

  // Manual Clear / Simulate Passage
  const handleSimulatePassage = async (intersectionId) => {
    try {
      await api.clearPreemption({ intersection_id: intersectionId });
      await fetchState();
      if (onAddToast) {
        onAddToast('success', `Ambulance passage simulated at ${intersectionId}. Normal cycle restoring.`);
      }
    } catch (err) {
      if (onAddToast) {
        onAddToast('error', err.message || 'Failed to clear preemption');
      }
    }
  };

  // Sync active incidents from Module 1
  const handleSyncModule1 = async () => {
    setSyncingModule1(true);
    try {
      const res = await api.syncModule1Emergencies();
      await fetchState();
      if (onAddToast) {
        onAddToast(
          'success',
          `Synced ${res.synced_ambulances} active Module 1 incident(s) into traffic corridors!`
        );
      }
    } catch (err) {
      if (onAddToast) {
        onAddToast('error', 'Failed to sync Module 1 emergencies');
      }
    } finally {
      setSyncingModule1(false);
    }
  };

  const intersections = trafficState?.intersections || [];
  const ambulances = trafficState?.ambulances || [];
  const metrics = trafficState?.metrics || {
    total_intersections: 6,
    preempted_intersections: 0,
    active_ambulances: 1,
    estimated_time_saved_minutes: 0,
    safety_interlocks_active: true
  };
  const logs = trafficState?.global_logs || [];

  const filteredIntersections = intersections.filter((item) => {
    if (filterMode === 'preempted') return item.is_preempted;
    if (filterMode === 'normal') return !item.is_preempted;
    return true;
  });

  // Helper for state badge style
  const getStateBadge = (state) => {
    switch (state) {
      case 'PREEMPTION_GREEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            PREEMPTION GREEN
          </span>
        );
      case 'CLEARANCE_YELLOW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            CLEARANCE YELLOW (3s)
          </span>
        );
      case 'ALL_RED_HOLD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-950/90 text-red-400 border border-red-500/60 animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5" />
            ALL-RED HOLD (2s)
          </span>
        );
      case 'RESTORATION_YELLOW':
      case 'RESTORATION_ALL_RED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-950/70 text-blue-300 border border-blue-500/30">
            <RefreshCw className="w-3 h-3 animate-spin" />
            RESTORING NORMAL
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Radio className="w-3 h-3 text-slate-400" />
            NORMAL CYCLIC
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP SIMULATION CONTROL CONSOLE */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-navy-900/90 via-navy-850 to-navy-900/90 border border-slate-800 shadow-xl backdrop-blur">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Title & Status */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shadow-lg shadow-blue-500/10">
              <Cpu className="w-6 h-6 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-navy-900"></div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Smart Traffic Signal Preemption Simulator
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 border border-blue-600/40 text-blue-300">
                  MODULE 2
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/80 border border-emerald-700/50 text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  100% Collision-Safe Interlocks
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic arterial green corridors, safe clearance phases, and multi-ambulance conflict arbitration
              </p>
            </div>
          </div>

          {/* Controls Cluster */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Play / Pause Toggle */}
            <button
              onClick={handleTogglePlay}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md transform active:scale-95 ${
                isPlaying
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pause Sim</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Sim</span>
                </>
              )}
            </button>

            {/* Step Forward Button */}
            <button
              onClick={() => handleStep(2)}
              disabled={stepping}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors disabled:opacity-50"
              title="Advance simulation by 2 seconds"
            >
              <FastForward className={`w-3.5 h-3.5 ${stepping ? 'animate-spin' : ''}`} />
              <span>Step +2s</span>
            </button>

            {/* Speed Selector */}
            <div className="flex items-center rounded-xl bg-navy-950 border border-slate-800 p-1 text-xs">
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => handleChangeSpeed(spd)}
                  className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors ${
                    simSpeed === spd
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Scenario Dropdown */}
            <select
              value={selectedScenario}
              onChange={(e) => handleReset(e.target.value)}
              className="py-2 px-3 rounded-xl text-xs bg-navy-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="svims_critical">Scenario 1: Critical Cardiac Incident (SVIMS Corridor)</option>
              <option value="dual_conflict">Scenario 2: Dual Ambulance Cross-Traffic Conflict Arbitration</option>
              <option value="multi_fleet">Scenario 3: Multi-Fleet City-Wide Operations (3 Units)</option>
            </select>

            {/* Reset Button */}
            <button
              onClick={() => handleReset()}
              className="p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Reset Simulation Positions"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Module 1 Sync Button */}
            <button
              onClick={handleSyncModule1}
              disabled={syncingModule1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-700/60 bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 text-xs font-semibold transition-all"
              title="Import active en-route emergencies from Module 1"
            >
              <Split className={`w-3.5 h-3.5 ${syncingModule1 ? 'animate-spin text-blue-400' : ''}`} />
              <span>Sync Mod 1</span>
            </button>
          </div>
        </div>

        {/* Real-time Ticker bar */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Sim Clock: <span className="text-white font-bold">{trafficState?.simulation_time || 0}s</span>
            </span>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPreemption}
                onChange={handleToggleAuto}
                className="rounded bg-navy-950 border-slate-700 text-blue-600 focus:ring-0"
              />
              <span className="text-slate-300 text-[11px]">Auto Preemption Detection (450m Approach Zone)</span>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowZones(!showZones)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                showZones
                  ? 'border-blue-600/60 bg-blue-950/60 text-blue-300'
                  : 'border-slate-800 bg-navy-950 text-slate-400'
              }`}
            >
              Preemption Zones {showZones ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setShowCorridors(!showCorridors)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                showCorridors
                  ? 'border-emerald-600/60 bg-emerald-950/60 text-emerald-300'
                  : 'border-slate-800 bg-navy-950 text-slate-400'
              }`}
            >
              Corridor Beams {showCorridors ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI METRICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Metric 1: Preempted Corridors */}
        <div className="p-4 rounded-xl border border-emerald-900/40 bg-navy-900/70 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Preempted Corridors</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-400 font-mono tracking-tight">
            {metrics.preempted_intersections} / {metrics.total_intersections}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span>Active Priority Green Intersections</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Metric 2: Ambulances in Transit */}
        <div className="p-4 rounded-xl border border-blue-900/40 bg-navy-900/70 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Ambulances in Transit</span>
            <Ambulance className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-400 font-mono tracking-tight">
            {metrics.active_ambulances} Units
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span>Navigating Tirupati Arterials</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Metric 3: Response Time Saved */}
        <div className="p-4 rounded-xl border border-amber-900/40 bg-navy-900/70 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Time Saved by Preemption</span>
            <Timer className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-amber-400 font-mono tracking-tight">
            ~{metrics.estimated_time_saved_minutes} min
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span>Cumulative Red-Light Delay Eliminated</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Metric 4: Safety Invariant */}
        <div className="p-4 rounded-xl border border-indigo-900/40 bg-navy-900/70 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Safety Interlock</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white font-mono tracking-tight flex items-center gap-1.5">
            <span>100%</span>
            <span className="text-xs font-normal text-emerald-400 font-sans">FAIL-SAFE</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span>Zero Conflicting Green States</span>
          </div>
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
        </div>

        {/* Metric 5: Next Intersection Distance */}
        <div className="p-4 rounded-xl border border-slate-800 bg-navy-900/70 shadow-sm relative overflow-hidden group col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Lead Target Signal</span>
            <Radio className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-base font-bold text-slate-100 font-mono truncate">
            {ambulances[0]?.next_intersection?.intersection_name || 'Approaching SVIMS'}
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-mono">
            {ambulances[0]?.next_intersection
              ? `${ambulances[0].next_intersection.distance_meters}m • ETA ${ambulances[0].next_intersection.eta_seconds}s`
              : 'Corridor Cleared'}
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE MAP & RADAR VIEW */}
      <div className="p-5 rounded-2xl bg-navy-900/80 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Tirupati Metropolitan Smart Corridor Radar Map
                <span className="text-[11px] font-mono font-normal text-slate-400">
                  (Live SVG GIS Simulation Grid)
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Interactive road network, live 4-way traffic signals, active preemption beacons, and GPS ambulance markers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              Green Corridor
            </span>
            <span className="text-slate-400 flex items-center gap-1.5 ml-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              Clearance Yellow
            </span>
            <span className="text-slate-400 flex items-center gap-1.5 ml-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              All-Red / Normal
            </span>
          </div>
        </div>

        {/* Map Canvas / SVG Container */}
        <div className="w-full h-[420px] rounded-xl bg-navy-950 border border-slate-800/90 relative overflow-hidden select-none">
          {/* Subtle Grid overlay */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          ></div>

          {/* SVG Road Network & Signals */}
          <svg className="w-full h-full" viewBox="0 0 900 420" preserveAspectRatio="xMidYMid meet">
            <defs>
              {/* Pulsing Preemption Beacon Filter */}
              <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <linearGradient id="corridor-pulse" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#059669" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Road Segments (Main Arterials in Tirupati) */}
            {/* Arterial 1: Kapila Theertham -> Alipiri -> SVIMS (Corridor A) */}
            <path
              d="M 680,80 L 520,110 L 260,110 L 160,200 L 200,310 L 220,380"
              fill="none"
              stroke="#1e293b"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 680,80 L 520,110 L 260,110 L 160,200 L 200,310 L 220,380"
              fill="none"
              stroke="#334155"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 680,80 L 520,110 L 260,110 L 160,200 L 200,310 L 220,380"
              fill="none"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />

            {/* Arterial 2: Renigunta Highway -> Ramanuja Circle -> RTC Bus Station -> RUIA Gate */}
            <path
              d="M 820,340 L 680,280 L 510,320 L 520,110"
              fill="none"
              stroke="#1e293b"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 820,340 L 680,280 L 510,320 L 520,110"
              fill="none"
              stroke="#334155"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 820,340 L 680,280 L 510,320 L 520,110"
              fill="none"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />

            {/* Arterial 3: North Cross Corridor -> Kapila Theertham -> Central Station */}
            <path
              d="M 520,20 L 520,110 L 510,320 L 500,400"
              fill="none"
              stroke="#1e293b"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M 520,20 L 520,110 L 510,320 L 500,400"
              fill="none"
              stroke="#334155"
              strokeWidth="10"
              strokeLinecap="round"
            />

            {/* Preemption Corridor Glowing Overlays */}
            {showCorridors &&
              intersections
                .filter((i) => i.is_preempted)
                .map((intNode) => {
                  // Coordinate mapping helper
                  const coords = getScreenCoords(intNode.latitude, intNode.longitude);
                  return (
                    <circle
                      key={`glow-${intNode.intersection_id}`}
                      cx={coords.x}
                      cy={coords.y}
                      r="40"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeDasharray="4 4"
                      className="animate-spin"
                      style={{ animationDuration: '8s' }}
                    />
                  );
                })}

            {/* Preemption Approach Radius Zones */}
            {showZones &&
              intersections.map((intNode) => {
                const coords = getScreenCoords(intNode.latitude, intNode.longitude);
                return (
                  <circle
                    key={`zone-${intNode.intersection_id}`}
                    cx={coords.x}
                    cy={coords.y}
                    r="55"
                    fill={intNode.is_preempted ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.03)'}
                    stroke={intNode.is_preempted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(59, 130, 246, 0.15)'}
                    strokeWidth="1"
                    strokeDasharray={intNode.is_preempted ? 'none' : '3 3'}
                  />
                );
              })}

            {/* Landmark Labels */}
            <text x="210" y="395" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              SVIMS Hospital Bay
            </text>
            <text x="590" y="195" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              RUIA Govt Hospital
            </text>
            <text x="800" y="325" fill="#94a3b8" fontSize="10" fontFamily="monospace">
              Renigunta Hwy
            </text>

            {/* Intersections (Signals) */}
            {intersections.map((intNode) => {
              const coords = getScreenCoords(intNode.latitude, intNode.longitude);
              const signals = intNode.signals || { N: 'RED', S: 'RED', E: 'RED', W: 'RED' };
              const isSelected = selectedIntersection?.intersection_id === intNode.intersection_id;

              return (
                <g
                  key={intNode.intersection_id}
                  transform={`translate(${coords.x}, ${coords.y})`}
                  className="cursor-pointer group"
                  onClick={() => setSelectedIntersection(intNode)}
                >
                  {/* Selection Ring */}
                  {isSelected && (
                    <circle
                      cx="0"
                      cy="0"
                      r="28"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      className="animate-spin"
                    />
                  )}

                  {/* Junction Base Box */}
                  <rect
                    x="-18"
                    y="-18"
                    width="36"
                    height="36"
                    rx="8"
                    fill="#0f172a"
                    stroke={intNode.is_preempted ? '#10b981' : isSelected ? '#3b82f6' : '#475569'}
                    strokeWidth={intNode.is_preempted ? 2.5 : 1.5}
                    className="transition-all"
                  />

                  {/* 4 Traffic Light Bulbs (N, S, E, W) */}
                  {/* North Light */}
                  <circle
                    cx="0"
                    cy="-9"
                    r="3.5"
                    fill={getSignalColorHex(signals.N)}
                    filter={signals.N === 'GREEN' ? 'url(#glow-green)' : undefined}
                  />
                  {/* South Light */}
                  <circle
                    cx="0"
                    cy="9"
                    r="3.5"
                    fill={getSignalColorHex(signals.S)}
                    filter={signals.S === 'GREEN' ? 'url(#glow-green)' : undefined}
                  />
                  {/* West Light */}
                  <circle
                    cx="-9"
                    cy="0"
                    r="3.5"
                    fill={getSignalColorHex(signals.W)}
                    filter={signals.W === 'GREEN' ? 'url(#glow-green)' : undefined}
                  />
                  {/* East Light */}
                  <circle
                    cx="9"
                    cy="0"
                    r="3.5"
                    fill={getSignalColorHex(signals.E)}
                    filter={signals.E === 'GREEN' ? 'url(#glow-green)' : undefined}
                  />

                  {/* Preemption Strobe Icon in Center */}
                  {intNode.is_preempted ? (
                    <circle cx="0" cy="0" r="2.5" fill="#10b981" className="animate-ping" />
                  ) : (
                    <circle cx="0" cy="0" r="1.5" fill="#64748b" />
                  )}

                  {/* Intersection Name Label */}
                  <text
                    x="0"
                    y="30"
                    textAnchor="middle"
                    fill={intNode.is_preempted ? '#34d399' : '#e2e8f0'}
                    fontSize="10"
                    fontWeight={intNode.is_preempted ? 'bold' : 'normal'}
                    className="select-none pointer-events-none drop-shadow"
                  >
                    {intNode.name.split(' ')[0]} {intNode.name.split(' ')[1] || ''}
                  </text>
                  <text
                    x="0"
                    y="41"
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {intNode.intersection_id} ({intNode.time_remaining}s)
                  </text>
                </g>
              );
            })}

            {/* Simulated Ambulances */}
            {ambulances.map((amb) => {
              const coords = getScreenCoords(amb.latitude, amb.longitude);
              const isSelected = selectedAmbulance?.ambulance_code === amb.ambulance_code;

              return (
                <g
                  key={amb.ambulance_code}
                  transform={`translate(${coords.x}, ${coords.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelectedAmbulance(amb)}
                >
                  {/* Siren Pulse Rings */}
                  <circle
                    cx="0"
                    cy="0"
                    r="18"
                    fill="none"
                    stroke={amb.severity === 'critical' ? '#ef4444' : '#3b82f6'}
                    strokeWidth="1.5"
                    className="animate-ping"
                    style={{ animationDuration: '1.2s' }}
                  />

                  {/* Vehicle Body with Directional Rotation */}
                  <g transform={`rotate(${amb.heading})`}>
                    <rect
                      x="-8"
                      y="-14"
                      width="16"
                      height="28"
                      rx="4"
                      fill="#ffffff"
                      stroke="#0f172a"
                      strokeWidth="1.5"
                      className="shadow-xl"
                    />
                    {/* Front Windshield */}
                    <rect x="-6" y="-11" width="12" height="5" rx="1.5" fill="#0284c7" />
                    {/* Emergency Red Cross on Roof */}
                    <rect x="-2" y="-3" width="4" height="10" fill="#dc2626" />
                    <rect x="-5" y="0" width="10" height="4" fill="#dc2626" />
                    {/* Flashing Light Bar (Red / Blue Strobes) */}
                    <circle cx="-3" cy="-12" r="2" fill="#ef4444" className="animate-pulse" />
                    <circle cx="3" cy="-12" r="2" fill="#3b82f6" className="animate-pulse" />
                  </g>

                  {/* Callout Tag */}
                  <g transform="translate(14, -12)">
                    <rect
                      x="0"
                      y="0"
                      width="60"
                      height="20"
                      rx="4"
                      fill="#070b14"
                      stroke={amb.severity === 'critical' ? '#dc2626' : '#2563eb'}
                      strokeWidth="1"
                    />
                    <text
                      x="30"
                      y="14"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {amb.ambulance_code}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {/* Quick Map Legend Overlay */}
          <div className="absolute bottom-3 left-3 px-3 py-2 rounded-xl bg-navy-900/90 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-3 backdrop-blur shadow-lg">
            <span className="font-semibold text-white">Legend:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Preempted (Active Green)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Clearance Phase
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-red-500"></span> All-Red / Normal
            </span>
            <span className="text-slate-400 font-mono">| Click any junction for manual controls</span>
          </div>
        </div>
      </div>

      {/* 4. INTERSECTION SIGNAL CONTROLLERS GRID */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-navy-900/70 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Cpu className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Intersection Signal Controllers
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {intersections.length} Managed
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                4-way phased signal states, clearance intervals, and directional preemption priority
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg p-1 bg-navy-950 border border-slate-800 text-xs">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filterMode === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({intersections.length})
              </button>
              <button
                onClick={() => setFilterMode('preempted')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filterMode === 'preempted'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Preempted ({metrics.preempted_intersections})
              </button>
              <button
                onClick={() => setFilterMode('normal')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  filterMode === 'normal'
                    ? 'bg-blue-950 text-blue-300 border border-blue-700/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Normal ({intersections.length - metrics.preempted_intersections})
              </button>
            </div>
          </div>
        </div>

        {/* Intersection Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIntersections.map((intNode) => {
            const signals = intNode.signals || { N: 'RED', S: 'RED', E: 'RED', W: 'RED' };
            const isPreempted = intNode.is_preempted;
            const activePre = intNode.active_preemption;

            return (
              <div
                key={intNode.intersection_id}
                className={`p-4 rounded-xl border transition-all ${
                  isPreempted
                    ? 'border-emerald-600/60 bg-navy-900/80 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/40'
                    : 'border-slate-800 bg-navy-900/50 hover:border-slate-700'
                }`}
              >
                {/* Header: ID, Name, State Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-navy-950 border border-slate-700 text-blue-400">
                        {intNode.intersection_id}
                      </span>
                      <h4 className="font-bold text-sm text-white">{intNode.name}</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{intNode.location_desc}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {getStateBadge(intNode.state)}
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-mono">Phase Timer</span>
                    <div className="font-mono font-bold text-sm text-slate-200">
                      {intNode.time_remaining}s rem
                    </div>
                  </div>
                </div>

                {/* 4-Way Signal Lights Indicator Box */}
                <div className="mt-4 p-3 rounded-xl bg-navy-950/70 border border-slate-800">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 mb-2 flex items-center justify-between">
                    <span>4-Way Directional Phasing</span>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Locked Safe
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* North-South Axis */}
                    <div className="p-2 rounded-lg bg-navy-900/90 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300 font-medium">North - South</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          signals.N === 'GREEN'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                            : signals.N === 'YELLOW'
                            ? 'bg-amber-950 text-amber-400 border border-amber-700 animate-pulse'
                            : 'bg-red-950 text-red-400 border border-red-700'
                        }`}
                      >
                        {signals.N}
                      </span>
                    </div>

                    {/* East-West Axis */}
                    <div className="p-2 rounded-lg bg-navy-900/90 border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300 font-medium">East - West</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          signals.E === 'GREEN'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                            : signals.E === 'YELLOW'
                            ? 'bg-amber-950 text-amber-400 border border-amber-700 animate-pulse'
                            : 'bg-red-950 text-red-400 border border-red-700'
                        }`}
                      >
                        {signals.E}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Active Preemption Banner */}
                {activePre && (
                  <div className="mt-3 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50 text-xs">
                    <div className="flex items-center justify-between text-emerald-300 font-medium">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        Ambulance: <span className="font-mono font-bold text-white">{activePre.ambulance_code}</span>
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-900 text-emerald-200 uppercase font-bold">
                        {activePre.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-300 flex items-center justify-between">
                      <span>Direction: {activePre.direction} Corridor</span>
                      <span className="font-mono text-emerald-400">Score: {activePre.priority_score}</span>
                    </div>
                  </div>
                )}

                {/* Queued Preemptions (Arbitration) */}
                {intNode.queued_preemptions && intNode.queued_preemptions.length > 0 && (
                  <div className="mt-2 p-2 rounded-lg bg-amber-950/40 border border-amber-800/40 text-xs">
                    <div className="flex items-center justify-between text-amber-300 text-[11px] font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Queued Standby (Arbitrated):
                      </span>
                      <span className="font-mono font-bold">
                        {intNode.queued_preemptions[0].ambulance_code}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Held safely. Services immediately upon corridor clearance.
                    </p>
                  </div>
                )}

                {/* Quick Actions for this Intersection */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2 text-xs">
                  {isPreempted ? (
                    <button
                      onClick={() => handleSimulatePassage(intNode.intersection_id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Simulate Passed</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleManualTrigger(intNode.intersection_id, 'AMB-101', 'EW')}
                      className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 font-medium transition-colors flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Request Priority</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedIntersection(intNode)}
                    className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                    title="View Controller Telemetry"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. ACTIVE AMBULANCES LIVE RADAR TABLE */}
      <div className="p-5 rounded-2xl bg-navy-900/70 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Ambulance className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Simulated Emergency Ambulances & Corridor Navigation
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {ambulances.length} Active
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Live waypoint progress, speed telemetry, heading angles, and approaching intersection ETA
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-navy-950/60">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-900/90 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Vehicle & Driver</th>
                <th className="py-3 px-4">Incident / Triage</th>
                <th className="py-3 px-4">Corridor Route</th>
                <th className="py-3 px-4">GPS & Heading</th>
                <th className="py-3 px-4">Next Intersection</th>
                <th className="py-3 px-4">Route Progress</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ambulances.map((amb) => (
                <tr key={amb.ambulance_code} className="hover:bg-slate-800/20 transition-colors">
                  {/* Vehicle & Driver */}
                  <td className="py-3 px-4 font-mono">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{amb.ambulance_code}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          amb.severity === 'critical'
                            ? 'bg-red-950 text-red-400 border border-red-700'
                            : amb.severity === 'high'
                            ? 'bg-orange-950 text-orange-400 border border-orange-700'
                            : 'bg-blue-950 text-blue-400 border border-blue-700'
                        }`}
                      >
                        {amb.severity}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Driver: {amb.driver_name}
                    </span>
                  </td>

                  {/* Incident */}
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-200">{amb.emergency_type}</div>
                    <span className="text-[10px] font-mono text-slate-400">{amb.incident_id}</span>
                  </td>

                  {/* Route */}
                  <td className="py-3 px-4">
                    <div className="text-slate-300 font-medium truncate max-w-xs">{amb.route_name}</div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <span>Dest: {amb.destination_name}</span>
                    </div>
                  </td>

                  {/* Coordinates & Heading */}
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                    <div>
                      {amb.latitude}, {amb.longitude}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Compass className="w-3 h-3 text-blue-400" />
                      <span>{amb.heading}° • {amb.speed_kmh} km/h</span>
                    </div>
                  </td>

                  {/* Next Intersection */}
                  <td className="py-3 px-4">
                    {amb.next_intersection ? (
                      <div>
                        <div className="font-semibold text-emerald-400 flex items-center gap-1">
                          <Radio className="w-3 h-3" />
                          <span>{amb.next_intersection.intersection_name}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-300 mt-0.5">
                          {amb.next_intersection.distance_meters}m • ETA {amb.next_intersection.eta_seconds}s
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic">Corridor Complete</span>
                    )}
                  </td>

                  {/* Progress Bar */}
                  <td className="py-3 px-4">
                    <div className="w-28 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Progress</span>
                        <span>{amb.progress_percent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300"
                          style={{ width: `${amb.progress_percent}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {amb.next_intersection && (
                        <button
                          onClick={() =>
                            handleManualTrigger(
                              amb.next_intersection.intersection_id,
                              amb.ambulance_code,
                              amb.next_intersection.direction
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1 transition-colors"
                          title="Force Preemption Request for this Ambulance"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Priority</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. REAL-TIME AUDIT & PREEMPTION EVENT STREAM */}
      <div className="p-5 rounded-2xl bg-navy-900/70 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Live Traffic Preemption & Safety Event Log
              </h3>
              <p className="text-xs text-slate-400">
                Immutable audit trail of priority requests, clearance intervals, and arbitration events
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Controller Stream
          </span>
        </div>

        <div className="rounded-xl border border-slate-800 bg-navy-950/60 p-4 max-h-60 overflow-y-auto space-y-2.5">
          {logs.length === 0 ? (
            <p className="text-center py-6 text-xs text-slate-400">
              No preemption events recorded yet. Click 'Start Sim' or 'Step +2s'.
            </p>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-navy-900/70 border border-slate-800/80 text-xs"
              >
                <div
                  className={`p-1.5 rounded flex-shrink-0 mt-0.5 ${
                    log.event_type.includes('PREEMPTION')
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/50'
                      : log.event_type.includes('CLEARANCE') || log.event_type.includes('ALL_RED')
                      ? 'bg-amber-950 text-amber-400 border border-amber-700/50'
                      : 'bg-blue-950 text-blue-400 border border-blue-700/50'
                  }`}
                >
                  <Radio className="w-3 h-3" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-200">{log.event_type}</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Sim T+{log.sim_time}s • {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{log.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 7. MODAL: DETAILED INTERSECTION CONTROLLER INSPECTOR */}
      {selectedIntersection && (
        <IntersectionInspectorModal
          intersection={selectedIntersection}
          onClose={() => setSelectedIntersection(null)}
          onTriggerPriority={(ambCode, dir) => {
            handleManualTrigger(selectedIntersection.intersection_id, ambCode, dir);
            setSelectedIntersection(null);
          }}
          onSimulatePassed={() => {
            handleSimulatePassage(selectedIntersection.intersection_id);
            setSelectedIntersection(null);
          }}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// HELPER: Convert Tirupati lat/lon to SVG Screen Coordinates
// Bounds: Lat [13.6200, 13.6600], Lon [79.3900, 79.4500]
// Canvas: 900 x 420
// -------------------------------------------------------------
function getScreenCoords(lat, lon) {
  const minLat = 13.620;
  const maxLat = 13.660;
  const minLon = 79.390;
  const maxLon = 79.450;

  const normX = (lon - minLon) / (maxLon - minLon);
  const normY = (lat - minLat) / (maxLat - minLat);

  // SVG Y goes top to bottom, so invert lat
  const x = Math.round(normX * 800 + 50);
  const y = Math.round((1 - normY) * 360 + 30);

  return { x: Math.max(30, Math.min(870, x)), y: Math.max(30, Math.min(390, y)) };
}

function getSignalColorHex(color) {
  switch (color) {
    case 'GREEN':
      return '#10b981';
    case 'YELLOW':
      return '#f59e0b';
    case 'RED':
      return '#ef4444';
    default:
      return '#64748b';
  }
}

// -------------------------------------------------------------
// CHILD COMPONENT: INTERSECTION INSPECTOR MODAL
// -------------------------------------------------------------
function IntersectionInspectorModal({ intersection, onClose, onTriggerPriority, onSimulatePassed }) {
  const signals = intersection.signals || { N: 'RED', S: 'RED', E: 'RED', W: 'RED' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-navy-900 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-navy-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Cpu className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {intersection.name}
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  {intersection.intersection_id}
                </span>
              </h3>
              <p className="text-xs text-slate-400">{intersection.location_desc}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Status Banner */}
          <div className="p-4 rounded-xl bg-navy-950/60 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                Current Operational State
              </span>
              <span className="font-bold text-sm text-white">{intersection.state}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                Time Remaining in Phase
              </span>
              <span className="font-mono font-bold text-base text-emerald-400">
                {intersection.time_remaining}s
              </span>
            </div>
          </div>

          {/* 4-Way Traffic Lights Visual Graphic */}
          <div className="p-4 rounded-xl bg-navy-950 border border-slate-800 flex flex-col items-center justify-center relative">
            <span className="text-[10px] uppercase font-semibold text-slate-400 mb-3">
              Directional Approach Telemetry
            </span>

            {/* Junction Diagram */}
            <div className="relative w-36 h-36 flex items-center justify-center">
              {/* North Signal */}
              <div className="absolute top-0 flex flex-col items-center">
                <span className="text-[9px] font-mono text-slate-400">NORTH</span>
                <span
                  className={`w-4 h-4 rounded-full mt-0.5 border ${
                    signals.N === 'GREEN'
                      ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : signals.N === 'YELLOW'
                      ? 'bg-amber-500 border-amber-400'
                      : 'bg-red-500 border-red-400'
                  }`}
                ></span>
              </div>

              {/* South Signal */}
              <div className="absolute bottom-0 flex flex-col items-center">
                <span
                  className={`w-4 h-4 rounded-full mb-0.5 border ${
                    signals.S === 'GREEN'
                      ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : signals.S === 'YELLOW'
                      ? 'bg-amber-500 border-amber-400'
                      : 'bg-red-500 border-red-400'
                  }`}
                ></span>
                <span className="text-[9px] font-mono text-slate-400">SOUTH</span>
              </div>

              {/* West Signal */}
              <div className="absolute left-0 flex items-center gap-1">
                <span className="text-[9px] font-mono text-slate-400">WEST</span>
                <span
                  className={`w-4 h-4 rounded-full border ${
                    signals.W === 'GREEN'
                      ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : signals.W === 'YELLOW'
                      ? 'bg-amber-500 border-amber-400'
                      : 'bg-red-500 border-red-400'
                  }`}
                ></span>
              </div>

              {/* East Signal */}
              <div className="absolute right-0 flex items-center gap-1">
                <span
                  className={`w-4 h-4 rounded-full border ${
                    signals.E === 'GREEN'
                      ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : signals.E === 'YELLOW'
                      ? 'bg-amber-500 border-amber-400'
                      : 'bg-red-500 border-red-400'
                  }`}
                ></span>
                <span className="text-[9px] font-mono text-slate-400">EAST</span>
              </div>

              {/* Center Interlock Badge */}
              <div className="w-12 h-12 rounded-full bg-navy-900 border border-slate-700 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Active Preemption Details */}
          {intersection.active_preemption ? (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700 text-emerald-200">
              <div className="font-bold flex items-center justify-between">
                <span>Active Preemption Granted</span>
                <span className="font-mono">{intersection.active_preemption.ambulance_code}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Corridor axis: {intersection.active_preemption.direction} • Severity: {intersection.active_preemption.severity?.toUpperCase()}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700 text-slate-400 text-center">
              No active preemption request. Standard cyclic round-robin active.
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              Close
            </button>
            {intersection.is_preempted ? (
              <button
                onClick={onSimulatePassed}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
              >
                Simulate Passed (Restore Normal)
              </button>
            ) : (
              <button
                onClick={() => onTriggerPriority('AMB-101', 'EW')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4" />
                <span>Trigger EW Priority</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

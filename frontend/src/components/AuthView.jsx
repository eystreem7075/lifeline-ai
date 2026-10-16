import React, { useState } from 'react';
import {
  HeartPulse,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Phone,
  Shield,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building2,
  Users,
  Sparkles,
  KeyRound,
  RefreshCw,
  Zap,
  Activity,
  Check
} from 'lucide-react';
import api from '../api';

const DEMO_PRESETS = [
  {
    role: 'Administrator',
    email: 'admin@lifeline.ai',
    password: 'Admin@123',
    badge: 'Full Command & Preemption',
    icon: Shield,
    color: 'text-indigo-400 border-indigo-500/30 bg-indigo-950/40',
  },
  {
    role: 'Ambulance Operator',
    email: 'operator@lifeline.ai',
    password: 'Operator@123',
    badge: 'Vehicle Dispatch & Status',
    icon: Truck,
    color: 'text-amber-400 border-amber-500/30 bg-amber-950/40',
  },
  {
    role: 'Hospital Coordinator',
    email: 'hospital@lifeline.ai',
    password: 'Hospital@123',
    badge: 'Inbound Triage & Beds',
    icon: Building2,
    color: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40',
  },
  {
    role: 'Patient / Requester',
    email: 'patient@lifeline.ai',
    password: 'Patient@123',
    badge: 'SOS Emergency Help',
    icon: Users,
    color: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40',
  },
];

export default function AuthView({ onAuthSuccess, onAddToast }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot'
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Login Form State
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    remember_me: true,
  });

  // Registration Form State
  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    role: 'patient',
    terms_accepted: true,
  });

  // Forgot / Reset Password State
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState('request'); // 'request' | 'reset'

  // Fill demo account
  const handleSelectDemoPreset = (preset) => {
    setMode('login');
    setLoginForm({
      email: preset.email,
      password: preset.password,
      remember_me: true,
    });
    setErrorMessage('');
    setSuccessMessage(`Selected demo profile: ${preset.role}`);
  };

  // Handle Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!loginForm.email.trim() || !loginForm.password) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.login({
        email: loginForm.email.trim(),
        password: loginForm.password,
        remember_me: loginForm.remember_me,
      });

      // Persist session
      api.saveAuthSession(response.access_token, response.user, loginForm.remember_me);

      if (onAddToast) {
        onAddToast('success', `Welcome back, ${response.user.full_name}! (${response.user.role.toUpperCase()})`);
      }
      onAuthSuccess(response.user);
    } catch (err) {
      setErrorMessage(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Registration
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!registerForm.full_name.trim()) {
      setErrorMessage('Please provide your full legal name.');
      return;
    }
    if (!registerForm.email.trim()) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }
    if (registerForm.password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (registerForm.password !== registerForm.confirm_password) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }
    if (!registerForm.terms_accepted) {
      setErrorMessage('You must accept the LifeLine AI emergency terms & privacy policy.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.register({
        full_name: registerForm.full_name.trim(),
        email: registerForm.email.trim(),
        phone_number: registerForm.phone_number.trim() || null,
        password: registerForm.password,
        role: registerForm.role,
        terms_accepted: registerForm.terms_accepted,
      });

      api.saveAuthSession(response.access_token, response.user, true);

      if (onAddToast) {
        onAddToast('success', `Account created successfully! Welcome, ${response.user.full_name}`);
      }
      onAuthSuccess(response.user);
    } catch (err) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password (Request Token)
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!forgotEmail.trim()) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.forgotPassword({ email: forgotEmail.trim() });
      setSuccessMessage(res.message);
      if (res.reset_token) {
        setResetToken(res.reset_token);
        setResetStep('reset');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to process password reset request.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Reset Password with Token
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword({
        token: resetToken,
        new_password: newPassword,
      });
      setSuccessMessage(res.message);
      if (onAddToast) {
        onAddToast('success', 'Password reset successful! You may now sign in.');
      }
      // Switch back to login after short delay
      setTimeout(() => {
        setMode('login');
        setLoginForm((prev) => ({ ...prev, email: forgotEmail, password: newPassword }));
        setResetStep('request');
      }, 1500);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-navy-950 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative overflow-hidden text-slate-100">
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-12 right-12 w-64 h-64 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

      {/* Main Container Card */}
      <div className="w-full max-w-5xl rounded-3xl border border-slate-800/90 bg-navy-900/90 backdrop-blur-xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
        
        {/* LEFT COLUMN: Visual Brand & Emergency Mission (5 cols on lg) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-navy-900 via-navy-850 to-navy-950 p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800/80 relative">
          <div>
            {/* Logo & Headline */}
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shadow-lg shadow-blue-500/10">
                <HeartPulse className="w-7 h-7 text-blue-400 animate-pulse" />
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-navy-900"></div>
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  LifeLine <span className="text-blue-400 text-base font-extrabold px-2 py-0.5 rounded-lg bg-blue-950 border border-blue-500/30">AI</span>
                </h1>
                <p className="text-xs text-slate-400 font-medium">Smart Emergency Coordination</p>
              </div>
            </div>

            {/* Tagline Callout */}
            <div className="mt-8 p-4 rounded-2xl bg-navy-950/80 border border-blue-500/20 relative overflow-hidden">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Mission Statement</span>
              </div>
              <p className="text-base font-bold text-white tracking-tight">
                "Every Second Matters. Every Life Counts."
              </p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Intelligent rapid dispatch, arterial green wave signal preemption, and real-time hospital triage synchronization.
              </p>
              <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>
            </div>

            {/* Key Platform Capabilities */}
            <div className="mt-6 space-y-3 text-xs">
              <div className="flex items-start gap-3 text-slate-300">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-white">Role-Based Secured Access</span>
                  <p className="text-slate-400 text-[11px]">Strict token-based access separation across Patients, Operators, Coordinators & Admins.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-slate-300">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 mt-0.5">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-white">Dynamic Preemption Engine</span>
                  <p className="text-slate-400 text-[11px]">Module 2 arterial corridor simulation with conflict arbitration & safety intervals.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 text-slate-300">
                <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 mt-0.5">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-white">Zero Plaintext Guarantee</span>
                  <p className="text-slate-400 text-[11px]">Bcrypt salted hashes with brute-force rate-limiting and session timeouts.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Demo Credentials Footer */}
          <div className="mt-8 pt-5 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3 h-3 text-amber-400" />
                Demo 1-Click Fast Fill
              </span>
              <span className="text-[10px] font-mono text-amber-400 px-1.5 py-0.5 rounded bg-amber-950/70 border border-amber-800/40">
                Hackathon Demo
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {DEMO_PRESETS.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.role}
                    type="button"
                    onClick={() => handleSelectDemoPreset(preset)}
                    className="p-2 rounded-xl text-left border border-slate-800/90 bg-navy-950/60 hover:bg-slate-800/60 hover:border-slate-700 transition-all text-xs group"
                  >
                    <div className="flex items-center gap-1.5 text-white font-medium text-[11px] group-hover:text-blue-300">
                      <Icon className="w-3.5 h-3.5 text-blue-400" />
                      <span className="truncate">{preset.role.split(' ')[0]}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5 font-mono">{preset.email.split('@')[0]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Form (7 cols on lg) */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center bg-navy-900/60">
          
          {/* Top Mode Navigation Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-navy-950/80 border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMessage(''); setSuccessMessage(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setErrorMessage(''); setSuccessMessage(''); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                mode === 'forgot'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Reset Password
            </button>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* ========================================================= */}
          {/* 1. LOGIN FORM */}
          {/* ========================================================= */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@lifeline.ai or patient email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setForgotEmail(loginForm.email); }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter account password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={loginForm.remember_me}
                    onChange={(e) => setLoginForm({ ...loginForm, remember_me: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-navy-950 text-blue-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>Keep me signed in for 7 days</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-xs transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Secure Session...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to LifeLine AI</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs text-slate-400">
                Don't have an emergency responder or patient account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-blue-400 font-semibold hover:underline"
                >
                  Create one now
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* 2. REGISTRATION FORM */}
          {/* ========================================================= */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Legal Name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Naidu"
                      value={registerForm.full_name}
                      onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="+91 98480 12345"
                      value={registerForm.phone_number}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone_number: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Select Account Role <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'patient', label: 'Patient / Requester', desc: 'Emergency SOS' },
                    { id: 'operator', label: 'Ambulance Operator', desc: 'Dispatch & Route' },
                    { id: 'hospital', label: 'Hospital Coordinator', desc: 'Triage & Beds' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRegisterForm({ ...registerForm, role: r.id })}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        registerForm.role === r.id
                          ? 'border-blue-500 bg-blue-950/60 ring-1 ring-blue-500'
                          : 'border-slate-800 bg-navy-950/50 hover:bg-slate-800/40 text-slate-400'
                      }`}
                    >
                      <div className={`text-xs font-semibold ${registerForm.role === r.id ? 'text-blue-300' : 'text-slate-200'}`}>
                        {r.label}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  Note: Administrator accounts are securely provisioned by emergency district supervisors.
                </p>
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Min 6 characters"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      className="w-full pl-9 pr-9 py-2 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Re-enter password"
                      value={registerForm.confirm_password}
                      onChange={(e) => setRegisterForm({ ...registerForm, confirm_password: e.target.value })}
                      className="w-full pl-9 pr-9 py-2 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="p-1 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="pt-1">
                <label className="flex items-start gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={registerForm.terms_accepted}
                    onChange={(e) => setRegisterForm({ ...registerForm, terms_accepted: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-navy-950 text-blue-600 focus:ring-0 mt-0.5"
                  />
                  <span className="leading-tight text-[11px] text-slate-400">
                    I agree to the <span className="text-blue-400">LifeLine AI Terms of Service</span> and acknowledge that emergency medical coordination data is processed for rapid response dispatch.
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Verified Account...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-1 text-xs text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-blue-400 font-semibold hover:underline"
                >
                  Sign in
                </button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* 3. FORGOT / RESET PASSWORD */}
          {/* ========================================================= */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-navy-950 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 font-semibold text-blue-400 mb-1">
                  <KeyRound className="w-4 h-4" />
                  <span>Secure Password Reset</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Enter your registered email address. In this local hackathon environment, a secure 15-minute one-time reset token is automatically generated for instant verification.
                </p>
              </div>

              {resetStep === 'request' ? (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Registered Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="patient@lifeline.ai"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-navy-950 border border-slate-700/80 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold text-xs transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating Secure Reset Token...</span>
                      </>
                    ) : (
                      <>
                        <span>Request Password Reset</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-3.5">
                  <div className="p-2.5 rounded-lg bg-blue-950/40 border border-blue-500/30 text-[11px] font-mono text-blue-300">
                    <span className="text-slate-400 block text-[10px] uppercase font-sans">Active Reset Token (15-Min TTL):</span>
                    <span className="truncate block">{resetToken}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Enter New Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-navy-950 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <span>Set New Password & Sign In</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              <div className="text-center pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-blue-400 hover:underline"
                >
                  ← Back to Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

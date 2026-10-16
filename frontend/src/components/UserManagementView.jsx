import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Truck,
  Building2,
  UserCheck,
  Calendar,
  Clock,
  RefreshCw,
  Search,
  CheckCircle2
} from 'lucide-react';
import api from '../api';

export default function UserManagementView({ onAddToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getSystemUsers();
      setUsers(data);
    } catch (err) {
      if (onAddToast) onAddToast('error', err.message || 'Failed to load user records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const getRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-mono">
            <Shield className="w-3 h-3 text-indigo-400" />
            ADMINISTRATOR
          </span>
        );
      case 'operator':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-700/60 font-mono">
            <Truck className="w-3 h-3 text-amber-400" />
            AMBULANCE OPERATOR
          </span>
        );
      case 'hospital':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono">
            <Building2 className="w-3 h-3 text-cyan-400" />
            HOSPITAL COORDINATOR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono">
            <Users className="w-3 h-3 text-emerald-400" />
            PATIENT / REQUESTER
          </span>
        );
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.full_name?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      return matchName || matchEmail;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-indigo-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Total System Users</span>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{users.length}</div>
          <span className="text-[11px] text-indigo-400 mt-0.5 block">Active Credentials</span>
        </div>

        <div className="p-4 rounded-xl border border-amber-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Ambulance Operators</span>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">
            {users.filter((u) => u.role === 'operator').length}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Fleet Drivers</span>
        </div>

        <div className="p-4 rounded-xl border border-cyan-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Hospital Coordinators</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1 font-mono">
            {users.filter((u) => u.role === 'hospital').length}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">ER Medical Staff</span>
        </div>

        <div className="p-4 rounded-xl border border-emerald-900/40 bg-navy-900/60">
          <span className="text-xs font-medium text-slate-400 block">Patients & Citizens</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono">
            {users.filter((u) => u.role === 'patient').length}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">Registered Requesters</span>
        </div>
      </div>

      {/* Filter and Table Card */}
      <div className="rounded-2xl border border-slate-800 bg-navy-900/70 overflow-hidden shadow-xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">System Authorized Accounts</h3>
              <p className="text-xs text-slate-400">Security audit & role privilege management</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search user, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-navy-950 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 w-44"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-lg text-xs bg-navy-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="operator">Ambulance Operators</option>
              <option value="hospital">Hospital Coordinators</option>
              <option value="patient">Patients / Requesters</option>
            </select>

            <button
              onClick={fetchUsers}
              className="p-2 rounded-lg border border-slate-700 bg-slate-850 hover:bg-slate-800 text-slate-300"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-navy-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Authorized Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Registered Date</th>
                <th className="py-3 px-4">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Loading authorized user directory...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">{u.full_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{u.email}</td>
                    <td className="py-3 px-4 font-mono text-slate-400">{u.phone_number || '—'}</td>
                    <td className="py-3 px-4">{getRoleBadge(u.role)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {u.last_login ? new Date(u.last_login).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

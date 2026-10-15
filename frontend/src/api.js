const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

/**
 * Standard HTTP request wrapper with structured error handling
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          // Pydantic validation errors
          errorMessage = errorData.detail.map(e => `${e.loc?.slice(1)?.join('.') || 'field'}: ${e.msg}`).join(', ');
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Response was not JSON
      }
      const error = new Error(errorMessage);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      const connErr = new Error('Cannot reach LifeLine AI backend service. Please verify the backend is running.');
      connErr.status = 0;
      throw connErr;
    }
    throw err;
  }
}

export const api = {
  // Health & System
  checkHealth: () => request('/health'),
  seedDatabase: (reset = false) => request(`/seed?reset=${reset}`, { method: 'POST' }),
  getRecentActivity: (limit = 15) => request(`/activity-logs?limit=${limit}`),

  // Dashboard Stats
  getDashboardStats: () => request('/dashboard'),

  // Emergencies
  getEmergencies: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.severity) query.append('severity', params.severity);
    if (params.limit) query.append('limit', params.limit);
    if (params.offset) query.append('offset', params.offset);
    const qs = query.toString();
    return request(`/emergencies${qs ? `?${qs}` : ''}`);
  },

  createEmergency: (data) => request('/emergencies', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getEmergency: (id) => request(`/emergencies/${id}`),

  updateEmergencyStatus: (id, status, notes = null) => request(`/emergencies/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  }),

  getEmergencyHistory: (id) => request(`/emergencies/${id}/history`),

  // Ambulances
  getAmbulances: (status = null) => {
    const query = status ? `?status=${status}` : '';
    return request(`/ambulances${query}`);
  },

  registerAmbulance: (data) => request('/ambulances', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  // Dispatch & Assignment
  assignAmbulance: (emergencyId, ambulanceId) => request(`/emergencies/${emergencyId}/assign/${ambulanceId}`, {
    method: 'POST',
  }),

  // Module 2: Smart Traffic Signal Preemption
  getTrafficState: () => request('/traffic/state'),
  getIntersections: () => request('/traffic/intersections'),
  getIntersection: (id) => request(`/traffic/intersections/${id}`),
  getTrafficAmbulances: () => request('/traffic/ambulances'),
  requestPreemption: (data) => request('/traffic/preemption/request', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  clearPreemption: (data) => request('/traffic/preemption/clear', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  stepSimulation: (dt = 1) => request(`/traffic/simulation/tick?dt=${dt}`, {
    method: 'POST',
  }),
  controlSimulation: (data) => request('/traffic/simulation/control', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  resetSimulation: (scenarioId = 'svims_critical') => request('/traffic/simulation/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario_id: scenarioId }),
  }),
  getTrafficLogs: (limit = 25) => request(`/traffic/logs?limit=${limit}`),
  syncModule1Emergencies: () => request('/traffic/sync-module1', {
    method: 'POST',
  }),
};

export default api;

function resolveApiBaseUrl() {
  const envUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').trim();
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = 'lifeline_auth_token';
const USER_KEY = 'lifeline_auth_user';

export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(token, user, rememberMe = false) {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Storage error:', e);
  }
}

export function clearAuthSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error('Storage error:', e);
  }
}

/**
 * Standard HTTP request wrapper with Bearer token authentication and structured error handling
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getStoredToken();

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
          if (response.status === 404 && errorMessage === 'Not Found') {
            errorMessage = 'API endpoint not found (404). Please verify backend URL and service status.';
          }
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
  // Auth & Session
  login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  register: (userData) => request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPassword: (data) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (data) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  getSystemUsers: () => request('/auth/users'),
  getStoredToken,
  getStoredUser,
  saveAuthSession,
  clearAuthSession,

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

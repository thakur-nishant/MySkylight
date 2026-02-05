const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

export async function api(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: getHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const auth = {
  login: (email, password) => api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (data) => api('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: () => api('/auth/me'),
};

export const users = {
  list: () => api('/users'),
};

export const tasks = {
  list: async (params) => {
    const data = await api(
      '/tasks' + (params ? '?' + new URLSearchParams(params).toString() : '')
    );
    return Array.isArray(data) ? data : [];
  },

  create: (data) =>
    api('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    api(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    api(`/tasks/${id}`, {
      method: 'DELETE',
    }),
};

export const completions = {
  list: async (params) => {
    const data = await api(
      '/completions' + (params ? '?' + new URLSearchParams(params).toString() : '')
    );
    return Array.isArray(data) ? data : [];
  },

  create: (data) => {
    // If single object, send as-is. If array, send array.
    // Backend handles both single object with user_ids or array of objects
    return api('/completions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: (data) => {
    // data should be an object with { updates: [...], task_id, selected_user_ids }
    return api('/completions', {
      method: 'PATCH',
      body: JSON.stringify(data), // do NOT wrap in array
    });
  },

  delete: (id) =>
    api(`/completions/${id}`, {
      method: 'DELETE',
    }),
};




export const insights = {
  scores: async (params) => {
    const data = await api(
      '/insights/scores' +
        (params ? '?' + new URLSearchParams(params).toString() : '')
    );
    return Array.isArray(data) ? data : [];
  },

  taskCounts: async (params) => {
    const data = await api(
      '/insights/task-counts' +
        (params ? '?' + new URLSearchParams(params).toString() : '')
    );
    return Array.isArray(data) ? data : [];
  },

  overview: async (params) => {
    // overview returns an OBJECT, not a list
    return api(
      '/insights/overview' +
        (params ? '?' + new URLSearchParams(params).toString() : '')
    );
  },
};


export const calendar = {
  events: async (params) => {
    const data = await api(
      '/calendar/events' +
        (params ? '?' + new URLSearchParams(params).toString() : '')
    );
    return Array.isArray(data) ? data : [];
  },
};
/**
 * apiClient.js — Thin fetch-based HTTP client.
 * No external dependencies; Electron's renderer has native fetch.
 */

const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:8080/api'

async function request(method, url, data, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(BASE_URL + url + qs, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return res.json()
}

const api = {
  get:    (url, { params } = {}) => request('GET',    url, null, params),
  post:   (url, data)            => request('POST',   url, data),
  put:    (url, data)            => request('PUT',    url, data),
  delete: (url)                  => request('DELETE', url),
}

// ── Products ─────────────────────────────────────────────────────────────────
export const productAPI = {
  getAll:   (params = {}) => api.get('/products', { params }),
  getById:  (id)          => api.get(`/products/${id}`),
  create:   (data)        => api.post('/products', data),
  update:   (id, data)    => api.put(`/products/${id}`, data),
  remove:   (id)          => api.delete(`/products/${id}`)
}

// ── Orders ────────────────────────────────────────────────────────────────────
export const orderAPI = {
  getAll:   (params = {}) => api.get('/orders', { params }),
  getById:  (id)          => api.get(`/orders/${id}`),
  create:   (data)        => api.post('/orders', data),
  update:   (id, data)    => api.put(`/orders/${id}`, data),
  remove:   (id)          => api.delete(`/orders/${id}`)
}

// ── Payments ──────────────────────────────────────────────────────────────────
export const paymentAPI = {
  process:     (data)     => api.post('/payments', data),
  getByOrder:  (orderId)  => api.get(`/payments/${orderId}`)
}

// ── Health ────────────────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => axios.get('http://localhost:8080/health', { timeout: 3000 })
}

export default api

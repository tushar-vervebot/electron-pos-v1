import axios from 'axios'

const BASE_URL = 'http://localhost:8080/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
})

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

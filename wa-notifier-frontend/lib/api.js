import axios from 'axios';

// Standalone frontend — talks directly to the backend API.
// Set NEXT_PUBLIC_API_URL in .env (e.g. http://localhost:3001/api or https://api.yourdomain.com/api)
const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('wa_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const isLoginCall = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginCall && typeof window !== 'undefined') {
      localStorage.removeItem('wa_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

export const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getToken() {
  return localStorage.getItem('keliq_token');
}

export function removeToken() {
  localStorage.removeItem('keliq_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('keliq_token', token);
}

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      removeToken();
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(err);
  }
);

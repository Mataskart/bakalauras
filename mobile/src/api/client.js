import axios from 'axios';
import { getToken, removeToken } from '../storage/token';

const client = axios.create({
  baseURL: 'https://keliq.lt/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token to every request
client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 — clear token and call handler
let _onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await removeToken();
      if (_onUnauthorized) _onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default client;
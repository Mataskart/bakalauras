import axios from 'axios';
import { getToken } from '../storage/token';

const client = axios.create({
  baseURL: 'https://keliq.lt/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request automatically
client.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
import axios from 'axios';

// TODO: Wire this typed API client into feature services when backend integration begins.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api',
  timeout: 15000,
});

import axios from "axios";

// Axios instance for /cash-api — attaches the same Bearer token used by services/api.ts
export const cashApi = axios.create();

cashApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

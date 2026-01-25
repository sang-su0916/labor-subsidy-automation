import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.message || '요청 처리 중 오류가 발생했습니다';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

export default api;

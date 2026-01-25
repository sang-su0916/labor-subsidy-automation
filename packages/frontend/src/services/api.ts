import axios from 'axios';

// 프로덕션: Render 백엔드 URL, 개발: 로컬 또는 환경변수
const API_BASE_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? 'https://labor-subsidy-api.onrender.com/api' : '/api');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000,
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

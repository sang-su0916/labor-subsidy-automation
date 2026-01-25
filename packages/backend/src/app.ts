import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDataDirectories } from './utils/fileSystem';

const app = express();

// CORS: 개발환경 + 프로덕션 허용
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://labor-subsidy-frontend.vercel.app',
];

// Railway 프로덕션 URL 허용
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

// Vercel 프론트엔드 URL 허용 (환경변수로 추가 도메인)
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

console.log('CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // 서버간 요청 (origin 없음)
    if (!origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      // 허용된 origin 또는 Vercel preview deployments
      callback(null, origin);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initializeDataDirectories().catch(console.error);

app.use('/api', routes);

// 프론트엔드 정적 파일 서빙 (프로덕션)
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.resolve(__dirname, '../../../frontend/dist');
  app.use(express.static(frontendPath));
  
  // SPA 라우팅: 모든 non-API 요청을 index.html로
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.use(errorHandler);

export default app;

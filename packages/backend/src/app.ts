import express from 'express';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDataDirectories } from './utils/fileSystem';
import { generalLimiter } from './middleware/rateLimiter';

const app = express();

// CORS: 모든 Vercel preview 도메인 + 개발환경 허용
app.use(cors({
  origin: function(origin, callback) {
    // 서버간 요청 (origin 없음) 허용
    if (!origin) return callback(null, true);

    // Vercel 도메인 허용 (.vercel.app으로 끝나는 모든 도메인)
    if (origin.endsWith('.vercel.app')) {
      return callback(null, origin);
    }

    // 로컬 개발 허용
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, origin);
    }

    // FRONTEND_URL 환경변수 허용
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, origin);
    }

    console.log('CORS blocked:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initializeDataDirectories().catch(console.error);

app.use('/api', generalLimiter, routes);

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

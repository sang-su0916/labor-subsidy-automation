import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDataDirectories } from './utils/fileSystem';

const app = express();

// CORS: 개발환경 + 프로덕션 허용
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Railway 프로덕션 URL 허용
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  allowedOrigins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initializeDataDirectories().catch(console.error);

app.use('/api', routes);

app.use(errorHandler);

export default app;

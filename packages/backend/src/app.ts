import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDataDirectories } from './utils/fileSystem';

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initializeDataDirectories().catch(console.error);

app.use('/api', routes);

app.use(errorHandler);

export default app;

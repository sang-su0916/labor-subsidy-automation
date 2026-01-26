import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3010', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  uploadDir: path.resolve(__dirname, '../../data/uploads'),
  dataDir: path.resolve(__dirname, '../../data'),
  extractedDir: path.resolve(__dirname, '../../data/extracted'),
  reportsDir: path.resolve(__dirname, '../../data/reports'),
  sessionsDir: path.resolve(__dirname, '../../data/sessions'),
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedFileTypes: ['pdf', 'xlsx', 'xls', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'tif'],
};

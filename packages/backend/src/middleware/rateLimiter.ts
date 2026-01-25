import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: {
    error: {
      code: 'UPLOAD_LIMIT_EXCEEDED',
      message: '파일 업로드 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const extractionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    error: {
      code: 'EXTRACTION_LIMIT_EXCEEDED',
      message: '추출 요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

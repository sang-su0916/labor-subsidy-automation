require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // 테스트할 모델들
  const models = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro-vision',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ];
  
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say hello');
      console.log(`✓ ${modelName} works`);
    } catch (error) {
      console.log(`✗ ${modelName}: ${error.message.substring(0, 50)}`);
    }
  }
}

listModels();

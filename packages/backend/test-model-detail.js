require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key:', apiKey ? apiKey.substring(0, 15) + '...' : 'NOT SET');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  try {
    const result = await model.generateContent('Say hello');
    console.log('Success:', result.response.text());
  } catch (error) {
    console.log('Full error:', error.message);
  }
}

test();

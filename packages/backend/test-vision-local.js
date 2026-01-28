require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testVision() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY not set');
    return;
  }
  console.log('API Key exists:', apiKey.substring(0, 10) + '...');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const pdfPath = '/Users/isangsu/tmp/2026-goyoung-jiwon/test-files/가을식품/사업자등록증.pdf';
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');
  
  console.log('PDF size:', pdfBuffer.length);
  
  const prompt = `이 사업자등록증에서 다음 정보를 JSON으로 추출하세요:
- businessNumber: 사업자등록번호
- businessName: 상호
- representativeName: 대표자명
- businessAddress: 사업장 주소
- businessType: 업태 (간단하게, 예: "제조업")
- businessItem: 종목 (간단하게, 예: "식품")
- openDate: 개업일 (YYYY-MM-DD)

JSON만 출력하세요.`;

  try {
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { data: pdfBase64, mimeType: 'application/pdf' } }
    ]);
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testVision();

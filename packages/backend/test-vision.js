const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const execAsync = promisify(exec);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY 환경변수가 필요합니다");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const BASE_DIR = "/Users/isangsu/Documents/Acube/노무법인 같이 협업/260126_장형 외 4업체 급여정보/가을식품";
const WAGE_DIR = path.join(BASE_DIR, "1. 3개월 급여자료");

const WAGE_PROMPT = `당신은 한국 급여대장 분석 전문가입니다.

이 급여대장 이미지에서 다음 정보를 추출하세요:

## 추출 규칙
1. **사람 이름만 추출** (부서명 제외)
   - ✅ 사람: 김용화, 박노철, 이상수, 김현정 (2~4글자 성+이름)
   - ❌ 부서: 본사, 생산, 관리, 합계, 소계

2. **급여 정보**
   - 기본급, 시간외수당, 상여금 등 구분
   - 숫자에서 쉼표 제거

3. **기간**
   - 헤더에서 "YYYY년 MM월" 형식 확인

반드시 JSON만 응답:
{
  "period": "YYYY-MM",
  "companyName": "회사명",
  "employees": [
    {
      "name": "이름",
      "department": "부서",
      "baseSalary": 숫자,
      "overtimePay": 숫자,
      "bonus": 숫자,
      "monthlyWage": 총지급액숫자,
      "deductions": 공제액숫자,
      "netPay": 실수령액숫자
    }
  ],
  "totalEmployees": 직원수,
  "totalWage": 총급여합계
}`;

async function convertPdfToImage(pdfPath) {
  const outputPath = `/tmp/wage_${Date.now()}.png`;

  try {
    // qlmanage로 고해상도 이미지 생성
    const qlDir = `/tmp/ql_${Date.now()}`;
    await execAsync(`mkdir -p "${qlDir}"`);
    await execAsync(`qlmanage -t -s 2000 -o "${qlDir}" "${pdfPath}" 2>/dev/null`);

    const files = fs.readdirSync(qlDir);
    const imageFile = files.find(f => f.endsWith('.png'));

    if (imageFile) {
      fs.copyFileSync(path.join(qlDir, imageFile), outputPath);
      fs.rmSync(qlDir, { recursive: true, force: true });
      return outputPath;
    }
    throw new Error("이미지 변환 실패");
  } catch (err) {
    // sips fallback
    await execAsync(`sips -s format png "${pdfPath}" --out "${outputPath}" 2>/dev/null`);
    return outputPath;
  }
}

async function analyzeWageLedgerWithVision(pdfPath) {
  console.log(`\n분석 중: ${path.basename(pdfPath)}`);

  // PDF를 이미지로 변환
  const imagePath = await convertPdfToImage(pdfPath);
  console.log(`  이미지 변환 완료: ${imagePath}`);

  // 이미지 읽기
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  // Gemini Vision으로 분석
  const result = await model.generateContent([
    WAGE_PROMPT,
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image
      }
    }
  ]);

  const text = result.response.text();

  // 임시 이미지 삭제
  fs.unlinkSync(imagePath);

  // JSON 파싱
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log("  JSON 파싱 실패:", e.message);
    console.log("  Raw response:", text.substring(0, 500));
  }

  return null;
}

async function main() {
  console.log("=== Gemini Vision 급여대장 분석 테스트 ===\n");

  // Unicode 정규화 필요 (macOS NFD vs NFC)
  const allFiles = fs.readdirSync(WAGE_DIR);
  const files = allFiles.filter(f => {
    const normalized = f.normalize('NFC');
    return normalized.endsWith(".pdf") && normalized.includes("급여대장");
  });
  console.log(`총 ${files.length}개 급여대장 파일\n`);

  let successCount = 0;

  for (const file of files) {
    const filePath = path.join(WAGE_DIR, file);

    try {
      const result = await analyzeWageLedgerWithVision(filePath);

      if (result && result.employees && result.employees.length > 0) {
        successCount++;
        console.log(`  ✅ 성공!`);
        console.log(`  기간: ${result.period}`);
        console.log(`  회사: ${result.companyName || 'N/A'}`);
        console.log(`  직원 수: ${result.employees.length}`);
        console.log(`  직원 목록:`);

        for (const emp of result.employees.slice(0, 5)) {
          console.log(`    - ${emp.name}: ${emp.monthlyWage?.toLocaleString() || 'N/A'}원 (기본급: ${emp.baseSalary?.toLocaleString() || 'N/A'}원)`);
        }

        if (result.employees.length > 5) {
          console.log(`    ... 외 ${result.employees.length - 5}명`);
        }

        console.log(`  총 급여: ${result.totalWage?.toLocaleString() || 'N/A'}원`);
      } else {
        console.log(`  ❌ 직원 정보 추출 실패`);
      }
    } catch (err) {
      console.log(`  ❌ 오류: ${err.message}`);
    }

    console.log();

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== 결과: ${successCount}/${files.length} 성공 ===`);
}

main().catch(console.error);

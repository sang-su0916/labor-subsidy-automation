const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const { extractWageLedger } = require("./dist/services/extraction/wageLedger.extractor.js");

const execAsync = promisify(exec);

const BASE_DIR = "/Users/isangsu/Documents/Acube/노무법인 같이 협업/260126_장형 외 4업체 급여정보/가을식품";
const WAGE_DIR = path.join(BASE_DIR, "1. 3개월 급여자료");
const OCR_SCRIPT = path.join(process.env.HOME, ".claude/skills/macos-ocr/scripts/ocr.swift");

async function convertPdfToImage(pdfPath) {
  const outputPath = `/tmp/wage_${Date.now()}.png`;

  try {
    const qlDir = `/tmp/ql_${Date.now()}`;
    await execAsync(`mkdir -p "${qlDir}"`);
    // 고해상도 (3000px)로 변환
    await execAsync(`qlmanage -t -s 3000 -o "${qlDir}" "${pdfPath}" 2>/dev/null`);

    const files = fs.readdirSync(qlDir);
    const imageFile = files.find(f => f.endsWith('.png'));

    if (imageFile) {
      fs.copyFileSync(path.join(qlDir, imageFile), outputPath);
      fs.rmSync(qlDir, { recursive: true, force: true });
      return outputPath;
    }
    throw new Error("이미지 변환 실패");
  } catch (err) {
    await execAsync(`sips -s format png "${pdfPath}" --out "${outputPath}" 2>/dev/null`);
    return outputPath;
  }
}

async function macosOcr(imagePath) {
  try {
    const { stdout } = await execAsync(`swift "${OCR_SCRIPT}" "${imagePath}"`, {
      maxBuffer: 10 * 1024 * 1024  // 10MB
    });
    return stdout;
  } catch (err) {
    console.error("macOS OCR 오류:", err.message);
    return "";
  }
}

async function main() {
  console.log("=== macOS Vision OCR 급여대장 테스트 ===\n");

  // OCR 스크립트 확인
  if (!fs.existsSync(OCR_SCRIPT)) {
    console.error(`OCR 스크립트 없음: ${OCR_SCRIPT}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(WAGE_DIR);
  const files = allFiles.filter(f => {
    const normalized = f.normalize('NFC');
    return normalized.endsWith(".pdf") && normalized.includes("급여대장");
  });

  console.log(`총 ${files.length}개 급여대장 파일\n`);

  let successCount = 0;
  let totalConfidence = 0;

  for (const file of files) {
    const filePath = path.join(WAGE_DIR, file);
    console.log(`파일: ${file.normalize('NFC')}`);

    try {
      // PDF → 이미지 변환
      const imagePath = await convertPdfToImage(filePath);
      console.log(`  이미지 변환 완료`);

      // macOS Vision OCR
      const ocrText = await macosOcr(imagePath);
      console.log(`  OCR 텍스트 길이: ${ocrText.length}`);
      console.log(`  OCR 샘플:\n${ocrText.substring(0, 400)}`);
      console.log("---");

      // 텍스트 추출기로 분석
      const result = extractWageLedger(ocrText);
      const empCount = result.data?.employees?.length || 0;
      const confidence = result.context?.confidence || 0;

      totalConfidence += confidence;

      if (empCount > 0) {
        successCount++;
        console.log(`  ✅ 직원 ${empCount}명 추출`);
        console.log(`  신뢰도: ${confidence}%`);
        console.log(`  직원 목록:`);
        for (const emp of result.data.employees.slice(0, 5)) {
          console.log(`    - ${emp.name}: ${emp.monthlyWage?.toLocaleString() || 'N/A'}원`);
        }
      } else {
        console.log(`  ❌ 직원 추출 실패 (신뢰도: ${confidence}%)`);
      }

      // 임시 파일 삭제
      fs.unlinkSync(imagePath);
    } catch (err) {
      console.log(`  ❌ 오류: ${err.message}`);
    }

    console.log();
  }

  console.log(`\n=== 결과: ${successCount}/${files.length} 성공, 평균 신뢰도: ${Math.round(totalConfidence/files.length)}% ===`);
}

main().catch(console.error);

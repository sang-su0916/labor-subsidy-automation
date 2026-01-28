const fs = require("fs");
const path = require("path");
const { ocrService } = require("./dist/services/ocr.service.js");
const { extractEmploymentContract } = require("./dist/services/extraction/employmentContract.extractor.js");
const { extractWageLedger } = require("./dist/services/extraction/wageLedger.extractor.js");

const BASE_DIR = "/Users/isangsu/Documents/Acube/노무법인 같이 협업/260126_장형 외 4업체 급여정보/가을식품";
const WAGE_DIR = path.join(BASE_DIR, "1. 3개월 급여자료");
const CONTRACT_DIR = path.join(BASE_DIR, "2. 근로계약서");

async function testWageLedgers() {
  console.log("\n=== 급여대장 추출 테스트 ===\n");

  const allFiles = fs.readdirSync(WAGE_DIR);
  console.log("전체 파일:", allFiles);
  const files = allFiles.filter(f => f.endsWith(".pdf"));
  console.log(`총 ${files.length}개 급여대장 파일\n`);

  let totalConfidence = 0;
  let successCount = 0;

  for (const file of files) {
    const filePath = path.join(WAGE_DIR, file);
    console.log(`파일: ${file}`);

    try {
      const ocrResult = await ocrService.extractTextFromPDF(filePath);
      console.log(`  OCR 텍스트 길이: ${ocrResult.text.length}`);
      console.log(`  OCR 신뢰도: ${ocrResult.confidence}%`);
      console.log(`  OCR 샘플:\n${ocrResult.text.substring(0, 500)}`);
      console.log("---");

      const result = extractWageLedger(ocrResult.text);

      const empCount = result.data?.employees?.length || 0;
      const confidence = result.context?.confidence || 0;

      totalConfidence += confidence;
      if (empCount > 0) successCount++;

      console.log(`  추출 직원 수: ${empCount}`);
      console.log(`  추출 신뢰도: ${confidence}%`);

      if (empCount > 0) {
        console.log(`  추출된 직원들:`);
        for (const emp of result.data.employees.slice(0, 5)) {
          console.log(`    - ${emp.name}: 기본급 ${emp.baseSalary?.toLocaleString() || 'N/A'}원`);
        }
      }
      console.log();
    } catch (err) {
      console.log(`  오류: ${err.message}\n`);
    }
  }

  console.log(`결과: ${successCount}/${files.length} 성공, 평균 신뢰도: ${Math.round(totalConfidence/files.length)}%\n`);
}

async function testContracts() {
  console.log("\n=== 근로계약서 추출 테스트 ===\n");

  const files = fs.readdirSync(CONTRACT_DIR).filter(f => f.endsWith(".pdf"));
  console.log(`총 ${files.length}개 근로계약서 파일\n`);

  let successCount = 0;
  let salaryCount = 0;

  for (const file of files) {
    const filePath = path.join(CONTRACT_DIR, file);
    console.log(`파일: ${file}`);

    try {
      const ocrResult = await ocrService.extractTextFromPDF(filePath);
      const result = extractEmploymentContract(ocrResult.text);

      const name = result.data?.employeeName || "N/A";
      const employer = result.data?.employerName || "N/A";
      const salary = result.data?.monthlySalary || 0;
      const confidence = result.context?.confidence || 0;

      const hasName = name && name !== "N/A" && name.length >= 2;
      const hasEmployer = employer && employer !== "N/A" && employer.length >= 2;

      if (hasName && hasEmployer) successCount++;
      if (salary > 0) salaryCount++;

      console.log(`  근로자: ${name}`);
      console.log(`  사업주: ${employer}`);
      console.log(`  월급여: ${salary > 0 ? salary.toLocaleString() + '원' : 'N/A'}`);
      console.log(`  신뢰도: ${confidence}%`);
      console.log();
    } catch (err) {
      console.log(`  오류: ${err.message}\n`);
    }
  }

  console.log(`결과: 이름+회사 ${successCount}/${files.length}, 월급여 ${salaryCount}/${files.length}\n`);
}

async function main() {
  try {
    await testContracts();
    await testWageLedgers();
    await ocrService.terminate();
  } catch (err) {
    console.error("테스트 오류:", err);
  }
}

main();

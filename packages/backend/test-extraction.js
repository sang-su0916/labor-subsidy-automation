const fs = require("fs");
const path = require("path");
const { extractEmploymentContract } = require("./dist/services/extraction/employmentContract.extractor.js");
const { sanitizeEmploymentContract } = require("./dist/services/ai-extraction.service.js");
const { extractWageLedger } = require("./dist/services/extraction/wageLedger.extractor.js");

const dir = "./data/extracted";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));

// 근로계약서 테스트
let contractCount = 0;
let contractSuccess = 0;
let salaryCount = 0;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!data.result || data.result.documentType !== "EMPLOYMENT_CONTRACT") continue;

  contractCount++;
  const rawText = data.result.rawText;
  const result = extractEmploymentContract(rawText);
  const sanitized = sanitizeEmploymentContract(result.data, rawText);

  const hasName = sanitized.employeeName && sanitized.employeeName.length >= 2;
  const hasEmployer = sanitized.employerName && sanitized.employerName.length >= 2;
  const hasSalary = sanitized.monthlySalary > 0;

  if (hasName && hasEmployer) contractSuccess++;
  if (hasSalary) salaryCount++;
}

// 급여대장 테스트
let wageLedgerCount = 0;
let wageLedgerSuccess = 0;
let avgConfidence = 0;

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!data.result || data.result.documentType !== "WAGE_LEDGER") continue;

  wageLedgerCount++;
  const rawText = data.result.rawText;
  const result = extractWageLedger(rawText);

  avgConfidence += result.context.confidence;
  if (result.data && result.data.employees.length > 0) {
    wageLedgerSuccess++;
  }
}

console.log("=== 근로계약서 추출 결과 ===");
console.log("총 건수:", contractCount);
console.log("이름+회사명:", contractSuccess + "/" + contractCount, "(" + Math.round(contractSuccess/contractCount*100) + "%)");
console.log("월급여:", salaryCount + "/" + contractCount, "(" + Math.round(salaryCount/contractCount*100) + "%)");

console.log("\n=== 급여대장 추출 결과 ===");
console.log("총 건수:", wageLedgerCount);
console.log("직원 추출:", wageLedgerSuccess + "/" + wageLedgerCount, "(" + Math.round(wageLedgerSuccess/wageLedgerCount*100) + "%)");
console.log("평균 신뢰도:", Math.round(avgConfidence/wageLedgerCount) + "%");

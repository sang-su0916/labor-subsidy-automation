const fs = require("fs");
const path = require("path");
const { extractWageLedger } = require("./dist/services/extraction/wageLedger.extractor.js");

const dir = "./data/extracted";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!data.result || data.result.documentType !== "WAGE_LEDGER") continue;

  const rawText = data.result.rawText;
  const result = extractWageLedger(rawText);

  console.log("\n=== " + file.substring(0, 8) + " ===");
  console.log("직원 수:", result.data?.employees?.length || 0);
  console.log("신뢰도:", result.context.confidence);
  console.log("에러:", result.context.errors);

  if (result.data?.employees?.length === 0) {
    console.log("rawText 샘플 (첫 500자):");
    console.log(rawText.substring(0, 500));
  }
}

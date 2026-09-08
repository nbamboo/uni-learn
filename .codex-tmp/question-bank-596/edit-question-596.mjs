import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/shenyongliang/Documents/GitHub/uni-learn/resources/topic/银行从业初级银行管理_章节练习_题目整理.xlsx";
const outputDir = "/Users/shenyongliang/Documents/GitHub/uni-learn/outputs/question-bank-596-text-20260908";
const outputPath = `${outputDir}/银行从业初级银行管理_章节练习_题目整理.xlsx`;
const previewPath = "/Users/shenyongliang/Documents/GitHub/uni-learn/.codex-tmp/question-bank-596/after.png";

const explanation = [
  "现金存取款环节常见的违规事项包括：",
  "",
  "1. 未经授权办理大额存取款业务；",
  "2. 未审核客户有效身份证件办理大额现金存取业务；",
  "3. 无支付凭证或使用商业银行内部凭证办理开户单位资金支付业务；",
  "4. 未能识别而收入本外币假钞或变造钞；",
  "5. 离岗后钱箱未加锁或虽加锁但钥匙未妥善保管；",
  "6. 外部人员采取化整为零手段，通过其他商业银行相互间、账户间频繁存取现金，进行洗钱活动等。",
  "",
  "因此，A、B、C、D项属于“现金存取款”环节的操作风险。E项（柜员离岗未退出业务操作系统，被他人利用进行操作）属于“柜员管理”环节的操作风险，不属于“现金存取款”环节。",
].join("\n");

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("全部题目");
sheet.getRange("Q596").values = [[explanation]];

const inspection = await workbook.inspect({
  kind: "table",
  sheetId: "全部题目",
  range: "H596:S596",
  include: "values,formulas",
  tableMaxRows: 2,
  tableMaxCols: 12,
  tableMaxCellChars: 3000,
  maxChars: 10000,
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "全部题目",
  range: "H595:S597",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const verificationInput = await FileBlob.load(outputPath);
const verificationWorkbook = await SpreadsheetFile.importXlsx(verificationInput);
const verification = await verificationWorkbook.inspect({
  kind: "table",
  sheetId: "全部题目",
  range: "Q596:Q596",
  include: "values,formulas",
  tableMaxRows: 1,
  tableMaxCols: 1,
  tableMaxCellChars: 3000,
  maxChars: 5000,
});
console.log(verification.ndjson);
console.log(JSON.stringify({ outputPath, previewPath }));

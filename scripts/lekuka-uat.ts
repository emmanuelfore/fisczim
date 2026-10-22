import "dotenv/config";
import { pool } from "../server/db.js";
import { runLekukaUat } from "../server/lib/lekuka-uat.js";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const companyId = Number(getArg("company") || 126);
const dryRun = hasFlag("dry-run");
const noRenewal = hasFlag("no-renewal");
const outputDir = getArg("output-dir");
const runId = getArg("run-id");
const cases = getArg("cases")
  ?.split(",")
  .map((id) => id.trim())
  .filter(Boolean);

runLekukaUat({
  companyId,
  runId,
  selected: cases && cases.length ? cases : undefined,
  dryRun,
  noRenewal,
  closeAfter: true,
  outputDir,
  onEvent: (event) => {
    if (event.type === "case-finished") {
      console.error(`[${event.result.status}] ${event.result.id} ${event.result.title}`);
    } else if (event.type === "log") {
      console.error(`[${event.level}] ${event.message}`);
    }
  },
})
  .then((report) => {
    console.log(JSON.stringify({
      report: report.outputPath,
      summary: report.summary,
      error: report.error || undefined,
      fiscalDay: report.fiscalDay
        ? {
            fiscalDayStatus: report.fiscalDay.fiscalDayStatus,
            lastFiscalDayNo: report.fiscalDay.lastFiscalDayNo,
            lastReceiptGlobalNo: report.fiscalDay.lastReceiptGlobalNo,
          }
        : null,
    }, null, 2));
    if (report.error) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(JSON.stringify({
      error: error?.message || String(error),
      details: error?.details,
      statusCode: error?.statusCode,
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

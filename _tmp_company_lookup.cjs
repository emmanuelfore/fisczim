require("dotenv").config();

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const select = "id,name,lastReceiptGlobalNo,dailyReceiptCount,lastFiscalHash,fiscalDayOpen,currentFiscalDayNo,zimraEnvironment,deviceSerialNo";
  const qs = new URLSearchParams({
    select,
    or: "(name.ilike.%XaviTech%,name.ilike.%Industrials Private%)",
    order: "id.asc",
  });
  const res = await fetch(`${url}/rest/v1/companies?${qs.toString()}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  console.log("STATUS", res.status);
  console.log(text);
})().catch((err) => {
  console.error("ERROR:", err && err.cause ? err.cause : err && err.stack ? err.stack : err);
  process.exit(1);
});

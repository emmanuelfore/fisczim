import { app, httpServer } from "../server/index.js";
import { registerRoutes } from "../server/routes.js";
import { randomBytes } from "crypto";

async function run() {
  await registerRoutes(httpServer, app);
  
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ message: err.message });
  });

  await new Promise<void>(r => httpServer.listen(5555, () => r()));
  console.log("Server listening on 5555 for Fiscalization Tests\n");
  
  const apiKey = "9a3b54c491aea3aef7c1b5fd84c427c04b7c069aa1c08d49d987cfcfdd43bd50";
  const companyId = 86;
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };

  const reqObj = async (method: string, url: string, body?: any) => {
    const res = await fetch(`http://localhost:5555${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, data: await res.json() };
  };

  try {
    // 1. OPEN DAY
    console.log("--- 1. Testing Z-Report (OPEN DAY) ---");
    let res = await reqObj("POST", `/api/companies/${companyId}/zimra/z-report?action=open`);
    console.log(`Status: ${res.status}`, JSON.stringify(res.data, null, 2));
    
    // Wait for a second so ZIMRA doesn't rate limit
    await new Promise(r => setTimeout(r, 2000));

    // 2. TransactM (Fiscalize Standard Invoice)
    const invNumber = `REV-${randomBytes(3).toString("hex").toUpperCase()}`;
    console.log(`\n--- 2. Testing TransactM (Fiscalize Invoice: ${invNumber}) ---`);
    const transactBody = {
      Currency: "USD",
      InvoiceNumber: invNumber,
      InvoiceAmount: "11.50",
      InvoiceTaxAmount: "1.50",
      InvoiceFlag: "0",
      InvoiceComment: "RevMax API Test",
      ItemsXML: `
        <ITEMS>
          <ITEM>
            <Description>Software License</Description>
            <Quantity>1</Quantity>
            <Amount>10.00</Amount>
            <TaxAmount>1.50</TaxAmount>
            <TaxCode>3</TaxCode>
          </ITEM>
        </ITEMS>
      `,
      Currencies: `
        <CURRENCIES>
          <CURRENCY>
            <Currency>USD</Currency>
            <Amount>11.50</Amount>
            <ExchangeRate>1</ExchangeRate>
          </CURRENCY>
        </CURRENCIES>
      `
    };
    res = await reqObj("POST", `/api/companies/${companyId}/zimra/transact`, transactBody);
    console.log(`Status: ${res.status}`, JSON.stringify(res.data, null, 2));

    await new Promise(r => setTimeout(r, 2000));

    // 3. GetTransaction (Verify fiscalization)
    console.log(`\n--- 3. Testing GetTransaction (${invNumber}) ---`);
    res = await reqObj("GET", `/api/companies/${companyId}/zimra/transactions/${invNumber}`);
    console.log(`Status: ${res.status}`);
    console.log(`Code: ${res.data.Code}, Message: ${res.data.Message}, VerificationCode: ${res.data.VerificationCode}`);

    // 4. GetUnProcessedTransactions
    console.log("\n--- 4. Testing GetUnProcessedTransactions ---");
    res = await reqObj("GET", `/api/companies/${companyId}/zimra/transactions/unprocessed?page=1&pageSize=5`);
    console.log(`Status: ${res.status}`);
    console.log(`Total Records: ${res.data.Data?.totalRecords}`);

    // 5. TransactMExt (Extended with Customer Data)
    const invNumberExt = `REV-EXT-${randomBytes(3).toString("hex").toUpperCase()}`;
    console.log(`\n--- 5. Testing TransactMExt (Fiscalize Extended Invoice: ${invNumberExt}) ---`);
    const transactExtBody = {
      ...transactBody,
      InvoiceNumber: invNumberExt,
      CustomerRegisteredName: "Acme Corp Ltd",
      CustomerVATNumber: "VAT987654",
      CustomerTIN: "TIN987654",
      CustomerEmail: "test@acmecorp.com",
      buyerCity: "Harare"
    };
    res = await reqObj("POST", `/api/companies/${companyId}/zimra/transact-ext`, transactExtBody);
    console.log(`Status: ${res.status}`, JSON.stringify(res.data, null, 2));

    await new Promise(r => setTimeout(r, 2000));

    // 6. CLOSE DAY
    console.log("\n--- 6. Testing Z-Report (CLOSE DAY) ---");
    res = await reqObj("POST", `/api/companies/${companyId}/zimra/z-report?action=close`);
    console.log(`Status: ${res.status}`);
    console.log(`Code: ${res.data.Code}, Message: ${res.data.Message}`);

  } catch (err) {
    console.error("Test Script Error:", err);
  } finally {
    httpServer.close();
    process.exit(0);
  }
}
run();

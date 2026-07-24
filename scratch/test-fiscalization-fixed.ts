import { app, httpServer } from "../server/index.js";
import { registerRoutes } from "../server/routes.js";
import { randomBytes } from "crypto";

async function run() {
  await registerRoutes(httpServer, app);
  
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ message: err.message });
  });

  await new Promise<void>(r => httpServer.listen(5556, () => r()));
  console.log("Server listening on 5556 for Fiscalization Tests\n");
  
  const apiKey = "9a3b54c491aea3aef7c1b5fd84c427c04b7c069aa1c08d49d987cfcfdd43bd50";
  const companyId = 86;
  const headers = { "x-api-key": apiKey, "Content-Type": "application/json" };

  const reqObj = async (method: string, url: string, body?: any) => {
    const res = await fetch(`http://localhost:5556${url}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, data: await res.json() };
  };

  try {
    const invNumber = `REV-${randomBytes(3).toString("hex").toUpperCase()}`;
    const transactBody = {
      CURRENCY: "USD",
      INVOICENUMBER: invNumber,
      INVOICEAMOUNT: "11.50",
      INVOICETAXAMOUNT: "1.50",
      INVOICEFLAG: "0",
      INVOICECOMMENT: "RevMax API Test",
      ITEMSXML: `
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
      CURRENCIES: `
        <CURRENCIES>
          <CURRENCY>
            <Currency>USD</Currency>
            <Amount>11.50</Amount>
            <ExchangeRate>1</ExchangeRate>
          </CURRENCY>
        </CURRENCIES>
      `
    };
    let res = await reqObj("POST", `/api/companies/${companyId}/zimra/transact`, transactBody);
    console.log(`TransactM Status: ${res.status}`, res.data);

  } catch (err) {
    console.error("Test Script Error:", err);
  } finally {
    httpServer.close();
    process.exit(0);
  }
}
run();

import { app, httpServer } from "../server/index.js";
import { registerRoutes } from "../server/routes.js";

async function run() {
  await registerRoutes(httpServer, app);
  
  // Custom error handler for JSON responses
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ message: err.message });
  });

  await new Promise<void>(r => httpServer.listen(5555, () => r()));
  console.log("Server listening on 5555");
  
  const apiKey = "9a3b54c491aea3aef7c1b5fd84c427c04b7c069aa1c08d49d987cfcfdd43bd50";
  const companyId = 86;

  console.log("\n--- Testing GetCardDetails ---");
  const res1 = await fetch(`http://localhost:5555/api/zimra/device-details?companyId=${companyId}`, {
    headers: { "x-api-key": apiKey }
  });
  console.log(res1.status, await res1.text());

  console.log("\n--- Testing GetDeviceStatus ---");
  const res2 = await fetch(`http://localhost:5555/api/companies/${companyId}/zimra/device-status`, {
    headers: { "x-api-key": apiKey }
  });
  console.log(res2.status, await res2.text());

  console.log("\n--- Testing Unprocessed Summary ---");
  const res3 = await fetch(`http://localhost:5555/api/companies/${companyId}/zimra/transactions/unprocessed/summary`, {
    headers: { "x-api-key": apiKey }
  });
  console.log(res3.status, await res3.text());

  httpServer.close();
  process.exit(0);
}
run();

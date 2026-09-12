import { storage } from "./server/storage.js";
async function run() {
  const logs = await storage.getApiLogs(105, 5);
  console.log(logs);
  process.exit(0);
}
run();

import { storage } from "./server/storage";
async function run() {
  try {
    const inv = await storage.getInvoice(144);
    console.log("Invoice:", inv ? "OK" : "null");
  } catch(e) {
    console.error(e);
  }
  process.exit();
}
run();

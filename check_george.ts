import { db } from './server/db.js';
import { validationErrors, zimraLogs, invoices, companies } from './shared/schema.js';
import { eq, inArray, gte, asc } from 'drizzle-orm';

async function check() {
  // Get invoices for company 11
  const invs = await db.select().from(invoices).where(eq(invoices.companyId, 11));
  console.log('Invoices for company 11:', invs.map(i => ({ id: i.id, num: i.invoiceNumber, status: i.fdmsStatus, validation: i.validationStatus, receiptGlobalNo: i.receiptGlobalNo, receiptCounter: i.receiptCounter, hash: i.fiscalCode })));
  
  // Get validation errors
  const ids = invs.map(i => i.id);
  if (ids.length > 0) {
    const errs = await db.select().from(validationErrors).where(inArray(validationErrors.invoiceId, ids));
    console.log('Validation errors:', errs.map(e => ({ invoiceId: e.invoiceId, code: e.errorCode, color: e.errorColor, msg: e.errorMessage })));
    
    // Get zimra logs
    const logs = await db.select().from(zimraLogs).where(inArray(zimraLogs.invoiceId, ids)).orderBy(asc(zimraLogs.createdAt));
    console.log('ZIMRA logs:', logs.map(l => ({ invoiceId: l.invoiceId, endpoint: l.endpoint, status: l.statusCode, error: l.errorMessage })));
  }
  
  // Get company
  const company = await db.select().from(companies).where(eq(companies.id, 11));
  console.log('Company:', company.map(c => ({ id: c.id, name: c.name, deviceId: c.fdmsDeviceId, lastHash: c.lastFiscalHash, globalNo: c.lastReceiptGlobalNo, dailyCount: c.dailyReceiptCount })));
  
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
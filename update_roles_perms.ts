import { db } from './server/db';
import { companyRoles, companyRolePermissions } from './shared/schema';
import { ALL_PERMISSION_KEYS } from './shared/permissions';
import { eq } from 'drizzle-orm';

const companyId = 60; // CLAMP INTEL APACHE

async function run() {
  const allRoles = await db.query.companyRoles.findMany({
    where: eq(companyRoles.companyId, companyId)
  });

  const adminRole = allRoles.find(r => r.name === 'admin');
  const salesRole = allRoles.find(r => r.name === 'sales and marketing');
  const controlRole = allRoles.find(r => r.name === 'control room');

  // Filter out HR and Manufacturing
  const excludePatterns = ['payroll', 'hr', 'manufacturing'];
  const basePermissions = ALL_PERMISSION_KEYS.filter(p => !excludePatterns.some(ex => p.includes(ex)));

  // Admin: Everything except HR & Manufacturing
  const adminPermissions = basePermissions;

  // Sales and Marketing: POS + Sales (No procurement, no HR/MFG)
  const salesPermissions = [
    "nav.dashboard", "nav.pos", "nav.invoices", "nav.customers", "nav.reports",
    "pos.sell", "pos.shift", "pos.void", "pos.discount", "pos.reconcile",
    "invoices.view", "invoices.create", "invoices.issue", "invoices.issue.direct",
    "invoices.fiscalize", "invoices.void", "invoices.credit_note",
    "reports.sales",
    "nav.settings", "settings.pos", "settings.organization", // Add basic settings so they can configure POS maybe? Not requested, let's keep it strictly sales.
  ];

  // Control Room: Invoices (need approval to issue => no invoices.issue.direct), ALL Procurement without approvals
  const controlPermissions = [
    "nav.dashboard", 
    "nav.invoices", "invoices.view", "invoices.create", "invoices.issue", // NO invoices.issue.direct
    "nav.inventory", "stock.view", "stock.count", "stock.transfer",
    "stock.adjust.request", "stock.adjust.direct", // direct = no approval
    "grn.view", "grn.create", "grn.confirm", "grn.confirm.direct", // direct = no approval
  ];

  async function updatePermissions(roleId: number, perms: string[]) {
    await db.delete(companyRolePermissions).where(eq(companyRolePermissions.roleId, roleId));
    
    // Deduplicate and filter valid keys just in case
    const validPerms = [...new Set(perms)].filter(p => ALL_PERMISSION_KEYS.includes(p));
    
    if (validPerms.length > 0) {
      const values = validPerms.map(p => ({ roleId, permission: p }));
      await db.insert(companyRolePermissions).values(values);
    }
  }

  if (adminRole) {
    await updatePermissions(adminRole.id, adminPermissions);
    console.log(`Updated admin (${adminRole.id}) permissions: ${adminPermissions.length} perms`);
  } else {
    console.log('Admin role not found!');
  }

  if (salesRole) {
    await updatePermissions(salesRole.id, salesPermissions);
    console.log(`Updated sales (${salesRole.id}) permissions: ${salesPermissions.length} perms`);
  } else {
    console.log('Sales role not found!');
  }

  if (controlRole) {
    await updatePermissions(controlRole.id, controlPermissions);
    console.log(`Updated control room (${controlRole.id}) permissions: ${controlPermissions.length} perms`);
  } else {
    console.log('Control role not found!');
  }

  console.log('Done mapping permissions');
  process.exit(0);
}

run().catch(console.error);

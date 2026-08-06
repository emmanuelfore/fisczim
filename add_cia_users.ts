import { db } from './server/db';
import { users, companyUsers, companyRoles } from './shared/schema';
import { eq, and } from 'drizzle-orm';
import { supabaseAdmin } from './server/supabase';

const companyId = 60; // CLAMP INTEL APACHE

const newUsers = [
  { email: 'simba@cia.co.zw', name: 'Simbarashe Bapiro', username: 'simba', role: 'admin' },
  { email: 'admin@cia.co.zw', name: 'Sharleen Mango', username: 'admin_cia', role: 'admin' },
  { email: 'accounts@cia.co.zw', name: 'C.I.A Accounts', username: 'accounts_cia', role: 'admin' },
  { email: 'tanya@cia.co.zw', name: 'Tanyaradzwa Chasweka', username: 'tanya', role: 'sales and marketing' },
  { email: 'faith@cia.co.zw', name: 'Faith Manjonjo', username: 'faith', role: 'sales and marketing' },
  { email: 'melissa@cia.co.zw', name: 'Melissa Chibanda', username: 'melissa', role: 'control room' },
  { email: 'makanakaishe@cia.co.zw', name: 'Makanakaishe Tawengwa', username: 'makanakaishe', role: 'control room' },
  { email: 'zvikomborero@cia.co.zw', name: 'Zvikomborero Tayera', username: 'zvikomborero', role: 'control room' },
];

async function run() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin not available');
  }

  for (const u of newUsers) {
    console.log(`Processing ${u.email}...`);
    
    // 1. Create or get Supabase user
    let supabaseUserId;
    let existing;
    try {
      const { data: existingUser, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) throw listError;
      existing = existingUser?.users.find(eu => eu.email === u.email);
    } catch(err) {
      console.log('Error listing users, fallback to create user');
    }
    
    if (existing) {
      console.log(`Supabase user exists: ${existing.id}`);
      supabaseUserId = existing.id;
      // Update password just in case?
      await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, { password: 'password123' });
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: 'password123',
        email_confirm: true,
        user_metadata: { name: u.name },
      });
      if (error) {
        console.error(`Error creating in Supabase: ${error.message}`);
        continue;
      }
      supabaseUserId = data.user.id;
      console.log(`Created in Supabase: ${supabaseUserId}`);
    }

    // 2. Insert into local `users` table
    let localUser = await db.query.users.findFirst({ where: eq(users.email, u.email) });
    if (!localUser) {
      const [inserted] = await db.insert(users).values({
        id: supabaseUserId,
        email: u.email,
        name: u.name,
        username: u.username,
        passwordChanged: true,
      }).returning();
      localUser = inserted;
      console.log(`Inserted local user: ${localUser.id}`);
    } else {
      console.log(`Local user already exists: ${localUser.id}`);
    }

    // 3. Ensure company_roles exists
    let compRole = await db.query.companyRoles.findFirst({
      where: and(eq(companyRoles.companyId, companyId), eq(companyRoles.name, u.role))
    });
    if (!compRole) {
      const [insertedRole] = await db.insert(companyRoles).values({
        companyId: companyId,
        name: u.role,
        legacyRole: u.role === 'admin' ? 'admin' : 'member'
      }).returning();
      compRole = insertedRole;
      console.log(`Created company_role: ${compRole.name}`);
    } else {
        console.log(`Found company_role: ${compRole.name}`);
    }

    // 4. Insert into company_users
    let compUser = await db.query.companyUsers.findFirst({
      where: and(eq(companyUsers.userId, localUser.id), eq(companyUsers.companyId, companyId))
    });
    if (!compUser) {
      await db.insert(companyUsers).values({
        userId: localUser.id,
        companyId: companyId,
        role: u.role === 'admin' ? 'admin' : 'member',
        companyRoleId: compRole.id
      });
      console.log(`Linked user to company ${companyId} with role ${u.role}`);
    } else {
      await db.update(companyUsers)
        .set({ companyRoleId: compRole.id, role: u.role === 'admin' ? 'admin' : 'member' })
        .where(eq(companyUsers.id, compUser.id));
      console.log(`Updated user link to company ${companyId} with role ${u.role}`);
    }
  }
  
  console.log('Done!');
  process.exit(0);
}

run().catch(console.error);

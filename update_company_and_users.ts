import { db } from "./server/db";
import { companies, users, companyUsers } from "./shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function runUpdate() {
    try {
        const sourceId = 84;
        const targetId = 86;

        console.log(`Copying details and users from company ${sourceId} to ${targetId}...`);

        // 1. Fetch source company details
        const [sourceCompany] = await db.select().from(companies).where(eq(companies.id, sourceId));
        if (!sourceCompany) {
            throw new Error(`Source company ${sourceId} not found.`);
        }

        // Modifying fields slightly
        const newAddress = sourceCompany.address ? `${sourceCompany.address} (HQ)` : "TBD (HQ)";
        const newPhone = sourceCompany.phone ? `${sourceCompany.phone}1` : "0000000001";
        const newEmail = sourceCompany.email ? sourceCompany.email.replace("@", "_v2@") : "info_v2@elimuz.com";

        // Update target company
        await db.update(companies).set({
            tin: sourceCompany.tin ? `${sourceCompany.tin}2` : null,
            vatNumber: sourceCompany.vatNumber ? `${sourceCompany.vatNumber}2` : null,
            bpNumber: sourceCompany.bpNumber ? `${sourceCompany.bpNumber}2` : null,
            address: newAddress,
            phone: newPhone,
            email: newEmail,
            zimraEnvironment: sourceCompany.zimraEnvironment,
        }).where(eq(companies.id, targetId));

        console.log("Updated company 86 details (TIN, VAT, Address, Phone, Email).");

        // 2. Fetch and copy users
        const sourceUsers = await db.select({
            user: users,
            role: companyUsers.role,
            accessRoleId: companyUsers.accessRoleId,
            companyRoleId: companyUsers.companyRoleId
        }).from(companyUsers)
          .innerJoin(users, eq(companyUsers.userId, users.id))
          .where(eq(companyUsers.companyId, sourceId));

        for (const cu of sourceUsers) {
            const u = cu.user;
            // modify email
            const emailParts = u.email.split("@");
            let newUemail = u.email;
            if (emailParts.length === 2) {
                newUemail = `${emailParts[0]}_v2@${emailParts[1]}`;
            } else {
                newUemail = `${u.email}_v2`;
            }

            // check if user already exists
            const [existing] = await db.select().from(users).where(eq(users.email, newUemail));
            let newUserId = existing?.id;

            if (!existing) {
                const { id, createdAt, email, username, ...rest } = u;
                const newUsername = username ? `${username}_v2` : null;
                const [insertedUser] = await db.insert(users).values({
                    ...rest,
                    email: newUemail,
                    username: newUsername,
                }).returning();
                newUserId = insertedUser.id;
                console.log(`Created new user: ${newUemail}`);
            } else {
                console.log(`User ${newUemail} already exists.`);
            }

            // link user to company 86
            // first check if link exists
            const [existingLink] = await db.select().from(companyUsers)
                .where(eq(companyUsers.companyId, targetId))
                // @ts-ignore
                .where(eq(companyUsers.userId, newUserId));

            if (!existingLink) {
                await db.insert(companyUsers).values({
                    // @ts-ignore
                    userId: newUserId,
                    companyId: targetId,
                    role: cu.role,
                    // accessRoleId: cu.accessRoleId, // Omitting accessRoleId as it is company-specific
                    // companyRoleId: cu.companyRoleId, 
                });
                console.log(`Linked user ${newUemail} to company 86.`);
            }
        }
        
        console.log("Process completed successfully!");
    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

runUpdate();

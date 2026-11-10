import { db } from "../db";
import { posShifts, posShiftTransactions, users, expenses, companies } from "@shared/schema";
import { baseCurrencyOf } from "@shared/currency";
import { eq, and, desc, gte, lte } from "drizzle-orm";

// pos_shifts has no primary key in the live database — migrations/0084 had to leave it out
// because two tenants hold a shift with the same id. Until those rows are renumbered, a
// shift may only be addressed by id together with the company that owns it: `WHERE id = ?`
// alone can return, or write, the other tenant's shift.
export const shiftInCompany = (shiftId: number, companyId: number) =>
    and(eq(posShifts.id, shiftId), eq(posShifts.companyId, companyId));

export async function startPosShift(companyId: number, userId: string, openingBalance: number, notes?: string) {
    // Check if user already has an open shift
    const existingShift = await db.query.posShifts.findFirst({
        where: and(
            eq(posShifts.userId, userId),
            eq(posShifts.companyId, companyId),
            eq(posShifts.status, "open")
        )
    });

    if (existingShift) {
        throw new Error("User already has an open shift.");
    }

    const [shift] = await db.insert(posShifts).values({
        companyId,
        userId,
        openingBalance: openingBalance.toString(),
        status: "open",
        startTime: new Date(),
        notes
    }).returning();

    return shift;
}

export async function endPosShift(shiftId: number, companyId: number, actualCash: number, notes?: string, reconciledBy?: string) {
    const hasActualCash = Number.isFinite(actualCash);
    const [shift] = await db.update(posShifts)
        .set({
            status: "closed",
            endTime: new Date(),
            actualCash: hasActualCash ? actualCash.toString() : null,
            reconciledAt: hasActualCash ? new Date() : null,
            reconciledBy: reconciledBy || null,
            reconciliationStatus: reconciledBy ? "approved" : "submitted",
            notes
        })
        // See shiftInCompany: closing by id alone would close both tenants' shifts.
        .where(shiftInCompany(shiftId, companyId))
        .returning();

    return shift;
}

export async function addPosTransaction(
    shiftId: number,
    companyId: number,
    userId: string,
    type: 'DROP' | 'PAYOUT',
    amount: number,
    reason: string,
    items: any[] = [],
    authorizedBy?: string
) {
    return await db.transaction(async (tx) => {
        // The caller's company is part of the lookup, not something read back off
        // whichever shift row came first — see shiftInCompany.
        const shift = await tx.query.posShifts.findFirst({
            where: shiftInCompany(shiftId, companyId)
        });

        if (!shift) throw new Error("Shift not found");

        const [transaction] = await tx.insert(posShiftTransactions).values({
            shiftId,
            userId,
            type,
            amount: amount.toString(),
            reason,
            items,
            authorizedBy: authorizedBy || null
        }).returning();

        // If it's a payout, also record it as an expense
        if (type === 'PAYOUT') {
            const [shiftCompany] = await tx
                .select({ currency: companies.currency, country: companies.country, fiscalProvider: companies.fiscalProvider })
                .from(companies)
                .where(eq(companies.id, shift.companyId));
            await tx.insert(expenses).values({
                companyId: shift.companyId,
                category: "POS Payout",
                description: reason || "POS Payout",
                amount: amount.toString(),
                currency: baseCurrencyOf(shiftCompany),
                expenseDate: new Date(),
                paymentMethod: "Cash",
                reference: `POS-PAYOUT-${transaction.id}`,
                status: "paid",
                notes: `Automatically created from POS Payout in shift #${shiftId}`
            });
        }

        return transaction;
    });
}

export async function getOpenShift(companyId: number, userId: string) {
    return await db.query.posShifts.findFirst({
        where: and(
            eq(posShifts.userId, userId),
            eq(posShifts.companyId, companyId),
            eq(posShifts.status, "open")
        ),
        with: {
            user: true
        }
    });
}

export async function getShiftTransactions(shiftId: number, companyId: number) {
    // Joined through the shift so a caller of one company cannot read the drawer
    // activity of another company's shift that happens to share its id.
    return await db.select({ transaction: posShiftTransactions })
        .from(posShiftTransactions)
        .innerJoin(posShifts, and(
            eq(posShiftTransactions.shiftId, posShifts.id),
            eq(posShifts.companyId, companyId)
        ))
        .where(eq(posShiftTransactions.shiftId, shiftId))
        .orderBy(desc(posShiftTransactions.createdAt))
        .then(rows => rows.map(row => row.transaction));
}

export async function getCompanyPosTransactions(companyId: number, startDate: Date, endDate: Date) {
    return await db.select({
        id: posShiftTransactions.id,
        type: posShiftTransactions.type,
        amount: posShiftTransactions.amount,
        reason: posShiftTransactions.reason,
        createdAt: posShiftTransactions.createdAt,
        authorizedBy: posShiftTransactions.authorizedBy,
        userName: users.name
    })
    .from(posShiftTransactions)
    .innerJoin(posShifts, eq(posShiftTransactions.shiftId, posShifts.id))
    .innerJoin(users, eq(posShiftTransactions.userId, users.id))
    .where(and(
        eq(posShifts.companyId, companyId),
        gte(posShiftTransactions.createdAt, startDate),
        lte(posShiftTransactions.createdAt, endDate)
    ))
    .orderBy(desc(posShiftTransactions.createdAt));
}

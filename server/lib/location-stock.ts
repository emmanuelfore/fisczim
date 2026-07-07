import {
  branches,
  branchStocks,
  inventoryLocations,
  inventoryLocationStocks,
  products,
} from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function ensureCompanyInventoryLocations(tx: any, companyId: number) {
  const existing = await tx
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.companyId, companyId));

  const existingWarehouse = existing.find(
    (location: { type: string; branchId: number | null }) =>
      location.type === "WAREHOUSE" && !location.branchId,
  );
  if (!existingWarehouse) {
    const [warehouse] = await tx
      .insert(inventoryLocations)
      .values({
        companyId,
        type: "WAREHOUSE",
        name: "Main Warehouse",
        code: "MAIN-WAREHOUSE",
        isDefaultReceiving: true,
        isDefaultDispatch: true,
        isActive: true,
      })
      .returning();
    existing.push(warehouse);
  }

  const companyBranches = await tx
    .select()
    .from(branches)
    .where(eq(branches.companyId, companyId));
  const existingBranchLocationIds = new Set(
    existing
      .filter((location: { branchId: number | null }) => location.branchId)
      .map((location: { branchId: number }) => Number(location.branchId)),
  );
  for (const branch of companyBranches) {
    if (existingBranchLocationIds.has(branch.id)) continue;
    const [branchLocation] = await tx
      .insert(inventoryLocations)
      .values({
        companyId,
        type: "BRANCH",
        name: branch.name,
        code: branch.code || `BRANCH-${branch.id}`,
        address: branch.address || null,
        branchId: branch.id,
        isActive: branch.isActive ?? true,
      })
      .returning();
    existing.push(branchLocation);
  }

  return tx
    .select()
    .from(inventoryLocations)
    .where(eq(inventoryLocations.companyId, companyId));
}

export async function resolveReceivingLocation(
  tx: any,
  companyId: number,
  branchId?: number | null,
) {
  const locations = await ensureCompanyInventoryLocations(tx, companyId);

  if (branchId) {
    const branchLocation = locations.find(
      (location: { branchId: number | null }) => location.branchId === branchId,
    );
    if (branchLocation) return branchLocation;
  }

  const defaultReceiving = locations.find(
    (location: { isDefaultReceiving: boolean | null }) => location.isDefaultReceiving,
  );
  if (defaultReceiving) return defaultReceiving;

  const warehouse = locations.find(
    (location: { type: string; branchId: number | null }) =>
      location.type === "WAREHOUSE" && !location.branchId,
  );
  if (warehouse) return warehouse;

  throw new Error("No default inventory location or warehouse found for this company.");
}

async function recalculateProductStockLevels(
  tx: any,
  productId: number,
  companyId: number,
  branchId?: number | null,
) {
  if (branchId) {
    const branchLocations = await tx
      .select({ id: inventoryLocations.id })
      .from(inventoryLocations)
      .where(eq(inventoryLocations.branchId, branchId));

    const locationIds = branchLocations.map((location: { id: number }) => location.id);
    let totalBranchStock = 0;
    if (locationIds.length > 0) {
      const [sumRow] = await tx
        .select({
          total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)`,
        })
        .from(inventoryLocationStocks)
        .where(
          and(
            inArray(inventoryLocationStocks.locationId, locationIds),
            eq(inventoryLocationStocks.productId, productId),
          ),
        );
      totalBranchStock = Number(sumRow?.total || 0);
    }

    const [branchStock] = await tx
      .select()
      .from(branchStocks)
      .where(and(eq(branchStocks.branchId, branchId), eq(branchStocks.productId, productId)))
      .limit(1);

    if (branchStock) {
      await tx
        .update(branchStocks)
        .set({ stockLevel: totalBranchStock.toString() })
        .where(eq(branchStocks.id, branchStock.id));
    } else {
      await tx.insert(branchStocks).values({
        branchId,
        productId,
        stockLevel: totalBranchStock.toString(),
      });
    }
  }

  const companyLocations = await tx
    .select({ id: inventoryLocations.id })
    .from(inventoryLocations)
    .where(eq(inventoryLocations.companyId, companyId));

  const companyLocIds = companyLocations.map((location: { id: number }) => location.id);
  let totalCompanyStock = 0;
  if (companyLocIds.length > 0) {
    const [sumRow] = await tx
      .select({
        total: sql<string>`coalesce(sum(${inventoryLocationStocks.stockLevel}::numeric), 0)`,
      })
      .from(inventoryLocationStocks)
      .where(
        and(
          inArray(inventoryLocationStocks.locationId, companyLocIds),
          eq(inventoryLocationStocks.productId, productId),
        ),
      );
    totalCompanyStock = Number(sumRow?.total || 0);
  }

  await tx
    .update(products)
    .set({ stockLevel: totalCompanyStock.toString() })
    .where(eq(products.id, productId));

  return totalCompanyStock;
}

export async function adjustLocationStock(
  tx: any,
  productId: number,
  quantityDelta: number,
  location: { id: number; companyId: number; branchId?: number | null; type?: string },
) {
  const [stock] = await tx
    .select()
    .from(inventoryLocationStocks)
    .where(
      and(
        eq(inventoryLocationStocks.locationId, location.id),
        eq(inventoryLocationStocks.productId, productId),
      ),
    )
    .limit(1);

  const next = Number(stock?.stockLevel || 0) + quantityDelta;
  const nextText = next.toString();

  if (stock) {
    await tx
      .update(inventoryLocationStocks)
      .set({
        stockLevel: nextText,
        availableQuantity: nextText,
        updatedAt: new Date(),
      })
      .where(eq(inventoryLocationStocks.id, stock.id));
  } else {
    await tx.insert(inventoryLocationStocks).values({
      locationId: location.id,
      productId,
      stockLevel: nextText,
      reservedQuantity: "0",
      availableQuantity: nextText,
    });
  }

  return recalculateProductStockLevels(
    tx,
    productId,
    location.companyId,
    location.branchId ?? null,
  );
}

import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { priceListItems, priceLists } from "../../shared/schema.js";
import { db } from "../db.js";

export interface SalesPriceRequest {
  companyId: number;
  productId: number;
  departmentId?: number | string | null;
  customerId?: number | string | null;
  variationId?: number | string | null;
  quantity?: number | string | null;
  asOf?: Date;
  fallbackUnitPrice: number | string | null | undefined;
}

export interface SalesPriceResult {
  unitPrice: number;
  source: "price_list" | "default";
  priceListId: number | null;
  priceListItemId: number | null;
  priceListCode: string | null;
}

function toId(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the effective selling price for a sales line. Specificity order is
 * customer+variation > customer > department+variation > department >
 * variation > global. Within the same specificity the highest list priority
 * wins, then the highest minimum-quantity tier that the line qualifies for.
 */
export async function resolveSalesUnitPrice(input: SalesPriceRequest): Promise<SalesPriceResult> {
  const fallback = roundMoney(Number(input.fallbackUnitPrice || 0));
  const asOf = input.asOf || new Date();
  const departmentId = toId(input.departmentId);
  const customerId = toId(input.customerId);
  const variationId = toId(input.variationId);
  const quantity = Math.max(Number(input.quantity || 0) || 0, 0);

  const specificity = sql`(
    case when ${priceLists.customerId} is not null then 2 else 0 end
    + case when ${priceLists.departmentId} is not null then 1 else 0 end
    + case when ${priceListItems.variationId} is not null then 4 else 0 end
  )`;

  const [match] = await db
    .select({
      id: priceListItems.id,
      unitPrice: priceListItems.unitPrice,
      priceListId: priceLists.id,
      code: priceLists.code,
    })
    .from(priceLists)
    .innerJoin(priceListItems, eq(priceListItems.priceListId, priceLists.id))
    .where(and(
      eq(priceLists.companyId, input.companyId),
      eq(priceLists.isActive, true),
      or(isNull(priceLists.effectiveFrom), lte(priceLists.effectiveFrom, asOf)),
      or(isNull(priceLists.effectiveTo), gte(priceLists.effectiveTo, asOf)),
      or(isNull(priceLists.departmentId), eq(priceLists.departmentId, departmentId ?? -1)),
      or(isNull(priceLists.customerId), eq(priceLists.customerId, customerId ?? -1)),
      eq(priceListItems.productId, input.productId),
      eq(priceListItems.isActive, true),
      or(isNull(priceListItems.effectiveFrom), lte(priceListItems.effectiveFrom, asOf)),
      or(isNull(priceListItems.effectiveTo), gte(priceListItems.effectiveTo, asOf)),
      or(isNull(priceListItems.variationId), eq(priceListItems.variationId, variationId ?? -1)),
      lte(priceListItems.minQuantity, String(quantity)),
    ))
    .orderBy(
      desc(specificity),
      desc(priceLists.priority),
      desc(priceListItems.minQuantity),
      asc(priceListItems.id),
    )
    .limit(1);

  if (!match) {
    return {
      unitPrice: fallback,
      source: "default",
      priceListId: null,
      priceListItemId: null,
      priceListCode: null,
    };
  }

  return {
    unitPrice: roundMoney(Number(match.unitPrice)),
    source: "price_list",
    priceListId: match.priceListId,
    priceListItemId: match.id,
    priceListCode: match.code,
  };
}

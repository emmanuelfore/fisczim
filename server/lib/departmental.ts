import { and, eq, inArray } from "drizzle-orm";
import {
  costCenters,
  departments,
  inventoryLocations,
  products,
} from "../../shared/schema.js";
import { db } from "../db.js";

export type DepartmentalInput = {
  departmentId?: number | string | null;
  costCenterId?: number | string | null;
};

export type DepartmentalDimensions = {
  departmentId: number | null;
  costCenterId: number | null;
};

function validationError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function toId(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Resolves and validates the analytical dimensions for a company.
 * Returns null when the company has no departments/cost centres configured,
 * so legacy tenants are unaffected.
 */
export async function resolveDepartmentalDimensions(
  companyId: number,
  input: DepartmentalInput = {},
): Promise<DepartmentalDimensions | null> {
  const configuredDepartments = await db
    .select({ id: departments.id, costCenterId: departments.costCenterId })
    .from(departments)
    .where(eq(departments.companyId, companyId));
  const configuredCostCenters = await db
    .select({ id: costCenters.id })
    .from(costCenters)
    .where(eq(costCenters.companyId, companyId));

  if (!configuredDepartments.length && !configuredCostCenters.length) return null;

  let departmentId = toId(input.departmentId);
  let costCenterId = toId(input.costCenterId);

  if (departmentId) {
    const department = configuredDepartments.find((d) => d.id === departmentId);
    if (!department) throw validationError(`Department ${departmentId} is not valid for this company`);
    if (!costCenterId && department.costCenterId) costCenterId = department.costCenterId;
  }
  if (costCenterId) {
    const costCenter = configuredCostCenters.find((cc) => cc.id === costCenterId);
    if (!costCenter) throw validationError(`Cost centre ${costCenterId} is not valid for this company`);
    if (!departmentId) {
      departmentId = configuredDepartments.find((d) => d.costCenterId === costCenterId)?.id ?? null;
    }
  }

  if (!departmentId && configuredDepartments.length === 1) {
    departmentId = configuredDepartments[0].id;
  }
  if (!costCenterId && departmentId) {
    costCenterId = configuredDepartments.find((d) => d.id === departmentId)?.costCenterId ?? null;
  }
  if (!costCenterId && configuredCostCenters.length === 1) {
    costCenterId = configuredCostCenters[0].id;
  }

  if (!departmentId || !costCenterId) {
    throw validationError("Department and cost centre are required for this transaction");
  }
  return { departmentId, costCenterId };
}

/** Fails the request when the company uses departments but no dimensions were captured. */
export async function requireDepartmentalDimensions(
  companyId: number,
  input: DepartmentalInput = {},
): Promise<DepartmentalDimensions | null> {
  return await resolveDepartmentalDimensions(companyId, input);
}

/**
 * Auto-captures department/cost centre from line products, then the dispatch
 * location, before requiring an explicit selection. Used by POS and other
 * fast-entry flows that do not yet expose the analytical fields.
 */
export async function resolveInvoiceAnalytics(
  companyId: number,
  input: DepartmentalInput & { locationId?: number | string | null },
  items: Array<{ productId?: number | string | null }> = [],
): Promise<DepartmentalDimensions | null> {
  const explicit = toId(input.departmentId) || toId(input.costCenterId)
    ? await resolveDepartmentalDimensions(companyId, input)
    : null;
  if (explicit) return explicit;

  const productIds = items
    .map((item) => toId(item.productId))
    .filter((id): id is number => id !== null);
  if (productIds.length) {
    const productRows = await db
      .select({ id: products.id, departmentId: products.departmentId, costCenterId: products.costCenterId })
      .from(products)
      .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));
    for (const product of productRows) {
      if (!product.departmentId && !product.costCenterId) continue;
      const resolved = await resolveDepartmentalDimensions(companyId, product);
      if (resolved) return resolved;
    }
  }

  const locationId = toId(input.locationId);
  if (locationId) {
    const [location] = await db
      .select({ departmentId: inventoryLocations.departmentId })
      .from(inventoryLocations)
      .where(and(eq(inventoryLocations.id, locationId), eq(inventoryLocations.companyId, companyId)))
      .limit(1);
    if (location?.departmentId) {
      const resolved = await resolveDepartmentalDimensions(companyId, { departmentId: location.departmentId });
      if (resolved) return resolved;
    }
  }

  return await resolveDepartmentalDimensions(companyId, input);
}

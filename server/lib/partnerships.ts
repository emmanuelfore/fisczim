import { eq, and } from "drizzle-orm";
import { db } from "../db.js";
import { companies, companyPartners, products } from "../../shared/schema.js";
import {
  computeRevenueSplit,
  normalizePartnershipSettings,
  type PartnerSnapshot,
} from "../../shared/partnership.js";
import type { CreateInvoiceRequest } from "../../shared/schema.js";

export async function getPartnerById(partnerId: number, companyId: number) {
  const [partner] = await db
    .select()
    .from(companyPartners)
    .where(and(eq(companyPartners.id, partnerId), eq(companyPartners.companyId, companyId), eq(companyPartners.isActive, true)))
    .limit(1);
  return partner;
}

export async function listActivePartners(companyId: number) {
  return db
    .select()
    .from(companyPartners)
    .where(and(eq(companyPartners.companyId, companyId), eq(companyPartners.isActive, true)))
    .orderBy(companyPartners.name);
}

function buildSnapshot(partner: typeof companyPartners.$inferSelect, revenueSharePercent: number): PartnerSnapshot {
  return {
    id: partner.id,
    name: partner.name,
    tradingName: partner.tradingName,
    logoUrl: partner.logoUrl,
    tin: partner.tin,
    vatNumber: partner.vatNumber,
    displayLabel: partner.displayLabel,
    revenueSharePercent,
  };
}

async function resolveOwnerGroupFromItems(companyId: number, items: CreateInvoiceRequest["items"]): Promise<string | null> {
  if (!items || !Array.isArray(items)) return null;
  for (const item of items) {
    if (!item.productId) continue;
    const [product] = await db
      .select({ ownerGroup: products.ownerGroup })
      .from(products)
      .where(and(eq(products.id, item.productId), eq(products.companyId, companyId)))
      .limit(1);
    const group = (product?.ownerGroup || "").trim();
    if (group) return group;
  }
  return null;
}

export async function resolvePartnerForInvoice(
  companyId: number,
  data: Pick<CreateInvoiceRequest, "partnerId" | "revenueSharePercent" | "items">
): Promise<{ partner: typeof companyPartners.$inferSelect; revenueSharePercent: number } | null> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const settings = normalizePartnershipSettings(company?.partnershipSettings);

  if (data.partnerId) {
    const partner = await getPartnerById(data.partnerId, companyId);
    if (!partner) return null;
    const pct = data.revenueSharePercent != null
      ? Number(data.revenueSharePercent)
      : Number(partner.defaultRevenueSharePercent || 0);
    return { partner, revenueSharePercent: pct };
  }

  const ownerGroup = await resolveOwnerGroupFromItems(companyId, data.items);
  if (ownerGroup) {
    const partners = await listActivePartners(companyId);
    const matched = partners.find(
      (p) => p.ownerGroupMatch && p.ownerGroupMatch.trim().toLowerCase() === ownerGroup.toLowerCase()
    );
    if (matched) {
      return {
        partner: matched,
        revenueSharePercent: Number(matched.defaultRevenueSharePercent || 0),
      };
    }
  }

  if (settings.defaultPartnerId) {
    const partner = await getPartnerById(settings.defaultPartnerId, companyId);
    if (partner) {
      return {
        partner,
        revenueSharePercent: Number(partner.defaultRevenueSharePercent || 0),
      };
    }
  }

  return null;
}

export async function applyPartnershipToInvoiceData(data: CreateInvoiceRequest): Promise<CreateInvoiceRequest> {
  const resolved = await resolvePartnerForInvoice(data.companyId, data);
  if (!resolved) {
    return {
      ...data,
      partnerId: null,
      partnerSnapshot: null,
      revenueSharePercent: null,
      partnerShareAmount: null,
      issuerShareAmount: null,
    } as CreateInvoiceRequest;
  }

  const total = Number(data.total || 0);
  const split = computeRevenueSplit(total, resolved.revenueSharePercent);
  const snapshot = buildSnapshot(resolved.partner, split.revenueSharePercent);

  return {
    ...data,
    partnerId: resolved.partner.id,
    partnerSnapshot: snapshot as any,
    revenueSharePercent: split.revenueSharePercent.toFixed(2),
    partnerShareAmount: split.partnerShareAmount.toFixed(2),
    issuerShareAmount: split.issuerShareAmount.toFixed(2),
  } as CreateInvoiceRequest;
}

import type { QueryKey } from "@tanstack/react-query";
import { api } from "@shared/routes";

/**
 * Single source of truth for CRM query keys. Cross-module keys (customers,
 * quotations) are declared here too so invalidations match the keys those
 * modules actually use.
 */
const crm = (companyId: number, ...rest: (string | number)[]): QueryKey => [
  "/api/companies",
  companyId,
  "crm",
  ...rest,
];

type Filters = Record<string, unknown>;

export const queryKeys = {
  crm: {
    stages: (companyId: number): QueryKey => crm(companyId, "stages"),
    enquiries: {
      all: (companyId: number): QueryKey => crm(companyId, "enquiries"),
      list: (companyId: number, filters: Filters = {}): QueryKey => [...crm(companyId, "enquiries"), filters],
      detail: (companyId: number, id: number | null): QueryKey => crm(companyId, "enquiries", String(id ?? "")),
    },
    followUps: {
      all: (companyId: number): QueryKey => crm(companyId, "follow-ups"),
      scope: (companyId: number, scope: string): QueryKey => crm(companyId, "follow-ups", scope),
    },
    reports: {
      all: (companyId: number): QueryKey => crm(companyId, "reports"),
      pipeline: (companyId: number): QueryKey => crm(companyId, "reports", "pipeline"),
    },
    duplicates: (companyId: number): QueryKey => crm(companyId, "duplicates"),
    dormant: {
      all: (companyId: number): QueryKey => crm(companyId, "dormant"),
      days: (companyId: number, days: number): QueryKey => crm(companyId, "dormant", String(days)),
    },
    matchingEnquiries: {
      all: (companyId: number): QueryKey => crm(companyId, "matching-enquiries"),
      search: (companyId: number, make: string, model: string, year: string): QueryKey =>
        crm(companyId, "matching-enquiries", make, model, year),
    },
    social: {
      all: (companyId: number): QueryKey => crm(companyId, "social"),
      connections: (companyId: number): QueryKey => crm(companyId, "social", "connections"),
      setup: (companyId: number): QueryKey => crm(companyId, "social", "setup"),
      inbox: (companyId: number): QueryKey => crm(companyId, "social", "inbox"),
      deliveries: (companyId: number): QueryKey => crm(companyId, "social", "deliveries"),
    },
    commissions: {
      all: (companyId: number): QueryKey => crm(companyId, "commissions"),
      list: (companyId: number, filters: Filters = {}): QueryKey => [...crm(companyId, "commissions"), filters],
      settings: (companyId: number): QueryKey => crm(companyId, "commission-settings"),
      rules: (companyId: number): QueryKey => crm(companyId, "commission-rules"),
      taskPenalties: (companyId: number): QueryKey => crm(companyId, "task-penalties"),
    },
    tasks: {
      all: (companyId: number): QueryKey => crm(companyId, "tasks"),
      list: (companyId: number, filters: Filters = {}): QueryKey => [...crm(companyId, "tasks"), filters],
    },
  },
  customers: {
    list: (companyId: number): QueryKey => [api.customers.list.path, companyId],
  },
  quotations: {
    list: (companyId: number): QueryKey => ["quotations", companyId],
  },
} as const;

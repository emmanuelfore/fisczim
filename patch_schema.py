import re

with open('shared/schema.ts', 'r') as f:
    content = f.read()

# Replace export const payrollEarningTypes = pgTable("payroll_earning_types" ... up to ));
earning_regex = re.compile(r'export const payrollEarningTypes = pgTable\("payroll_earning_types", \{.*?\n\}\);', re.DOTALL)
content = earning_regex.sub('', content)

# It actually has an index: }, (table) => ({ ... }));
earning_regex2 = re.compile(r'export const payrollEarningTypes = pgTable\("payroll_earning_types", \{.*?\}\, \(table\) => \(\{.*?\}\)\);', re.DOTALL)
content = earning_regex2.sub('', content)

# Deduction types
deduction_regex = re.compile(r'export const payrollDeductionTypes = pgTable\("payroll_deduction_types", \{.*?\}\, \(table\) => \(\{.*?\}\)\);', re.DOTALL)
content = deduction_regex.sub('', content)

# Relations
rel_earning = re.compile(r'export const payrollEarningTypesRelations = relations\(payrollEarningTypes.*?\}\)\);', re.DOTALL)
content = rel_earning.sub('', content)

rel_deduction = re.compile(r'export const payrollDeductionTypesRelations = relations\(payrollDeductionTypes.*?\}\)\);', re.DOTALL)
content = rel_deduction.sub('', content)

# Schemas and types
type_earning = re.compile(r'export const insertPayrollEarningTypeSchema = .*?export type InsertPayrollEarningType = z\.infer<typeof insertPayrollEarningTypeSchema>;', re.DOTALL)
content = type_earning.sub('', content)

type_deduction = re.compile(r'export const insertPayrollDeductionTypeSchema = .*?export type InsertPayrollDeductionType = z\.infer<typeof insertPayrollDeductionTypeSchema>;', re.DOTALL)
content = type_deduction.sub('', content)

# Insert the new elements near payrollGrades
new_schema = """
export const payrollElements = pgTable("payroll_elements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  countryCode: text("country_code").default("ZW").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // EARNING, DEDUCTION, EMPLOYER_CONTRIBUTION, TAX_CREDIT
  category: text("category").notNull(), 
  taxTreatment: text("tax_treatment").default("TAXABLE"), 
  affectsPAYE: boolean("affects_paye").default(false).notNull(),
  affectsNSSA: boolean("affects_nssa").default(false).notNull(),
  affectsPension: boolean("affects_pension").default(false).notNull(),
  taxCreditEligible: boolean("tax_credit_eligible").default(false).notNull(),
  calculationMethod: text("calculation_method").default("FIXED").notNull(),
  formula: text("formula"),
  employeeRate: decimal("employee_rate", { precision: 12, scale: 6 }).default("0.000000").notNull(),
  employerRate: decimal("employer_rate", { precision: 12, scale: 6 }).default("0.000000").notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  maxAmount: decimal("max_amount", { precision: 15, scale: 2 }),
  priorityOrder: integer("priority_order").default(100).notNull(),
  glAccountId: integer("gl_account_id").references(() => accounts.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  elementCompanyCodeIdx: index("payroll_elements_company_code_idx").on(table.companyId, table.code),
}));

export const payrollCalculationAudits = pgTable("payroll_calculation_audits", {
  id: serial("id").primaryKey(),
  runEmployeeId: integer("run_employee_id").references(() => payrollRunEmployees.id).notNull(),
  elementId: integer("element_id").references(() => payrollElements.id).notNull(),
  elementCode: text("element_code").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  employerAmount: decimal("employer_amount", { precision: 15, scale: 2 }).default("0.00"),
  formulaUsed: text("formula_used"),
  variables: jsonb("variables").$type<Record<string, any>>().default({}),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const payrollElementsRelations = relations(payrollElements, ({ one }) => ({
  company: one(companies, { fields: [payrollElements.companyId], references: [companies.id] }),
  glAccount: one(accounts, { fields: [payrollElements.glAccountId], references: [accounts.id] }),
}));

export const payrollCalculationAuditsRelations = relations(payrollCalculationAudits, ({ one }) => ({
  runEmployee: one(payrollRunEmployees, { fields: [payrollCalculationAudits.runEmployeeId], references: [payrollRunEmployees.id] }),
  element: one(payrollElements, { fields: [payrollCalculationAudits.elementId], references: [payrollElements.id] }),
}));

export const insertPayrollElementSchema = createInsertSchema(payrollElements).omit({ id: true, createdAt: true });
export type PayrollElement = typeof payrollElements.$inferSelect;
export type InsertPayrollElement = z.infer<typeof insertPayrollElementSchema>;

export const insertPayrollCalculationAuditSchema = createInsertSchema(payrollCalculationAudits).omit({ id: true, timestamp: true });
export type PayrollCalculationAudit = typeof payrollCalculationAudits.$inferSelect;
export type InsertPayrollCalculationAudit = z.infer<typeof insertPayrollCalculationAuditSchema>;
"""

content = content.replace('export const payrollRunEmployees = pgTable("payroll_run_employees", {', new_schema + '\nexport const payrollRunEmployees = pgTable("payroll_run_employees", {')

with open('shared/schema.ts', 'w') as f:
    f.write(content)


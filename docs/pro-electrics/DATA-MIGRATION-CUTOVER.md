# PRO ELECTRICS — Data Migration and Cutover Runbook

**Version:** 1.0  
**Date:** 2026-11-24  
**Target model:** **One legal company** with a **central chart of accounts (COA)** and departmental/cost-centre analytical tracking. This is **not** a three-legal-company migration.  
**Environments:** Source legacy/CSV/UAT → staging → production.

> **Client confirmation is mandatory before production cutover:** exact monetary approval thresholds, department managers and named approvers, final department/cost-centre/warehouse codes, and opening/damaged stock data. Provisional `REP` / `ECS` / `HW` and `WH-REP` / `WH-ECS` / `WH-HW` codes are for rehearsal only and remain pending confirmation.

## 1. Scope and implementation boundary

- Migrate one PRO ELECTRICS legal company, one central COA, three departments (Repairs, Electrical Services, Hardware), three departmental warehouses plus a central warehouse.
- Carry department/cost-centre dimensions through quotations, sales orders, invoices, purchase orders, expenses, inventory transactions and GL lines for analytical reporting.
- Preserve accounting history: cancelled duplicate invoices must remain with audit notes; do not delete posted journals or invoices.
- Migration files present at time of writing:
  - `migrations/0109_sales_order_picking_and_invoice_dedupe.sql`: adds picking records, `sales_order_items.picked_quantity`, one-active pick list/active invoice indexes, cancels duplicate active invoices while preserving the posted/FiscalInvoice/oldest entry, and repoints quotation links to real quotation tables.
  - `migrations/0110_departmental_structure.sql`: adds nullable `department_id` / `cost_center_id` / warehouse links to departments, products, inventory locations/transactions, quotations, sales orders, invoices, purchase orders and expenses; backfills by normalized name match.
  - `migrations/0111_approval_sod_departmental_gl.sql`: adds department/cost-centre columns to GL and source documents, account default departments, analytical indexes and 14 normalized approval policies for tenants with no settings. It is present in this working tree but must be confirmed in the deployment branch; its absence is a blocker.
  - `migrations/0112_vehicle_agency_accounting.sql`: vehicle-import agency accounting tables and fields; apply where vehicle workflows are in scope.
  - `migrations/0113_department_price_lists.sql`, `0114_department_budgets.sql`, `0115_procurement_requisitions.sql`: department/customer price lists, budgets and requisition/supplier-quote tables.
  - `migrations/0116_requisition_approval_policy.sql`: backfills the 15th approval policy without overwriting configured tenant settings.
  - `migrations/0117_hr_employee_fields.sql`: termination type/reason and probation date storage for employees and contracts.
  - `migrations/0118_nhif_wcif_statutory_rules.sql`: adds unpriced NHIF/WCIF rule rows; rates remain client-configured.
  - `migrations/0119_quotation_location.sql`: stores the quotation location with its analytical dimensions.
- Mandatory capture, immutability and self-approval hardening are still cutover prerequisites/UAT checks on every entry route; do not assume they exist because columns or a guard exist on one route.

## 2. Pre-cutover checklist

| # | Item | Owner | Status | Evidence |
|---|---|---|---|---|
| PC-01 | Final legal company name, TIN/VAT, currency, country = Zimbabwe confirmed. | General Manager | ☐ | Company profile |
| PC-02 | Final department, cost-centre and warehouse codes confirmed; provisional codes replaced in load files. | Finance Manager / Department Manager | ☐ | Signed mapping sheet |
| PC-03 | Department manager assignments and named approvers confirmed. | General Manager | ☐ | Approval matrix |
| PC-04 | For the actual PRO ELECTRICS company id (currently 154), all 15 approval policies are loaded into `companies.approval_settings` with `mode`, `amountThreshold`, `ownerBypass`, `allowSelfApproval:false`, `approverUserIds` and `approverRoleIds`; thresholds confirmed. | General Manager / Finance Manager | ☐ | Settings export + SQL |
| PC-05 | Opening stock, damaged/obsolete stock and per-location balances confirmed. | Warehouse Officer / Finance Manager | ☐ | Signed stock sheet |
| PC-06 | COA, opening balances and control accounts reconciled. | Accountant | ☐ | TB/opening balance report |
| PC-07 | Customer/supplier master deduplicated; opening balances agreed. | Accountant | ☐ | AR/AP ageing |
| PC-08 | Duplicate active invoices per sales order identified; 0109 behaviour tested on staging copy. | Finance Manager | ☐ | Duplicate report + 0109 log |
| PC-09 | Open POs, GDNs/GRNs and unmatched supplier bills listed with department/cost centre. | Procurement Officer | ☐ | Open items report |
| PC-10 | Payroll statutory config, tax tables, approved credits, APWCS industry rate, and NHIF/WCIF effective rates confirmed; NHIF/WCIF remain zero with warnings until configured. | HR/Payroll Officer | ☐ | Statutory export |
| PC-11 | User roles, permissions and approver/delegate assignments confirmed; SoD reviewed; verify tenant id and that 0111 seeded settings rather than assuming migration success. | System Administrator | ☐ | User/role matrix + SQL |
| PC-12 | Source data frozen; cutover timing and user communication issued. | General Manager / System Administrator | ☐ | Cutover notice |
| PC-13 | Full backup of production and staging completed and restore tested. | System Administrator | ☐ | Backup/restore log |
| PC-14 | Migration rehearsal completed end-to-end with validation SQL attached. | System Administrator / Finance Manager | ☐ | Rehearsal evidence |
| PC-15 | UAT exit criteria met or waivers approved. | General Manager | ☐ | UAT sign-off |

## 3. Backup and restore

Run from a trusted admin workstation. Replace placeholders with approved values. Never rehearse against production.

```bash
# Pre-cutover production backup
pg_dump -Fc --no-owner --no-privileges \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f "backup_pro_electrics_pre_cutover_$(date +%Y%m%d_%H%M%S).dump"

# Restore rehearsal into an isolated database
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" pro_electrics_restore_test
pg_restore --clean --if-exists --no-owner --no-privileges \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
  -d pro_electrics_restore_test \
  -f backup_pro_electrics_pre_cutover_YYYYMMDD_HHMMSS.dump
```

Record backup file name, checksum, restore duration and the validation result. Confirm application can start against the restored database before proceeding.

## 4. Schema and migration order

| Step | Action | Notes / guardrails |
|---|---|---|
| 1 | Confirm current migration version and application version on staging and production. | Use the deployment's migration tracking table; do not guess. |
| 2 | Apply baseline migrations in numeric order through `0108_*`. | Includes 0104 three-way match enforcement, 0107 configurable statutory engine and 0108 payroll calendar/notifications. |
| 3 | Apply `0109_sales_order_picking_and_invoice_dedupe.sql`. | Review its duplicate-invoice cancellation list on a restored copy first. It keeps ledger-linked/FiscalInvoice/oldest record, cancels the rest with a note, and creates `invoices_one_active_per_sales_order_idx`. |
| 4 | Apply `0110_departmental_structure.sql`. | Links are nullable; its name-based backfill can mislink similarly named records. Review before data load. |
| 5 | Apply `0111_approval_sod_departmental_gl.sql`, then `0112_vehicle_agency_accounting.sql` where vehicles are in scope. | 0111 adds GL/source-document department fields, indexes and approval policies for tenants with `approval_settings IS NULL`; verify the actual company id and policy count afterwards. Raise a blocker if 0111 is absent. |
| 6 | Load reference data: departments, cost centres, warehouses, products, COA, opening balances. | One company only. Keep a signed mapping sheet and load-batch IDs. |
| 7 | Load master and transactional data: customers, suppliers, sales orders/invoices, purchasing, inventory, payroll, approval settings/users. | Preserve document numbers and source IDs in a cross-reference table. |
| 8 | Run section 6 validation SQL and UAT regression checks. | No go-live until all blockers are closed. |
| 9 | Freeze source system, take final incremental backup, switch users to production, monitor. | Keep pre-cutover backup available for the agreed rollback window. |

## 5. Data mapping

### 5.1 Reference data

| Object | Provisional code | Name | Cost centre | Manager / approver | Warehouse link | Confirmation status |
|---|---|---|---|---|---|---|
| Department | `REP` | Repairs | Client-confirmed cost centre | Client-confirmed manager | `WH-REP` | Code pending confirmation |
| Department | `ECS` | Electrical Services | Client-confirmed cost centre | Client-confirmed manager | `WH-ECS` | Code pending confirmation |
| Department | `HW` | Hardware | Client-confirmed cost centre | Client-confirmed manager | `WH-HW` | Code pending confirmation |
| Warehouse | `CENTRAL` | Central Warehouse | Central/default | Warehouse Officer | Not forced to one department | Name/code pending confirmation |
| Warehouse | `WH-REP` | Repairs Warehouse | REP cost centre | Warehouse Officer | `department_id` → REP | Code pending confirmation |
| Warehouse | `WH-ECS` | Electrical Services Warehouse | ECS cost centre | Warehouse Officer | `department_id` → ECS | Code pending confirmation |
| Warehouse | `WH-HW` | Hardware Warehouse | HW cost centre | Warehouse Officer | `department_id` → HW | Code pending confirmation |

### 5.2 Mapping rules by data set

| Data set | Target | Mapping rule / prerequisite |
|---|---|---|
| Chart of accounts | `accounts` | One `company_id`; single central COA. Do not clone per department. Accounts may carry `default_cost_center_id` where agreed. Opening balances post to the same company and balance period. |
| Cost centres | `cost_centers` | Unique `(company_id, code)`. Final codes from client; provisional labels only in rehearsal. |
| Departments | `departments` | Link `cost_center_id` and `manager_user_id`. Manager names are client-confirmed. |
| Products | `products` | Populate `department_id` and `cost_center_id` for every saleable/stockable product. Review unmapped products before load. |
| Inventory locations | `inventory_locations` | Central + three departmental warehouses; `department_id` on WH-REP/WH-ECS/WH-HW. Unique `(company_id, code)`. |
| Customers | `customers` | Deduplicate by name/TIN/phone; preserve credit terms, currency and opening balance. |
| Suppliers | `suppliers` | Deduplicate by name/TIN/phone; preserve payment terms and opening balance. |
| Quotations | `quotations` | Link to real quotation records; ensure `sales_orders.quotation_id` and `sales_order_items.quotation_item_id` resolve (0109 clears invalid links). Set department/cost centre. |
| Sales orders | `sales_orders` | Preserve order number/status; set `department_id`, `cost_center_id`, `location_id`; keep source ID cross-reference. |
| Picking/dispatch | `sales_pick_lists`, `sales_pick_list_items`, `sales_order_items.picked_quantity` | Only one active pick list per SO. Migrate picked/dispatched quantities and delivery/POD references where available. |
| Invoices | `invoices` | One active invoice per SO. Cancel duplicates rather than delete; preserve `notes`, journal links and FiscalInvoice history. Set department/cost centre/location. |
| Payments/reconciliation | Payments, payment allocations, cashbook | Preserve allocation to invoices and bank/cashbook references; reconcile AR/AP after load. |
| Purchase requisitions/quotes | `purchase_requisitions`, `purchase_requisition_items`, `supplier_quotes`, `supplier_quote_items` | Map requester, department/cost centre/location, manager approval, supplier quotes and selected quote. Preserve source IDs in `notes` when legacy records exist. |
| Purchase orders | `purchase_orders` | Preserve PO number/status; set department/cost centre/location; link supplier and source quotes where available. |
| GDN/GRN | `goods_delivery_notes`, inventory receipts/transactions | Link GDN → PO → GRN; preserve receipt quantities, GRV numbers and department/cost centre from PO. |
| Supplier bills / three-way match | `supplier_invoices`, `supplier_bill_matches` | Preserve PO/GRN/invoice values, status, variance, waiver and approval evidence. Do not create new duplicate active supplier invoice numbers. |
| Inventory opening stock | `inventory_location_stocks`, `inventory_transactions` | Load per location per product with confirmed good/damaged split; damaged quantities require client confirmation. Include department/cost centre on transactions. |
| Expenses | `expenses` | Map department/cost centre and GL accounts; retain approval and attachment references. |
| Payroll employees/contracts | `employees`, `employee_contracts`, salary history tables | Preserve employee number, department, position, effective dates, salary history and contract currency. |
| Payroll statutory config | `payroll_statutory_rules`, tax tables, `payroll_employee_tax_credits` | ZW rules: PAYE, AIDS_LEVY, NSSA_POBS, NEC, ZIMDEF, APWCS, PENSION. Only approved credits apply. |
| APWCS rate | `payroll_industry_codes`, `payroll_industry_premium_rates` | Client/industry code and effective-dated premium rate required. Never invent a rate; missing rate must raise a warning/block. |
| Approval settings | `companies.approval_settings` | Load all 15 types with `mode`, `amountThreshold`, `ownerBypass`, `allowSelfApproval`, `approverUserIds` and `approverRoleIds`. Eight types support amount thresholds; `0` means no threshold. Thresholds and named approvers are client-confirmed. |
| Users and roles | `users`, `company_users`, `company_roles`, `company_role_permissions` | One company membership per user; least privilege; no shared accounts. Named approvers from client matrix. |

## 6. Validation SQL (Postgres)

Bind the production company id to `$1`. Run each query on staging and again after production load. Expected results are stated above each query.

### 6.1 Departments, cost centres and managers

Expected: three active departments with cost-centre links and confirmed managers.

```sql
SELECT d.id,
       d.code AS department_code,
       d.name AS department_name,
       d.cost_center_id,
       cc.code AS cost_center_code,
       cc.name AS cost_center_name,
       d.manager_user_id,
       u.name AS manager_name,
       d.is_active
FROM departments d
LEFT JOIN cost_centers cc
       ON cc.id = d.cost_center_id AND cc.company_id = d.company_id
LEFT JOIN users u
       ON u.id = d.manager_user_id
WHERE d.company_id = $1
ORDER BY d.code;
```

### 6.2 Warehouse links

Expected: central warehouse plus WH-REP/WH-ECS/WH-HW; departmental warehouses linked to the correct department.

```sql
SELECT il.id,
       il.code AS warehouse_code,
       il.name AS warehouse_name,
       il.type,
       il.department_id,
       d.code AS department_code,
       il.is_default_receiving,
       il.is_default_dispatch,
       il.is_active
FROM inventory_locations il
LEFT JOIN departments d
       ON d.id = il.department_id AND d.company_id = il.company_id
WHERE il.company_id = $1
ORDER BY il.code;
```

### 6.3 Null department/cost-centre counts

Expected: zero for required documents after load, except explicitly approved central/control postings.

```sql
SELECT 'products' AS table_name,
       count(*) FILTER (WHERE department_id IS NULL) AS missing_department,
       count(*) FILTER (WHERE cost_center_id IS NULL) AS missing_cost_center,
       count(*) AS total_rows
FROM products WHERE company_id = $1
UNION ALL
SELECT 'quotations',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM quotations WHERE company_id = $1
UNION ALL
SELECT 'sales_orders',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM sales_orders WHERE company_id = $1
UNION ALL
SELECT 'invoices',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM invoices WHERE company_id = $1
UNION ALL
SELECT 'purchase_orders',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM purchase_orders WHERE company_id = $1
UNION ALL
SELECT 'expenses',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM expenses WHERE company_id = $1
UNION ALL
SELECT 'inventory_transactions',
       count(*) FILTER (WHERE department_id IS NULL),
       count(*) FILTER (WHERE cost_center_id IS NULL),
       count(*)
FROM inventory_transactions WHERE company_id = $1
ORDER BY table_name;
```

### 6.4 Duplicate active invoice rule

Expected: unique index exists and duplicate query returns zero rows.

```sql
-- Index from migration 0109
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'invoices_one_active_per_sales_order_idx';

-- Duplicate active invoices for this company (expected: no rows)
SELECT i.sales_order_id,
       count(*) AS active_invoice_count,
       array_agg(i.id ORDER BY i.id) AS invoice_ids
FROM invoices i
WHERE i.company_id = $1
  AND i.sales_order_id IS NOT NULL
  AND COALESCE(i.status, '') <> 'cancelled'
GROUP BY i.sales_order_id
HAVING count(*) > 1
ORDER BY i.sales_order_id;
```

### 6.5 Approval settings and request queue

Expected: 15 policies, 15 with `allowSelfApproval:false`, modes/thresholds match the client-confirmed matrix; no unexpected pending or `failed` requests after cutover.

```sql
SELECT id, name, approval_settings
FROM companies
WHERE id = $1;

SELECT count(*) AS policy_count,
       count(*) FILTER (WHERE value->>'allowSelfApproval' = 'false') AS self_approval_blocked
FROM companies, jsonb_each(approval_settings)
WHERE id = $1;

SELECT type, status, count(*) AS request_count
FROM approval_requests
WHERE company_id = $1
GROUP BY type, status
ORDER BY type, status;
```

### 6.6 Payroll configuration

Expected: active ZW rules with client-confirmed rates; APWCS has an effective industry premium; credits approved before application.

```sql
SELECT rule_code,
       name,
       currency,
       pay_frequency,
       employee_rate,
       employer_rate,
       calculation_basis,
       requires_industry_rate,
       effective_from,
       effective_to,
       is_active
FROM payroll_statutory_rules
WHERE company_id = $1
  AND country_code = 'ZW'
  AND rule_code IN ('PAYE','AIDS_LEVY','NSSA_POBS','NEC','ZIMDEF','STANDARDS_LEVY','APWCS','PENSION')
ORDER BY rule_code, effective_from DESC;

SELECT ic.code AS industry_code,
       ic.description,
       pr.rate AS apwcs_premium_rate,
       pr.ceiling_amount,
       pr.effective_from,
       pr.effective_to,
       pr.source_reference
FROM payroll_industry_premium_rates pr
JOIN payroll_industry_codes ic
  ON ic.id = pr.industry_code_id AND ic.company_id = pr.company_id
WHERE pr.company_id = $1
ORDER BY pr.effective_from DESC;

SELECT approval_status, count(*) AS credit_count
FROM payroll_employee_tax_credits
WHERE company_id = $1
GROUP BY approval_status
ORDER BY approval_status;
```

### 6.7 Department and cost-centre GL/source coverage

Expected: no posted journal for the company has unassigned department **or** cost centre, except cleared central adjustments. Also verify source-document columns introduced by 0111.

```sql
SELECT je.id AS journal_entry_id,
       je.entry_date,
       je.reference_type,
       je.reference_id,
       je.description,
       count(*) AS line_count,
       count(*) FILTER (WHERE le.cost_center_id IS NULL) AS lines_without_cost_center,
       count(*) FILTER (WHERE le.department_id IS NULL) AS lines_without_department
FROM journal_entries je
JOIN ledger_entries le
  ON le.journal_entry_id = je.id
WHERE je.company_id = $1
  AND je.status = 'POSTED'
GROUP BY je.id, je.entry_date, je.reference_type, je.reference_id, je.description
HAVING count(*) FILTER (WHERE le.cost_center_id IS NULL) > 0
    OR count(*) FILTER (WHERE le.department_id IS NULL) > 0
ORDER BY je.id DESC
LIMIT 50;

SELECT 'accounts' AS source, count(*) FILTER (WHERE default_department_id IS NULL) AS missing
FROM accounts WHERE company_id = $1
UNION ALL
SELECT 'supplier_payments', count(*) FILTER (WHERE department_id IS NULL OR cost_center_id IS NULL)
FROM supplier_payments WHERE company_id = $1
UNION ALL
SELECT 'purchase_returns', count(*) FILTER (WHERE department_id IS NULL OR cost_center_id IS NULL)
FROM purchase_returns WHERE company_id = $1
UNION ALL
SELECT 'stock_transfers', count(*) FILTER (WHERE department_id IS NULL OR cost_center_id IS NULL)
FROM stock_transfers WHERE company_id = $1
UNION ALL
SELECT 'stock_takes', count(*) FILTER (WHERE department_id IS NULL OR cost_center_id IS NULL)
FROM stock_takes WHERE company_id = $1;
```

## 7. Rollback plan

1. **Freeze changes:** stop new postings/imports and notify users. Record rows loaded, document numbers and GL batches for the cutover window.
2. **Data-only correction:** for a limited bad load, reverse only the affected load batch using the source cross-reference. Use credit notes, journal reversals or new versions for posted documents; never hard-delete accounting history.
3. **Duplicate-invoice caution:** 0109 cancels duplicates with notes. Do not "uncancel" rows without Finance Manager and Accountant approval and an audit record.
4. **Full rollback:** if go/no-go fails or data integrity is uncertain, restore the pre-cutover backup into the production database during the agreed maintenance window, redeploy the prior application version, and verify login, COA, AR/AP, stock, payroll and reports.
5. **Payroll rollback:** approved/locked runs should be reversed through the payroll reversal flow, not edited. Bank files already transmitted require General Manager and Finance Manager approval before cancellation/reissue.
6. **Post-rollback:** confirm all users can log in, no duplicate documents remain, and a fresh backup of the rolled-back state is taken before any retry.

## 8. Go / no-go checklist

| # | Criterion | Owner | Go | No-go / action |
|---|---|---|---|---|
| GN-01 | One legal company and central COA; no accidental company duplication. | Finance Manager | ☐ | |
| GN-02 | Final codes, thresholds, managers/approvers and opening/damaged stock confirmed in writing. | General Manager | ☐ | |
| GN-03 | Migrations 0109–0119 (0112 only where vehicles are in scope) applied successfully; tenant approval settings and NHIF/WCIF rule rows verified. | System Administrator | ☐ | |
| GN-04 | Validation SQL 6.1–6.7 passed with zero unexplained exceptions. | Accountant | ☐ | |
| GN-05 | One active invoice per SO; duplicates cancelled with notes and history intact. | Finance Manager | ☐ | |
| GN-06 | Department **and** cost centre propagated to source documents and GL; reports reconcile. | Finance Manager | ☐ | |
| GN-07 | Payroll statutory config, APWCS rate and approved credits verified by HR/Payroll Officer. | HR/Payroll Officer | ☐ | |
| GN-08 | Users, roles, approvers and SoD active; self-approval prevention verified or documented as blocker/waiver. | System Administrator | ☐ | |
| GN-09 | Backup restored successfully and rollback plan accepted. | System Administrator | ☐ | |
| GN-10 | UAT exit criteria met; open S1/S2 defects closed or formally waived. | General Manager | ☐ | |

**Go decision:** ☐ Go ☐ No-go ☐ Conditional go (conditions attached)  
**Cutover window:** ____________________ **Migration lead:** ____________________

## 9. Sign-off

| Role | Name | Signature | Date | Confirmation |
|---|---|---|---|---|
| System Administrator | | | | Backup, migrations, users/permissions, audit trail |
| General Manager | | | | Final codes, thresholds, approvers, go/no-go decision |
| Finance Manager | | | | COA, opening balances, cost centres, invoice/GL controls |
| HR/Payroll Officer | | | | Employees, contracts, statutory config, credits, APWCS rate |
| Department Manager | | | | REP/ECS/HW assignments and departmental data |
| Salesperson | | | | Sales orders, picking/dispatch handover |
| Procurement Officer | | | | Open POs, supplier quotes, GDN/GRN, three-way match |
| Warehouse Officer | | | | Opening/damaged stock per location, transfers/counts |
| Accountant | | | | AR/AP, GL reconciliation, reports, cutover validation queries |

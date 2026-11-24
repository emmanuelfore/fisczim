# PRO ELECTRICS — User Acceptance Test (UAT) Plan

**Version:** 1.0  
**Date:** 2026-11-24  
**Status:** Draft — client inputs pending confirmation  
**Scope:** One legal company, central chart of accounts, departmental/cost-centre analytics, three departments and three departmental warehouses plus a central warehouse.

## 1. Purpose and scope

This plan defines the business acceptance tests for the PRO ELECTRICS implementation. It covers:

- One legal company with a **central chart of accounts (COA)** and departmental cost centres for analytical/reporting purposes.
- Departments: **Repairs**, **Electrical Services**, **Hardware**; warehouses: **Central**, **WH-REP**, **WH-ECS**, **WH-HW**.
- Sales: enquiry → quotation → approval → sales order → picking → dispatch/POD → invoice approval → payment/reconciliation.
- Procurement: requisition → manager approval → supplier quotes → management PO approval → GDN/GRN → three-way match → payment approval.
- Payroll: Zimbabwe PAYE, AIDS Levy, NSSA, ZIMDEF, APWCS, approved tax credits and statutory reporting.
- Approval policy, segregation of duties (SoD), self-approval prevention, mandatory capture, immutability, GL propagation, audit trails, exports and permissions.
- Reporting: sales dashboard, financial reports, cost-centre and departmental views.

> **Client-confirmed inputs required:** exact monetary approval limits, department manager assignments, named approvers, final codes and opening/damaged stock figures are client-confirmed inputs. Provisionally use `REP` / `ECS` / `HW` and `WH-REP` / `WH-ECS` / `WH-HW` in the UAT environment; these codes remain **pending client confirmation**.

### Implementation boundary at time of writing

- Required migrations in numeric order: `0109_sales_order_picking_and_invoice_dedupe.sql`, `0110_departmental_structure.sql`, `0111_approval_sod_departmental_gl.sql` and `0112_vehicle_agency_accounting.sql` (where vehicle-import workflows are in scope). 0111 is present in this working tree but must be confirmed in the deployment branch before UAT starts; its absence is a blocker.
- Migration 0110 makes department/cost-centre links **nullable** and backfills by matching names. Mandatory capture on some entry paths is still being hardened, so TC-06/TC-07/TC-09 must record the exact route and HTTP result. Any route that silently saves without dimensions must be logged as a gap.
- Approval types now number **14**: `stock_adjustment`, `grn_confirm`, `journal_post`, `invoice_issue`, `sales_commission`, `quotation`, `discount`, `sales_order`, `purchase_order`, `supplier_registration`, `credit_note`, `payment_execution`, `leave` and `expense`. Amount thresholds are supported by eight types: `journal_post`, `invoice_issue`, `discount`, `sales_order`, `purchase_order`, `credit_note`, `payment_execution` and `expense`. Purchase-order approval is generic; requisition approval remains absent and must be logged as a requirement gap.
- A self-approval guard exists in `server/lib/approvals.ts` and applies to approve and reject, but it can be disabled by `allowSelfApproval` in policy. TC-19 is therefore still **critical**: verify the guard is active and that no waiver enabled the flag.
- Approval execution failures are terminal (`status: failed`) and are never replayed; an administrator closes them through `POST /api/companies/:companyId/approvals/:id/resolve-failed` after manual reconciliation.

## 2. Entry criteria

| # | Criterion | Owner | Evidence |
|---|---|---|---|
| EC-01 | UAT environment refreshed from a production-like backup; only one legal company configured for the test. | System Administrator | Backup/restore log |
| EC-02 | Migrations 0109, 0110, 0111 and 0112 (where vehicles are in scope) applied in order; verify columns/indexes and the approval-policy seed on the actual tenant id, not just migration success. | System Administrator | Migration log + SQL verification |
| EC-03 | Central COA, cost centres, departments, warehouses and product mappings loaded from the confirmed data mapping. | Finance Manager | Reference-data export |
| EC-04 | Users created for all nine sign-off roles with least-privilege permissions and named approvers recorded. | System Administrator | User/role matrix |
| EC-05 | For the actual PRO ELECTRICS company id (currently 154), `companies.approval_settings` contains all 14 normalized policies with `allowSelfApproval:false`, `mode`, `amountThreshold`, `ownerBypass`, `approverUserIds` and `approverRoleIds`; provisional non-zero thresholds set for UAT. | General Manager | Settings export + SQL verification |
| EC-06 | Zimbabwe statutory configuration, tax tables and APWCS industry rate/premium available in UAT. | HR/Payroll Officer | Statutory setup export |
| EC-07 | Sales/procurement/payroll sample data prepared and opening balances reconciled. | Finance Manager | Sample-data pack |
| EC-08 | Defect log, evidence folder and daily defect triage established. | System Administrator | Defect log link |
| EC-09 | FiscalPrinter training mode available for invoice/POD demonstration; no live fiscalization in UAT. | System Administrator | `FiscalPrinter/README.md` training commands |

## 3. Exit criteria

- All **critical** and **high** test cases pass, or an approved workaround and client waiver are recorded.
- One-active-invoice, mandatory department/cost-centre capture, duplicate-invoice preservation, partial delivery/backorder, GL **department and cost-centre** propagation, self-approval prevention, payroll statutory calculations and permissions have explicit evidence.
- No open Severity 1 or Severity 2 defects.
- All failed cases have an owner, target date and retest result.
- Sales dashboard, financial reports and cost-centre/departmental reports reconcile to the UAT GL.
- Final sign-off is completed by all roles in section 6.

## 4. Test cases

`Pass/Fail` is completed during execution. `Evidence` must reference a screenshot, export, document ID, log entry or query result stored in the UAT evidence folder.

| ID | Scenario | Steps | Expected result | Pass/Fail | Evidence |
|---|---|---|---|---|---|
| TC-01 | Single legal company and central COA | 1. Log in as System Administrator. 2. Confirm company count and COA list. 3. Open `/accounting/coa`. | Exactly one active legal company; one central COA; no company-level duplicate COA sets. | ☐ Pass ☐ Fail | |
| TC-02 | Department and cost-centre reference data | 1. Open department/cost-centre setup. 2. Verify Repairs, Electrical Services, Hardware and their linked cost centres. 3. Export the mapping. | Three active departments with cost-centre links; codes still marked provisional pending client confirmation. | ☐ Pass ☐ Fail | |
| TC-03 | Warehouse setup | 1. Open `/inventory/locations`. 2. Verify Central, WH-REP, WH-ECS, WH-HW. 3. Check each departmental warehouse's `department_id`. | Four active locations; departmental warehouses linked to REP/ECS/HW respectively; Central not forced to a single department. | ☐ Pass ☐ Fail | |
| TC-04 | Department manager assignment | 1. Assign confirmed manager users to departments. 2. Save and reopen each department. | Manager assignments match client-confirmed names; unconfirmed assignments flagged as pending, not silently defaulted. | ☐ Pass ☐ Fail | |
| TC-05 | Product department/cost-centre mapping | 1. Open representative products from each department. 2. Check `department_id` and `cost_center_id`. 3. Run unmapped-product query. | All saleable/stockable UAT products mapped to the correct department/cost centre; unmapped list empty or approved as pending. | ☐ Pass ☐ Fail | |
| TC-06 | Mandatory capture on sales documents | 1. Test each entry route separately: direct `/quotations`, CRM enquiry→quotation, `/sales-orders`, direct `/invoices` and expense capture. 2. Submit without department/cost centre. 3. Record HTTP status and whether a record was created. 4. Retry with dimensions. | Direct quotation, PO and invoice routes reject with HTTP 400; other routes either require selection or auto-derive from product with evidence. Silent nulls in CRM quotations, customer-flow sales orders or expenses are release-blocking gaps. | ☐ Pass ☐ Fail | |
| TC-07 | Enquiry → quotation | 1. Capture enquiry in `/crm/enquiries`. 2. Qualify and create quotation. 3. Check department/cost-centre defaults from product/customer context. 4. Repeat via direct `/quotations`. | Enquiry linked to quotation; direct route returns HTTP 202 with approval receipt when required; CRM route must not silently save null dimensions; quotation number unique. | ☐ Pass ☐ Fail | |
| TC-08 | Quotation approval | 1. Submit quotation for approval. 2. Log in as named approver. 3. Approve/reject with notes. | Approval record created; status changes only by authorised approver; notes and timestamp visible in audit trail. | ☐ Pass ☐ Fail | |
| TC-09 | Sales order approval and propagation | 1. Convert approved quotation to sales order. 2. Select department/cost centre/location. 3. Submit/approve order. 4. Inspect sales order, pick list, dispatch and invoice fields. | Department, cost centre and location propagate through picking and invoice; when a deferred approval creates the SO, the persisted row carries the same dimensions; no silent reassignment to defaults. | ☐ Pass ☐ Fail | |
| TC-10 | Picking worksheet | 1. Open `/sales-orders/:id`. 2. Generate pick list via `/api/sales-orders/:id/pick-list`. 3. Pick from WH-REP. | One active pick list per sales order; picked quantities recorded; stock reduced only on confirm. | ☐ Pass ☐ Fail | |
| TC-11 | Partial delivery / backorder | 1. Pick less than ordered quantity. 2. Confirm picking. 3. Dispatch picked quantity. 4. Reopen order. | Picked quantity only is dispatched; unpicked balance remains visible as backorder/remaining quantity; no forced full-order invoicing. | ☐ Pass ☐ Fail | |
| TC-12 | Dispatch and POD | 1. Dispatch picked goods with delivery number and recipient. 2. Attach/record POD reference where available. 3. Inspect order timeline. | Pick status → dispatched; delivery number, recipient and POD evidence recorded; second active dispatch not allowed. If no POD capture field exists, log as gap. | ☐ Pass ☐ Fail | |
| TC-13 | Invoice from dispatched order | 1. Invoice only picked/dispatched quantities via `/api/invoices/from-sales-order`. 2. Inspect invoice. | One invoice created from the order; quantities do not exceed picked quantities; department/cost centre/location retained. | ☐ Pass ☐ Fail | |
| TC-14 | One active invoice per sales order | 1. Reopen the same sales order and retry `/api/invoices/from-sales-order`. 2. Retry generic `POST /api/invoices` with the same SO. 3. Attempt a duplicate while an invoice approval/discount approval is pending. 4. Check DB index `invoices_one_active_per_sales_order_idx`. | SO route returns existing invoice with `alreadyExists:true`; generic route returns HTTP 409; approval executors create no duplicate; failed attempts are audit-logged; unique partial index present. | ☐ Pass ☐ Fail | |
| TC-15 | Duplicate invoice cancellation preservation | 1. Prepare a UAT dataset with two active invoices on one SO (pre-migration copy). 2. Run/confirm 0109 behaviour. 3. Inspect cancelled invoice, notes and journal links. | One invoice remains active; duplicate set to `cancelled` with migration note; no invoice row or accounting history deleted; ledger links preserved. | ☐ Pass ☐ Fail | |
| TC-16 | Invoice approval and threshold | 1. Set provisional invoice threshold. 2. Submit invoice below and at/above threshold. 3. Approve as named approver. | Below-threshold direct where permitted; at/above threshold queued for approval; approval decision and timestamp recorded. Actual limits are client-confirmed inputs. | ☐ Pass ☐ Fail | |
| TC-17 | Approval request types | 1. Trigger all 14 types where a UI exists; use direct `POST /api/companies/:companyId/approvals` for types without a UI. 2. Configure `approverUserIds`/`approverRoleIds` for one type. 3. Review `/approvals`. | Every supported type appears with correct title, requester, payload and review route; a non-named approver is denied and the named delegate succeeds; requisition approval is logged as absent and payroll run approval remains a separate workflow check. | ☐ Pass ☐ Fail | |
| TC-18 | Approval modes and owner bypass | 1. Exercise `disabled`, `by_permission`, `always` modes on a threshold-capable type. 2. Set threshold `0`, then a non-zero provisional amount. 3. Test owner and superadmin bypass and `allowSelfApproval` disabled. | A threshold of `0` means no threshold; only `by_permission` uses the amount, `always` ignores it; owner/superadmin bypass is evaluated before mode; disabled policies post directly. | ☐ Pass ☐ Fail | |
| TC-19 | Self-approval prevention | 1. Confirm `allowSelfApproval:false` in settings export. 2. Submit as a user with approve permission. 3. Attempt approve and reject via UI and direct `POST /api/companies/:companyId/approvals/:id/{approve,reject}`. 4. Confirm audit entry. | Both approve and reject are denied for the requester; request stays pending; no business record is created; another authorised approver succeeds; denial is audited. Any approved waiver must be recorded. Failure is release-blocking. | ☐ Pass ☐ Fail | |
| TC-20 | GL propagation from sales and payments | 1. Post an invoice for an ECS product/order through both direct invoice and sales-order routes. 2. Record a customer payment and a supplier payment with dimensions. 3. Inspect journal/ledger lines and filter GL reports by department and cost centre. | `ledger_entries.department_id` and `cost_center_id` match the source document on AR, revenue, VAT, COGS and payment lines; reports include both documents; totals agree with invoice and TB. | ☐ Pass ☐ Fail | |
| TC-21 | Immutability of approved/posted records | 1. Try to edit/delete an approved invoice, posted journal, confirmed GRN and locked payroll run. 2. Attempt direct API update. | Posted/approved records cannot be silently changed; correction requires credit note, reversal or new version with audit entry. | ☐ Pass ☐ Fail | |
| TC-22 | Customer payment and reconciliation | 1. Receive part payment. 2. Allocate to invoice. 3. Run AR ageing/customer statement. 4. Reconcile bank/cashbook. | Allocation correct; invoice balance reduces; AR ageing and cashbook agree; over/under payment handled per configured rule. | ☐ Pass ☐ Fail | |
| TC-23 | Procurement requisition and manager approval | 1. Raise requisition for department REP. 2. Submit to named manager. 3. Approve/reject. | Requisition records department/cost centre; only named manager approves; approval evidence retained. If no requisition module exists, log requirement gap. | ☐ Pass ☐ Fail | |
| TC-24 | Supplier quotes → management PO approval | 1. Capture two supplier quotes. 2. Compare and select. 3. Obtain management PO approval at/above limit. 4. Issue PO. | Selected quote linked to PO; approval threshold enforced; PO shows department/cost centre/location; named approver recorded. | ☐ Pass ☐ Fail | |
| TC-25 | GDN → GRN confirmation | 1. Create GDN against approved PO. 2. Receive partial quantity. 3. Confirm GRN. 4. Inspect stock and ledger. | GRN linked to PO/GDN; stock received at correct location; PO department/cost centre propagated to inventory/GL; duplicate GRN number blocked. | ☐ Pass ☐ Fail | |
| TC-26 | Three-way match | 1. Enter supplier invoice matching PO and GRN. 2. Enter a second with quantity variance. 3. Post/attempt post. | Matched bill posts; variance blocked or routed to `accounting.bills.waive`; `supplier_bill_matches` snapshot records PO/GRN/invoice values and status. | ☐ Pass ☐ Fail | |
| TC-27 | Supplier payment approval and AP reconciliation | 1. Approve matched bill. 2. Record supplier payment as an authorised user. 3. Repeat as a user without direct payment permission. 4. Run AP ageing/reconciliation. | Payment only on approved/matched bill; non-authorised submissions return HTTP 202 and create no payment until approval; allocation correct; AP and ledger agree. If the gate is absent, log a release blocker. | ☐ Pass ☐ Fail | |
| TC-28 | Payroll statutory calculations | 1. Run UAT payroll for one employee per department. 2. Verify PAYE, AIDS Levy, NSSA employee/employer, NEC, ZIMDEF, APWCS, approved credits and net pay. 3. Compare with independent calculation. | All ZW statutory components calculated from active config; APWCS uses client industry rate; unapproved credits excluded; warnings shown where APWCS rate missing. | ☐ Pass ☐ Fail | |
| TC-29 | Payroll approval and lock | 1. Prepare run as HR/Payroll Officer. 2. Approve as named payroll approver. 3. Lock and post. 4. Attempt edit. 5. Repeat with one user holding both prepare and approve roles. | Run status moves DRAFT → approved → locked; `payroll.approve` required; signoff names/timestamps on report; locked run immutable. Dual-role self-approval is either blocked or logged as a SoD gap/waiver. | ☐ Pass ☐ Fail | |
| TC-30 | Statutory reports/exports | 1. Export P2/P6/ITF16/NSSA-style reports and payroll register. 2. Compare to run. | Exports contain PAYE, AIDS Levy, NSSA, ZIMDEF/APWCS where applicable; report approval status enforced; figures reconcile. | ☐ Pass ☐ Fail | |
| TC-31 | Warehouses, transfers, counts, adjustments | 1. Transfer stock Central → WH-HW. 2. Perform stock count. 3. Adjust damaged stock. 4. Check audit and GL. | Location balances correct; transfer/count/adjustment carry department/cost centre; adjustments follow approval policy; damaged stock uses client-confirmed figures. | ☐ Pass ☐ Fail | |
| TC-32 | Segregation of duties and permissions | 1. Log in as Salesperson, Procurement Officer, Warehouse Officer, Accountant, HR/Payroll Officer and Department Manager in turn. 2. Try restricted actions and direct URLs. | Users see only permitted modules/routes; no write access via direct API; approval, posting, payroll lock and user management restricted. | ☐ Pass ☐ Fail | |
| TC-33 | Audit trail | 1. Repeat key actions from TC-09, TC-16, TC-25, TC-29. 2. Review `/audit-logs` and record history. | Creator, timestamp, before/after values, approval notes and reviewer recorded for each material change; no missing audit rows. | ☐ Pass ☐ Fail | |
| TC-34 | Sales dashboard and reports | 1. Open `/reports/sales`, `/reports/daily` and sales dashboard. 2. Filter by department/cost centre/warehouse. 3. Compare to source documents. | Totals by department/warehouse agree with quotations, orders, invoices and payments; filters respect permissions. | ☐ Pass ☐ Fail | |
| TC-35 | Financial reports and cost-centre views | 1. Run TB, P&L, balance sheet, cost-centre report and departmental view. 2. Drill to ledger lines. | Central COA retained; cost-centre/departmental analytics reconcile to GL with no unassigned postings except approved central items. | ☐ Pass ☐ Fail | |
| TC-36 | Export and permission controls | 1. Attempt report/CSV/PDF exports as each role. 2. Export approved and pending statutory reports. | Exports include only permitted data; pending statutory reports blocked or clearly marked; export events audited. | ☐ Pass ☐ Fail | |
| TC-37 | Failed approval lifecycle | 1. Force an executor failure (for example invalid target data). 2. Have two approvers race the same pending request. 3. Attempt to approve a `failed` request again. 4. Resolve as administrator with reconciliation notes. | Only one approver claims the request; failure sets `status: failed` with notes; failed requests are not replayable; administrator closure is audited as `APPROVAL_EXECUTION_RESOLVED`. | ☐ Pass ☐ Fail | |
| TC-38 | Tax/FX totals cannot be understated | 1. Submit an invoice with a client-supplied low `total`, omitted discount and `isPos:true`. 2. Compare stored total and approval threshold to server-calculated values. | Server recomputes subtotal/tax/total and discount from validated lines; approval threshold is based on the server amount; POS flag cannot be set by client input to bypass approval. | ☐ Pass ☐ Fail | |

## 5. Defect log template

| Defect ID | Date | TC ID | Summary | Severity (S1–S4) | Steps to reproduce | Actual result | Expected result | Owner | Status (Open/In Progress/Fixed/Retest/Closed/Waived) | Target date | Evidence link |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DEF-001 | | | | | | | | | | | |

Severity guide: **S1** release-blocking/data loss/security; **S2** critical workflow or statutory/compliance failure; **S3** material usability/reporting issue; **S4** cosmetic or low-impact issue.

## 6. Sign-off

By signing, each role confirms the applicable UAT scope was executed and that outstanding items are accepted, waived or scheduled before production cutover.

| Role | Name | Signature | Date | Scope accepted / remarks |
|---|---|---|---|---|
| System Administrator | | | | Environment, migrations, users, permissions, audit/evidence |
| General Manager | | | | Overall business acceptance, approval policy, named approvers |
| Finance Manager | | | | COA, GL, cost centres, financial reports, reconciliation |
| HR/Payroll Officer | | | | Payroll, statutory config, credits, approvals, exports |
| Department Manager | | | | REP/ECS/HW processes, departmental assignments |
| Salesperson | | | | Enquiry, quotation, sales order, dispatch, invoice workflow |
| Procurement Officer | | | | Requisition, quotes, PO, GDN/GRN, three-way match |
| Warehouse Officer | | | | Warehouses, picking, dispatch/POD, transfers, counts, adjustments |
| Accountant | | | | Invoice controls, postings, three-way match, payment, reconciliation, reports |

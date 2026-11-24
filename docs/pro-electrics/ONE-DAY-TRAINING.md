# PRO ELECTRICS — One-Day Hands-On Training Guide

**Version:** 1.0  
**Date:** 2026-11-24  
**Audience:** Salesperson, Procurement Officer, Warehouse Officer, Department Managers, Finance/Accountant, HR/Payroll Officer, System Administrator, General Manager  
**Format:** Instructor-led, hands-on in the UAT/training company. Facilitator names to be confirmed by the client.

> Use training/UAT data only. Do not use live customer, supplier, employee, fiscal or bank data. Department codes `REP` / `ECS` / `HW` and warehouse codes `WH-REP` / `WH-ECS` / `WH-HW` are **provisional training codes pending client confirmation**. Monetary approval limits, department manager assignments and approver names are also client-confirmed inputs; use clearly marked placeholders until confirmed.

## 1. Learning outcomes

By the end of the day participants will be able to:

1. Select the correct department, cost centre and warehouse on sales and procurement documents.
2. Run the enquiry → quotation → approval → sales order → picking → dispatch/POD → invoice → payment flow.
3. Enforce one active invoice per sales order and understand duplicate-invoice cancellation preservation.
4. Process requisition, supplier quotes, PO approval, GDN/GRN and three-way match.
5. Perform warehouse transfers, stock counts, adjustments and partial/backorder handling.
6. Submit and process approvals, including prevention of self-approval.
7. Prepare and approve a Zimbabwe payroll run with PAYE, AIDS Levy, NSSA, ZIMDEF, APWCS and approved credits.
8. Use sales dashboards, financial/cost-centre/departmental reports, audit trails and role-based permissions.
9. Use FiscalPrinter **training mode** for invoice/credit-note samples without live fiscalization.

## 2. Agenda

| Time | Module | Facilitator | Exercise | Sample data | Expected outcome |
|---|---|---|---|---|---|
| 08:30–09:00 | Registration, objectives, ground rules | System Administrator | Attendance register; confirm users and roles | Named participant accounts | All participants logged in; training company selected |
| 09:00–09:45 | One company, central COA, departments, cost centres and warehouses | Finance Manager + Department Manager | Exercise 1 | Departments REP/ECS/HW; warehouses Central, WH-REP/WH-ECS/WH-HW; central COA | Participants explain the difference between legal company, COA, department and cost centre |
| 09:45–10:45 | Sales cycle: enquiry → quotation → approval → sales order | Salesperson + System Administrator | Exercise 2 | Enquiry ENQ-TRAIN-001; customer CUST-REP-001; service/product items | Quotation and approved SO carry correct department/cost centre |
| 10:45–11:00 | Break | — | — | — | — |
| 11:00–11:45 | Picking, partial delivery/backorder, dispatch/POD | Warehouse Officer | Exercise 3 | SO from Exercise 2; stock in WH-REP/WH-ECS | Pick list, partial dispatch, remaining quantity and POD reference recorded |
| 11:45–12:30 | Invoice controls and FiscalPrinter training mode | Finance Manager + System Administrator | Exercise 4 | Dispatched SO; training invoice PDFs/credit notes | One active invoice; duplicate attempt blocked; training QR/watermark observed |
| 12:30–13:15 | Lunch | — | — | — | — |
| 13:15–14:15 | Purchasing: requisition, quotes, PO approval, GDN/GRN, three-way match | Procurement Officer + Finance Manager | Exercise 5 | Supplier SUP-TRAIN-001; requisition REQ-TRAIN-001; PO/GRN sample | PO approved, GRN received, matched bill posted or variance routed for waiver |
| 14:15–15:00 | Warehouses: transfers, counts, adjustments and damaged stock | Warehouse Officer + Finance Manager | Exercise 6 | Central and WH-HW stock; count sheet; damaged-stock placeholder | Location balances and GL/department analytics updated correctly |
| 15:00–15:40 | Approvals, SoD and self-approval prevention | General Manager + System Administrator | Exercise 7 | Two approval-enabled users; provisional thresholds | Own request rejected as approver; delegate approves; audit entry visible |
| 15:40–16:15 | Payroll: statutory config, run, approval and reports | HR/Payroll Officer + Finance Manager | Exercise 8 | Three employees (one per department); active ZW rules; APWCS rate | PAYE, AIDS Levy, NSSA, ZIMDEF, APWCS and credits calculated; run approved/locked |
| 16:15–16:40 | Reports, dashboards, audit trail and permissions | Finance Manager + System Administrator | Exercise 9 | Data created during the day | Sales/financial/cost-centre reports reconcile; audit and permissions demonstrated |
| 16:40–16:45 | Evaluation, open questions, close | General Manager | Evaluation form; attendance sign-off | Evaluation form | Feedback captured; follow-up actions assigned |

## 3. Sample data pack

Prepare before the session in the training company only.

| Data set | Training value | Notes |
|---|---|---|
| Legal company | `PRO ELECTRICS TRAINING` | One company only; central COA |
| Departments | Repairs (`REP`), Electrical Services (`ECS`), Hardware (`HW`) | Provisional codes pending confirmation |
| Cost centres | Linked to each department | Final codes pending client confirmation; use labels shown in setup |
| Warehouses | `CENTRAL`, `WH-REP`, `WH-ECS`, `WH-HW` | Provisional departmental warehouse codes pending confirmation |
| Customers | `CUST-REP-001`, `CUST-ECS-001`, `CUST-HW-001` | Use fictitious names/contacts |
| Suppliers | `SUP-TRAIN-001`, `SUP-TRAIN-002` | Fictitious supplier quotes |
| Products | Repair labour, distribution board, cable, tools | Each mapped to one department/cost centre |
| Employees | One per department | Contracts, salary history and tax credits for UAT payroll |
| Approval settings | `by_permission` / provisional amount threshold | Clearly mark as training-only; actual limits client-confirmed |
| Payroll config | ZW country; PAYE, AIDS_LEVY, NSSA_POBS, NEC, ZIMDEF, APWCS rules | APWCS rate must be the client/industry value, never guessed |

## 4. Trainer notes

- **Reset the training company** before each session or use a new training dataset; do not reuse posted payroll runs or fiscalized documents.
- **Permissions:** log in with each role at least once. Use two approver-enabled users for Exercise 7 so self-approval can be tested safely.
- **Pending functionality:** where a step is not implemented in the current build (for example a POD attachment field or requisition module), demonstrate the intended control, state clearly that it is pending, and log a training/UAT gap. Do not imply the feature exists.
- **Approval submissions:** many actions now return HTTP `202` and create an approval request instead of a business record. This applies to quotations, sales orders, purchase orders, supplier registration, expenses, credit notes, payments, leave and discounts. Trainees must check `/approvals` before assuming the document was saved.
- **Approval settings:** display the configured policy screen and explicitly state that monetary limits and approver names are client-confirmed inputs. Explain that a threshold of `0` means no threshold.
- **Migration awareness:** explain that 0109 created picking records and the one-active-invoice rule; 0110 added department/cost-centre/warehouse links; 0111 added GL/source-document department fields, indexes and approval-policy seeds; 0112 added vehicle-agency accounting where applicable. Migration success does not prove the tenant was seeded — verify the actual company id and settings export.
- **FiscalPrinter training mode:** use the offline commands below. They make no API call, write no invoice and consume no fiscal counter. Copies carry `TRAINING — NOT A VALID FISCAL INVOICE` and a training QR.

```bash
cd FiscalPrinter
npm run training:invoice          # A4 sample invoice (HTML)
npm run training:credit           # sample credit note (HTML)
npm run training:pdf              # sample invoice as PDF
npm run training:stamp:samples    # stamp a training QR on bundled PDFs
```

- Keep one printed or PDF copy of each exercise output as evidence for UAT TC references where the same flow is tested.

## 5. Exercise sheets

### Exercise 1 — Company, COA, departments, cost centres and warehouses

1. Log in as the **System Administrator** and select the `PRO ELECTRICS TRAINING` company.
2. Open `/accounting/coa` and confirm there is one central chart of accounts.
3. Open department/cost-centre setup and record the link for `REP`, `ECS` and `HW`.
4. Open `/inventory/locations` and confirm `CENTRAL`, `WH-REP`, `WH-ECS` and `WH-HW`.
5. Verify each departmental warehouse's department link.
6. Assign the provisional training manager for each department, then reopen the record to confirm the save.
7. **Checkpoint:** explain why departments/cost centres are analytical dimensions and not separate legal companies.

### Exercise 2 — Enquiry → quotation → approval → sales order

1. Log in as the **Salesperson**.
2. Open `/crm/enquiries` and create enquiry `ENQ-TRAIN-001` for `CUST-ECS-001`.
3. Capture requirement, source, expected value and department `ECS`.
4. Convert/quote from the enquiry in `/quotations`; retain the enquiry-to-quotation link.
5. Select product lines mapped to `ECS` and confirm the cost centre is propagated or prompted. If the CRM enquiry path did not carry dimensions, enter/check them on the quotation rather than assuming defaults.
6. Submit the quotation for approval and confirm the HTTP `202` approval receipt; no quotation is final until an approver acts.
7. Log in as the **named approver** (or training delegate) and approve it in `/approvals` with a note.
8. Convert the approved quotation to a sales order in `/sales-orders`.
9. Verify the SO shows department, cost centre and the intended dispatch warehouse.
10. **Checkpoint:** the audit trail shows requester, approver, timestamp and linked records.

### Exercise 3 — Picking, partial delivery/backorder and dispatch/POD

1. Log in as the **Warehouse Officer** and open `/sales-orders/:id` for the Exercise 2 order.
2. Load the worksheet via `/api/sales-orders/:id/pick-list`.
3. Select `WH-ECS` as the pick location.
4. Enter a picked quantity lower than the ordered quantity for at least one line.
5. Prepare and then confirm the pick list.
6. Confirm that only picked quantities are available to dispatch/invoice.
7. Record delivery number `DN-TRAIN-001` and recipient name via the dispatch action.
8. Record the POD reference/attachment where available; if the field is absent, note the gap.
9. Reopen the sales order and identify the remaining/backorder quantity.
10. **Checkpoint:** one active pick list exists and stock was not over-deducted.

### Exercise 4 — Invoice controls and training-mode fiscal printing

1. Log in as the **Accountant** and open the dispatched sales order.
2. Click invoice generation (`/api/invoices/from-sales-order`) and invoice only picked/dispatched quantities.
3. Verify department, cost centre and location on the invoice.
4. Attempt to invoice the same sales order again.
5. Confirm the existing invoice is reopened/blocked rather than a second active invoice being created.
6. Explain how migration 0109 handles legacy duplicates: it cancels duplicates and preserves accounting history; it does not delete rows.
7. Open the invoice approval flow and submit it when the amount requires approval.
8. In `FiscalPrinter`, run `npm run training:invoice` and `npm run training:pdf`; inspect the watermark/training QR.
9. Run `npm run training:stamp:samples` on a copy of a sample PDF and confirm the source file is unchanged.
10. **Checkpoint:** no live fiscalization was used and one active invoice remains.

### Exercise 5 — Requisition, supplier quotes, PO, GDN/GRN and three-way match

1. Log in as the **Procurement Officer** and create requisition `REQ-TRAIN-001` for department `HW`.
2. Attach two fictitious supplier quotes from `SUP-TRAIN-001` and `SUP-TRAIN-002`.
3. Submit the requisition to the training **Department Manager** for approval.
4. After manager approval, obtain management approval for the PO at/above the provisional limit.
5. Create the PO in `/inventory/purchase-orders`; confirm department, cost centre and receiving warehouse `WH-HW`.
6. Create a GDN for a partial receipt, then confirm the GRN in `/inventory/grvs`.
7. Verify stock increases in `WH-HW` and the GRN carries PO department/cost-centre values.
8. Enter a supplier invoice in `/supplier-invoices` matching PO and GRN; observe a `MATCHED` result.
9. Enter a second bill with a quantity or price variance; observe it is blocked or routed for waiver approval.
10. If the requisition or PO approval UI is not available in the build, record the exact step as a pending requirement rather than inventing a screen.
11. **Checkpoint:** describe the three-way match: PO quantity/price vs GRN receipt vs supplier invoice.

### Exercise 6 — Transfers, counts, adjustments and damaged stock

1. Log in as the **Warehouse Officer**.
2. Transfer stock from `CENTRAL` to `WH-HW` in `/inventory/transfers`.
3. Confirm both location balances and the inventory transaction department/cost centre.
4. Perform a stock count in `/inventory/stock-counts` for one product in `WH-REP`.
5. Post an approved adjustment in `/inventory/adjustments` for a small training variance.
6. Record a damaged-stock quantity using the client-confirmed damaged-stock figure when available; otherwise use a clearly labelled placeholder.
7. Log in as the **Accountant** and inspect the resulting GL lines and cost centre.
8. **Checkpoint:** explain which movements require approval and why adjustments must be auditable.

### Exercise 7 — Approvals, SoD and self-approval prevention

1. Log in as a user who has both request and approve permissions.
2. Confirm in the settings export that `allowSelfApproval` is `false`; note that the guard can be explicitly disabled by policy.
3. Create a stock adjustment request at the provisional threshold.
4. Open `/approvals` and attempt to approve your own request; repeat once via the direct approve and reject API endpoints where available.
5. Confirm the system rejects both actions, the request remains pending and an audit entry records the denial.
6. Log in as a second authorised approver and approve with review notes.
7. Configure a named approver/role on one policy and show that a different approver is denied.
8. Repeat a journal posting approval below and at/above the provisional threshold.
9. Log in as a **Salesperson** and attempt to open `/approvals` or an accounting posting screen directly by URL.
10. Confirm access is denied and record the permission error.
11. **Checkpoint:** requester ≠ approver; permissions are enforced server-side, not just hidden in the UI.

### Exercise 8 — Payroll and Zimbabwe statutory components

1. Log in as the **HR/Payroll Officer** and open `/hr/setup`.
2. Confirm the country is Zimbabwe and active rules include PAYE, AIDS_LEVY, NSSA_POBS, NEC, ZIMDEF and APWCS.
3. Confirm the client/industry APWCS premium rate is configured; note that no rate is guessed by the system.
4. Verify one approved and one unapproved employee tax credit; only the approved, effective credit should apply.
5. Open `/hr/payroll` and create a draft run for the training period and currency.
6. Run payroll for the three training employees.
7. Open the run report and identify gross pay, PAYE, AIDS Levy, NSSA employee/employer, NEC, ZIMDEF, APWCS, credits, deductions and net pay.
8. Submit the run for approval.
9. Log in as the named payroll approver, approve and lock the run.
10. Attempt to edit the locked run and confirm it is immutable.
11. Export the payroll register and ZIMRA report; confirm pending reports are not silently exportable as final.
12. **Checkpoint:** explain why payroll approval must be separated from payroll preparation.

### Exercise 9 — Reports, dashboards, audit trail and permissions

1. Log in as the **Finance Manager** and open `/reports/sales` and the sales dashboard.
2. Filter by department, cost centre and warehouse; compare totals to Exercise 2–4 documents.
3. Open `/accounting/reports/cost-centers`, trial balance and P&L; drill into a line created during the day.
4. Run a departmental view for `REP`, `ECS` and `HW` and confirm central GL remains one COA.
5. Open `/audit-logs` and locate a quotation approval, invoice approval, GRN confirmation, payroll approval and permission denial.
6. Log in as an **Accountant** and export a financial report; log in as a **Salesperson** and attempt the same export.
7. Confirm permitted users can export and restricted users cannot, and that exports are audited.
8. **Checkpoint:** state one report that reconciles end-to-end and one open item requiring client confirmation.

## 6. Attendance register template

| # | Name | Role / Department | Company | Email | User ID | Day 1 attendance (☐) | Signature | Remarks |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | ☐ | | |
| 2 | | | | | | ☐ | | |
| 3 | | | | | | ☐ | | |

Trainer: ____________________  Date: ____________  Training company: ____________________

## 7. Evaluation form

Rate each item 1–5 (1 = poor, 5 = excellent). Add comments for any score below 4.

| # | Question | Rating (1–5) | Comment |
|---|---|---|---|
| 1 | Agenda and objectives were clear | | |
| 2 | Exercises matched my day-to-day work | | |
| 3 | Sales cycle and invoice control exercise was clear | | |
| 4 | Picking/dispatch/POD and backorder exercise was clear | | |
| 5 | Purchasing/GRN/three-way match exercise was clear | | |
| 6 | Warehouse transfer/count/adjustment exercise was clear | | |
| 7 | Department/cost-centre selection was clear | | |
| 8 | Approvals and self-approval prevention were clear | | |
| 9 | Payroll/statutory exercise was clear | | |
| 10 | Reports, dashboards, audit trail and permissions were clear | | |
| 11 | Trainers answered questions adequately | | |
| 12 | I feel confident using the system after today | | |

**Most useful module:** __________________________________________________

**Module needing more practice:** _______________________________________

**Open questions / pending client inputs:** _____________________________

**Participant name/signature:** ____________________ **Date:** ____________

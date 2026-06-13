# Requirements Document

## Introduction

The HR Module is an ERP-grade, Zimbabwe-specific Human Resources management system built into the fisczim platform. It extends the existing payroll engine (`ZimbabwePayrollEngine`) into a fully integrated HR suite covering the complete employee lifecycle: hiring, onboarding, contract management, attendance, leave, payroll processing, payslip generation, employee self-service, and statutory compliance reporting for ZIMRA (P2, P6, ITF16) and NSSA.

The module is scoped per company, supports multi-currency payroll (USD and ZiG), and is compliant with the Zimbabwe Labour Act (Chapter 28:01), Income Tax Act, and NSSA Act. It integrates with the existing accounting (GL postings), fiscalization (ZIMRA), and audit-log infrastructure already present in fisczim.

---

## Glossary

- **HR_Module**: The top-level HR section of the fisczim platform, accessible at `/hr`.
- **Employee**: A person employed by the Active_Company under a formal contract, stored in the `employees` table.
- **Employee_Profile**: The full record for an Employee including personal details, contact info, banking details, tax numbers, and employment history.
- **Contract**: A formal employment agreement linking an Employee to a position, department, salary, and start/end dates, stored in `employee_contracts`.
- **Department**: An organisational unit within a company (e.g., Finance, Operations), stored in `departments`.
- **Position**: A job title/role within a Department (e.g., Accountant, Branch Manager), stored in `positions`.
- **Pay_Grade**: A salary band with min/midpoint/max values, currency, pay frequency, and NEC sector linkage, stored in `payroll_pay_grades`.
- **Payroll_Run**: A payroll processing cycle covering a specific period and currency, stored in `payroll_runs`.
- **Payroll_Engine**: The `ZimbabwePayrollEngine` in `shared/payroll-engine.ts` that computes PAYE, AIDS Levy, NSSA, NEC, and net pay.
- **PAYE**: Pay As You Earn — income tax withheld at source per ZIMRA tax tables.
- **AIDS_Levy**: A 3% surcharge on PAYE payable to ZIMRA.
- **NSSA**: National Social Security Authority — statutory pension/accident contribution scheme.
- **NEC**: National Employment Council — sector-specific collective bargaining body whose rates apply to employees in regulated sectors.
- **Payslip**: A detailed breakdown of an employee's earnings, deductions, and net pay for a payroll period, printable as PDF.
- **Leave_Balance**: The accrued, used, and available leave days for an Employee per leave type, stored in `leave_balances`.
- **Leave_Request**: An Employee's application for a period of leave, stored in `leave_requests`.
- **Attendance_Record**: A daily or shift-based time entry for an Employee recording clock-in, clock-out, and hours worked.
- **ESS**: Employee Self-Service — the portal where employees view their own payslips, leave balances, and submit leave requests.
- **Statutory_Report**: A compliance report generated for ZIMRA (P2, P6, ITF16) or NSSA, produced from locked Payroll_Runs.
- **Active_Company**: The company currently selected by the user, identified via the `useActiveCompany` hook.
- **ZiG**: Zimbabwe Gold — the local currency alongside USD in Zimbabwe's dual-currency environment.
- **BP_Number**: Business Partner number issued by ZIMRA, required on P2/P6/ITF16 reports.
- **Labour_Act**: Zimbabwe Labour Act Chapter 28:01 that governs minimum leave entitlements, notice periods, and termination procedures.

---

## Requirements

### Requirement 1: Employee Lifecycle Management

**User Story:** As an HR manager, I want to manage the full employee lifecycle from hiring through to termination, so that all employment records are accurate, auditable, and compliant with the Zimbabwe Labour Act.

#### Acceptance Criteria

1. THE HR_Module SHALL provide a dedicated employee list view at `/hr/employees` displaying all active employees of the Active_Company with name, employee number, department, position, and employment status.
2. WHEN an HR manager creates a new Employee, THE HR_Module SHALL capture: first name, last name, date of birth, national ID number, gender, nationality, address, phone, email, emergency contact, NSSA number, ZIMRA tax number, bank name, bank branch, bank account number, and EcoCash/mobile money number.
3. THE HR_Module SHALL auto-generate a unique employee number in the format `EMP-{companyId}-{sequence}` when a new Employee is created.
4. WHEN a new Employee is saved, THE HR_Module SHALL require at minimum: first name, last name, date of birth, national ID, and joining date before allowing the record to be saved.
5. THE HR_Module SHALL support attaching digital copies of employee documents (contract, national ID, academic certificates) with file type restricted to PDF, JPEG, or PNG, and a maximum size of 10 MB per file.
6. WHEN an Employee's employment status is changed to `TERMINATED`, THE HR_Module SHALL record the termination date, reason, and termination type (resignation, dismissal, retrenchment, contract expiry, or death) and prevent further payroll runs for that employee after the termination date.
7. THE HR_Module SHALL record all changes to an Employee record in the existing `audit_logs` table, capturing the changed fields, old values, new values, the user who made the change, and the timestamp.
8. WHERE the Active_Company has branches, THE HR_Module SHALL allow assigning an Employee to a specific branch.

---

### Requirement 2: Employment Contracts

**User Story:** As an HR manager, I want to create and manage employment contracts linked to employees, so that terms of employment, salary, and contract duration are formally recorded and reviewable.

#### Acceptance Criteria

1. THE HR_Module SHALL allow creating one or more Contracts per Employee, each specifying: contract type (permanent, fixed-term, casual, probationary), start date, end date (nullable for permanent), department, position, pay grade, base salary, currency (USD or ZiG), pay frequency (monthly, bi-monthly, weekly), and probation end date.
2. WHEN a new Contract is saved, THE HR_Module SHALL mark the new contract as `ACTIVE` and set any previously active contract for the same employee to `SUPERSEDED`.
3. THE HR_Module SHALL display a contract history timeline per employee showing all past and current contracts in chronological order.
4. WHEN a fixed-term Contract's end date is within 30 days of the current date, THE HR_Module SHALL display a visual alert on the employee's profile and on the HR dashboard.
5. THE HR_Module SHALL enforce that the Contract's base salary is within the minimum and maximum range of the assigned Pay_Grade when a Pay_Grade is selected.
6. WHEN a probationary Contract's probation end date is reached, THE HR_Module SHALL display a reminder to confirm or extend the probation period.

---

### Requirement 3: Organisational Structure — Departments and Positions

**User Story:** As an HR administrator, I want to manage departments and positions, so that the company's organisational hierarchy is reflected in the HR system.

#### Acceptance Criteria

1. THE HR_Module SHALL allow creating, updating, and deactivating Departments for the Active_Company, each with a name, code, description, and optional parent department (for nested hierarchies).
2. THE HR_Module SHALL allow creating, updating, and deactivating Positions for the Active_Company, each linked to a Department, with a job title, job description, and optional Pay_Grade.
3. THE HR_Module SHALL display an organisational chart view rendering the Department and Position hierarchy visually.
4. WHEN a Department is deactivated, THE HR_Module SHALL prevent assigning new Employees or Positions to that Department, but SHALL preserve existing assignments.
5. THE HR_Module SHALL display a headcount summary per Department on the HR dashboard.

---

### Requirement 4: Pay Grades and NEC Sector Configuration

**User Story:** As a payroll administrator, I want to configure pay grades and NEC sector rates, so that salary bands and collective bargaining deductions are applied consistently across all employees.

#### Acceptance Criteria

1. THE HR_Module SHALL allow creating, updating, and viewing Pay_Grades per company with: code, name, currency, pay frequency, minimum salary, midpoint salary, maximum salary, effective-from date, and linked NEC sector.
2. THE HR_Module SHALL allow configuring NEC sectors with: name, code, employee contribution rate, employer contribution rate, and optional fixed amount.
3. WHEN a Pay_Grade's effective-from date is in the future, THE HR_Module SHALL treat the grade as pending and display it with a "Pending" status badge.
4. THE HR_Module SHALL prevent deleting a Pay_Grade that is referenced by any active Contract or Employee.

---

### Requirement 5: Payroll Processing

**User Story:** As a payroll administrator, I want to run payroll for a selected period and currency, so that all employee net pay amounts are computed accurately with correct statutory deductions.

#### Acceptance Criteria

1. THE HR_Module SHALL allow initiating a Payroll_Run for the Active_Company by specifying: period start date, period end date, currency (USD or ZiG), and optionally filtering by department or branch.
2. WHEN a Payroll_Run is initiated, THE Payroll_Engine SHALL compute for each in-scope employee: gross salary, taxable income, PAYE (using active ZIMRA tax tables for the selected currency and pay frequency), AIDS Levy (3% of PAYE), NSSA employee contribution, NSSA employer contribution, NEC employee contribution, NEC employer contribution, pension deductions, other recurring deductions, recurring allowances, and net pay.
3. THE Payroll_Engine SHALL apply PAYE tax brackets from the `tax_tables_config` table that are effective for the Payroll_Run period, matched by currency and pay frequency.
4. WHEN computing PAYE, THE Payroll_Engine SHALL apply the AIDS Levy of 3% on top of the computed PAYE.
5. WHEN computing NSSA, THE Payroll_Engine SHALL apply the employee and employer contribution rates from the active `payroll_statutory_rules` record, capped at the statutory monthly ceiling.
6. THE Payroll_Engine SHALL apply all active recurring items (allowances and deductions) for each employee where the item's date range overlaps the Payroll_Run period.
7. WHEN a Payroll_Run is in `DRAFT` status, THE HR_Module SHALL allow editing individual employee lines to add one-off adjustments, overriding the computed amounts with an audit note.
8. THE HR_Module SHALL display a payroll summary table showing each employee's: employee number, name, gross salary, PAYE, AIDS Levy, NSSA (employee + employer), NEC, other deductions, total deductions, and net pay.
9. WHEN the payroll summary is reviewed, THE HR_Module SHALL allow an authorised user (payroll.approve permission) to approve the Payroll_Run, changing status from `DRAFT` to `APPROVED`.
10. WHEN a Payroll_Run is approved, THE HR_Module SHALL allow a further authorised action to lock the run, changing status to `LOCKED`, after which no edits are permitted on that run's employee lines.
11. WHEN a Payroll_Run is locked, THE HR_Module SHALL create GL journal entries in the accounting module: debit Salary Expense, credit Payable accounts for Net Pay, PAYE Payable, NSSA Payable, and NEC Payable.
12. THE HR_Module SHALL support running separate payroll runs per currency within the same period (one USD run and one ZiG run).
13. IF an employee has zero gross salary in a period, THEN THE Payroll_Engine SHALL skip that employee and log a warning rather than creating a zero-pay line.

---

### Requirement 6: Leave Management

**User Story:** As an employee and HR manager, I want to manage leave requests and balances per the Zimbabwe Labour Act, so that leave entitlements are tracked accurately and requests are handled through a proper approval workflow.

#### Acceptance Criteria

1. THE HR_Module SHALL support the following leave types as defined by the Zimbabwe Labour Act and common practice: Annual Leave (minimum 30 days per year), Sick Leave, Maternity Leave (98 days), Paternity Leave, Compassionate/Bereavement Leave, and Study Leave.
2. THE HR_Module SHALL accrue Annual Leave at a rate of 2.5 days per completed calendar month of service per employee.
3. WHEN an Employee submits a Leave_Request, THE HR_Module SHALL capture: leave type, start date, end date, number of working days requested, reason, and supporting document (optional).
4. WHEN a Leave_Request is submitted, THE HR_Module SHALL validate that the requested days do not exceed the employee's available Leave_Balance for the specified leave type.
5. THE HR_Module SHALL route Leave_Requests through an approval workflow: the employee's line manager or HR manager SHALL receive a notification and SHALL be able to approve or reject the request.
6. WHEN a Leave_Request is approved, THE HR_Module SHALL deduct the approved days from the employee's Leave_Balance for the corresponding leave type.
7. WHEN a Leave_Request is rejected, THE HR_Module SHALL notify the employee with the rejection reason and SHALL not alter the Leave_Balance.
8. THE HR_Module SHALL display each employee's current Leave_Balance summary (accrued, used, pending, available) for all leave types on the employee's profile and on the ESS portal.
9. THE HR_Module SHALL allow HR managers to manually adjust Leave_Balances with a mandatory reason, and SHALL record the adjustment in the audit log.
10. WHEN a Payroll_Run is processed, THE HR_Module SHALL not deduct unpaid leave from gross salary automatically unless the payroll administrator explicitly marks a leave record as unpaid on the payroll line.
11. THE HR_Module SHALL generate a leave calendar view showing all approved and pending leave for all employees, filterable by department.

---

### Requirement 7: Attendance and Time Tracking

**User Story:** As an HR manager, I want to track employee attendance and working hours, so that payroll calculations reflect actual hours worked and absences are documented.

#### Acceptance Criteria

1. THE HR_Module SHALL allow recording daily attendance for each Employee with: date, clock-in time, clock-out time, total hours worked, attendance status (present, absent, late, half-day, public holiday), and notes.
2. THE HR_Module SHALL support bulk importing attendance records via CSV upload, with columns: employee_number, date, clock_in, clock_out, status.
3. WHEN an attendance import file is uploaded, THE HR_Module SHALL validate each row for: valid employee number belonging to the Active_Company, valid date format (YYYY-MM-DD), valid time format (HH:MM), and attendance status in the allowed set; and SHALL report row-level errors before committing any records.
4. THE HR_Module SHALL display a monthly attendance summary grid per department showing each employee's attendance status per working day.
5. WHEN computing payroll for hourly or daily-rate employees, THE HR_Module SHALL use attendance records for the payroll period to calculate the number of hours or days worked and derive the gross pay accordingly.
6. THE HR_Module SHALL allow HR managers to view a list of employees who were absent without approved leave for any period in the last 30 days.

---

### Requirement 8: Payslip Generation

**User Story:** As an employee and payroll administrator, I want to generate and distribute payslips for each payroll run, so that employees receive a clear, printable record of their earnings and deductions.

#### Acceptance Criteria

1. WHEN a Payroll_Run is in `APPROVED` or `LOCKED` status, THE HR_Module SHALL allow generating payslips for all employees in that run or for a selected individual employee.
2. THE Payslip SHALL display: company name and logo, payroll period, employee name, employee number, position, department, national ID, NSSA number, ZIMRA tax number, base salary, itemised earnings (base pay, allowances), itemised deductions (PAYE, AIDS Levy, NSSA employee, NEC employee, pension, other deductions), total earnings, total deductions, net pay, currency, and the payment method/bank details for the employee.
3. THE HR_Module SHALL generate payslips as downloadable PDF files using the existing PDF generation infrastructure in the platform.
4. THE HR_Module SHALL allow bulk-downloading all payslips for a Payroll_Run as a single ZIP archive.
5. WHEN a payslip PDF is generated, THE HR_Module SHALL store a reference to the generated document in the `payslip_documents` table linked to the payroll run employee record.
6. THE HR_Module SHALL allow emailing payslips directly to each employee's registered email address with the PDF attached and a standard message body.
7. WHERE an employee has no email address on file, THE HR_Module SHALL flag that employee in the bulk email summary and skip sending to that employee without failing the entire batch.

---

### Requirement 9: Employee Self-Service Portal

**User Story:** As an employee, I want a self-service portal where I can view my own payslips, leave balances, and submit leave requests, so that I can manage my HR interactions without contacting the HR department for routine tasks.

#### Acceptance Criteria

1. THE ESS Portal SHALL be accessible at `/hr/self-service` and SHALL only display data belonging to the currently authenticated user who is an Employee of the Active_Company.
2. THE ESS Portal SHALL display the authenticated employee's current leave balances for all leave types.
3. THE ESS Portal SHALL display a list of the authenticated employee's payslips for the last 24 months, downloadable as PDF.
4. THE ESS Portal SHALL allow the authenticated employee to submit new Leave_Requests and view the status of all their pending and historical leave requests.
5. THE ESS Portal SHALL display the authenticated employee's personal details and allow the employee to update their contact number, email, and emergency contact information.
6. WHEN an employee updates their personal details in the ESS Portal, THE HR_Module SHALL record the change in the audit log.
7. THE ESS Portal SHALL display the authenticated employee's attendance summary for the current and previous calendar month.

---

### Requirement 10: Multi-Currency Payroll (USD and ZiG)

**User Story:** As a payroll administrator, I want to run payroll in both USD and ZiG, so that employees paid in either currency receive correctly computed statutory deductions under the applicable ZIMRA rates for that currency.

#### Acceptance Criteria

1. THE HR_Module SHALL allow an Employee's Contract to specify base salary in either USD or ZiG, with the currency stored on the contract record.
2. THE HR_Module SHALL support configuring separate PAYE tax tables for USD and ZiG via the `tax_tables_config` table, keyed by currency and effective date.
3. WHEN a Payroll_Run is created for a specific currency, THE Payroll_Engine SHALL use only the tax tables matching that currency and SHALL only include employees whose active Contract is denominated in that currency.
4. THE HR_Module SHALL not perform automatic currency conversion between USD and ZiG during payroll computation; each currency SHALL be calculated independently.
5. THE HR_Module SHALL display payroll reports and payslips in the native currency of the Payroll_Run.
6. WHEN generating statutory reports (P2, ITF16, NSSA), THE HR_Module SHALL allow selecting the currency of the report and SHALL aggregate only runs matching that currency.

---

### Requirement 11: Statutory Compliance Reporting (ZIMRA and NSSA)

**User Story:** As a compliance officer, I want to generate ZIMRA and NSSA statutory reports from locked payroll runs, so that the company meets its legal obligations for P2, P6, ITF16, and NSSA submissions.

#### Acceptance Criteria

1. THE HR_Module SHALL generate the following statutory reports from locked Payroll_Runs: P2 (Monthly PAYE Return), P6 (Employee Tax Certificate), ITF16 (Annual Reconciliation), and NSSA Monthly Schedule.
2. WHEN generating a statutory report, THE HR_Module SHALL validate that: the employer BP number is set on the company record, all included employees have a national ID, and all included payroll runs are in `LOCKED` status; and SHALL display a pre-flight validation summary listing any blocking errors before allowing the report to be finalised.
3. THE P2 Report SHALL contain: employer name, employer BP number, tax period, a schedule of each employee's taxable remuneration, PAYE deducted, and AIDS Levy for the period, and a totals row.
4. THE P6 Certificate SHALL be generated per employee per tax year and SHALL contain: employer details, employee name, national ID, ZIMRA tax number, total remuneration for the year, total PAYE deducted, total AIDS Levy, and total pension contributions.
5. THE ITF16 Annual Reconciliation SHALL aggregate all P2 monthly submissions for the tax year and SHALL validate that totals on the ITF16 equal the sum of monthly P2 returns.
6. THE NSSA Monthly Schedule SHALL contain: employer name, each employee's NSSA number, name, pensionable earnings, employee contribution, and employer contribution, and a totals row.
7. WHEN a statutory report is finalised, THE HR_Module SHALL generate the report as a downloadable PDF and optionally as a structured CSV/XML file for electronic submission.
8. WHEN a statutory report is finalised, THE HR_Module SHALL store the report in the `payroll_statutory_reports` table with a SHA-256 snapshot hash covering the payroll data used, making the report tamper-evident.
9. THE HR_Module SHALL display the filing status (NOT_SUBMITTED, SUBMITTED, ACKNOWLEDGED) for each statutory report and SHALL allow HR managers to update the status with a reference number when the submission is acknowledged by ZIMRA or NSSA.
10. THE HR_Module SHALL compute and display statutory payment deadlines for each obligation: P2 is due on the 10th of the following month, and NSSA is due on the last day of the following month.

---

### Requirement 12: Loan and Advance Management

**User Story:** As an HR manager, I want to record employee loans and salary advances, so that repayment deductions are automatically applied in each payroll run until the loan is fully repaid.

#### Acceptance Criteria

1. THE HR_Module SHALL allow recording an employee loan with: principal amount, currency, interest rate (percentage, default 0%), repayment term in months, monthly repayment amount, disbursement date, and status (active, fully_repaid, cancelled).
2. WHEN a loan is recorded, THE HR_Module SHALL auto-generate a repayment schedule as monthly installment records.
3. WHEN a Payroll_Run is processed, THE Payroll_Engine SHALL automatically include the monthly installment amount as a deduction for each employee with an active loan where the installment due date falls within the payroll period.
4. WHEN an installment is deducted in a payroll run, THE HR_Module SHALL mark the installment as paid and update the loan's outstanding balance.
5. WHEN the last installment is deducted, THE HR_Module SHALL automatically update the loan status to `FULLY_REPAID`.
6. THE HR_Module SHALL display a loan statement per employee showing each installment, payment status, and remaining balance.

---

### Requirement 13: Integration with Accounting Module

**User Story:** As a finance manager, I want payroll runs to automatically post to the general ledger, so that payroll costs are reflected in financial reports without manual journal entries.

#### Acceptance Criteria

1. WHEN a Payroll_Run is locked, THE HR_Module SHALL post a journal entry to the GL with the following lines: debit Salary Expense account for gross salary, credit PAYE Payable account for the PAYE + AIDS Levy total, credit NSSA Payable account for employee + employer NSSA, credit NEC Payable account for employee + employer NEC, credit Pension Payable account for employee pension deductions, and credit Net Salary Payable account for the net pay total.
2. THE GL journal entry created SHALL reference the Payroll_Run ID as the `referenceId` and `PAYROLL_RUN` as the `referenceType`.
3. THE HR_Module SHALL use the account codes configured in the company's accounting settings for each payroll GL line, falling back to a default chart of accounts if not configured.
4. WHEN a Payroll_Run is reversed (status set to `REVERSED`), THE HR_Module SHALL post a reversing journal entry negating the original payroll journal.
5. THE HR_Module SHALL generate a payroll cost report by cost centre, department, and branch for any date range, pulling data from the GL ledger entries tagged with `PAYROLL_RUN` reference type.

---

### Requirement 14: Compliance Data Validation and Alerts

**User Story:** As a compliance officer, I want the HR module to alert me to missing or expiring compliance data, so that the company avoids penalties from ZIMRA and NSSA.

#### Acceptance Criteria

1. THE HR_Module SHALL display a compliance dashboard tile on the HR home page listing all employees missing any of: national ID, NSSA number, ZIMRA tax number, or joining date.
2. THE HR_Module SHALL display alerts for: fixed-term contracts expiring within 30 days, probation periods ending within 7 days, and loans where the next installment is overdue.
3. WHEN a Payroll_Run is initiated, THE HR_Module SHALL run a pre-flight check and display a warning for each employee in the run who is missing NSSA number, ZIMRA tax number, or national ID, but SHALL still allow the run to proceed.
4. THE HR_Module SHALL display outstanding statutory filing deadlines (P2, NSSA) on the HR dashboard with a traffic-light indicator: green if more than 5 days remain, amber if 2–5 days remain, and red if less than 2 days remain or the deadline has passed.

---

### Requirement 15: Bulk Import and Export

**User Story:** As an HR administrator, I want to bulk import and export employee data, leave balances, and payroll items, so that large datasets can be managed efficiently without manual entry.

#### Acceptance Criteria

1. THE HR_Module SHALL provide CSV import for: employees, pay grades, earning types, deduction types, recurring payroll items, leave balances, and loans, using the column templates already defined in the `IMPORT_TEMPLATES` map in `payroll.ts`.
2. WHEN a CSV import file is uploaded, THE HR_Module SHALL validate all rows before committing, displaying a row-level error table for any validation failures, and SHALL only import rows that pass validation.
3. THE HR_Module SHALL allow downloading a CSV export of: the employee list, the payroll register for any locked run, leave balance summary, and the NSSA monthly schedule.
4. WHEN exporting the payroll register, THE HR_Module SHALL include columns for: employee number, name, gross salary, PAYE, AIDS Levy, NSSA (employee + employer), NEC, total deductions, net pay, currency, and pay period.
5. THE HR_Module SHALL provide downloadable blank CSV templates for each import type via a "Download Template" button.

---

### Requirement 16: HR Dashboard and Analytics

**User Story:** As an HR director, I want an HR dashboard showing key workforce metrics, so that I can monitor headcount, payroll costs, leave utilisation, and compliance status at a glance.

#### Acceptance Criteria

1. THE HR_Module SHALL render a dashboard at `/hr` displaying the following key metrics for the Active_Company: total headcount, employees on leave today, new hires this month, terminations this month, total payroll cost for the current month (USD and ZiG separately), and number of open compliance alerts.
2. THE HR_Module SHALL display a payroll cost trend chart showing monthly gross payroll (USD and ZiG) for the last 12 months.
3. THE HR_Module SHALL display a leave utilisation chart showing total days taken per leave type for the current year.
4. THE HR_Module SHALL display a headcount-by-department bar chart.
5. WHEN the user clicks on a metric tile, THE HR_Module SHALL navigate to the relevant detail view (e.g., clicking "Employees on Leave Today" navigates to a filtered leave report).


# FiscalStack HR Module — Comprehensive QA Audit Report

**Date:** 13 September 2026
**Server:** 161.97.115.59 (fiscalstack.co.zw)
**Scope:** Full HR & Payroll module — Zimbabwe compliance (NSSA, ZIMRA, Labour Act)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Architecture Overview](#2-module-architecture-overview)
3. [ZIMRA Compliance (Tax & Statutory)](#3-zimra-compliance-tax--statutory)
4. [NSSA Compliance](#4-nssa-compliance)
5. [Labour Act Compliance (Zimbabwe)](#5-labour-act-compliance-zimbabwe)
6. [NEC (National Employment Council) Compliance](#6-nec-national-employment-council-compliance)
7. [Multi-Currency & Finance Act Compliance](#7-multi-currency--finance-act-compliance)
8. [Calculation Engine Accuracy](#8-calculation-engine-accuracy)
9. [Gap Analysis — Missing Features](#9-gap-analysis--missing-features)
10. [Severity Rating Summary](#10-severity-rating-summary)

---

## 1. Executive Summary

### What Works Well

The HR module has a **strong statutory calculation engine** covering PAYE, NSSA, NEC, AIDS Levy, ZIMDEF, Standards Levy, and multi-currency (USD/ZiG) split-pay. The payroll engine correctly implements:

- Progressive PAYE with ZIMRA 2025/2026 tax brackets
- Final Deduction System (FDS) with both forecasting and averaging methods
- NSSA POBS at correct 4.5%+4.5% rates with ceiling
- 12 NEC sector presets with configurable rates
- Finance Act Section 14(2) split-currency compliance
- $400 annual tax-free bonus threshold
- Medical aid tax credits (50%) with roll-over
- Full statutory reporting: P2, P6, ITF16, ZIMDEF
- Immutable payroll snapshots with hash chain audit trail
- Salary change approval workflow with effective-dated history

### Critical Gaps

The module has **8 critical gaps** against Zimbabwe Labour Act requirements and **6 moderate gaps** against best practice/regulatory recommendations. The most significant are:

- **No NHIF (National Health Insurance Fund)** — completely absent
- **No notice period management** — Labour Act Section 12 non-compliance
- **No severance/retrenchment calculation** — Section 13C non-compliance
- **No workers' compensation (WCIF)** — Compensation for Injuries & Diseases Act
- **No minimum wage enforcement** — no validation against NEC sector minimums
- **No disciplinary or grievance UI** — schema exists but no management interface
- **No paternity leave type** — missing from schema enum

---

## 2. Module Architecture Overview

### Pages (16 files)

| Page | Path | Lines | Purpose |
|------|------|-------|---------|
| HR Dashboard | `client/src/pages/hr/index.tsx` | — | Summary metrics, recent runs |
| Employee Directory | `client/src/pages/hr/employees.tsx` | 1,241 | Full employee CRUD, contracts, recurring items, CSV import |
| Payroll Runs | `client/src/pages/hr/payroll.tsx` | 533 | Create/list/approve/lock/reverse runs |
| Payslips | `client/src/pages/hr/payslips.tsx` | 477 | Detailed payslip view, email, print |
| Run Report | `client/src/pages/hr/run-report.tsx` | 329 | Per-run aggregate report |
| Leave | `client/src/pages/hr/leave.tsx` | 318 | Admin leave management |
| Loans | `client/src/pages/hr/loans.tsx` | 300 | Loan tracking, repayment schedules |
| Self-Service | `client/src/pages/hr/self-service.tsx` | 356 | Employee portal |
| Settings Hub | `client/src/pages/hr/setup.tsx` | — | Tabbed config container |
| Tax Tables | `client/src/pages/hr/tax-setup.tsx` | 277 | ZIMRA bracket management |
| Pay Grades | `client/src/pages/hr/pay-grades.tsx` | 281 | Salary bands |
| Earnings Setup | `client/src/pages/hr/incomes-setup.tsx` | 336 | Earning type configuration |
| Deductions Setup | `client/src/pages/hr/deductions-setup.tsx` | 218 | Deduction type configuration |
| Statutory Setup | `client/src/pages/hr/statutory-setup.tsx` | 273 | NSSA, AIDS, NEC rules |
| ZIMRA Reports | `client/src/pages/hr/zimra-reports.tsx` | 372 | P2, P6, ITF16, ZIMDEF |
| Bank Export | `client/src/components/hr/BankExportSettingsModal.tsx` | — | Bank payment config |

### API (1 file, 79 endpoints)

`server/api/v1/payroll.ts` — 4,643 lines, mounted at `/api/companies/:companyId/payroll`

### Calculation Engine (4 files)

| File | Lines | Purpose |
|------|-------|---------|
| `shared/payroll-engine.ts` | 422 | Core ZimbabwePayrollEngine |
| `shared/overtime-calculator.ts` | 79 | Overtime & holidays |
| `shared/proration.ts` | 204 | Salary proration logic |
| `server/lib/payroll-seeding.ts` | 303 | Tax table & NEC sector seeding |

### Database (47 tables)

Full schema in `shared/schema.ts` lines 3016–3999+, covering employees, contracts, payroll runs, run employees, allowances, deductions, leave, loans, tax tables, statutory rules, earning/deduction types, salary structures, grade steps, employment history, salary history, attendance imports, documents, payslip documents, integration events, statutory reports, report exports, validation issues, deadlines, remittances, import batches, and calculation audits.

---

## 3. ZIMRA Compliance (Tax & Statutory)

### 3.1 PAYE — Income Tax

**Status: FULLY IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Progressive tax brackets | `computeMonthlyPAYE()` with bracket walk (payroll-engine.ts:196) | CORRECT |
| ZIMRA 2025/2026 USD brackets | Seeded at payroll-seeding.ts:28-35 | CORRECT |
| ZiG 2024 brackets | Seeded at payroll-seeding.ts:39-46 | CORRECT |
| Non-monthly frequency handling | Weekly (52/12), fortnightly (26/12), daily normalisation (payroll-engine.ts:183) | CORRECT |
| Tax credits | Medical aid 50%, blind, elderly, annual credit (payroll-engine.ts:347) | CORRECT |
| Credit roll-over | Credits carry forward if unused, reset at month 12 (payroll-engine.ts:350) | CORRECT |
| Effective-dated tax tables | Active table resolution by date (payroll.ts:587) | CORRECT |
| Immutability of used tables | Cannot edit tables used in locked runs (payroll.ts:597) | CORRECT |

**PAYE Tax Brackets (USD 2025/2026):**

| Band | Rate | Deduction |
|------|------|-----------|
| $0 – $100 | 0% | $0 |
| $100 – $300 | 20% | $20 |
| $300 – $1,000 | 25% | $35 |
| $1,000 – $2,000 | 30% | $85 |
| $2,000 – $3,000 | 35% | $185 |
| $3,000+ | 40% | $335 |

### 3.2 Final Deduction System (FDS)

**Status: FULLY IMPLEMENTED**

| Method | Implementation | Verdict |
|--------|---------------|---------|
| Forecasting | Annualise current month + remaining months at current rate (payroll.ts:311) | CORRECT |
| Averaging | Average YTD × 12 months, cumulative tax (payroll.ts:330) | CORRECT |
| Method selection | Configurable per payroll run | CORRECT |

### 3.3 AIDS Levy

**Status: FULLY IMPLEMENTED**

- Rate: 3% of PAYE after credits (payroll-engine.ts:359)
- Configurable via statutory rule `AIDS_LEVY` (payroll.ts:3255)
- Applied BEFORE final PAYE amount, AFTER credits

### 3.4 ZIMDEF (Zimbabwe Manpower Development Fund)

**Status: FULLY IMPLEMENTED**

- Rate: 1% of gross (payroll-engine.ts:294)
- Employer-only levy
- Exportable via `GET /exports/zimdef` (payroll.ts:4395)

### 3.5 Standards Development Levy

**Status: FULLY IMPLEMENTED**

- Rate: 0.5% of gross (payroll-engine.ts:295)
- Employer-only levy

### 3.6 Tax-Free Bonus Threshold

**Status: FULLY IMPLEMENTED**

- Threshold: $400 per tax year (Finance Act)
- YTD tracking prevents over-taxation across bonus runs (payroll-engine.ts:227-236)
- Bonus runs use `runType: "BONUS"` with separate processing

### 3.7 Statutory Reporting

**Status: FULLY IMPLEMENTED**

| Report | Endpoint | Description |
|--------|----------|-------------|
| P2 (Monthly PAYE Return) | `GET /exports/p2` | PAYE + AIDS Levy, due 10th of following month |
| P6 (Employee Tax Certificate) | `GET /exports/p6` | Annual certificate per employee |
| ITF16 (Annual Reconciliation) | `GET /exports/itf16` | Cross-check vs monthly P2 |
| ZIMDEF Return | `GET /exports/zimdef` | Employer ZIMDEF contribution report |

### 3.8 Statutory Remittance Tracking

**Status: FULLY IMPLEMENTED**

- Auto-computes monthly obligations (payroll.ts:4449-4532)
- P2 due 10th of following month
- ZIMDEF + Standards Levy due 10th of following month
- NSSA due end of month
- Mark-as-paid workflow with reference numbers

---

## 4. NSSA Compliance

### 4.1 NSSA POBS (Employees' Compensation Insurance Fund)

**Status: FULLY IMPLEMENTED**

| Parameter | Value | Source |
|-----------|-------|--------|
| Employee rate | 4.5% | ZIMBABWE_DEFAULTS.nssaRateEmployee |
| Employer rate | 4.5% | ZIMBABWE_DEFAULTS.nssaRateEmployer |
| Ceiling (USD) | $700/month | Configurable via statutory rule |
| Ceiling (ZiG) | ZiG 9,492/month | Seeded at payroll-seeding.ts:203 |
| Base | Gross earnings (base + taxable allowances + bonus + overtime) | payroll-engine.ts:275 |
| Tax-deductible | YES — subtracted from taxable income | payroll-engine.ts:307 |

**Calculation (payroll-engine.ts:275-279):**
```
earningsSubjectToTaxes = baseSalary + taxableAllowances + taxableBonus + totalOvertimePay
nssaBase = min(earningsSubjectToTaxes, nssaCeilingLimit)
nssaEmployee = nssaBase × 0.045
nssaEmployer = nssaBase × 0.045
```

**Verdict:** Correctly implements NSSA POBS per Social Security (Compensation for Occupational Injuries) Act.

### 4.2 NSSA APWCS (AIDS Prevention and Welfare Control Scheme)

**Status: FULLY IMPLEMENTED**

- Employer-only levy
- Rate: defaults to half of ZIMDEF rate (0.5% of gross)
- Configurable via statutory rule `APWCS`

### 4.3 NSSA Reporting

- Monthly contribution schedule generated via statutory reports
- Statutory remittance tracking with due dates

---

## 5. Labour Act Compliance (Zimbabwe)

### 5.1 Employment Contracts

**Status: SUBSTANTIALLY IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Contract types | PERMANENT, FIXED_TERM, CASUAL | CORRECT |
| Start/end dates | Present on `employee_contracts` | CORRECT |
| Salary terms | baseSalary, currency, pay frequency | CORRECT |
| Employment history | `employeeEmploymentHistory` tracks JOINED, TRANSFER, PROMOTION, etc. | CORRECT |
| Fixed-term expiry alerts | Spec says 30-day alerts (requirements.md:67) | PRESENT IN SPEC |
| Salary change approval | Full workflow with request → approve → effective date | CORRECT |

**Missing:**
- No `PROBATIONARY` contract type
- No `probationEndDate` field
- No notice period terms in contracts

### 5.2 Annual Leave

**Status: PARTIALLY IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Minimum 30 days/year | `leave_requests` with `leaveType: ANNUAL` | Schema exists |
| Leave balance tracking | `leave_balances` with accrued/used/pending/available | CORRECT |
| Leave approval workflow | Admin can approve/reject | CORRECT |
| Employee self-service | Submit/cancel leave requests | CORRECT |
| **Enforce 30-day minimum** | **NOT ENFORCED** | **MISSING** |
| **Auto-accrual** | **NOT AUTOMATIC** (manual balance adjustment) | **MISSING** |

**Gap:** The system does not enforce that annual leave is at least 30 days per year. There is no auto-accrual at 2.5 days/month as required by Labour Act Section 18(1).

### 5.3 Maternity Leave

**Status: SCHEMA ONLY**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Leave type exists | `MATERNITY` in enum | CORRECT |
| **Minimum 98 days** | **NOT ENFORCED** | **MISSING** |
| **Continuous employment requirement** | **NOT CHECKED** | **MISSING** |

**Gap:** Labour Act Section 18(4) requires 98 consecutive days maternity leave. The system accepts the leave type but does not enforce the minimum duration.

### 5.4 Paternity Leave

**Status: NOT IMPLEMENTED**

- No `PATERNITY` leave type in the schema enum
- Current enum: `ANNUAL, SICK, MATERNITY, COMPASSIONATE, UNPAID, CUSTOM`
- Recent Zimbabwe regulations provide for 3 working days paternity leave

### 5.5 Notice Period

**Status: NOT IMPLEMENTED**

Labour Act Section 12 requires:

| Service Length | Required Notice |
|----------------|-----------------|
| Less than 1 year | 1 week |
| 1–5 years | 1 month |
| More than 5 years | 3 months |

**Gap:** No notice period field on contracts or employees. No calculation of required notice based on length of service. No payment-in-lieu-of-notice calculation.

### 5.6 Termination & Severance

**Status: PARTIALLY IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Termination date tracking | `employees.terminationDate` | CORRECT |
| Status change to TERMINATED | Blocks future payroll runs | CORRECT |
| Employment history event | `TERMINATION` event type recorded | CORRECT |
| **Termination type** | **NOT IN SCHEMA** (resignation, dismissal, retrenchment, etc.) | **MISSING** |
| **Termination reason** | **NOT IN SCHEMA** | **MISSING** |
| **Severance calculation** | **NOT IMPLEMENTED** | **MISSING** |
| **Retrenchment package** | **NOT IMPLEMENTED** | **MISSING** |
| **Termination checklist** | **NOT IMPLEMENTED** | **MISSING** |

**Gap:** The system blocks future payroll on termination but does not:
- Track WHY the employee was terminated (resignation vs dismissal vs retrenchment)
- Calculate severance pay (minimum 1 month per year of service)
- Generate retrenchment packages requiring Retrenchment Board approval for >10 employees

### 5.7 Probation Period

**Status: SPECIFIED BUT NOT IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Probation end date | **NOT IN DATABASE** | **MISSING** |
| Probation expiry reminders | **NOT IMPLEMENTED** | **MISSING** |
| Auto-confirm after probation | **NOT IMPLEMENTED** | **MISSING** |
| Max 6-month limit | **NOT ENFORCED** | **MISSING** |

**Gap:** The spec (requirements.md:64,69) describes probation management but the schema has no `probationEndDate` column and the UI has no probation workflow.

### 5.8 Overtime

**Status: FULLY IMPLEMENTED**

| Requirement | Implementation | Verdict |
|-------------|---------------|---------|
| Standard overtime | 1.5× hourly rate (Labour Act S.15) | CORRECT |
| Sunday/Public Holiday | 2.0× hourly rate | CORRECT |
| Hourly rate derivation | baseSalary / workingDaysPerMonth / hoursPerDay | CORRECT |
| Working days/month | Default 22, configurable | CORRECT |
| Hours/day | Default 8, configurable | CORRECT |
| Public holidays | Zimbabwe 2026 holidays hardcoded | CORRECT |
| Overtime is taxable | Included in gross salary | CORRECT |

### 5.9 Disciplinary & Grievance Management

**Status: SCHEMA ONLY, NO UI**

| Component | Implementation | Verdict |
|-----------|---------------|---------|
| `disciplinary_records` table | EXISTS (schema:3534) | Schema present |
| Offense types | WARNING, SUSPENSION, WRITTEN_WARNING, TERMINATION | Partial |
| Status tracking | ACTIVE, APPEALED, RESOLVED | Partial |
| **Management UI** | **NOT IMPLEMENTED** | **MISSING** |
| **Progressive discipline workflow** | **NOT IMPLEMENTED** | **MISSING** |
| **Grievance procedure** | **NOT IMPLEMENTED** | **MISSING** |
| **Code of conduct management** | **NOT IMPLEMENTED** | **MISSING** |

**Gap:** Labour Act Section 12 requires progressive discipline (verbal → written → final warning → suspension → dismissal). The table exists but there is no interface to create, manage, or track disciplinary records.

### 5.10 Workers' Compensation (WCIF)

**Status: NOT IMPLEMENTED**

- No WCIF tracking table
- No industry-specific rate configuration
- No monthly liability calculation
- No WCIF remittance reporting
- **Full absence of Compensation for Injuries and Diseases Act compliance**

### 5.11 Minimum Wage

**Status: NOT IMPLEMENTED**

- No minimum wage validation on contracts
- No Poverty Datum Line (PDL) reference data
- No alert when salary falls below NEC sector minimum
- No automatic flagging of wages below living wage

### 5.12 Attendance / Timesheet

**Status: MINIMAL INFRASTRUCTURE**

| Component | Implementation | Verdict |
|-----------|---------------|---------|
| `payroll_attendance_imports` table | Batch import tracking only | Partial |
| Import sources | MANUAL, CSV, BIOMETRIC, MOBILE_APP, API | Good |
| **Daily attendance records** | **NOT IMPLEMENTED** | **MISSING** |
| **Clock-in/clock-out** | **NOT IMPLEMENTED** | **MISSING** |
| **Attendance-to-payroll integration** | **NOT IMPLEMENTED** | **MISSING** |
| **Monthly attendance summary** | **NOT IMPLEMENTED** | **MISSING** |

### 5.13 Employee Shift / Roster Management

**Status: NOT IMPLEMENTED**

- No HR shift scheduling
- No shift-based attendance tracking
- POS shifts (open/close register) are unrelated to HR
- Required for overtime compliance tracking

---

## 6. NEC (National Employment Council) Compliance

**Status: FULLY IMPLEMENTED**

### Sector Presets (payroll-seeding.ts:53-138)

| Sector | Code | Employee | Employer | Fixed |
|--------|------|----------|----------|-------|
| Commercial | NEC-COMM | 1.0% | 1.0% | $0 |
| Agriculture | NEC-AGRI | 1.0% | 1.0% | $0 |
| Mining | NEC-MINE | 0.5% | 0.5% | $0 |
| Motor Industry | NEC-MOTO | 1.0% | 1.0% | $0 |
| Construction | NEC-CONS | 1.0% | 1.0% | $0 |
| Hotel & Catering | NEC-HOSP | 1.0% | 1.5% | $0 |
| Financial Institutions | NEC-FINC | 0.75% | 0.75% | $0 |
| Health Services | NEC-HLTH | 1.0% | 1.0% | $0 |
| Domestic Workers | NEC-DOME | 0.0% | 0.0% | $2.00 |
| Transport | NEC-TRNS | 1.0% | 1.0% | $0 |
| Communications | NEC-COMM2 | 0.75% | 0.75% | $0 |
| No NEC | NEC-NONE | 0.0% | 0.0% | $0 |

### NEC Calculation (payroll-engine.ts:289-291)

```
necEmployee = (baseSalary × necRate) + necFixedAmount
necEmployer = (baseSalary × necEmployerRate) + necFixedAmount
```

- Applied on **baseSalary only** (not gross)
- Supports both percentage and fixed amounts
- Sector assignment via employee contract → pay grade → NEC sector
- Configurable via `necSectorsConfig` table

---

## 7. Multi-Currency & Finance Act Compliance

**Status: FULLY IMPLEMENTED**

### Finance Act Section 14(2) — Split-Currency Net Pay

| Component | Implementation | Verdict |
|-----------|---------------|---------|
| USD/ZiG split on contracts | `usdPercentage` + `zigPercentage` | CORRECT |
| Exchange rate per run | `payroll_runs.exchangeRate` | CORRECT |
| Net pay split | `netSalaryUsd`, `netSalaryZig` | CORRECT |
| PAYE split | `payeUsd`, `payeZig` | CORRECT |
| NSSA split | `nssaEmployeeUsd`, `nssaEmployeeZig` | CORRECT |
| Separate tax tables | USD and ZiG brackets maintained independently | CORRECT |

### Currency Handling in Runs

- Run specifies a currency (default "USD")
- Employee contracts can be "USD", "ZiG", or "SPLIT"
- SPLIT contracts: ratio applied to all statutory amounts
- Non-matching currency employees skipped unless SPLIT

---

## 8. Calculation Engine Accuracy

### 8.1 Gross Salary

```
grossSalary = baseSalary + taxableAllowances + nontaxableAllowances + overtimePay + bonusAmount
```
**Verdict:** CORRECT

### 8.2 Taxable Income

```
taxableIncome = max(0, baseSalary + taxableAllowances + taxableBonus + overtimePay
                        - nssaEmployee - taxDeductiblePension - taxDeductibleDeductions)
```
**Verdict:** CORRECT — NSSA and pension are correctly deducted before tax.

### 8.3 Net Salary

```
netSalary = grossSalary - totalDeductions
totalDeductions = payeFinal + nssaEmployee + pensionEmployee + necEmployee + otherDeductions
```
**Verdict:** CORRECT

### 8.4 Employer Cost

```
totalEmployerCost = grossSalary + nssaEmployer + pensionEmployer + necEmployer
                    + apwcsAmount + zimdefAmount + standardsLevyAmount
```
**Verdict:** CORRECT

### 8.5 Pension Tax Deductibility Cap

```
maxTaxDeductiblePensionAnnual = $54,000 per annum
```

- YTD pension tracked: `cumulativePension = prevPension + pensionEmployee`
- If `prevPension >= limit`: `taxDeductiblePension = 0`
- If `cumulativePension > limit`: `taxDeductiblePension = limit - prevPension`
- **Verdict:** CORRECT

### 8.6 Proration

```
factor = min(1, max(0, worked / total))
proratedSalary = baseSalary × factor
```

**Proration bases:** CALENDAR_DAYS, WORKING_DAYS, PAYABLE_DAYS, HOURS_WORKED
**Verdict:** CORRECT — handles mid-month joins and terminations.

### 8.7 Double-Entry on Lock

When a payroll run is locked (payroll.ts:3746-3817):

| Debit | Credit |
|-------|--------|
| Salaries Expense (6000) = totalBasic | Net Salaries Payable (2000) = totalNet |
| | PAYE Payable (2100) = totalPaye + aidsLevy |
| | NSSA Payable (2110) = nssaEmployee + nssaEmployer |

**Verdict:** CORRECT double-entry accounting.

### 8.8 Unit Tests

File: `server/__tests__/payroll-engine.test.ts` (155 lines)

| Test | Status |
|------|--------|
| Tax-deductible deductions reduce taxable income | PRESENT |
| NSSA cap correctly applied | PRESENT |
| Pension and NEC rate calculations | PRESENT |
| Decimal rate normalisation | PRESENT |
| 2025/2026 ZIMRA tax tables | PRESENT |
| AIDS levy | PRESENT |

**Gap:** Tests are minimal (155 lines for a 422-line engine). Missing tests for:
- Non-monthly pay frequencies
- FDS forecasting vs averaging
- Bonus taxability ($400 threshold)
- Split-currency calculations
- Proration edge cases
- Overtime calculations

---

## 9. Gap Analysis — Missing Features

### CRITICAL GAPS (Zimbabwe Law Non-Compliance)

| # | Gap | Labour Act / Regulation | Impact | Effort |
|---|-----|------------------------|--------|--------|
| C1 | **NHIF not implemented** | National Health Insurance Act | No health insurance deduction | Medium |
| C2 | **No notice period management** | Section 12 | Cannot enforce statutory notice | Low |
| C3 | **No termination type tracking** | Section 12(1)-(3) | Cannot distinguish resignation/dismissal/retrenchment | Low |
| C4 | **No severance/retrenchment calculation** | Section 13C | Retrenchment packages not computable | High |
| C5 | **Workers' compensation (WCIF) absent** | Compensation for Injuries & Diseases Act | No statutory WCIF tracking | Medium |
| C6 | **No minimum wage enforcement** | NEC regulations | No validation against sector minimums | Medium |
| C7 | **No probation period management** | Common practice / contracts | Cannot manage probation lifecycle | Low |
| C8 | **No paternity leave type** | Recent regulations | 3-day paternity leave not supported | Trivial |

### MODERATE GAPS (Best Practice / Regulatory Recommendations)

| # | Gap | Details | Effort |
|---|-----|---------|--------|
| M1 | **Disciplinary schema has no UI** | `disciplinary_records` table exists but no management page | Medium |
| M2 | **Attendance system incomplete** | Only batch import tracking; no daily records | High |
| M3 | **No shift/roster management** | Required for overtime compliance tracking | High |
| M4 | **No PDL (Poverty Datum Line) reference** | No living wage benchmarking | Low |
| M5 | **No contract renewal workflow** | Fixed-term expiry alerts exist but no renewal process | Medium |
| M6 | **No grievance procedure module** | Labour Act Section 102 requires formal grievance tracking | Medium |
| M7 | **Leave auto-accrual not implemented** | Manual balance adjustment only; no automatic 2.5 days/month | Medium |
| M8 | **No employment equity tracking** | Required under Employment Code of Conduct | Low |
| M9 | **Minimal unit tests** | 155 lines of tests for a 422-line calculation engine | Medium |

### MISSING CALCULATIONS

| # | Item | Zimbabwe Requirement | Current Status |
|---|------|---------------------|----------------|
| D1 | **NHIF deduction** | % of gross, tiered | NOT IMPLEMENTED |
| D2 | **Severance pay** | Min 1 month per year of service | NOT IMPLEMENTED |
| D3 | **Pay-in-lieu-of-notice** | Based on statutory notice period | NOT IMPLEMENTED |
| D4 | **Leave encashment calculation** | Not auto-computed in engine | NOT IMPLEMENTED |
| D5 | **WCIF contribution** | Industry-specific rate × gross | NOT IMPLEMENTED |
| D6 | **NPLA (National Productivity Levy)** | Industry-specific | NOT IMPLEMENTED |
| D7 | **CZI levy** | Industry-specific | NOT IMPLEMENTED |

---

## 10. Severity Rating Summary

### By Compliance Area

| Area | Rating | Score | Notes |
|------|--------|-------|-------|
| **PAYE / Income Tax** | EXCELLENT | 10/10 | Full ZIMRA 2025/2026 compliance, FDS, credits |
| **NSSA** | EXCELLENT | 10/10 | POBS + APWCS, correct rates and ceiling |
| **NEC** | EXCELLENT | 10/10 | 12 sectors, configurable rates |
| **AIDS Levy** | EXCELLENT | 10/10 | Correct 3% implementation |
| **ZIMDEF** | GOOD | 9/10 | Correct, employer-only |
| **Multi-Currency** | EXCELLENT | 10/10 | Finance Act s.14(2) fully compliant |
| **13th Cheque** | EXCELLENT | 10/10 | $400 threshold, YTD tracking |
| **Overtime** | EXCELLENT | 10/10 | 1.5x/2.0x, public holidays |
| **Proration** | EXCELLENT | 10/10 | Multiple bases, salary blending |
| **Statutory Reporting** | EXCELLENT | 10/10 | P2, P6, ITF16, ZIMDEF |
| **Contracts** | GOOD | 7/10 | Types present, missing probation/notice |
| **Annual Leave** | PARTIAL | 5/10 | Tracking exists, no enforcement |
| **Maternity Leave** | PARTIAL | 4/10 | Type exists, no minimum enforcement |
| **Paternity Leave** | ABSENT | 0/10 | Not in schema enum |
| **Notice Period** | ABSENT | 0/10 | No implementation |
| **Termination** | PARTIAL | 3/10 | Date tracking only, no type/reason/severance |
| **Disciplinary** | ABSENT | 1/10 | Schema only, no UI |
| **Grievance** | ABSENT | 0/10 | No implementation |
| **Probation** | ABSENT | 0/10 | Spec only, not in DB |
| **Workers' Comp** | ABSENT | 0/10 | No implementation |
| **NHIF** | ABSENT | 0/10 | No implementation |
| **Minimum Wage** | ABSENT | 0/10 | No implementation |
| **Attendance** | MINIMAL | 2/10 | Batch import only |
| **Shift/Roster** | ABSENT | 0/10 | No implementation |

### Overall Score

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Tax & Statutory (ZIMRA, NSSA, NEC) | 40% | 10/10 | 4.0 |
| Labour Act Compliance | 30% | 3/10 | 0.9 |
| Multi-Currency | 15% | 10/10 | 1.5 |
| HR Management Features | 15% | 3/10 | 0.45 |
| **OVERALL** | | | **6.85/10** |

---

## Appendix A: Files Audited

| Category | File | Lines |
|----------|------|-------|
| Schema | `shared/schema.ts` | 3,016–3,999+ |
| Engine | `shared/payroll-engine.ts` | 422 |
| Overtime | `shared/overtime-calculator.ts` | 79 |
| Proration | `shared/proration.ts` | 204 |
| Seeding | `server/lib/payroll-seeding.ts` | 303 |
| API | `server/api/v1/payroll.ts` | 4,643 |
| Tests | `server/__tests__/payroll-engine.test.ts` | 155 |
| Reports | `server/services/reportService.ts` | 172 |
| Email | `server/email.ts` | — |
| HR Pages | `client/src/pages/hr/*.tsx` | 16 files |
| Layout | `client/src/pages/hr/layout.tsx` | — |
| Sidebar | `client/src/components/layout.tsx` | 472–491 |
| Permissions | `shared/permissions.ts` | 432–442 |
| Spec | `.kiro/specs/hr-module/requirements.md` | 290 |
| Spec | `FISCALSTACK_PAYROLL_HR_SPECIFICATION.md` | 1,061 |

## Appendix B: Recommendations Priority Order

1. **Immediate (this sprint):** Add paternity leave type (trivial), add probation end date column (low effort), add termination type/reason fields (low effort)
2. **Short-term (next 2 weeks):** NHIF implementation, notice period management, minimum wage validation, disciplinary UI
3. **Medium-term (next month):** Severance/retrenchment calculation, workers' compensation, attendance system enhancement, leave auto-accrual
4. **Long-term (next quarter):** Shift/roster management, grievance module, PDL reference data, employment equity tracking, comprehensive unit test suite

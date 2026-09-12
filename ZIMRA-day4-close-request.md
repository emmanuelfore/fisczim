# ZIMRA FDMS Support Request — Manual Close of Fiscal Day 4 (Device 43203)

**Date:** 2026-08-01
**Device ID:** 43203
**Device Serial:** FS-00023
**Environment:** Production
**Fiscal day to close:** 4 (opened per FDMS on **2026-07-25**)

---

## 1. Problem

Fiscal day 4 cannot be closed via the `CloseDay` API. FDMS rejects every close
attempt asynchronously with `FiscalDayCloseFailed`.

Attempted error codes (in chronological order):

| Attempt | fiscalDayDate sent | Result |
|---|---|---|
| 2026-08-01 08:52–09:03 (multiple) | 2026-07-25 | Close failed (Grey/Red receipts present) |
| 2026-08-01 14:34 | 2026-08-01 (wrong — day was opened 2026-07-25) | `BadCertificateSignature` |
| 2026-08-01 ~16:30 | 2026-07-25 (correct) | `MissingReceipts` |

`MissingReceipts` = "Close day is not allowed. There are missing receipts in
fiscal day ('Grey' validation error)" (FiscalDayProcessingError).

## 2. Root cause

On 2026-08-01 our integration submitted receipts whose `previousReceiptHash`
chain did not match FDMS's stored chain. A chain break occurred early in the day
(day-global 2 onwards). All receipts submitted that day were therefore rejected
with `RCPT020` (Invoice signature is not valid, Red) or accepted as Grey because
the previous receipt in their chain was missing/never stored.

Per the FDMS spec, `closeDay` cannot succeed while the fiscal day contains any
Grey or Red receipts:

> "In case fiscal day contains at least one 'Grey' or 'Red' receipt, FDMS will
> respond to closeDay request with error (fiscal day will remain opened)."

These records cannot be revalidated: their stored signatures were computed over
the broken previous hash, so FDMS's revalidation can never match. The day is
permanently unclosable through the API.

## 3. Current state (already repaired on our side)

The receipt chain has been fixed and verified against FDMS:

- Probe receipts `receiptGlobalNo` 1–3 submitted 2026-08-01 ~16:12 were accepted
  with **no validation errors** (chain anchored correctly).
- A real sales receipt (invoice INV-403084 area, `receiptGlobalNo=4`,
  `receiptCounter=4`, USD 2.00) was accepted afterwards with only `RCPT041`
  (Yellow warning — "Invoice is issued after fiscal day end", because the
  receipts are dated 2026-08-01 while FDMS has fiscal day 4 opened on
  2026-07-25).
- Our device now chains correctly; new receipts are accepted.

Day 4 on our side contains 743 invoices total (all on 2026-08-01):

- ~116 rejected as Red (RCPT012/RCPT020 — chain error, now unrecoverable)
- ~625 accepted with Yellow `RCPT041` (issued after fiscal day end) — these are
  valid invoices dated 2026-08-01
- The rest probes/pending

## 4. Request

Please **manually close fiscal day 4** on device 43203 (via the supplier Public
Portal or ZIMRA officer, per the spec's manual-close procedure:

> "…fiscal day may be closed manually by supplier in Public Portal, or by ZIMRA
> officer.")

so that fiscal day 5 can be opened and normal fiscalization continues. The
valid day-4 receipts (those accepted with `RCPT041` Yellow on 2026-08-01) should
be included in the day's Z-report; the Grey/Red records from the chain break
should be discarded as invalid.

## 5. Supporting details (for ZIMRA's reference)

- Company registered TIN/VAT for device 43203: as registered for this taxpayer
  (branch FS-00023).
- Fiscal day 4 was opened **2026-07-25** and left open for a week; all receipts
  are dated 2026-08-01, which also explains the `RCPT041` "after fiscal day end"
  warnings on every receipt of the day.
- First receipt of the day (submitted 2026-08-01 ~08:56 UTC) carried no previous
  receipt hash; FDMS stored it Grey. Subsequent receipts chained onto a hash
  FDMS never retained → Red `RCPT020`.
- We have full request/response logs (`zimra_logs`) for every submission if
  ZIMRA needs to cross-reference operation IDs.

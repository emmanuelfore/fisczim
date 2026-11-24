-- Backfill the requisition approval policy added with the procurement module.
-- Existing tenant settings are preserved; only tenants missing the policy are
-- changed. Thresholds and named approvers remain client-confirmed inputs.

UPDATE companies
SET approval_settings = $$
{
  "stock_adjustment": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "grn_confirm": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "journal_post": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "invoice_issue": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_commission": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "quotation": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "requisition": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "discount": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_order": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "purchase_order": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "supplier_registration": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "credit_note": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "payment_execution": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "leave": {"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "expense": {"mode":"by_permission","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false}
}
$$::jsonb
WHERE approval_settings IS NULL;

--> statement-breakpoint
UPDATE companies
SET approval_settings = jsonb_set(
  approval_settings,
  '{requisition}',
  '{"mode":"by_permission","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false}'::jsonb,
  true
)
WHERE approval_settings IS NOT NULL
  AND NOT approval_settings ? 'requisition';

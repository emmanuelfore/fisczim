-- Approvals are now opt-in. New companies get every policy disabled, and
-- existing companies are switched off while retaining their other settings
-- (thresholds, named approvers, owner bypass) so they can be re-enabled later.

UPDATE companies
SET approval_settings = $$
{
  "stock_adjustment": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "grn_confirm": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "journal_post": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "invoice_issue": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_commission": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "quotation": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "discount": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "sales_order": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "purchase_order": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "supplier_registration": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "requisition": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "credit_note": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "payment_execution": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "leave": {"mode":"disabled","ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false},
  "expense": {"mode":"disabled","amountThreshold":0,"ownerBypass":true,"approverUserIds":[],"approverRoleIds":[],"allowSelfApproval":false}
}
$$::jsonb
WHERE approval_settings IS NULL;

--> statement-breakpoint
UPDATE companies
SET approval_settings = jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
  jsonb_set(
    approval_settings,
    '{stock_adjustment}', COALESCE(approval_settings -> 'stock_adjustment', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{grn_confirm}', COALESCE(approval_settings -> 'grn_confirm', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{journal_post}', COALESCE(approval_settings -> 'journal_post', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{invoice_issue}', COALESCE(approval_settings -> 'invoice_issue', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{sales_commission}', COALESCE(approval_settings -> 'sales_commission', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{quotation}', COALESCE(approval_settings -> 'quotation', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{discount}', COALESCE(approval_settings -> 'discount', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{sales_order}', COALESCE(approval_settings -> 'sales_order', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{purchase_order}', COALESCE(approval_settings -> 'purchase_order', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{supplier_registration}', COALESCE(approval_settings -> 'supplier_registration', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{requisition}', COALESCE(approval_settings -> 'requisition', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{credit_note}', COALESCE(approval_settings -> 'credit_note', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{payment_execution}', COALESCE(approval_settings -> 'payment_execution', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{leave}', COALESCE(approval_settings -> 'leave', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true),
    '{expense}', COALESCE(approval_settings -> 'expense', '{}'::jsonb) || '{"mode":"disabled"}'::jsonb, true)
WHERE approval_settings IS NOT NULL;

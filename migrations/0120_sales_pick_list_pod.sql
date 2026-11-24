-- Proof-of-delivery evidence on dispatched sales orders. Nullable so legacy
-- pick lists and no-evidence dispatches are unaffected.

ALTER TABLE sales_pick_lists
  ADD COLUMN IF NOT EXISTS pod_reference text,
  ADD COLUMN IF NOT EXISTS pod_attachment_url text;

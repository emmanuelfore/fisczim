-- Migration: Add ship_to to purchase_orders and free-text fields to purchase_order_items
-- Allows POs to have a delivery address and line items that don't reference a product/service record

-- 1. Add ship_to column to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS ship_to TEXT;

-- 2. Make productId nullable on purchase_order_items (allow free-text lines)
ALTER TABLE purchase_order_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 3. Add description column (for free-text lines: "Office Supplies Expense", etc.)
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Add account_code column (optional GL account reference for expense/asset lines)
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS account_code TEXT;

-- Migration: Add is_for_sale flag to products
-- Raw material products (isIngredient=true) can be marked as not for sale
-- so they are hidden from the POS and invoice product picker.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_for_sale boolean NOT NULL DEFAULT true;

-- All existing products default to for-sale (true), preserving current behaviour.

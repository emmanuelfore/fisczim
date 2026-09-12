ALTER TABLE products
ADD COLUMN IF NOT EXISTS owner_group text;

CREATE INDEX IF NOT EXISTS products_company_owner_group_idx
ON products (company_id, owner_group);

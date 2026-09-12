DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'is_compound'
    ) THEN
        ALTER TABLE products ADD COLUMN is_compound BOOLEAN DEFAULT false;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS compound_product_items (
    id SERIAL PRIMARY KEY,
    parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity DECIMAL(12, 4) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS compound_product_items_parent_idx ON compound_product_items(parent_product_id);
CREATE INDEX IF NOT EXISTS compound_product_items_component_idx ON compound_product_items(component_product_id);

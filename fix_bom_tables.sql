CREATE TABLE IF NOT EXISTS bill_of_materials (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  version TEXT DEFAULT '1.0' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id SERIAL PRIMARY KEY,
  bom_id INTEGER NOT NULL REFERENCES bill_of_materials(id),
  component_product_id INTEGER NOT NULL REFERENCES products(id),
  type TEXT DEFAULT 'COMPONENT' NOT NULL,
  quantity DECIMAL(12, 4) NOT NULL,
  unit_of_measure TEXT NOT NULL,
  scrap_percentage DECIMAL(5, 2) DEFAULT 0 NOT NULL
);

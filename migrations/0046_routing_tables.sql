CREATE TABLE IF NOT EXISTS manufacturing_work_centers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  cost_per_hour DECIMAL(15,2) DEFAULT 0,
  overhead_rate DECIMAL(15,2) DEFAULT 0,
  capacity_hours_per_day DECIMAL(5,2) DEFAULT 8,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manufacturing_machines (
  id SERIAL PRIMARY KEY,
  work_center_id INTEGER NOT NULL REFERENCES manufacturing_work_centers(id),
  name TEXT NOT NULL,
  serial_number TEXT,
  status TEXT DEFAULT 'AVAILABLE',
  maintenance_schedule TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manufacturing_routings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manufacturing_routing_operations (
  id SERIAL PRIMARY KEY,
  routing_id INTEGER NOT NULL REFERENCES manufacturing_routings(id),
  work_center_id INTEGER NOT NULL REFERENCES manufacturing_work_centers(id),
  operation_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  setup_time_minutes DECIMAL(10,2) DEFAULT 0,
  cycle_time_minutes DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

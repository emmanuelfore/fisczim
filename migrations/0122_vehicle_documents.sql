CREATE TABLE IF NOT EXISTS vehicle_documents (
  id serial PRIMARY KEY,
  vehicle_id integer NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL,
  mime_type text NOT NULL,
  content_base64 text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_documents_vehicle_idx ON vehicle_documents (vehicle_id);

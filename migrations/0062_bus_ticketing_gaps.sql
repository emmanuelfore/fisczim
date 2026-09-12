-- Bus ticketing gap fixes
-- Adds location tracking columns to bus_trips, admin notes to bus_reconciliations,
-- and trip/route references + closed timestamp to bus_shifts.

ALTER TABLE "bus_trips"
  ADD COLUMN IF NOT EXISTS "current_latitude" double precision,
  ADD COLUMN IF NOT EXISTS "current_longitude" double precision,
  ADD COLUMN IF NOT EXISTS "last_location_update" timestamp;

ALTER TABLE "bus_reconciliations"
  ADD COLUMN IF NOT EXISTS "admin_notes" text;

ALTER TABLE "bus_shifts"
  ADD COLUMN IF NOT EXISTS "vehicle_id" integer REFERENCES "bus_vehicles"("id"),
  ADD COLUMN IF NOT EXISTS "trip_id" integer REFERENCES "bus_trips"("id"),
  ADD COLUMN IF NOT EXISTS "route_id" integer REFERENCES "bus_routes"("id"),
  ADD COLUMN IF NOT EXISTS "closed_at" timestamp;

CREATE INDEX IF NOT EXISTS "bus_trips_location_idx" ON "bus_trips" ("company_id", "status", "last_location_update");
CREATE INDEX IF NOT EXISTS "bus_shifts_conductor_open_idx" ON "bus_shifts" ("conductor_id", "status");

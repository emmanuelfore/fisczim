CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "key" text PRIMARY KEY NOT NULL,
  "user_id" uuid REFERENCES "users"("id"),
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer NOT NULL,
  "response_body" jsonb NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx"
  ON "idempotency_keys" ("expires_at");

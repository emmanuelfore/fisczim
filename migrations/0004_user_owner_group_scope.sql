ALTER TABLE users
ADD COLUMN IF NOT EXISTS owner_group_scope text;

CREATE INDEX IF NOT EXISTS users_owner_group_scope_idx
ON users (owner_group_scope);

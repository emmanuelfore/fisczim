#!/bin/bash
# Save PM2-injected env vars before .env overrides them
_SAVED_PORT="${PORT}"
_SAVED_COUNTRY_SCOPE="${COUNTRY_SCOPE}"

# Automatically source environment variables from .env if it exists
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Restore PM2-injected env vars (PORT, COUNTRY_SCOPE, etc.)
[ -n "$_SAVED_PORT" ] && export PORT="$_SAVED_PORT"
[ -n "$_SAVED_COUNTRY_SCOPE" ] && export COUNTRY_SCOPE="$_SAVED_COUNTRY_SCOPE"
unset _SAVED_PORT _SAVED_COUNTRY_SCOPE

# Execute the compiled server
exec node dist/index.cjs

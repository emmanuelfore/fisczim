#!/bin/bash

# Test Supabase connection with different endpoints

echo "=== Testing Supabase Connection ==="

# Test 1: Direct connection (from .env)
echo "Test 1: Direct pooler connection (eu-west-3)"
psql "postgresql://postgres:2512@161.97.115.59:5432/postgres" -c "SELECT version();"

# Test 2: Session mode (might work better for pg_dump)
echo "Test 2: Session mode connection"
psql "postgresql://postgres:2512@161.97.115.59:6543/postgres" -c "SELECT version();"

# Test 3: Transaction mode
echo "Test 3: Transaction mode connection"
psql "postgresql://postgres:2512@161.97.115.59:5432/postgres?target_session_attrs=read-write" -c "SELECT version();"

# Test 4: Check if we can at least ping the host
echo "Test 4: Ping check"
ping -c 3 161.97.115.59

echo "=== Connection Tests Complete ==="

WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id, conductor_id, start_time ORDER BY id) as rn
  FROM bus_shifts
)
SELECT * FROM duplicates WHERE rn > 1;

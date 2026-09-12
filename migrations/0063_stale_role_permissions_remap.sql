-- Remap legacy/stale permission keys in company_role_permissions to their
-- current equivalents in the permission catalog.
--
-- These keys were seeded by an older version of LEGACY_ROLE_PERMISSIONS and are
-- no longer part of ALL_PERMISSION_KEYS. They were invisible in the Roles UI
-- but still stored, which made the access-roles POST/PATCH validation reject
-- every role save with "Invalid permissions".
--
-- Mappings:
--   grn.direct          -> grn.confirm.direct
--   grn.approve         -> grn.confirm
--   payroll.process     -> payroll.write
--   restaurant.menu     -> restaurant.layout
--   accounting.close    -> accounting.periods

-- Drop stale rows whose modern equivalent already exists on the same role
-- (otherwise the remap below would violate the primary key on (role_id, permission)).
DELETE FROM company_role_permissions crp
USING company_role_permissions crp2
WHERE crp.role_id = crp2.role_id
  AND crp.permission IN ('grn.direct','grn.approve','payroll.process','restaurant.menu','accounting.close')
  AND crp2.permission = CASE crp.permission
    WHEN 'grn.direct' THEN 'grn.confirm.direct'
    WHEN 'grn.approve' THEN 'grn.confirm'
    WHEN 'payroll.process' THEN 'payroll.write'
    WHEN 'restaurant.menu' THEN 'restaurant.layout'
    WHEN 'accounting.close' THEN 'accounting.periods'
  END;

-- Remap the remaining stale keys to their modern equivalents.
UPDATE company_role_permissions SET permission = 'grn.confirm.direct' WHERE permission = 'grn.direct';
UPDATE company_role_permissions SET permission = 'grn.confirm' WHERE permission = 'grn.approve';
UPDATE company_role_permissions SET permission = 'payroll.write' WHERE permission = 'payroll.process';
UPDATE company_role_permissions SET permission = 'restaurant.layout' WHERE permission = 'restaurant.menu';
UPDATE company_role_permissions SET permission = 'accounting.periods' WHERE permission = 'accounting.close';

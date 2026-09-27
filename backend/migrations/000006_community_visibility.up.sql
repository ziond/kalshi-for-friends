BEGIN;
-- Preserve privacy for communities created before visibility existed.
ALTER TABLE communities ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'PRIVATE'
 CHECK (visibility IN ('PUBLIC', 'PRIVATE'));
COMMIT;

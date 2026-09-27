BEGIN;

-- Markets still in their grace period go back to waiting for a pick; nothing was paid yet.
DELETE FROM settlements WHERE paid_out_at IS NULL;
UPDATE markets SET status = 'LOCKED', updated_at = CURRENT_TIMESTAMP WHERE status = 'PAYOUT_PENDING';

DROP INDEX settlements_payout_due_idx;
ALTER TABLE settlements DROP CONSTRAINT settlements_payout_check;
ALTER TABLE settlements DROP COLUMN paid_out_at;
ALTER TABLE settlements DROP COLUMN payout_at;

ALTER TABLE markets DROP CONSTRAINT markets_status_check;
ALTER TABLE markets ADD CONSTRAINT markets_status_check
    CHECK (status IN ('OPEN', 'LOCKED', 'RESOLVED', 'CANCELLED'));

COMMIT;

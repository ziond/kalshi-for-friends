BEGIN;

-- Picking a winner starts a grace period (PAYOUT_PENDING); coins move at payout_at.
ALTER TABLE markets DROP CONSTRAINT markets_status_check;
ALTER TABLE markets ADD CONSTRAINT markets_status_check
    CHECK (status IN ('OPEN', 'LOCKED', 'PAYOUT_PENDING', 'RESOLVED', 'CANCELLED'));

ALTER TABLE settlements ADD COLUMN payout_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN paid_out_at TIMESTAMPTZ;
-- Existing settlements were paid out when they were recorded.
UPDATE settlements SET payout_at = resolved_at, paid_out_at = resolved_at;
ALTER TABLE settlements ALTER COLUMN payout_at SET NOT NULL;
ALTER TABLE settlements ADD CONSTRAINT settlements_payout_check CHECK (
    payout_at >= resolved_at AND (paid_out_at IS NULL OR paid_out_at >= payout_at)
);

-- The payout job only scans settlements still waiting for their payout.
CREATE INDEX settlements_payout_due_idx ON settlements (payout_at) WHERE paid_out_at IS NULL;

COMMENT ON COLUMN settlements.payout_at IS
    'resolved_at + the payout grace period. The pick is final; until then the moderator can only nullify.';
COMMENT ON COLUMN settlements.paid_out_at IS
    'NULL while the market is PAYOUT_PENDING. A nullify deletes the pending settlement.';

COMMIT;

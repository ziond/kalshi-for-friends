BEGIN;
-- Existing links get one final 15-minute window from migration time.
ALTER TABLE communities ADD COLUMN invite_expires_at TIMESTAMPTZ;
UPDATE communities SET invite_expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes';
ALTER TABLE communities ALTER COLUMN invite_expires_at SET NOT NULL;
ALTER TABLE communities ALTER COLUMN invite_expires_at SET DEFAULT (clock_timestamp() + INTERVAL '15 minutes');
COMMENT ON COLUMN communities.invite_expires_at IS
    'Invite expires 15 minutes after issuance. Regenerating replaces the code and starts a new window.';
COMMIT;

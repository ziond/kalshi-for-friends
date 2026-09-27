BEGIN;

-- Points economy: 1,000 on signup, then 1,000 claimable every 24 hours.
-- Existing wallets can claim straight away; new wallets wait a day (the
-- server sets the exact time at signup from its DAILY_BONUS_HOURS setting).
ALTER TABLE wallets ADD COLUMN next_daily_bonus_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE wallets ALTER COLUMN next_daily_bonus_at SET DEFAULT now() + interval '24 hours';
COMMENT ON COLUMN wallets.next_daily_bonus_at IS
    'When the next DAILY_BONUS can be claimed. A claim sets it to claim time + 24h, so missed days never stack.';

-- DEPOSIT (free top-ups) is legacy: kept so existing rows stay valid, never written again.
ALTER TABLE transactions DROP CONSTRAINT transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check CHECK
 (transaction_type IN ('INITIAL_BONUS','DAILY_BONUS','PLACE_POSITION','WIN_REWARD','LOSS','REFUND','POINT_REFILL','DEPOSIT'));
ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (
 (transaction_type IN ('INITIAL_BONUS','DAILY_BONUS','DEPOSIT') AND amount>0 AND position_id IS NULL AND market_id IS NULL)
 OR (transaction_type='POINT_REFILL' AND amount>0 AND position_id IS NULL AND market_id IS NULL AND request_key IS NOT NULL)
 OR (transaction_type='PLACE_POSITION' AND amount<0 AND position_id IS NOT NULL)
 OR (transaction_type IN ('WIN_REWARD','REFUND') AND amount>0 AND position_id IS NOT NULL)
 OR (transaction_type='LOSS' AND amount=0 AND position_id IS NOT NULL)
);

COMMIT;

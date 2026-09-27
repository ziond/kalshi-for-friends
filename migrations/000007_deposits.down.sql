BEGIN;
-- Refuse rollback once deposits exist; do not erase ledger history.
ALTER TABLE transactions DROP CONSTRAINT transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check CHECK
 (transaction_type IN ('INITIAL_BONUS','PLACE_POSITION','WIN_REWARD','LOSS','REFUND','POINT_REFILL'));
ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (
 (transaction_type='INITIAL_BONUS' AND amount>0 AND position_id IS NULL AND market_id IS NULL)
 OR (transaction_type='POINT_REFILL' AND amount>0 AND position_id IS NULL AND market_id IS NULL AND request_key IS NOT NULL)
 OR (transaction_type='PLACE_POSITION' AND amount<0 AND position_id IS NOT NULL)
 OR (transaction_type IN ('WIN_REWARD','REFUND') AND amount>0 AND position_id IS NOT NULL)
 OR (transaction_type='LOSS' AND amount=0 AND position_id IS NOT NULL)
);
COMMIT;

BEGIN;

CREATE TABLE settlements (
    market_id BIGINT PRIMARY KEY REFERENCES markets(id) ON DELETE RESTRICT,
    winning_option_id BIGINT NOT NULL,
    resolved_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    total_pool BIGINT NOT NULL CHECK (total_pool BETWEEN 0 AND 9007199254740991),
    winning_pool BIGINT NOT NULL CHECK (winning_pool BETWEEN 0 AND total_pool),
    settlement_mode VARCHAR(30) NOT NULL CHECK (settlement_mode IN ('PAYOUT', 'NO_WINNERS_REFUND')),
    CONSTRAINT settlements_option_fk FOREIGN KEY (market_id, winning_option_id)
        REFERENCES market_options(market_id, id) ON DELETE RESTRICT,
    CONSTRAINT settlements_mode_check CHECK (
        (settlement_mode = 'PAYOUT' AND winning_pool > 0)
        OR (settlement_mode = 'NO_WINNERS_REFUND' AND winning_pool = 0)
    )
);

CREATE INDEX settlements_resolved_by_idx ON settlements (resolved_by);
CREATE INDEX settlements_option_idx ON settlements (winning_option_id);

CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    user_id BIGINT NOT NULL REFERENCES wallets(user_id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL CHECK (amount BETWEEN -9007199254740991 AND 9007199254740991),
    transaction_type VARCHAR(30) NOT NULL CHECK (
        transaction_type IN ('INITIAL_BONUS', 'PLACE_POSITION', 'WIN_REWARD', 'LOSS', 'REFUND', 'POINT_REFILL')
    ),
    balance_after BIGINT NOT NULL CHECK (balance_after BETWEEN 0 AND 9007199254740991),
    position_id BIGINT,
    market_id BIGINT REFERENCES markets(id) ON DELETE RESTRICT,
    reference_type TEXT GENERATED ALWAYS AS (
        CASE WHEN position_id IS NOT NULL THEN 'POSITION'
             WHEN market_id IS NOT NULL THEN 'MARKET' END
    ) STORED,
    reference_id BIGINT GENERATED ALWAYS AS (COALESCE(position_id, market_id)) STORED,
    request_key VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_position_owner_fk
        FOREIGN KEY (user_id, position_id) REFERENCES positions(user_id, id) ON DELETE RESTRICT,
    CONSTRAINT transactions_reference_check
        CHECK (position_id IS NULL OR market_id IS NULL),
    CONSTRAINT transactions_request_key_check
        CHECK (request_key IS NULL OR btrim(request_key) <> ''),
    CONSTRAINT transactions_type_check CHECK (
        (transaction_type = 'INITIAL_BONUS' AND amount > 0 AND position_id IS NULL AND market_id IS NULL)
        OR
        (transaction_type = 'POINT_REFILL' AND amount > 0 AND position_id IS NULL
            AND market_id IS NULL AND request_key IS NOT NULL)
        OR
        (transaction_type = 'PLACE_POSITION' AND amount < 0 AND position_id IS NOT NULL)
        OR
        (transaction_type IN ('WIN_REWARD', 'REFUND') AND amount > 0 AND position_id IS NOT NULL)
        OR
        (transaction_type = 'LOSS' AND amount = 0 AND position_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX transactions_initial_bonus_unique ON transactions (user_id)
    WHERE transaction_type = 'INITIAL_BONUS';
CREATE UNIQUE INDEX transactions_stake_unique ON transactions (position_id)
    WHERE transaction_type = 'PLACE_POSITION';
CREATE UNIQUE INDEX transactions_final_result_unique ON transactions (position_id)
    WHERE transaction_type IN ('WIN_REWARD', 'LOSS', 'REFUND');
CREATE UNIQUE INDEX transactions_request_key_unique ON transactions (user_id, request_key)
    WHERE request_key IS NOT NULL;
CREATE INDEX transactions_user_history_idx ON transactions (user_id, created_at DESC, id DESC);
CREATE INDEX transactions_market_idx ON transactions (market_id) WHERE market_id IS NOT NULL;

COMMENT ON TABLE settlements IS
    'At most one result per market. Cancellation has no settlement; no-winning-stake resolution retains its result and refunds.';
COMMENT ON TABLE transactions IS
    'Point ledger. Application must atomically change the locked wallet and append its movement; never edit past entries.';
COMMENT ON COLUMN transactions.transaction_type IS
    'POINT_REFILL supports the requested feature but is an addition to the supplied draft API enum.';
COMMENT ON COLUMN transactions.reference_type IS
    'Derived from real foreign keys; clients cannot supply an unchecked polymorphic reference.';

COMMIT;

BEGIN;

CREATE TABLE markets (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
    creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    moderator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL CHECK (btrim(title) <> ''),
    description TEXT,
    market_type VARCHAR(30) NOT NULL CHECK (market_type IN ('BINARY', 'MULTIPLE_CHOICE')),
    deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'LOCKED', 'RESOLVED', 'CANCELLED')),
    cancelled_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT markets_deadline_check CHECK (deadline > created_at),
    CONSTRAINT markets_cancellation_check CHECK (
        (status = 'CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
        OR
        (status <> 'CANCELLED' AND cancelled_by IS NULL AND cancelled_at IS NULL
            AND cancellation_reason IS NULL)
    )
);

CREATE INDEX markets_community_feed_idx ON markets (community_id, created_at DESC, id DESC);
CREATE INDEX markets_creator_idx ON markets (creator_id);
CREATE INDEX markets_moderator_idx ON markets (moderator_id);
CREATE INDEX markets_open_deadline_idx ON markets (deadline, id) WHERE status = 'OPEN';

CREATE TABLE market_options (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    option_text VARCHAR(255) NOT NULL CHECK (btrim(option_text) <> ''),
    sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 9),
    total_amount BIGINT NOT NULL DEFAULT 0
        CHECK (total_amount BETWEEN 0 AND 9007199254740991),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (market_id, id),
    UNIQUE (market_id, sort_order)
);

CREATE UNIQUE INDEX market_options_text_unique
    ON market_options (market_id, lower(btrim(option_text)));

CREATE TABLE market_participants (
    market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    option_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (market_id, user_id),
    UNIQUE (market_id, user_id, option_id),
    CONSTRAINT market_participants_option_fk
        FOREIGN KEY (market_id, option_id) REFERENCES market_options(market_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX market_participants_user_idx ON market_participants (user_id, market_id);

CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    market_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    option_id BIGINT NOT NULL,
    amount BIGINT NOT NULL CHECK (amount BETWEEN 1 AND 9007199254740991),
    result VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (result IN ('PENDING', 'WON', 'LOST', 'REFUNDED')),
    payout BIGINT,
    request_key VARCHAR(128) NOT NULL CHECK (btrim(request_key) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMPTZ,
    UNIQUE (user_id, request_key),
    UNIQUE (user_id, id),
    CONSTRAINT positions_participant_fk
        FOREIGN KEY (market_id, user_id, option_id)
        REFERENCES market_participants(market_id, user_id, option_id) ON DELETE RESTRICT,
    CONSTRAINT positions_payout_check CHECK (
        (result = 'PENDING' AND payout IS NULL AND settled_at IS NULL)
        OR
        (result = 'WON' AND payout IS NOT NULL
            AND payout BETWEEN amount AND 9007199254740991 AND settled_at IS NOT NULL)
        OR
        (result = 'LOST' AND payout IS NOT NULL AND payout = 0 AND settled_at IS NOT NULL)
        OR
        (result = 'REFUNDED' AND payout IS NOT NULL AND payout = amount AND settled_at IS NOT NULL)
    )
);

CREATE INDEX positions_market_activity_idx ON positions (market_id, created_at DESC, id DESC);
CREATE INDEX positions_user_history_idx ON positions (user_id, created_at DESC, id DESC);
CREATE INDEX positions_user_result_idx ON positions (user_id, result, created_at DESC, id DESC);
CREATE INDEX positions_option_idx ON positions (option_id);

COMMENT ON TABLE market_participants IS
    'One choice per user per market. Positions reference this choice; additions use new position rows.';
COMMENT ON COLUMN positions.request_key IS
    'Retry key scoped to a user. HTTP Idempotency-Key integration remains to be agreed with frontend.';
COMMENT ON COLUMN market_options.total_amount IS
    'Cached sum of original stakes; updated atomically with positions. Retained after finalization.';

COMMIT;

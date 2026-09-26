BEGIN;

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    username VARCHAR(50) NOT NULL CHECK (username = btrim(username) AND username <> ''),
    email VARCHAR(255) NOT NULL CHECK (email = btrim(email) AND email <> ''),
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    avatar_url TEXT,
    prediction_score BIGINT NOT NULL DEFAULT 0
        CHECK (prediction_score BETWEEN -9007199254740991 AND 9007199254740991),
    total_predictions INTEGER NOT NULL DEFAULT 0 CHECK (total_predictions >= 0),
    correct_predictions INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_correct_predictions_check
        CHECK (correct_predictions BETWEEN 0 AND total_predictions)
);

CREATE UNIQUE INDEX users_username_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE wallets (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 9007199254740991),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE wallets IS
    'Global demo-point balances. Registration must grant starting points and insert INITIAL_BONUS atomically.';
COMMENT ON COLUMN wallets.balance IS
    'Starts at zero so a default value never creates unrecorded points. No real-money deposits.';

COMMIT;

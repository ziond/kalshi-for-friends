-- Run only through scripts/test-migrations.sh against its disposable cluster.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.expect_error(statement TEXT, expected_state TEXT, expected_constraint TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    actual_state TEXT;
    actual_constraint TEXT;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE,
            actual_constraint = CONSTRAINT_NAME;
        IF actual_state <> expected_state THEN
            RAISE EXCEPTION 'Expected SQLSTATE %, got % for %', expected_state, actual_state, statement;
        END IF;
        IF expected_constraint IS NOT NULL AND actual_constraint IS DISTINCT FROM expected_constraint THEN
            RAISE EXCEPTION 'Expected constraint %, got % for %', expected_constraint, actual_constraint, statement;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected SQLSTATE % but statement succeeded: %', expected_state, statement;
END;
$$;

INSERT INTO users (id, username, email, password_hash) VALUES
    (1, 'Owen', 'owen@example.test', 'test-hash'),
    (2, 'Zion', 'zion@example.test', 'test-hash'),
    (3, 'Sofiri', 'sofiri@example.test', 'test-hash');
INSERT INTO wallets (user_id) VALUES (1), (2), (3);
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));

SELECT pg_temp.expect_error(
    $$INSERT INTO users (username, email, password_hash) VALUES ('owen', 'other@example.test', 'hash')$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO users (username, email, password_hash) VALUES ('other', 'OWEN@example.test', 'hash')$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO users (id, username, email, password_hash) VALUES (9007199254740992, 'overflow', 'overflow@example.test', 'hash')$$, '23514');
SELECT pg_temp.expect_error($$UPDATE users SET correct_predictions = 1 WHERE id = 1$$, '23514');
SELECT pg_temp.expect_error($$INSERT INTO wallets (user_id) VALUES (1)$$, '23505');
SELECT pg_temp.expect_error($$UPDATE wallets SET balance = -1 WHERE user_id = 1$$, '23514');
SELECT pg_temp.expect_error($$UPDATE wallets SET balance = 9007199254740992 WHERE user_id = 1$$, '23514');

-- Registration grant is explicit and recorded, not silently created by a default.
UPDATE wallets SET balance = 1000 WHERE user_id IN (1, 2, 3);
INSERT INTO transactions (user_id, amount, transaction_type, balance_after)
    SELECT id, 1000, 'INITIAL_BONUS', 1000 FROM users;
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after) VALUES (1, 1000, 'INITIAL_BONUS', 2000)$$, '23505');

INSERT INTO communities (id, name, invite_code, creator_id) VALUES (1, 'Friends', 'invite-1', 1);
INSERT INTO community_members (community_id, user_id, role) VALUES
    (1, 1, 'ADMIN'), (1, 2, 'MODERATOR'), (1, 3, 'MEMBER');
SELECT pg_temp.expect_error(
    $$INSERT INTO community_members (community_id, user_id) VALUES (1, 1)$$, '23505');
SELECT pg_temp.expect_error(
    $$UPDATE community_members SET role = 'OWNER' WHERE community_id = 1 AND user_id = 1$$, '23514');

INSERT INTO markets (id, community_id, creator_id, moderator_id, title, market_type, deadline) VALUES
    (1, 1, 1, 2, 'Who wins?', 'MULTIPLE_CHOICE', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    (2, 1, 1, 2, 'Will it rain?', 'BINARY', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    (3, 1, 1, 2, 'No winners?', 'BINARY', CURRENT_TIMESTAMP + INTERVAL '1 day'),
    (4, 1, 1, 2, 'Cancel this?', 'BINARY', CURRENT_TIMESTAMP + INTERVAL '1 day');
SELECT pg_temp.expect_error(
    $$UPDATE markets SET deadline = created_at WHERE id = 1$$, '23514');
SELECT pg_temp.expect_error(
    $$UPDATE markets SET status = 'CANCELLED' WHERE id = 1$$, '23514');

INSERT INTO market_options (id, market_id, option_text, sort_order) VALUES
    (1, 1, 'Team A', 0), (2, 1, 'Team B', 1),
    (3, 2, 'YES', 0), (4, 2, 'NO', 1),
    (5, 3, 'YES', 0), (6, 3, 'NO', 1),
    (7, 4, 'YES', 0), (8, 4, 'NO', 1);
SELECT setval(pg_get_serial_sequence('market_options', 'id'), (SELECT max(id) FROM market_options));
SELECT pg_temp.expect_error(
    $$INSERT INTO market_options (market_id, option_text, sort_order) VALUES (1, ' team a ', 2)$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO market_options (market_id, option_text, sort_order) VALUES (1, 'Team C', 10)$$, '23514');

INSERT INTO market_participants (market_id, user_id, option_id) VALUES
    (1, 1, 1), (1, 2, 2), (2, 1, 3), (3, 1, 6), (4, 1, 7);
SELECT pg_temp.expect_error(
    $$INSERT INTO market_participants (market_id, user_id, option_id) VALUES (1, 1, 2)$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO market_participants (market_id, user_id, option_id) VALUES (1, 3, 3)$$, '23503');

INSERT INTO positions (id, market_id, user_id, option_id, amount, request_key) VALUES
    (1, 1, 1, 1, 100, 'stake-1'),
    (2, 1, 1, 1, 50, 'stake-2'),
    (3, 1, 2, 2, 100, 'stake-3'),
    (4, 3, 1, 6, 50, 'stake-4'),
    (5, 4, 1, 7, 50, 'stake-5');
SELECT setval(pg_get_serial_sequence('positions', 'id'), (SELECT max(id) FROM positions));
SELECT pg_temp.expect_error(
    $$INSERT INTO positions (market_id, user_id, option_id, amount, request_key) VALUES (1, 1, 2, 10, 'switch')$$, '23503');
SELECT pg_temp.expect_error(
    $$UPDATE market_participants SET option_id = 2 WHERE market_id = 1 AND user_id = 1$$, '23503');
SELECT pg_temp.expect_error(
    $$INSERT INTO positions (market_id, user_id, option_id, amount, request_key) VALUES (1, 1, 1, 10, 'stake-1')$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO positions (market_id, user_id, option_id, amount, request_key) VALUES (1, 1, 1, 0, 'zero')$$, '23514');
SELECT pg_temp.expect_error($$UPDATE positions SET result = 'WON' WHERE id = 1$$, '23514');
SELECT pg_temp.expect_error($$UPDATE positions SET payout = 100 WHERE id = 1$$, '23514');

UPDATE wallets SET balance = 750 WHERE user_id = 1;
UPDATE wallets SET balance = 900 WHERE user_id = 2;
UPDATE market_options SET total_amount = 150 WHERE id = 1;
UPDATE market_options SET total_amount = 100 WHERE id = 2;
UPDATE market_options SET total_amount = 50 WHERE id IN (6, 7);
-- Check ownership before inserting the legitimate debit so the unique debit
-- index cannot mask the foreign-key violation this assertion is testing.
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES (3, -100, 'PLACE_POSITION', 900, 1)$$,
    '23503', 'transactions_position_owner_fk');
INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES
    (1, -100, 'PLACE_POSITION', 900, 1),
    (1, -50, 'PLACE_POSITION', 850, 2),
    (2, -100, 'PLACE_POSITION', 900, 3),
    (1, -50, 'PLACE_POSITION', 800, 4),
    (1, -50, 'PLACE_POSITION', 750, 5);
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES (1, -100, 'PLACE_POSITION', 800, 1)$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES (2, -100, 'LOSS', 800, 3)$$, '23514');

-- One settlement, with its winning option bound to the same market.
SELECT pg_temp.expect_error(
    $$INSERT INTO settlements (market_id, winning_option_id, resolved_by, total_pool, winning_pool, settlement_mode) VALUES (1, 3, 2, 250, 150, 'PAYOUT')$$, '23503');
INSERT INTO settlements (market_id, winning_option_id, resolved_by, total_pool, winning_pool, settlement_mode)
    VALUES (1, 1, 2, 250, 150, 'PAYOUT'), (3, 5, 2, 50, 0, 'NO_WINNERS_REFUND');
SELECT pg_temp.expect_error(
    $$INSERT INTO settlements (market_id, winning_option_id, resolved_by, total_pool, winning_pool, settlement_mode) VALUES (1, 1, 2, 250, 150, 'PAYOUT')$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO settlements (market_id, winning_option_id, resolved_by, total_pool, winning_pool, settlement_mode) VALUES (2, 3, 2, 0, 0, 'PAYOUT')$$, '23514');

UPDATE markets SET status = 'RESOLVED' WHERE id IN (1, 3);
UPDATE positions SET result = 'WON', payout = 167, settled_at = CURRENT_TIMESTAMP WHERE id = 1;
UPDATE positions SET result = 'WON', payout = 83, settled_at = CURRENT_TIMESTAMP WHERE id = 2;
UPDATE positions SET result = 'LOST', payout = 0, settled_at = CURRENT_TIMESTAMP WHERE id = 3;
UPDATE positions SET result = 'REFUNDED', payout = 50, settled_at = CURRENT_TIMESTAMP WHERE id = 4;
UPDATE markets SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
    cancelled_by = 2, cancellation_reason = 'Test cancellation' WHERE id = 4;
UPDATE positions SET result = 'REFUNDED', payout = 50, settled_at = CURRENT_TIMESTAMP WHERE id = 5;
UPDATE wallets SET balance = 1100 WHERE user_id = 1;

INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES
    (1, 167, 'WIN_REWARD', 917, 1),
    (1, 83, 'WIN_REWARD', 1000, 2),
    (2, 0, 'LOSS', 900, 3),
    (1, 50, 'REFUND', 1050, 4),
    (1, 50, 'REFUND', 1100, 5);
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES (1, 167, 'WIN_REWARD', 1267, 1)$$, '23505');
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, position_id) VALUES (1, 100, 'REFUND', 1200, 1)$$, '23505');
SELECT pg_temp.expect_error(
    $$UPDATE positions SET payout = 49 WHERE id = 5$$, '23514');
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after) VALUES (1, 100, 'POINT_REFILL', 1200)$$, '23514');
UPDATE wallets SET balance = 1200 WHERE user_id = 1;
INSERT INTO transactions (user_id, amount, transaction_type, balance_after, request_key)
    VALUES (1, 100, 'POINT_REFILL', 1200, 'refill:claim-1');
SELECT pg_temp.expect_error(
    $$INSERT INTO transactions (user_id, amount, transaction_type, balance_after, request_key) VALUES (1, 100, 'POINT_REFILL', 1300, 'refill:claim-1')$$, '23505');

-- Removing current membership preserves the user's historical stakes and ledger.
DELETE FROM community_members WHERE community_id = 1 AND user_id = 1;
SELECT pg_temp.expect_error($$DELETE FROM users WHERE id = 1$$, '23503');
SELECT pg_temp.expect_error($$DELETE FROM markets WHERE id = 1$$, '23503');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM (VALUES
            (0::bigint,0::bigint,0::bigint), (0,3,0), (1,3,33),
            (2,3,67), (1,8,13), (7,8,88), (3,3,100),
            (1073741823,2147483647,50)
        ) AS examples(correct,total,expected)
        WHERE calculate_prediction_score(correct,total) <> expected
    ) THEN
        RAISE EXCEPTION 'LDR-03: score calculation or rounding is incorrect';
    END IF;
    IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 11 THEN
        RAISE EXCEPTION 'Expected exactly 11 MVP tables';
    END IF;
    IF (SELECT count(*) FROM positions WHERE market_id = 1 AND user_id = 1) <> 2 THEN
        RAISE EXCEPTION 'Same-option additions must retain separate positions';
    END IF;
    IF EXISTS (
        SELECT 1 FROM wallets w
        WHERE w.balance <> (SELECT sum(t.amount) FROM transactions t WHERE t.user_id = w.user_id)
    ) THEN
        RAISE EXCEPTION 'Fixture ledger does not reconcile with balances';
    END IF;
    IF (SELECT sum(payout) FROM positions WHERE market_id = 1) <> 250 THEN
        RAISE EXCEPTION 'Fixture payouts must conserve the market pool';
    END IF;
    IF EXISTS (SELECT 1 FROM settlements WHERE market_id = 4) THEN
        RAISE EXCEPTION 'Cancellation should not record a settlement';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM transactions
        WHERE position_id = 1 AND transaction_type = 'PLACE_POSITION'
            AND reference_type = 'POSITION' AND reference_id = 1
    ) THEN
        RAISE EXCEPTION 'Transaction reference mapping is incorrect';
    END IF;
END;
$$;

ROLLBACK;
\echo 'PASS: schema constraints and representative lifecycle fixture'

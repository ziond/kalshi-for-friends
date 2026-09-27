BEGIN;

-- LDR-03: whole-number accuracy percentage; exact numeric rounding, ties up.
CREATE FUNCTION calculate_prediction_score(correct BIGINT, total BIGINT)
RETURNS BIGINT LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT CASE WHEN total = 0 THEN 0
                ELSE round(correct::numeric * 100 / total)::bigint END;
$$;

UPDATE users SET prediction_score = calculate_prediction_score(correct_predictions, total_predictions);

COMMENT ON COLUMN users.prediction_score IS
    'Rounded accuracy percentage (0-100). Zero with no settled predictions; refunds excluded. One prediction per resolved market.';

COMMIT;

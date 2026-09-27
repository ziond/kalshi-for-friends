BEGIN;
DROP FUNCTION calculate_prediction_score(BIGINT, BIGINT);
COMMENT ON COLUMN users.prediction_score IS NULL;
-- Preserve computed scores; pre-migration values cannot be reconstructed.
COMMIT;

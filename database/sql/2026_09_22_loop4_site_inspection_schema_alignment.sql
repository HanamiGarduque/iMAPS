-- Loop 4: align the local iMAPS Site Inspection schema with the established
-- iMAPS <-> FieldSync completed-result and reinspection contracts.
-- Target: iMAPS PostgreSQL. First applied to local test DB imaps_db_0921;
-- retained as the reproducible handoff for authorized Team Leader deployment.
-- This script is intentionally bounded and does not update historical rows.

BEGIN;

-- FieldSync completion payload compatibility. Existing rows retain NULL.
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS is_compliant boolean NULL,
    ADD COLUMN IF NOT EXISTS findings text NULL;

-- Permit the Planning Officer to create a distinct reinspection round.
ALTER TABLE public.technical_reviews
    DROP CONSTRAINT IF EXISTS technical_reviews_decision_check;

ALTER TABLE public.technical_reviews
    ADD CONSTRAINT technical_reviews_decision_check
    CHECK (
        decision IN (
            'Approved',
            'Needs Site Inspection',
            'Requires Reinspection',
            'Declined'
        )
    );

COMMIT;

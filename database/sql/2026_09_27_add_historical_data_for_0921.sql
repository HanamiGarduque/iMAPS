-- Forward compatibility for the shared 0921-based iMAPS PostgreSQL database.
-- Apply after 2026_09_26_canonical_schema_reconciliation_0921_forward.sql.
-- Merged master MapsController reads historical_data, which the 0921 base lacks.
-- Mirrors 2026_09_23_145135_create_historical_data_table.php exactly:
-- bigint sequence-backed PK, nullable business columns and timestamps(0),
-- no additional indexes, foreign keys, unique constraints or business defaults.
-- No historical rows are imported; no existing data or migration ledger is edited.
-- Take the normal database backup before applying this forward update.
-- Re-running against the matching table is a no-op. Verify the catalog afterwards;
-- IF NOT EXISTS does not repair a differently shaped pre-existing table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.historical_data (
    id bigserial PRIMARY KEY,
    encoding_date date NULL,
    form_number varchar(255) NULL,
    name varchar(255) NULL,
    barangay varchar(255) NULL,
    zoning_code varchar(255) NULL,
    lot_area_sqm numeric(12, 2) NULL,
    application_type varchar(255) NULL,
    purpose text NULL,
    assessment_fee numeric(12, 2) NULL,
    created_at timestamp(0) without time zone NULL,
    updated_at timestamp(0) without time zone NULL
);

COMMIT;

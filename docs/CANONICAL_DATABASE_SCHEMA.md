-- ============================================================
-- CANONICAL DATABASE SCHEMA - iMAPS / FieldSync Bridge
--
-- SOURCE OF TRUTH. Pure SQL. Copy this entire file and execute it against
-- an empty PostgreSQL database to construct the canonical application
-- schema in one controlled run.
--
-- PROVENANCE: generated from the live imaps_db_0921 schema
-- (PostgreSQL 18.3, PostGIS 3.6.2). Every explanation, migration history
-- and rationale lives in docs/FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md.
--
-- SCOPE: schema only, no production data. The Laravel migrations ledger
-- is framework operational history rather than application schema, so
-- Laravel creates it itself and it is intentionally absent here. The
-- leftover diagnostic schema notif_sqlcheck is likewise absent.
--
-- MARKERS: each bracket marker below appears exactly once in this file.
-- The index lists the same IDs without brackets so a change-log reference
-- resolves to exactly one definition and no marker is duplicated.
-- ============================================================

-- ============================================================
-- CANONICAL SCHEMA MARKER INDEX (unbracketed by design)
-- SCHEMA-EXT-001 REQUIRED EXTENSION postgis
-- SCHEMA-SEQ-001 .. SCHEMA-SEQ-023 SEQUENCES backing serial column defaults
-- SCHEMA-IDENT-001 .. SCHEMA-IDENT-001 IDENTITY columns (inline with their table)
-- SCHEMA-SEQOWN-001..014 and SCHEMA-SEQOWN-016..024 SEQUENCE OWNERSHIP (ALTER SEQUENCE OWNED BY; 23 markers, no marker 015)
-- SCHEMA-BASE-001 CORE users TABLE - users
-- SCHEMA-BASE-002 CORE application_drafts TABLE - application_drafts
-- SCHEMA-BASE-003 CORE application_status_tracks TABLE - application_status_tracks
-- SCHEMA-BASE-004 CORE audit_trail TABLE - audit_trail
-- SCHEMA-BASE-005 CORE barangay_boundary TABLE (PostGIS) - barangay_boundary
-- SCHEMA-BASE-006 CORE failed_jobs TABLE - failed_jobs
-- SCHEMA-BASE-007 CORE jobs TABLE - jobs
-- SCHEMA-BASE-008 CORE land_parcels TABLE (PostGIS) - land_parcels
-- SCHEMA-BASE-009 CORE land_use_plan TABLE (PostGIS) - land_use_plan
-- SCHEMA-BASE-010 CORE parcels TABLE (PostGIS) - parcels
-- SCHEMA-BASE-011 CORE rosario_boundary TABLE (PostGIS) - rosario_boundary
-- SCHEMA-BASE-012 CORE sessions TABLE - sessions
-- SCHEMA-BASE-013 CORE site_inspections TABLE - site_inspections
-- SCHEMA-BASE-014 CORE technical_reviews TABLE - technical_reviews
-- SCHEMA-BASE-015 CORE zoning_applications TABLE - zoning_applications
-- SCHEMA-ADD-001 ADDED TABLE forecast_runs - forecast_runs
-- SCHEMA-ADD-002 ADDED TABLE forecast_outputs - forecast_outputs
-- SCHEMA-ADD-003 ADDED TABLE historical_data - historical_data
-- SCHEMA-ADD-004 ADDED TABLE notifications - notifications
-- SCHEMA-ADD-005 ADDED TABLE application_po_assignments (ownership history) - application_po_assignments
-- SCHEMA-ADD-006 ADDED TABLE site_inspection_assignments (ownership history) - site_inspection_assignments
-- SCHEMA-ADD-007 ADDED TABLE inspection_delivery_attempts (delivery monitoring) - inspection_delivery_attempts
-- SCHEMA-ADD-008 ADDED TABLE generated_permits - generated_permits
-- SCHEMA-ADD-009 ADDED TABLE report_action_audit - report_action_audit
-- SCHEMA-ADD-010 ADDED TABLE report_escalations - report_escalations
-- SCHEMA-ADD-011 LEGACY RETAINED TABLE application_sequences - application_sequences
-- SCHEMA-CON-001 .. SCHEMA-CON-061 CONSTRAINTS (pk, unique, check, foreign key)
-- SCHEMA-IDX-001 .. SCHEMA-IDX-029 INDEXES
-- SCHEMA-POL-001 .. SCHEMA-POL-002 POLICY DEFINITIONS (Supabase-managed storage policies and FieldSync metadata constraints), guarded application
-- ============================================================

-- ============================================================
-- [SCHEMA-EXT-001] REQUIRED EXTENSION postgis
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';;

-- ============================================================
-- SEQUENCES backing column defaults
-- ============================================================

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-001] SEQUENCE application_drafts_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.application_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-002] SEQUENCE application_po_assignments_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.application_po_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-003] SEQUENCE application_status_tracks_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.application_status_tracks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-004] SEQUENCE audit_trail_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.audit_trail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-005] SEQUENCE barangay_boundary_gid_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.barangay_boundary_gid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-006] SEQUENCE failed_jobs_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.failed_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-007] SEQUENCE forecast_outputs_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.forecast_outputs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-008] SEQUENCE forecast_runs_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.forecast_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-009] SEQUENCE generated_permits_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.generated_permits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-010] SEQUENCE historical_data_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.historical_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-011] SEQUENCE inspection_delivery_attempts_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.inspection_delivery_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-012] SEQUENCE jobs_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-013] SEQUENCE land_parcels_gid_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.land_parcels_gid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-014] SEQUENCE land_use_plan_gid_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.land_use_plan_gid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-015] SEQUENCE notifications_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-016] SEQUENCE parcels_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.parcels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-017] SEQUENCE report_action_audit_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.report_action_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-018] SEQUENCE report_escalations_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.report_escalations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-019] SEQUENCE rosario_boundary_gid_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.rosario_boundary_gid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-020] SEQUENCE site_inspection_assignments_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.site_inspection_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-021] SEQUENCE site_inspections_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.site_inspections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-022] SEQUENCE users_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ------------------------------------------------------------
-- [SCHEMA-SEQ-023] SEQUENCE zoning_applications_id_seq
-- ------------------------------------------------------------
CREATE SEQUENCE public.zoning_applications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- ============================================================
-- TABLES
-- ============================================================

-- ------------------------------------------------------------
-- [SCHEMA-BASE-001] CORE users TABLE - users
-- ------------------------------------------------------------

CREATE TABLE public.users (
    id bigint NOT NULL,
    email character varying(80) NOT NULL,
    password character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(255) DEFAULT 'Planning Officer'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login timestamp(0) without time zone,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(0) without time zone,
    handshake_key character varying,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('Planning Officer'::character varying)::text, ('Admin'::character varying)::text, ('Site Inspector'::character varying)::text])))
);
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-023] SEQUENCE OWNERSHIP - users_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-002] CORE application_drafts TABLE - application_drafts
-- ------------------------------------------------------------

CREATE TABLE public.application_drafts (
    id bigint NOT NULL,
    temp_reference_number character varying(255) NOT NULL,
    user_id bigint NOT NULL,
    applicant_name character varying(255),
    application_type character varying(255),
    barangay character varying(255),
    status character varying(255) DEFAULT 'Auto-saved'::character varying NOT NULL,
    form_payload json,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.application_drafts ALTER COLUMN id SET DEFAULT nextval('public.application_drafts_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-001] SEQUENCE OWNERSHIP - application_drafts_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.application_drafts_id_seq OWNED BY public.application_drafts.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-003] CORE application_status_tracks TABLE - application_status_tracks
-- ------------------------------------------------------------

CREATE TABLE public.application_status_tracks (
    id bigint NOT NULL,
    reference_number character varying(255) NOT NULL,
    masked_applicant_name character varying(255) NOT NULL,
    status character varying(255) NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE ONLY public.application_status_tracks ALTER COLUMN id SET DEFAULT nextval('public.application_status_tracks_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-003] SEQUENCE OWNERSHIP - application_status_tracks_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.application_status_tracks_id_seq OWNED BY public.application_status_tracks.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-004] CORE audit_trail TABLE - audit_trail
-- ------------------------------------------------------------

CREATE TABLE public.audit_trail (
    id bigint NOT NULL,
    application_id integer NOT NULL,
    action character varying(60) NOT NULL,
    performed_by integer NOT NULL,
    note text,
    performed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE ONLY public.audit_trail ALTER COLUMN id SET DEFAULT nextval('public.audit_trail_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-004] SEQUENCE OWNERSHIP - audit_trail_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.audit_trail_id_seq OWNED BY public.audit_trail.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-005] CORE barangay_boundary TABLE (PostGIS) - barangay_boundary
-- ------------------------------------------------------------

CREATE TABLE public.barangay_boundary (
    gid integer NOT NULL,
    location character varying(50),
    shape_leng numeric,
    shape_area numeric,
    land_area numeric,
    geom public.geometry(MultiPolygon,4326)
);
ALTER TABLE ONLY public.barangay_boundary ALTER COLUMN gid SET DEFAULT nextval('public.barangay_boundary_gid_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-005] SEQUENCE OWNERSHIP - barangay_boundary_gid_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.barangay_boundary_gid_seq OWNED BY public.barangay_boundary.gid;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-006] CORE failed_jobs TABLE - failed_jobs
-- ------------------------------------------------------------

CREATE TABLE public.failed_jobs (
    id bigint NOT NULL,
    uuid character varying(255) NOT NULL,
    connection text NOT NULL,
    queue text NOT NULL,
    payload text NOT NULL,
    exception text NOT NULL,
    failed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE ONLY public.failed_jobs ALTER COLUMN id SET DEFAULT nextval('public.failed_jobs_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-006] SEQUENCE OWNERSHIP - failed_jobs_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.failed_jobs_id_seq OWNED BY public.failed_jobs.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-007] CORE jobs TABLE - jobs
-- ------------------------------------------------------------

CREATE TABLE public.jobs (
    id bigint NOT NULL,
    queue character varying(255) NOT NULL,
    payload text NOT NULL,
    attempts smallint NOT NULL,
    reserved_at integer,
    available_at integer NOT NULL,
    created_at integer NOT NULL
);
ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT nextval('public.jobs_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-012] SEQUENCE OWNERSHIP - jobs_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-008] CORE land_parcels TABLE (PostGIS) - land_parcels
-- ------------------------------------------------------------

CREATE TABLE public.land_parcels (
    gid integer NOT NULL,
    barangay character varying(80),
    lot_area_sqm numeric,
    land_use_class character varying(80),
    parcel_code character varying(80),
    survey_number character varying(80),
    location_address character varying(80),
    owner_name character varying(80),
    lot_number character varying(80),
    property_index_number character varying(80),
    tct_number character varying(80),
    tax_dec_number character varying(80),
    arp_number character varying(80),
    source character varying(80),
    geom public.geometry(MultiPolygon,4326)
);
ALTER TABLE ONLY public.land_parcels ALTER COLUMN gid SET DEFAULT nextval('public.land_parcels_gid_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-013] SEQUENCE OWNERSHIP - land_parcels_gid_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.land_parcels_gid_seq OWNED BY public.land_parcels.gid;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-009] CORE land_use_plan TABLE (PostGIS) - land_use_plan
-- ------------------------------------------------------------

CREATE TABLE public.land_use_plan (
    gid integer NOT NULL,
    location character varying(50),
    lup_2030 character varying(50),
    shape_leng numeric,
    shape_area numeric,
    geom public.geometry(MultiPolygon,4326)
);
ALTER TABLE ONLY public.land_use_plan ALTER COLUMN gid SET DEFAULT nextval('public.land_use_plan_gid_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-014] SEQUENCE OWNERSHIP - land_use_plan_gid_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.land_use_plan_gid_seq OWNED BY public.land_use_plan.gid;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-010] CORE parcels TABLE (PostGIS) - parcels
-- ------------------------------------------------------------

CREATE TABLE public.parcels (
    id bigint NOT NULL,
    zoning_application_id bigint NOT NULL,
    parcel_code character varying(20) NOT NULL,
    lot_number character varying(100),
    tct_number character varying(100),
    tax_dec_number character varying(100),
    lot_area_sqm numeric(12,4),
    latitude numeric(10,7),
    longitude numeric(10,7),
    boundary public.geometry(Polygon,4326),
    land_use_class character varying(100),
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(0) without time zone,
    property_index_number character varying(50),
    barangay character varying(100),
    location_address text,
    owner_name character varying(100),
    arp_number character varying,
    survey_number character varying
);
ALTER TABLE ONLY public.parcels ALTER COLUMN id SET DEFAULT nextval('public.parcels_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-017] SEQUENCE OWNERSHIP - parcels_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.parcels_id_seq OWNED BY public.parcels.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-011] CORE rosario_boundary TABLE (PostGIS) - rosario_boundary
-- ------------------------------------------------------------

CREATE TABLE public.rosario_boundary (
    gid integer NOT NULL,
    id double precision,
    geom public.geometry(MultiPolygon,4326)
);
ALTER TABLE ONLY public.rosario_boundary ALTER COLUMN gid SET DEFAULT nextval('public.rosario_boundary_gid_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-020] SEQUENCE OWNERSHIP - rosario_boundary_gid_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.rosario_boundary_gid_seq OWNED BY public.rosario_boundary.gid;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-012] CORE sessions TABLE - sessions
-- ------------------------------------------------------------

CREATE TABLE public.sessions (
    id character varying(255) NOT NULL,
    user_id bigint,
    ip_address character varying(45),
    user_agent text,
    payload text NOT NULL,
    last_activity integer NOT NULL
);

-- ------------------------------------------------------------
-- [SCHEMA-BASE-013] CORE site_inspections TABLE - site_inspections
-- ------------------------------------------------------------

CREATE TABLE public.site_inspections (
    id bigint NOT NULL,
    zoning_application_id bigint NOT NULL,
    inspector_id bigint,
    status character varying(255) DEFAULT 'assigned'::character varying NOT NULL,
    scheduled_date date,
    completed_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    assigned_notes text,
    parcel_id bigint,
    deadline_date date,
    assigned_by_imaps_user_id bigint,
    assigned_by_name character varying(255),
    submitted_at timestamp(0) without time zone,
    inspection_result character varying(255),
    observations text,
    discrepancies text,
    recommendations text,
    inspector_notes text,
    checklist_data json,
    confirmed_latitude double precision,
    confirmed_longitude double precision,
    gps_accuracy_m double precision,
    gps_confirmed_at timestamp(0) without time zone,
    is_compliant boolean,
    findings text,
    delivery_status character varying(32),
    last_delivery_attempt_at timestamp without time zone,
    delivered_at timestamp without time zone,
    last_delivery_failure_category character varying(48),
    CONSTRAINT site_inspections_delivered_at_present_check CHECK ((((delivery_status)::text IS DISTINCT FROM 'delivered'::text) OR (delivered_at IS NOT NULL))),
    CONSTRAINT site_inspections_delivery_failure_category_check CHECK (((last_delivery_failure_category IS NULL) OR ((last_delivery_failure_category)::text = ANY (ARRAY[('inspector_mapping_unresolved'::character varying)::text, ('supabase_unreachable'::character varying)::text, ('authentication_failure'::character varying)::text, ('remote_constraint_failure'::character varying)::text, ('remote_validation_failure'::character varying)::text, ('configuration_failure'::character varying)::text, ('unknown'::character varying)::text])))),
    CONSTRAINT site_inspections_delivery_status_check CHECK (((delivery_status IS NULL) OR ((delivery_status)::text = ANY (ARRAY[('pending_delivery'::character varying)::text, ('delivered'::character varying)::text, ('delivery_failed'::character varying)::text]))))
);
ALTER TABLE ONLY public.site_inspections ALTER COLUMN id SET DEFAULT nextval('public.site_inspections_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-022] SEQUENCE OWNERSHIP - site_inspections_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.site_inspections_id_seq OWNED BY public.site_inspections.id;

-- ------------------------------------------------------------
-- [SCHEMA-BASE-014] CORE technical_reviews TABLE - technical_reviews
-- ------------------------------------------------------------

CREATE TABLE public.technical_reviews (
    id bigint NOT NULL,
    zoning_application_id bigint NOT NULL,
    reviewed_by bigint NOT NULL,
    review_round smallint DEFAULT 1 NOT NULL,
    decision character varying(30) NOT NULL,
    findings text,
    decision_reason text,
    site_inspection_task_id bigint,
    reviewed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(0) without time zone,
    parcel_id bigint,
    reviewed_site_inspection_id bigint,
    CONSTRAINT technical_reviews_decision_check CHECK (((decision)::text = ANY (ARRAY[('Approved'::character varying)::text, ('Needs Site Inspection'::character varying)::text, ('Requires Reinspection'::character varying)::text, ('Declined'::character varying)::text])))
);

-- [SCHEMA-IDENT-001] IDENTITY SEQUENCE FOR technical_reviews
ALTER TABLE public.technical_reviews ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.technical_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- ------------------------------------------------------------
-- [SCHEMA-BASE-015] CORE zoning_applications TABLE - zoning_applications
-- ------------------------------------------------------------

CREATE TABLE public.zoning_applications (
    id bigint NOT NULL,
    reference_number character varying(30) NOT NULL,
    application_type character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'Received'::character varying NOT NULL,
    purpose text NOT NULL,
    applicant_name character varying(255) NOT NULL,
    contact_number character varying(15) NOT NULL,
    email character varying(255),
    representative_name character varying(255),
    barangay character varying(100) NOT NULL,
    assessment_fee numeric(12,2),
    or_number character varying(50),
    remarks text,
    encoded_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone,
    form_number character varying(100),
    target_land_use_class character varying(100),
    corporation_name character varying(255),
    corporation_contact character varying(15),
    corporation_address text,
    building_area numeric(12,4),
    area_to_develop numeric(12,4),
    number_of_saleable_lots integer,
    project_type_business_name character varying(255),
    project_cost numeric(15,2),
    right_over_land character varying(100),
    project_tenure character varying(100),
    preferred_release_mode character varying(100),
    application_stream character varying(100) DEFAULT 'Permit'::character varying,
    sb_ordinance_number character varying(100),
    dar_clearance_ref character varying(100),
    representative_address character varying(100),
    representative_contact character varying(100),
    zoning_certificate_fee numeric(12,2) DEFAULT 0 NOT NULL,
    locational_clearance_fee numeric(12,2) DEFAULT 0 NOT NULL,
    development_permit_fee numeric(12,2) DEFAULT 0 NOT NULL,
    other_fees numeric(12,2) DEFAULT 0 NOT NULL,
    penalty_fee numeric(12,2) DEFAULT 0 NOT NULL,
    date_of_receipt date,
    assigned_planning_officer_id bigint,
    applicant_street character varying(255),
    applicant_barangay character varying(255),
    CONSTRAINT zoning_applications_status_check CHECK (((status)::text = ANY (ARRAY[('Received'::character varying)::text, ('Technical Review'::character varying)::text, ('Under Sangguniang Bayan'::character varying)::text, ('For Release'::character varying)::text, ('Released'::character varying)::text, ('Denied'::character varying)::text])))
);

-- assigned_planning_officer_id is NULL for applications that were never
-- assigned a Planning Officer. NOT backfilled: ownership is recorded only
-- when an officer is actually assigned, so no application is given an owner
-- by inference. See the ownership-history table below.
ALTER TABLE ONLY public.zoning_applications ALTER COLUMN id SET DEFAULT nextval('public.zoning_applications_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-024] SEQUENCE OWNERSHIP - zoning_applications_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.zoning_applications_id_seq OWNED BY public.zoning_applications.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-001] ADDED TABLE forecast_runs - forecast_runs
-- ------------------------------------------------------------

CREATE TABLE public.forecast_runs (
    id bigint NOT NULL,
    application_type character varying(255),
    forecast_periods integer DEFAULT 6 NOT NULL,
    model_metrics json,
    historical_data json,
    triggered_by character varying(255),
    executed_at timestamp(0) without time zone NOT NULL,
    status character varying(255) NOT NULL,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.forecast_runs ALTER COLUMN id SET DEFAULT nextval('public.forecast_runs_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-008] SEQUENCE OWNERSHIP - forecast_runs_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.forecast_runs_id_seq OWNED BY public.forecast_runs.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-002] ADDED TABLE forecast_outputs - forecast_outputs
-- ------------------------------------------------------------

CREATE TABLE public.forecast_outputs (
    id bigint NOT NULL,
    forecast_run_id bigint NOT NULL,
    forecast_date date NOT NULL,
    mean_value numeric(10,2) NOT NULL,
    lower_ci numeric(10,2),
    upper_ci numeric(10,2),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.forecast_outputs ALTER COLUMN id SET DEFAULT nextval('public.forecast_outputs_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-007] SEQUENCE OWNERSHIP - forecast_outputs_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.forecast_outputs_id_seq OWNED BY public.forecast_outputs.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-003] ADDED TABLE historical_data - historical_data
-- ------------------------------------------------------------

CREATE TABLE public.historical_data (
    id bigint NOT NULL,
    encoding_date date,
    form_number character varying(255),
    name character varying(255),
    barangay character varying(255),
    zoning_code character varying(255),
    lot_area_sqm numeric(12,2),
    application_type character varying(255),
    purpose text,
    assessment_fee numeric(12,2),
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.historical_data ALTER COLUMN id SET DEFAULT nextval('public.historical_data_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-010] SEQUENCE OWNERSHIP - historical_data_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.historical_data_id_seq OWNED BY public.historical_data.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-004] ADDED TABLE notifications - notifications
-- ------------------------------------------------------------

CREATE TABLE public.notifications (
    id bigint NOT NULL,
    user_id bigint,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(255) DEFAULT 'system_alert'::character varying NOT NULL,
    action_url character varying(255),
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp(0) without time zone,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-016] SEQUENCE OWNERSHIP - notifications_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-005] ADDED TABLE application_po_assignments (ownership history) - application_po_assignments
-- ------------------------------------------------------------

CREATE TABLE public.application_po_assignments (
    id bigint NOT NULL,
    zoning_application_id bigint NOT NULL,
    assignment_type character varying(20) NOT NULL,
    from_planning_officer_id bigint,
    to_planning_officer_id bigint NOT NULL,
    reason character varying(30),
    reason_note text,
    reassigned_by bigint NOT NULL,
    reassigned_at timestamp(0) without time zone NOT NULL,
    CONSTRAINT app_po_assignments_from_check CHECK (((((assignment_type)::text = 'initial'::text) AND (from_planning_officer_id IS NULL)) OR (((assignment_type)::text = 'reassignment'::text) AND (from_planning_officer_id IS NOT NULL)))),
    CONSTRAINT app_po_assignments_other_note_check CHECK ((((reason)::text IS DISTINCT FROM 'Other'::text) OR ((reason_note IS NOT NULL) AND (btrim(reason_note) <> ''::text)))),
    CONSTRAINT app_po_assignments_reason_check CHECK (((((assignment_type)::text = 'initial'::text) AND (reason IS NULL)) OR (((assignment_type)::text = 'reassignment'::text) AND (reason IS NOT NULL) AND ((reason)::text = ANY (ARRAY[('Absent'::character varying)::text, ('On Leave'::character varying)::text, ('Workload Transfer'::character varying)::text, ('Unavailable'::character varying)::text, ('Other'::character varying)::text]))))),
    CONSTRAINT app_po_assignments_type_check CHECK (((assignment_type)::text = ANY (ARRAY[('initial'::character varying)::text, ('reassignment'::character varying)::text])))
);
ALTER TABLE ONLY public.application_po_assignments ALTER COLUMN id SET DEFAULT nextval('public.application_po_assignments_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-002] SEQUENCE OWNERSHIP - application_po_assignments_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.application_po_assignments_id_seq OWNED BY public.application_po_assignments.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-006] ADDED TABLE site_inspection_assignments (ownership history) - site_inspection_assignments
-- ------------------------------------------------------------

CREATE TABLE public.site_inspection_assignments (
    id bigint NOT NULL,
    site_inspection_id bigint NOT NULL,
    assignment_type character varying(20) NOT NULL,
    from_inspector_id bigint,
    to_inspector_id bigint NOT NULL,
    reason character varying(30),
    reason_note text,
    reassigned_by bigint NOT NULL,
    reassigned_at timestamp(0) without time zone NOT NULL,
    CONSTRAINT site_insp_assignments_from_check CHECK (((((assignment_type)::text = 'initial'::text) AND (from_inspector_id IS NULL)) OR (((assignment_type)::text = 'reassignment'::text) AND (from_inspector_id IS NOT NULL)))),
    CONSTRAINT site_insp_assignments_other_note_check CHECK ((((reason)::text IS DISTINCT FROM 'Other'::text) OR ((reason_note IS NOT NULL) AND (btrim(reason_note) <> ''::text)))),
    CONSTRAINT site_insp_assignments_reason_check CHECK (((((assignment_type)::text = 'initial'::text) AND (reason IS NULL)) OR (((assignment_type)::text = 'reassignment'::text) AND (reason IS NOT NULL) AND ((reason)::text = ANY (ARRAY[('Absent'::character varying)::text, ('On Leave'::character varying)::text, ('Workload Transfer'::character varying)::text, ('Unavailable'::character varying)::text, ('Other'::character varying)::text]))))),
    CONSTRAINT site_insp_assignments_type_check CHECK (((assignment_type)::text = ANY (ARRAY[('initial'::character varying)::text, ('reassignment'::character varying)::text])))
);
ALTER TABLE ONLY public.site_inspection_assignments ALTER COLUMN id SET DEFAULT nextval('public.site_inspection_assignments_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-021] SEQUENCE OWNERSHIP - site_inspection_assignments_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.site_inspection_assignments_id_seq OWNED BY public.site_inspection_assignments.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-007] ADDED TABLE inspection_delivery_attempts (delivery monitoring) - inspection_delivery_attempts
-- ------------------------------------------------------------

CREATE TABLE public.inspection_delivery_attempts (
    id bigint NOT NULL,
    site_inspection_id bigint NOT NULL,
    attempt_number integer NOT NULL,
    source character varying(32) NOT NULL,
    outcome character varying(16) NOT NULL,
    failure_category character varying(48),
    safe_message text,
    attempted_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    queue_job_uuid uuid,
    CONSTRAINT inspection_delivery_attempts_attempt_number_check CHECK ((attempt_number >= 1)),
    CONSTRAINT inspection_delivery_attempts_completed_at_check CHECK ((((outcome)::text = 'pending'::text) OR (completed_at IS NOT NULL))),
    CONSTRAINT inspection_delivery_attempts_failure_category_check CHECK (((((outcome)::text = 'failed'::text) AND (failure_category IS NOT NULL) AND ((failure_category)::text = ANY (ARRAY[('inspector_mapping_unresolved'::character varying)::text, ('supabase_unreachable'::character varying)::text, ('authentication_failure'::character varying)::text, ('remote_constraint_failure'::character varying)::text, ('remote_validation_failure'::character varying)::text, ('configuration_failure'::character varying)::text, ('unknown'::character varying)::text]))) OR (((outcome)::text = ANY (ARRAY[('pending'::character varying)::text, ('delivered'::character varying)::text])) AND (failure_category IS NULL)))),
    CONSTRAINT inspection_delivery_attempts_outcome_check CHECK (((outcome)::text = ANY (ARRAY[('pending'::character varying)::text, ('delivered'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT inspection_delivery_attempts_source_check CHECK (((source)::text = ANY (ARRAY[('initial_dispatch'::character varying)::text, ('automatic_retry'::character varying)::text, ('planning_officer_retry'::character varying)::text, ('legacy_reconciliation'::character varying)::text])))
);
ALTER TABLE ONLY public.inspection_delivery_attempts ALTER COLUMN id SET DEFAULT nextval('public.inspection_delivery_attempts_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-011] SEQUENCE OWNERSHIP - inspection_delivery_attempts_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.inspection_delivery_attempts_id_seq OWNED BY public.inspection_delivery_attempts.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-008] ADDED TABLE generated_permits - generated_permits
-- ------------------------------------------------------------

CREATE TABLE public.generated_permits (
    id bigint NOT NULL,
    zoning_application_id bigint NOT NULL,
    permit_type character varying(50) NOT NULL,
    permit_name character varying(150) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(255) NOT NULL,
    file_format character varying(20) DEFAULT 'pdf'::character varying NOT NULL,
    file_size bigint DEFAULT '0'::bigint NOT NULL,
    input_data json,
    generated_by bigint,
    created_at timestamp(0) without time zone,
    updated_at timestamp(0) without time zone
);
ALTER TABLE ONLY public.generated_permits ALTER COLUMN id SET DEFAULT nextval('public.generated_permits_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-009] SEQUENCE OWNERSHIP - generated_permits_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.generated_permits_id_seq OWNED BY public.generated_permits.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-009] ADDED TABLE report_action_audit - report_action_audit
-- ------------------------------------------------------------

CREATE TABLE public.report_action_audit (
    id bigint NOT NULL,
    report_id uuid NOT NULL,
    action character varying(60) NOT NULL,
    from_status character varying(20) NOT NULL,
    to_status character varying(20) NOT NULL,
    performed_by bigint NOT NULL,
    performed_by_name character varying(255) NOT NULL,
    performed_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT report_action_audit_action_ck CHECK (((action)::text = ANY ((ARRAY['report_review_started'::character varying, 'report_resolved'::character varying, 'report_wont_fix'::character varying])::text[]))),
    CONSTRAINT report_action_audit_from_status_ck CHECK (((from_status)::text = ANY ((ARRAY['submitted'::character varying, 'in_review'::character varying])::text[]))),
    CONSTRAINT report_action_audit_to_status_ck CHECK (((to_status)::text = ANY ((ARRAY['in_review'::character varying, 'resolved'::character varying, 'wont_fix'::character varying])::text[]))),
    CONSTRAINT report_action_audit_transition_ck CHECK (((((action)::text = 'report_review_started'::text) AND ((from_status)::text = 'submitted'::text) AND ((to_status)::text = 'in_review'::text)) OR (((action)::text = 'report_resolved'::text) AND ((from_status)::text = ANY ((ARRAY['submitted'::character varying, 'in_review'::character varying])::text[])) AND ((to_status)::text = 'resolved'::text)) OR (((action)::text = 'report_wont_fix'::text) AND ((from_status)::text = ANY ((ARRAY['submitted'::character varying, 'in_review'::character varying])::text[])) AND ((to_status)::text = 'wont_fix'::text))))
);
ALTER TABLE ONLY public.report_action_audit ALTER COLUMN id SET DEFAULT nextval('public.report_action_audit_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-018] SEQUENCE OWNERSHIP - report_action_audit_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.report_action_audit_id_seq OWNED BY public.report_action_audit.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-010] ADDED TABLE report_escalations - report_escalations
-- ------------------------------------------------------------

CREATE TABLE public.report_escalations (
    id bigint NOT NULL,
    report_id uuid NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    created_by bigint NOT NULL,
    created_at timestamp(0) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    recommendation text,
    recommendation_recorded_by bigint,
    recommendation_at timestamp(0) without time zone,
    closed_by bigint,
    closed_at timestamp(0) without time zone,
    closure_note text,
    CONSTRAINT report_escalations_closed_ck CHECK ((((status)::text <> 'closed'::text) OR ((closed_by IS NOT NULL) AND (closed_at IS NOT NULL)))),
    CONSTRAINT report_escalations_closure_explained_ck CHECK ((((status)::text <> 'closed'::text) OR (recommendation IS NOT NULL) OR (closure_note IS NOT NULL))),
    CONSTRAINT report_escalations_closure_note_ck CHECK (((closure_note IS NULL) OR ((length(closure_note) <= 2000) AND (btrim(regexp_replace(closure_note, '\s'::text, ''::text, 'g'::text)) <> ''::text)))),
    CONSTRAINT report_escalations_open_ck CHECK ((((status)::text <> 'open'::text) OR ((closed_by IS NULL) AND (closed_at IS NULL) AND (closure_note IS NULL)))),
    CONSTRAINT report_escalations_recommendation_actor_ck CHECK ((((recommendation IS NULL) AND (recommendation_recorded_by IS NULL) AND (recommendation_at IS NULL)) OR ((recommendation IS NOT NULL) AND (recommendation_recorded_by IS NOT NULL) AND (recommendation_at IS NOT NULL)))),
    CONSTRAINT report_escalations_recommendation_text_ck CHECK (((recommendation IS NULL) OR ((length(recommendation) <= 2000) AND (btrim(regexp_replace(recommendation, '\s'::text, ''::text, 'g'::text)) <> ''::text)))),
    CONSTRAINT report_escalations_status_ck CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[])))
);
ALTER TABLE ONLY public.report_escalations ALTER COLUMN id SET DEFAULT nextval('public.report_escalations_id_seq'::regclass);

-- ------------------------------------------------------------
-- [SCHEMA-SEQOWN-019] SEQUENCE OWNERSHIP - report_escalations_id_seq
-- ------------------------------------------------------------
ALTER SEQUENCE public.report_escalations_id_seq OWNED BY public.report_escalations.id;

-- ------------------------------------------------------------
-- [SCHEMA-ADD-011] LEGACY RETAINED TABLE application_sequences - application_sequences
-- ------------------------------------------------------------

CREATE TABLE public.application_sequences (
    type_code character varying(4) NOT NULL,
    year integer NOT NULL,
    last_seq integer NOT NULL
);

-- ============================================================
-- CONSTRAINTS
-- ============================================================

-- ------------------------------------------------------------
-- [SCHEMA-CON-001] CONSTRAINT ON application_drafts (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_drafts
    ADD CONSTRAINT application_drafts_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-002] CONSTRAINT ON application_drafts (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_drafts
    ADD CONSTRAINT application_drafts_temp_reference_number_unique UNIQUE (temp_reference_number);

-- ------------------------------------------------------------
-- [SCHEMA-CON-003] CONSTRAINT ON application_po_assignments (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_po_assignments
    ADD CONSTRAINT application_po_assignments_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-004] CONSTRAINT ON application_sequences (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_sequences
    ADD CONSTRAINT application_sequences_pkey PRIMARY KEY (type_code, year);

-- ------------------------------------------------------------
-- [SCHEMA-CON-005] CONSTRAINT ON application_status_tracks (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_status_tracks
    ADD CONSTRAINT application_status_tracks_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-006] CONSTRAINT ON audit_trail (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.audit_trail
    ADD CONSTRAINT audit_trail_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-007] CONSTRAINT ON barangay_boundary (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.barangay_boundary
    ADD CONSTRAINT barangay_boundary_pkey PRIMARY KEY (gid);

-- ------------------------------------------------------------
-- [SCHEMA-CON-008] CONSTRAINT ON failed_jobs (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-009] CONSTRAINT ON failed_jobs (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.failed_jobs
    ADD CONSTRAINT failed_jobs_uuid_unique UNIQUE (uuid);

-- ------------------------------------------------------------
-- [SCHEMA-CON-010] CONSTRAINT ON forecast_outputs (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.forecast_outputs
    ADD CONSTRAINT forecast_outputs_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-011] CONSTRAINT ON forecast_runs (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.forecast_runs
    ADD CONSTRAINT forecast_runs_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-012] CONSTRAINT ON generated_permits (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.generated_permits
    ADD CONSTRAINT generated_permits_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-013] CONSTRAINT ON historical_data (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.historical_data
    ADD CONSTRAINT historical_data_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-014] CONSTRAINT ON inspection_delivery_attempts (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.inspection_delivery_attempts
    ADD CONSTRAINT inspection_delivery_attempts_inspection_attempt_unique UNIQUE (site_inspection_id, attempt_number);

-- ------------------------------------------------------------
-- [SCHEMA-CON-015] CONSTRAINT ON inspection_delivery_attempts (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.inspection_delivery_attempts
    ADD CONSTRAINT inspection_delivery_attempts_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-016] CONSTRAINT ON jobs (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-017] CONSTRAINT ON land_parcels (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.land_parcels
    ADD CONSTRAINT land_parcels_pkey PRIMARY KEY (gid);

-- ------------------------------------------------------------
-- [SCHEMA-CON-018] CONSTRAINT ON land_use_plan (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.land_use_plan
    ADD CONSTRAINT land_use_plan_pkey PRIMARY KEY (gid);

-- ------------------------------------------------------------
-- [SCHEMA-CON-019] CONSTRAINT ON notifications (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-020] CONSTRAINT ON parcels (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.parcels
    ADD CONSTRAINT parcels_application_id_parcel_code_unique UNIQUE (zoning_application_id, parcel_code);

-- ------------------------------------------------------------
-- [SCHEMA-CON-021] CONSTRAINT ON parcels (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.parcels
    ADD CONSTRAINT parcels_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-022] CONSTRAINT ON report_action_audit (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_action_audit
    ADD CONSTRAINT report_action_audit_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-023] CONSTRAINT ON report_action_audit (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_action_audit
    ADD CONSTRAINT report_action_audit_report_id_action_unique UNIQUE (report_id, action);

-- ------------------------------------------------------------
-- [SCHEMA-CON-024] CONSTRAINT ON report_escalations (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_escalations
    ADD CONSTRAINT report_escalations_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-025] CONSTRAINT ON rosario_boundary (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.rosario_boundary
    ADD CONSTRAINT rosario_boundary_pkey PRIMARY KEY (gid);

-- ------------------------------------------------------------
-- [SCHEMA-CON-026] CONSTRAINT ON sessions (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-027] CONSTRAINT ON site_inspection_assignments (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspection_assignments
    ADD CONSTRAINT site_inspection_assignments_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-028] CONSTRAINT ON site_inspections (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspections
    ADD CONSTRAINT site_inspections_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-029] CONSTRAINT ON technical_reviews (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.technical_reviews
    ADD CONSTRAINT technical_reviews_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-030] CONSTRAINT ON users (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);

-- ------------------------------------------------------------
-- [SCHEMA-CON-031] CONSTRAINT ON users (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-032] CONSTRAINT ON zoning_applications (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.zoning_applications
    ADD CONSTRAINT zoning_applications_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------
-- [SCHEMA-CON-033] CONSTRAINT ON zoning_applications (CONSTRAINT)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.zoning_applications
    ADD CONSTRAINT zoning_applications_reference_number_unique UNIQUE (reference_number);

-- ------------------------------------------------------------
-- [SCHEMA-CON-034] CONSTRAINT ON application_po_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_po_assignments
    ADD CONSTRAINT app_po_assignments_actor_foreign FOREIGN KEY (reassigned_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-035] CONSTRAINT ON application_po_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_po_assignments
    ADD CONSTRAINT app_po_assignments_application_foreign FOREIGN KEY (zoning_application_id) REFERENCES public.zoning_applications(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-036] CONSTRAINT ON application_po_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_po_assignments
    ADD CONSTRAINT app_po_assignments_from_po_foreign FOREIGN KEY (from_planning_officer_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-037] CONSTRAINT ON application_po_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_po_assignments
    ADD CONSTRAINT app_po_assignments_to_po_foreign FOREIGN KEY (to_planning_officer_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-038] CONSTRAINT ON application_drafts (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.application_drafts
    ADD CONSTRAINT application_drafts_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-039] CONSTRAINT ON forecast_outputs (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.forecast_outputs
    ADD CONSTRAINT forecast_outputs_forecast_run_id_foreign FOREIGN KEY (forecast_run_id) REFERENCES public.forecast_runs(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-040] CONSTRAINT ON generated_permits (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.generated_permits
    ADD CONSTRAINT generated_permits_generated_by_foreign FOREIGN KEY (generated_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-041] CONSTRAINT ON generated_permits (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.generated_permits
    ADD CONSTRAINT generated_permits_zoning_application_id_foreign FOREIGN KEY (zoning_application_id) REFERENCES public.zoning_applications(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-042] CONSTRAINT ON inspection_delivery_attempts (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.inspection_delivery_attempts
    ADD CONSTRAINT inspection_delivery_attempts_inspection_foreign FOREIGN KEY (site_inspection_id) REFERENCES public.site_inspections(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-043] CONSTRAINT ON notifications (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_foreign FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-044] CONSTRAINT ON parcels (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.parcels
    ADD CONSTRAINT parcels_zoning_application_id_foreign FOREIGN KEY (zoning_application_id) REFERENCES public.zoning_applications(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-045] CONSTRAINT ON report_action_audit (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_action_audit
    ADD CONSTRAINT report_action_audit_performed_by_foreign FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-046] CONSTRAINT ON report_escalations (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_escalations
    ADD CONSTRAINT report_escalations_closed_by_foreign FOREIGN KEY (closed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-047] CONSTRAINT ON report_escalations (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_escalations
    ADD CONSTRAINT report_escalations_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-048] CONSTRAINT ON report_escalations (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.report_escalations
    ADD CONSTRAINT report_escalations_recommendation_recorded_by_foreign FOREIGN KEY (recommendation_recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-049] CONSTRAINT ON site_inspection_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspection_assignments
    ADD CONSTRAINT site_insp_assignments_actor_foreign FOREIGN KEY (reassigned_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-050] CONSTRAINT ON site_inspection_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspection_assignments
    ADD CONSTRAINT site_insp_assignments_from_si_foreign FOREIGN KEY (from_inspector_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-051] CONSTRAINT ON site_inspection_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspection_assignments
    ADD CONSTRAINT site_insp_assignments_inspection_foreign FOREIGN KEY (site_inspection_id) REFERENCES public.site_inspections(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-052] CONSTRAINT ON site_inspection_assignments (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspection_assignments
    ADD CONSTRAINT site_insp_assignments_to_si_foreign FOREIGN KEY (to_inspector_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-053] CONSTRAINT ON site_inspections (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspections
    ADD CONSTRAINT site_inspections_inspector_id_foreign FOREIGN KEY (inspector_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-054] CONSTRAINT ON site_inspections (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspections
    ADD CONSTRAINT site_inspections_parcel_id_foreign FOREIGN KEY (parcel_id) REFERENCES public.parcels(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-055] CONSTRAINT ON site_inspections (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.site_inspections
    ADD CONSTRAINT site_inspections_zoning_application_id_foreign FOREIGN KEY (zoning_application_id) REFERENCES public.zoning_applications(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-056] CONSTRAINT ON technical_reviews (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.technical_reviews
    ADD CONSTRAINT technical_reviews_reviewed_by_foreign FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- [SCHEMA-CON-057] CONSTRAINT ON technical_reviews (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.technical_reviews
    ADD CONSTRAINT technical_reviews_reviewed_site_inspection_id_foreign FOREIGN KEY (reviewed_site_inspection_id) REFERENCES public.site_inspections(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-058] CONSTRAINT ON technical_reviews (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.technical_reviews
    ADD CONSTRAINT technical_reviews_zoning_application_id_foreign FOREIGN KEY (zoning_application_id) REFERENCES public.zoning_applications(id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- [SCHEMA-CON-059] CONSTRAINT ON zoning_applications (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.zoning_applications
    ADD CONSTRAINT zoning_applications_assigned_po_foreign FOREIGN KEY (assigned_planning_officer_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- [SCHEMA-CON-060] CONSTRAINT ON zoning_applications (FK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.zoning_applications
    ADD CONSTRAINT zoning_applications_encoded_by_foreign FOREIGN KEY (encoded_by) REFERENCES public.users(id) ON DELETE SET NULL;
--
-- PostgreSQL database dump complete
--;

-- ============================================================
-- INDEXES
-- ============================================================

-- ------------------------------------------------------------
-- [SCHEMA-IDX-001] INDEX app_po_assignments_lookup_idx
-- ------------------------------------------------------------
CREATE INDEX app_po_assignments_lookup_idx ON public.application_po_assignments USING btree (zoning_application_id, reassigned_at);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-002] INDEX application_status_tracks_reference_number_index
-- ------------------------------------------------------------
CREATE INDEX application_status_tracks_reference_number_index ON public.application_status_tracks USING btree (reference_number);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-003] INDEX barangay_boundary_geom_idx
-- ------------------------------------------------------------
CREATE INDEX barangay_boundary_geom_idx ON public.barangay_boundary USING gist (geom);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-004] INDEX inspection_delivery_attempts_inspection_attempted_index
-- ------------------------------------------------------------
CREATE INDEX inspection_delivery_attempts_inspection_attempted_index ON public.inspection_delivery_attempts USING btree (site_inspection_id, attempted_at);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-005] INDEX inspection_delivery_attempts_queue_correlation_index
-- ------------------------------------------------------------
CREATE INDEX inspection_delivery_attempts_queue_correlation_index ON public.inspection_delivery_attempts USING btree (site_inspection_id, queue_job_uuid, attempt_number DESC) WHERE (queue_job_uuid IS NOT NULL);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-006] INDEX jobs_queue_index
-- ------------------------------------------------------------
CREATE INDEX jobs_queue_index ON public.jobs USING btree (queue);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-007] INDEX land_parcels_geom_idx
-- ------------------------------------------------------------
CREATE INDEX land_parcels_geom_idx ON public.land_parcels USING gist (geom);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-008] INDEX land_use_plan_geom_idx
-- ------------------------------------------------------------
CREATE INDEX land_use_plan_geom_idx ON public.land_use_plan USING gist (geom);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-009] INDEX notifications_broadcast_index
-- ------------------------------------------------------------
CREATE INDEX notifications_broadcast_index ON public.notifications USING btree (user_id) WHERE (user_id IS NULL);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-010] INDEX notifications_created_at_index
-- ------------------------------------------------------------
CREATE INDEX notifications_created_at_index ON public.notifications USING btree (created_at DESC);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-011] INDEX notifications_user_id_is_read_index
-- ------------------------------------------------------------
CREATE INDEX notifications_user_id_is_read_index ON public.notifications USING btree (user_id, is_read);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-012] INDEX parcels_boundary_gist
-- ------------------------------------------------------------
CREATE INDEX parcels_boundary_gist ON public.parcels USING gist (boundary);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-013] INDEX parcels_pin_index
-- ------------------------------------------------------------
CREATE INDEX parcels_pin_index ON public.parcels USING btree (property_index_number);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-014] INDEX parcels_zoning_application_id_index
-- ------------------------------------------------------------
CREATE INDEX parcels_zoning_application_id_index ON public.parcels USING btree (zoning_application_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-015] INDEX report_action_audit_one_terminal_unique
-- ------------------------------------------------------------
CREATE UNIQUE INDEX report_action_audit_one_terminal_unique ON public.report_action_audit USING btree (report_id) WHERE ((action)::text = ANY ((ARRAY['report_resolved'::character varying, 'report_wont_fix'::character varying])::text[]));

-- ------------------------------------------------------------
-- [SCHEMA-IDX-016] INDEX report_action_audit_report_id_performed_at_index
-- ------------------------------------------------------------
CREATE INDEX report_action_audit_report_id_performed_at_index ON public.report_action_audit USING btree (report_id, performed_at);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-017] INDEX report_escalations_one_open_per_report
-- ------------------------------------------------------------
CREATE UNIQUE INDEX report_escalations_one_open_per_report ON public.report_escalations USING btree (report_id) WHERE ((status)::text = 'open'::text);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-018] INDEX report_escalations_report_created_idx
-- ------------------------------------------------------------
CREATE INDEX report_escalations_report_created_idx ON public.report_escalations USING btree (report_id, created_at);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-019] INDEX rosario_boundary_geom_idx
-- ------------------------------------------------------------
CREATE INDEX rosario_boundary_geom_idx ON public.rosario_boundary USING gist (geom);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-020] INDEX sessions_last_activity_index
-- ------------------------------------------------------------
CREATE INDEX sessions_last_activity_index ON public.sessions USING btree (last_activity);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-021] INDEX sessions_user_id_index
-- ------------------------------------------------------------
CREATE INDEX sessions_user_id_index ON public.sessions USING btree (user_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-022] INDEX site_insp_assignments_lookup_idx
-- ------------------------------------------------------------
CREATE INDEX site_insp_assignments_lookup_idx ON public.site_inspection_assignments USING btree (site_inspection_id, reassigned_at);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-023] INDEX site_inspections_delivery_status_index
-- ------------------------------------------------------------
CREATE INDEX site_inspections_delivery_status_index ON public.site_inspections USING btree (delivery_status) WHERE (delivery_status IS NOT NULL);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-024] INDEX site_inspections_inspector_id_index
-- ------------------------------------------------------------
CREATE INDEX site_inspections_inspector_id_index ON public.site_inspections USING btree (inspector_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-025] INDEX site_inspections_status_index
-- ------------------------------------------------------------
CREATE INDEX site_inspections_status_index ON public.site_inspections USING btree (status);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-026] INDEX site_inspections_zoning_application_id_index
-- ------------------------------------------------------------
CREATE INDEX site_inspections_zoning_application_id_index ON public.site_inspections USING btree (zoning_application_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-027] INDEX technical_reviews_reviewed_site_inspection_id_index
-- ------------------------------------------------------------
CREATE INDEX technical_reviews_reviewed_site_inspection_id_index ON public.technical_reviews USING btree (reviewed_site_inspection_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-028] INDEX technical_reviews_zoning_application_id_index
-- ------------------------------------------------------------
CREATE INDEX technical_reviews_zoning_application_id_index ON public.technical_reviews USING btree (zoning_application_id);

-- ------------------------------------------------------------
-- [SCHEMA-IDX-029] INDEX technical_reviews_zoning_application_id_review_round_index
-- ------------------------------------------------------------
CREATE INDEX technical_reviews_zoning_application_id_review_round_index ON public.technical_reviews USING btree (zoning_application_id, review_round);

-- ============================================================
-- CANONICAL CONSTRAINTS & POLICY DEFINITIONS (FieldSync bridge hardening)
-- ============================================================

-- ------------------------------------------------------------
-- [SCHEMA-CON-061] CONSTRAINT ON field_job_photos (CHECK)
-- ------------------------------------------------------------
ALTER TABLE ONLY public.field_job_photos
    ADD CONSTRAINT field_job_photos_path_namespace_chk
    CHECK (
        photo_url ~ ('^inspections/' || field_job_id::text || '/photo_[A-Za-z0-9_-]+\.jpg$')
    );

-- ------------------------------------------------------------
-- [SCHEMA-POL-001] POLICY inspectors upload own inspection photos (storage.objects INSERT)
-- [SCHEMA-POL-002] POLICY r4p1_inspectors_update_assigned_inspection_objects (storage.objects UPDATE)
--
-- Supabase Storage manages storage.objects and the storage.* / auth.uid()
-- helpers. This canonical contract records the exact deployed policy semantics
-- and applies the policy DDL only where those Supabase-managed objects exist,
-- so a non-Supabase PostgreSQL validation pass never emits DDL against objects
-- it does not own. No storage.objects trigger, no substitute Storage objects or
-- functions are defined.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('storage.objects') IS NOT NULL
       AND to_regproc('storage.foldername(text)') IS NOT NULL
       AND to_regproc('storage.allow_only_operation(text)') IS NOT NULL
       AND to_regproc('auth.uid()') IS NOT NULL
    THEN
        DROP POLICY IF EXISTS "inspectors upload own inspection photos" ON storage.objects;
        CREATE POLICY "inspectors upload own inspection photos"
          ON storage.objects
          FOR INSERT
          TO authenticated
          WITH CHECK (
            bucket_id = 'inspection-photos'
            AND (storage.foldername(name))[1] = 'inspections'
            AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
            AND name ~ '^inspections/[0-9a-fA-F-]{36}/photo_[A-Za-z0-9_-]+\.jpg$'
            AND EXISTS (
              SELECT 1
              FROM public.field_jobs
              WHERE (public.field_jobs.id)::text = (storage.foldername(name))[2]
                AND public.field_jobs.assigned_inspector_id =auth.uid()
            )
          );

        DROP POLICY IF EXISTS "r4p1_inspectors_update_assigned_inspection_objects" ON storage.objects;
        CREATE POLICY "r4p1_inspectors_update_assigned_inspection_objects"
          ON storage.objects
          FOR UPDATE
          TO authenticated
          USING (
            bucket_id = 'inspection-photos'
            AND storage.allow_only_operation('storage.object.upload_update')
            AND (storage.foldername(name))[1] = 'inspections'
            AND name ~ '^inspections/[0-9a-fA-F-]{36}/photo_[A-Za-z0-9_-]+\.jpg$'
            AND EXISTS (
              SELECT 1
              FROM public.field_jobs job
              WHERE (public.field_jobs.id)::text = (storage.foldername(objects.name))[2]
                AND public.field_jobs.assigned_inspector_id =auth.uid()
            )
          )
          WITH CHECK (
            bucket_id = 'inspection-photos'
            AND storage.allow_only_operation('storage.object.upload_update')
            AND (storage.foldername(name))[1] = 'inspections'
            AND name ~ '^inspections/[0-9a-fA-F-]{36}/photo_[A-Za-z0-9_-]+\.jpg$'
            AND EXISTS (
              SELECT 1
              FROM public.field_jobs job
              WHERE (public.field_jobs.id)::text = (storage.foldername(objects.name))[2]
                AND public.field_jobs.assigned_inspector_id =auth.uid()
            )
          );
    END IF;
END $$;
--
-- PostgreSQL database dump
--

\restrict imT5g7f6hJVyxMqee4a3Vc29kUXdmhrDSbc7q4216Uj7SJ4CQHaxqIpezAtOIfh

-- Dumped from database version 15.8 (Debian 15.8-1.pgdg120+1)
-- Dumped by pg_dump version 15.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: breeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.breeds (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    country_id uuid NOT NULL,
    description text,
    sort_order integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: country; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    country_code character varying(3) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    currency character varying(10) DEFAULT NULL::character varying,
    is_active boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN country.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country.currency IS 'Currency code for the country (e.g., USD, EUR, INR)';


--
-- Name: COLUMN country.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country.is_active IS 'Boolean flag to control if country is active for user registration';


--
-- Name: custom_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_feeds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fd_code text NOT NULL,
    fd_country_id uuid,
    fd_country_name character varying(100),
    fd_country_cd character varying(10),
    fd_name character varying(100) NOT NULL,
    fd_category character varying(50),
    fd_type character varying(50),
    fd_dm numeric(10,2),
    fd_ash numeric(10,2),
    fd_cp numeric(10,2),
    fd_ee numeric(10,2),
    fd_cf numeric(10,2),
    fd_nfe numeric(10,2),
    fd_st numeric(10,2),
    fd_ndf numeric(10,2),
    fd_hemicellulose numeric(10,2),
    fd_adf numeric(10,2),
    fd_cellulose numeric(10,2),
    fd_lg numeric(10,2),
    fd_ndin numeric(10,2),
    fd_adin numeric(10,2),
    fd_ca numeric(10,2),
    fd_p numeric(10,2),
    fd_orginin character varying(50),
    fd_ipb_local_lab character varying(50),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fd_npn_cp numeric(10,2),
    fd_country text,
    fd_season text,
    baseline_price numeric(10,2),
    baseline_currency character varying(3)
);


--
-- Name: TABLE custom_feeds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_feeds IS 'Custom feeds created by users, replica of feeds table with user_id foreign key';


--
-- Name: COLUMN custom_feeds.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.id IS 'Primary key, auto-generated UUID';


--
-- Name: COLUMN custom_feeds.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.user_id IS 'Foreign key to user_information table';


--
-- Name: COLUMN custom_feeds.fd_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_code IS 'Unique feed code (e.g., IND-1234)';


--
-- Name: COLUMN custom_feeds.fd_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_name IS 'Feed name (required)';


--
-- Name: COLUMN custom_feeds.fd_dm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_dm IS 'Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_ash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_ash IS 'Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_cp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_cp IS 'Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_ee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_ee IS 'Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_cf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_cf IS 'Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_nfe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_nfe IS 'Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_st; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_st IS 'Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_ndf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_ndf IS 'Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_hemicellulose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_hemicellulose IS 'Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_adf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_adf IS 'Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_cellulose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_cellulose IS 'Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_lg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_lg IS 'Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_ndin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_ndin IS 'Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_adin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_adin IS 'Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_ca; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_ca IS 'Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN custom_feeds.fd_p; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_feeds.fd_p IS 'Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: diet_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diet_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    simulation_id character varying(20) NOT NULL,
    report_name character varying(255) NOT NULL,
    file_name character varying(255) NOT NULL,
    pdf_data bytea NOT NULL,
    file_size integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE diet_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.diet_reports IS 'Stores PDF diet recommendation reports generated for users';


--
-- Name: COLUMN diet_reports.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.id IS 'Primary key - UUID';


--
-- Name: COLUMN diet_reports.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.user_id IS 'Foreign key to user_information table';


--
-- Name: COLUMN diet_reports.simulation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.simulation_id IS 'Case identifier (e.g., abc-1234)';


--
-- Name: COLUMN diet_reports.report_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.report_name IS 'Human-readable report name';


--
-- Name: COLUMN diet_reports.file_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.file_name IS 'Original filename of the PDF';


--
-- Name: COLUMN diet_reports.pdf_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.pdf_data IS 'The actual PDF file as binary data';


--
-- Name: COLUMN diet_reports.file_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.file_size IS 'Size of the PDF file in bytes';


--
-- Name: COLUMN diet_reports.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.created_at IS 'Timestamp when report was created';


--
-- Name: COLUMN diet_reports.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.diet_reports.updated_at IS 'Timestamp when report was last updated';


--
-- Name: feed_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_analytics (
    da_name character varying(100) NOT NULL,
    da_phone_num character varying(100) NOT NULL,
    country_cd character varying(3) NOT NULL,
    country_name character varying(100) NOT NULL,
    animal_info text NOT NULL,
    sys_rcmd text NOT NULL,
    cust_rcmd text NOT NULL,
    farmer_name text NOT NULL,
    farmer_phone_num character varying(100) NOT NULL,
    rcmd_dt date DEFAULT CURRENT_DATE NOT NULL,
    farmer_adopted boolean,
    created_on timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_on timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id uuid NOT NULL
);


--
-- Name: feed_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name character varying(100) NOT NULL,
    feed_type_id uuid NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE feed_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feed_categories IS 'Master table for feed categories, linked to feed types';


--
-- Name: COLUMN feed_categories.feed_type_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feed_categories.feed_type_id IS 'Foreign key to feed_types table';


--
-- Name: feed_country_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_country_availability (
    id uuid NOT NULL,
    master_feed_id uuid NOT NULL,
    country_id uuid NOT NULL,
    is_available boolean NOT NULL,
    local_name text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feed_country_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_country_pricing (
    id uuid NOT NULL,
    master_feed_id uuid NOT NULL,
    country_id uuid NOT NULL,
    price_per_kg numeric(10,2) NOT NULL,
    currency character varying(3) NOT NULL,
    set_by uuid,
    is_active boolean NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: feed_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE feed_types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feed_types IS 'Master table for feed types (Forage, Concentrate)';


--
-- Name: feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feeds (
    id uuid NOT NULL,
    fd_code text,
    fd_country_name text,
    fd_country_cd text,
    fd_name text NOT NULL,
    fd_category text,
    fd_type text,
    fd_dm numeric(10,2),
    fd_ash numeric(10,2),
    fd_cp numeric(10,2),
    fd_npn_cp numeric(10,2),
    fd_ee numeric(10,2),
    fd_cf numeric(10,2),
    fd_nfe numeric(10,2),
    fd_st numeric(10,2),
    fd_ndf numeric(10,2),
    fd_hemicellulose numeric(10,2),
    fd_adf numeric(10,2),
    fd_cellulose numeric(10,2),
    fd_lg numeric(10,2),
    fd_ndin numeric(10,2),
    fd_adin numeric(10,2),
    fd_ca numeric(10,2),
    fd_p numeric(10,2),
    fd_season text,
    fd_orginin text,
    fd_ipb_local_lab text,
    fd_country_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fd_category_id uuid,
    created_by uuid,
    baseline_price numeric(10,2),
    baseline_currency character varying(3)
);


--
-- Name: TABLE feeds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.feeds IS 'Updated: Removed deprecated fd_country column - use fd_country_name instead';


--
-- Name: COLUMN feeds.fd_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_code IS 'Feed code (format: country_code-number). Can be null for bulk uploaded feeds without specific codes.';


--
-- Name: COLUMN feeds.fd_dm; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_dm IS 'Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_ash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_ash IS 'Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_cp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_cp IS 'Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_ee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_ee IS 'Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_cf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_cf IS 'Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_nfe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_nfe IS 'Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_st; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_st IS 'Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_ndf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_ndf IS 'Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_hemicellulose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_hemicellulose IS 'Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_adf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_adf IS 'Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_cellulose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_cellulose IS 'Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_lg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_lg IS 'Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_ndin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_ndin IS 'Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_adin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_adin IS 'Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_ca; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_ca IS 'Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_p; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_p IS 'Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places';


--
-- Name: COLUMN feeds.fd_category_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.feeds.fd_category_id IS 'Foreign key reference to feed_categories.id for data integrity validation';


--
-- Name: feeds_dup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feeds_dup (
    id uuid,
    fd_code text,
    fd_country_name text,
    fd_country_cd text,
    fd_name text,
    fd_category text,
    fd_type text,
    fd_dm numeric(10,2),
    fd_ash numeric(10,2),
    fd_cp numeric(10,2),
    fd_npn_cp numeric(10,2),
    fd_ee numeric(10,2),
    fd_cf numeric(10,2),
    fd_nfe numeric(10,2),
    fd_st numeric(10,2),
    fd_ndf numeric(10,2),
    fd_hemicellulose numeric(10,2),
    fd_adf numeric(10,2),
    fd_cellulose numeric(10,2),
    fd_lg numeric(10,2),
    fd_ndin numeric(10,2),
    fd_adin numeric(10,2),
    fd_ca numeric(10,2),
    fd_p numeric(10,2),
    fd_season text,
    fd_orginin text,
    fd_ipb_local_lab text,
    fd_country_id uuid,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    fd_category_id uuid,
    created_by uuid,
    baseline_price numeric(10,2),
    baseline_currency character varying(3)
);


--
-- Name: master_feeds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_feeds (
    id uuid NOT NULL,
    fd_code text NOT NULL,
    fd_name text NOT NULL,
    fd_type text NOT NULL,
    fd_category text NOT NULL,
    fd_dm numeric(10,2),
    fd_ash numeric(10,2),
    fd_cp numeric(10,2),
    fd_npn_cp integer,
    fd_ee numeric(10,2),
    fd_cf numeric(10,2),
    fd_nfe numeric(10,2),
    fd_st numeric(10,2),
    fd_ndf numeric(10,2),
    fd_hemicellulose numeric(10,2),
    fd_adf numeric(10,2),
    fd_cellulose numeric(10,2),
    fd_lg numeric(10,2),
    fd_ndin numeric(10,2),
    fd_adin numeric(10,2),
    fd_ca numeric(10,2),
    fd_p numeric(10,2),
    fd_season text,
    fd_orginin text,
    fd_ipb_local_lab text,
    created_by uuid,
    is_active boolean NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    report_id character varying(50) NOT NULL,
    report_type character varying(10) NOT NULL,
    user_id uuid NOT NULL,
    bucket_url text,
    json_result jsonb,
    saved_to_bucket boolean DEFAULT false,
    report bytea,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    save_report boolean DEFAULT false NOT NULL,
    simulation_id character varying(100),
    animal_inputs jsonb,
    feed_selection jsonb,
    custom_constraints jsonb,
    country_id uuid,
    report_name character varying(255),
    CONSTRAINT reports_report_type_check CHECK (((report_type)::text = ANY ((ARRAY['rec'::character varying, 'eval'::character varying])::text[])))
);


--
-- Name: TABLE reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reports IS 'Stores PDF reports and JSON results for diet recommendations and evaluations';


--
-- Name: COLUMN reports.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.id IS 'Primary key UUID';


--
-- Name: COLUMN reports.report_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.report_id IS 'Unique report identifier in format rec-xxxxxx or eval-xxxxxx';


--
-- Name: COLUMN reports.report_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.report_type IS 'Type of report: rec (recommendation) or eval (evaluation)';


--
-- Name: COLUMN reports.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.user_id IS 'Foreign key to user_information table';


--
-- Name: COLUMN reports.bucket_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.bucket_url IS 'URL of PDF report stored in AWS S3 bucket';


--
-- Name: COLUMN reports.json_result; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.json_result IS 'Complete API response JSON data';


--
-- Name: COLUMN reports.saved_to_bucket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.saved_to_bucket IS 'Boolean flag indicating if PDF was successfully saved to AWS bucket';


--
-- Name: COLUMN reports.report; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.report IS 'Binary PDF file data';


--
-- Name: COLUMN reports.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.created_at IS 'Timestamp when report was created';


--
-- Name: COLUMN reports.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.updated_at IS 'Timestamp when report was last updated';


--
-- Name: COLUMN reports.save_report; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reports.save_report IS 'Flag to indicate if user has explicitly saved the report (set by /save-report-to-bucket/ API)';


--
-- Name: system_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metadata (
    key character varying(255) NOT NULL,
    value_timestamp timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    overall_rating integer,
    text_feedback text,
    feedback_type character varying(50) DEFAULT 'General'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_feedback_overall_rating_check CHECK (((overall_rating >= 1) AND (overall_rating <= 5)))
);


--
-- Name: TABLE user_feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_feedback IS 'Stores user feedback for the mobile application';


--
-- Name: COLUMN user_feedback.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.id IS 'Unique identifier for the feedback entry';


--
-- Name: COLUMN user_feedback.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.user_id IS 'Reference to the user who submitted the feedback';


--
-- Name: COLUMN user_feedback.overall_rating; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.overall_rating IS 'Star rating from 1 to 5 representing overall app experience';


--
-- Name: COLUMN user_feedback.text_feedback; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.text_feedback IS 'Optional text feedback with maximum 1000 characters';


--
-- Name: COLUMN user_feedback.feedback_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.feedback_type IS 'Type of feedback: General, Bug, or Feature Request';


--
-- Name: COLUMN user_feedback.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.created_at IS 'Timestamp when feedback was submitted';


--
-- Name: COLUMN user_feedback.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_feedback.updated_at IS 'Timestamp when feedback was last updated';


--
-- Name: user_information; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_information (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email_id character varying(255) NOT NULL,
    pin_hash character varying(255) NOT NULL,
    country_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_admin boolean DEFAULT false,
    is_active boolean DEFAULT true NOT NULL,
    admin_level character varying(20),
    user_role character varying(30),
    CONSTRAINT ck_user_admin_level CHECK (((admin_level IS NULL) OR ((admin_level)::text = ANY ((ARRAY['super_admin'::character varying, 'country_admin'::character varying])::text[])))),
    CONSTRAINT ck_user_role CHECK (((user_role IS NULL) OR ((user_role)::text = ANY ((ARRAY['farmer'::character varying, 'extension_worker'::character varying, 'nutritionist'::character varying, 'researcher'::character varying, 'feed_supplier'::character varying, 'other'::character varying])::text[]))))
);


--
-- Name: COLUMN user_information.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_information.is_admin IS 'Flag to indicate if user has admin privileges for feedback management';


--
-- Name: COLUMN user_information.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_information.is_active IS 'Flag to indicate if user account is active (enabled/disabled by admin)';


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: breeds breeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breeds
    ADD CONSTRAINT breeds_pkey PRIMARY KEY (id);


--
-- Name: country country_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_country_code_key UNIQUE (country_code);


--
-- Name: country country_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_name_key UNIQUE (name);


--
-- Name: country country_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country
    ADD CONSTRAINT country_pkey PRIMARY KEY (id);


--
-- Name: custom_feeds custom_feeds_feed_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_feeds
    ADD CONSTRAINT custom_feeds_feed_code_key UNIQUE (fd_code);


--
-- Name: custom_feeds custom_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_feeds
    ADD CONSTRAINT custom_feeds_pkey PRIMARY KEY (id);


--
-- Name: diet_reports diet_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_reports
    ADD CONSTRAINT diet_reports_pkey PRIMARY KEY (id);


--
-- Name: feed_analytics feed_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_analytics
    ADD CONSTRAINT feed_analytics_pkey PRIMARY KEY (id);


--
-- Name: feed_categories feed_categories_category_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_categories
    ADD CONSTRAINT feed_categories_category_name_unique UNIQUE (category_name);


--
-- Name: feed_categories feed_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_categories
    ADD CONSTRAINT feed_categories_pkey PRIMARY KEY (id);


--
-- Name: feed_country_availability feed_country_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_availability
    ADD CONSTRAINT feed_country_availability_pkey PRIMARY KEY (id);


--
-- Name: feed_country_pricing feed_country_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_pricing
    ADD CONSTRAINT feed_country_pricing_pkey PRIMARY KEY (id);


--
-- Name: feed_types feed_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_types
    ADD CONSTRAINT feed_types_pkey PRIMARY KEY (id);


--
-- Name: feed_types feed_types_type_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_types
    ADD CONSTRAINT feed_types_type_name_unique UNIQUE (type_name);


--
-- Name: feeds feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT feeds_pkey PRIMARY KEY (id);


--
-- Name: master_feeds master_feeds_fd_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_feeds
    ADD CONSTRAINT master_feeds_fd_code_key UNIQUE (fd_code);


--
-- Name: master_feeds master_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_feeds
    ADD CONSTRAINT master_feeds_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: reports reports_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_report_id_key UNIQUE (report_id);


--
-- Name: system_metadata system_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metadata
    ADD CONSTRAINT system_metadata_pkey PRIMARY KEY (key);


--
-- Name: breeds uq_breeds_name_country; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breeds
    ADD CONSTRAINT uq_breeds_name_country UNIQUE (name, country_id);


--
-- Name: feed_country_availability uq_feed_country_availability; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_availability
    ADD CONSTRAINT uq_feed_country_availability UNIQUE (master_feed_id, country_id);


--
-- Name: feed_country_pricing uq_feed_country_pricing; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_pricing
    ADD CONSTRAINT uq_feed_country_pricing UNIQUE (master_feed_id, country_id);


--
-- Name: user_information uq_user_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_information
    ADD CONSTRAINT uq_user_email UNIQUE (email_id);


--
-- Name: user_feedback user_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_pkey PRIMARY KEY (id);


--
-- Name: user_information user_information_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_information
    ADD CONSTRAINT user_information_pkey PRIMARY KEY (id);


--
-- Name: idx_country_active_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_country_active_new ON public.country USING btree (is_active, name) WHERE (is_active = true);


--
-- Name: idx_country_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_country_code ON public.country USING btree (country_code);


--
-- Name: idx_country_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_country_is_active ON public.country USING btree (is_active);


--
-- Name: idx_country_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_country_name ON public.country USING btree (name);


--
-- Name: idx_custom_feeds_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_feeds_country_id ON public.custom_feeds USING btree (fd_country_id);


--
-- Name: idx_custom_feeds_feed_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_feeds_feed_code ON public.custom_feeds USING btree (fd_code);


--
-- Name: idx_custom_feeds_user_filter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_feeds_user_filter ON public.custom_feeds USING btree (user_id, fd_type, fd_category, fd_country_id);


--
-- Name: idx_custom_feeds_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_feeds_user_id ON public.custom_feeds USING btree (user_id);


--
-- Name: idx_diet_reports_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_case_id ON public.diet_reports USING btree (simulation_id);


--
-- Name: idx_diet_reports_case_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_case_lookup ON public.diet_reports USING btree (simulation_id, user_id);


--
-- Name: idx_diet_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_created_at ON public.diet_reports USING btree (created_at);


--
-- Name: idx_diet_reports_simulation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_simulation_id ON public.diet_reports USING btree (simulation_id);


--
-- Name: idx_diet_reports_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_user_created ON public.diet_reports USING btree (user_id, created_at DESC);


--
-- Name: idx_diet_reports_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_diet_reports_user_id ON public.diet_reports USING btree (user_id);


--
-- Name: idx_feed_analytics_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_analytics_id ON public.feed_analytics USING btree (id);


--
-- Name: idx_feed_categories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_categories_active ON public.feed_categories USING btree (is_active);


--
-- Name: idx_feed_categories_active_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_categories_active_new ON public.feed_categories USING btree (feed_type_id, is_active, sort_order) WHERE (is_active = true);


--
-- Name: idx_feed_categories_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_categories_type_id ON public.feed_categories USING btree (feed_type_id);


--
-- Name: idx_feed_types_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_types_active ON public.feed_types USING btree (is_active);


--
-- Name: idx_feed_types_active_new; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_types_active_new ON public.feed_types USING btree (is_active, sort_order) WHERE (is_active = true);


--
-- Name: idx_feeds_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_country_id ON public.feeds USING btree (fd_country_id);


--
-- Name: idx_feeds_country_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_country_type ON public.feeds USING btree (fd_country_id, fd_type, fd_category);


--
-- Name: idx_feeds_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_created_by ON public.feeds USING btree (created_by);


--
-- Name: idx_feeds_fd_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_fd_category_id ON public.feeds USING btree (fd_category_id);


--
-- Name: idx_feeds_fd_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_fd_country_id ON public.feeds USING btree (fd_country_id);


--
-- Name: idx_feeds_filter_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feeds_filter_composite ON public.feeds USING btree (fd_type, fd_category, fd_country_id);


--
-- Name: idx_reports_admin_view; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_admin_view ON public.reports USING btree (save_report, created_at DESC) WHERE (save_report = true);


--
-- Name: idx_reports_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_created_at ON public.reports USING btree (created_at);


--
-- Name: idx_reports_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_report_id ON public.reports USING btree (report_id);


--
-- Name: idx_reports_report_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_report_type ON public.reports USING btree (report_type);


--
-- Name: idx_reports_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_type_created ON public.reports USING btree (report_type, created_at DESC);


--
-- Name: idx_reports_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_user_id ON public.reports USING btree (user_id);


--
-- Name: idx_reports_user_saved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_user_saved ON public.reports USING btree (user_id, save_report, created_at DESC) WHERE (save_report = true);


--
-- Name: idx_reports_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_user_type ON public.reports USING btree (user_id, report_type);


--
-- Name: idx_user_admin_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_level ON public.user_information USING btree (admin_level) WHERE (admin_level IS NOT NULL);


--
-- Name: idx_user_admin_verification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_admin_verification ON public.user_information USING btree (id, is_admin) WHERE (is_admin = true);


--
-- Name: idx_user_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_country ON public.user_information USING btree (country_id);


--
-- Name: idx_user_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_country_id ON public.user_information USING btree (country_id);


--
-- Name: idx_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_created_at ON public.user_information USING btree (created_at);


--
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email ON public.user_information USING btree (email_id);


--
-- Name: idx_user_feedback_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_admin ON public.user_feedback USING btree (created_at DESC);


--
-- Name: idx_user_feedback_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_created_at ON public.user_feedback USING btree (created_at);


--
-- Name: idx_user_feedback_feedback_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_feedback_type ON public.user_feedback USING btree (feedback_type);


--
-- Name: idx_user_feedback_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_rating ON public.user_feedback USING btree (overall_rating);


--
-- Name: idx_user_feedback_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_user_created ON public.user_feedback USING btree (user_id, created_at DESC);


--
-- Name: idx_user_feedback_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_feedback_user_id ON public.user_feedback USING btree (user_id);


--
-- Name: idx_user_information_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_information_is_active ON public.user_information USING btree (is_active);


--
-- Name: idx_user_information_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_information_is_admin ON public.user_information USING btree (is_admin);


--
-- Name: idx_user_status_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_status_check ON public.user_information USING btree (id, is_active) WHERE (is_active = true);


--
-- Name: ix_breeds_country_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_breeds_country_active ON public.breeds USING btree (country_id, is_active);


--
-- Name: ix_breeds_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_breeds_country_id ON public.breeds USING btree (country_id);


--
-- Name: ix_feed_availability_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feed_availability_country ON public.feed_country_availability USING btree (country_id);


--
-- Name: ix_feed_availability_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feed_availability_feed ON public.feed_country_availability USING btree (master_feed_id);


--
-- Name: ix_feed_pricing_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feed_pricing_country ON public.feed_country_pricing USING btree (country_id);


--
-- Name: ix_feed_pricing_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feed_pricing_feed ON public.feed_country_pricing USING btree (master_feed_id);


--
-- Name: ix_master_feeds_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_master_feeds_active ON public.master_feeds USING btree (is_active);


--
-- Name: ix_master_feeds_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_master_feeds_category ON public.master_feeds USING btree (fd_category);


--
-- Name: ix_master_feeds_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_master_feeds_type ON public.master_feeds USING btree (fd_type);


--
-- Name: country update_country_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_country_updated_at BEFORE UPDATE ON public.country FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: feeds update_feeds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_feeds_updated_at BEFORE UPDATE ON public.feeds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_feedback update_user_feedback_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_feedback_updated_at BEFORE UPDATE ON public.user_feedback FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_information update_user_information_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_information_updated_at BEFORE UPDATE ON public.user_information FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: breeds breeds_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breeds
    ADD CONSTRAINT breeds_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE CASCADE;


--
-- Name: custom_feeds custom_feeds_fd_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_feeds
    ADD CONSTRAINT custom_feeds_fd_country_id_fkey FOREIGN KEY (fd_country_id) REFERENCES public.country(id);


--
-- Name: custom_feeds custom_feeds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_feeds
    ADD CONSTRAINT custom_feeds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_information(id) ON DELETE CASCADE;


--
-- Name: diet_reports diet_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diet_reports
    ADD CONSTRAINT diet_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_information(id) ON DELETE CASCADE;


--
-- Name: feed_categories feed_categories_feed_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_categories
    ADD CONSTRAINT feed_categories_feed_type_id_fkey FOREIGN KEY (feed_type_id) REFERENCES public.feed_types(id);


--
-- Name: feed_country_availability feed_country_availability_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_availability
    ADD CONSTRAINT feed_country_availability_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE CASCADE;


--
-- Name: feed_country_availability feed_country_availability_master_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_availability
    ADD CONSTRAINT feed_country_availability_master_feed_id_fkey FOREIGN KEY (master_feed_id) REFERENCES public.master_feeds(id) ON DELETE CASCADE;


--
-- Name: feed_country_pricing feed_country_pricing_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_pricing
    ADD CONSTRAINT feed_country_pricing_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE CASCADE;


--
-- Name: feed_country_pricing feed_country_pricing_master_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_pricing
    ADD CONSTRAINT feed_country_pricing_master_feed_id_fkey FOREIGN KEY (master_feed_id) REFERENCES public.master_feeds(id) ON DELETE CASCADE;


--
-- Name: feed_country_pricing feed_country_pricing_set_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_country_pricing
    ADD CONSTRAINT feed_country_pricing_set_by_fkey FOREIGN KEY (set_by) REFERENCES public.user_information(id) ON DELETE SET NULL;


--
-- Name: feeds feeds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT feeds_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_information(id) ON DELETE SET NULL;


--
-- Name: feeds feeds_fd_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT feeds_fd_country_id_fkey FOREIGN KEY (fd_country_id) REFERENCES public.country(id);


--
-- Name: feeds fk_feeds_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT fk_feeds_created_by FOREIGN KEY (created_by) REFERENCES public.user_information(id) ON DELETE SET NULL;


--
-- Name: feeds fk_feeds_fd_category_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT fk_feeds_fd_category_id FOREIGN KEY (fd_category_id) REFERENCES public.feed_categories(id);


--
-- Name: user_information fk_user_country; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_information
    ADD CONSTRAINT fk_user_country FOREIGN KEY (country_id) REFERENCES public.country(id) ON DELETE RESTRICT;


--
-- Name: master_feeds master_feeds_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_feeds
    ADD CONSTRAINT master_feeds_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_information(id) ON DELETE SET NULL;


--
-- Name: reports reports_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.country(id);


--
-- Name: reports reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_information(id);


--
-- Name: user_feedback user_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_feedback
    ADD CONSTRAINT user_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_information(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict imT5g7f6hJVyxMqee4a3Vc29kUXdmhrDSbc7q4216Uj7SJ4CQHaxqIpezAtOIfh


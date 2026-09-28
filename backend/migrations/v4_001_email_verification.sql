-- Migration: v4_001_email_verification
-- Task 2.7 — Email verification columns on user_information
-- Applied as an Alembic revision in Phase 3; run manually in Phase 2.
--
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).

ALTER TABLE user_information
    ADD COLUMN IF NOT EXISTS is_email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verify_token  VARCHAR(64),
    ADD COLUMN IF NOT EXISTS email_verify_token_exp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS requires_pin_reset  BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing users pre-date the requirement: treat them as already verified
-- but flag for PIN reset so they migrate from 4-digit SHA-256 on next login.
UPDATE user_information
SET
    is_email_verified = TRUE,
    requires_pin_reset = TRUE
WHERE is_email_verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_user_email_verify_token
    ON user_information (email_verify_token)
    WHERE email_verify_token IS NOT NULL;

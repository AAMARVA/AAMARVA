-- Migration: Add passwordChangedAt to users table
-- Description: Supports human session invalidation upon password reset.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMPTZ NULL;

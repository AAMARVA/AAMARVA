-- Add IP column to security_enforcement_events for structured identity
ALTER TABLE security_enforcement_events ADD COLUMN IF NOT EXISTS ip TEXT;

-- Update record_violation_atomic to accept IP if we want to store it there too
-- Actually, the enforcement event is logged in SecurityService.ts, so we just need the column.

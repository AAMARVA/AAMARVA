-- Drop unique constraint on users.email to allow master and slave agents to share the same email address
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
DROP INDEX IF EXISTS users_email_idx;

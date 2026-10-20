-- Fix counter-party review concurrency / duplicate-review race
-- Enforce one review per connection per reviewer at the database level.
-- Using reviewerUserId as the authoritative identifier.
DROP INDEX IF EXISTS idx_reviews_connection_reviewer_unique;
CREATE UNIQUE INDEX idx_reviews_connection_reviewer_unique 
ON reviews ("connectionId", "reviewerUserId");

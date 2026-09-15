-- ==============================================================================
-- MIGRATION: ENFORCE ONE REVIEW PER PARTICIPANT PER CONNECTION
-- ==============================================================================
-- Ensures at the database level that each participant in a connection can submit
-- at most one review, guaranteeing a maximum of two reviews per connection.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    -- Create unique index on connectionId and reviewerUserId
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_connection_reviewer_user_unique 
      ON reviews("connectionId", "reviewerUserId") 
      WHERE "connectionId" IS NOT NULL;

    -- Create unique index on connectionId and reviewerAgentId
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_connection_reviewer_agent_unique 
      ON reviews("connectionId", "reviewerAgentId") 
      WHERE "connectionId" IS NOT NULL;
  END IF;
END $$;

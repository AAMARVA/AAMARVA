-- ==============================================================================
-- MIGRATION: PRESERVE REVIEWS AND HISTORY ON CONNECTION CHANNEL DELETION
-- ==============================================================================
-- Updates reviews foreign key constraint from ON DELETE CASCADE to ON DELETE SET NULL,
-- guaranteeing that reviews and counterparty ratings remain stored forever.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    -- Make connectionId nullable
    ALTER TABLE reviews ALTER COLUMN "connectionId" DROP NOT NULL;
    
    -- Drop old cascade constraints
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_connectionId_fkey;
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS fk_reviews_connection;
    
    -- Add ON DELETE SET NULL constraint
    ALTER TABLE reviews ADD CONSTRAINT fk_reviews_connection 
      FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE SET NULL;
  END IF;
END $$;

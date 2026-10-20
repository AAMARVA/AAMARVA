-- Migration to reconcile canonical connections schema and drop obsolete structures
DO $$
BEGIN
  -- Safe column renames for connections table
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerUserId') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerUserId" TO user1_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorUserId') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorUserId" TO user2_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerAgentId') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerAgentId" TO user1_agent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorAgentId') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorAgentId" TO user2_agent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'postOwnerAgentName') THEN
    ALTER TABLE connections RENAME COLUMN "postOwnerAgentName" TO user1_agent_name;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'replyAuthorAgentName') THEN
    ALTER TABLE connections RENAME COLUMN "replyAuthorAgentName" TO user2_agent_name;
  END IF;

  -- Drop obsolete columns if they linger
  ALTER TABLE connections DROP COLUMN IF EXISTS "requestId";
  ALTER TABLE connections DROP COLUMN IF EXISTS "postId";
  ALTER TABLE connections DROP COLUMN IF EXISTS "replyId";
END $$;

-- Drop obsolete tables
DROP TABLE IF EXISTS connection_requests CASCADE;
DROP TABLE IF EXISTS cluster_invites CASCADE;

-- Migration to drop obsolete post/reply columns from connections
ALTER TABLE connections DROP COLUMN IF EXISTS "postId";
ALTER TABLE connections DROP COLUMN IF EXISTS "replyId";

-- Drop unnecessary indexes
DROP INDEX IF EXISTS idx_connections_post_id;
DROP INDEX IF EXISTS idx_connections_reply_id_unique;

-- Drop obsolete RPC functions
DROP FUNCTION IF EXISTS create_connection_from_reply(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS accept_connection_request(TEXT, TEXT, TEXT);

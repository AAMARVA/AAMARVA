-- Migration to drop obsolete posts and replies tables and associated dependencies
-- WARNING: This will permanently delete all post and reply data.

-- Drop dependent tables first (contracts depend on posts/replies)
DROP TABLE IF EXISTS contracts;
DROP TABLE IF EXISTS replies;
DROP TABLE IF EXISTS posts;

-- Drop obsolete RPC functions (already dropped, but for safety)
DROP FUNCTION IF EXISTS award_ticket_and_create_contract(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS accept_contract(TEXT, TEXT, TEXT);

-- Remove obsolete columns from connections (already done, but re-affirming)
ALTER TABLE connections DROP COLUMN IF EXISTS "postId";
ALTER TABLE connections DROP COLUMN IF EXISTS "replyId";

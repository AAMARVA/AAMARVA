-- Migration: Add unique constraint on replies to prevent duplicate applications per ticket
CREATE UNIQUE INDEX IF NOT EXISTS idx_replies_unique_user_per_post ON replies("postId", "userId");

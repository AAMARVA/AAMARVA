-- ==============================================================================
-- MIGRATION: ACCOUNT DELETION & AUTH RECORDS CASCADE SYNCHRONIZATION
-- ==============================================================================
-- Run this in your Supabase SQL Editor to enforce CASCADE deletion for all
-- auth records and ensure deleting a user cleanly purges old auth credentials.

-- 1. Add userId column and cascade constraint to account_audit_logs if present
ALTER TABLE account_audit_logs ADD COLUMN IF NOT EXISTS "userId" TEXT REFERENCES users(id) ON DELETE CASCADE;

-- 2. Enforce ON DELETE CASCADE constraints on all dependent auth & app tables
DO $$
BEGIN
  -- refresh_tokens
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_tokens') THEN
    ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_userId_fkey;
    ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS fk_refresh_tokens_user;
    ALTER TABLE refresh_tokens ADD CONSTRAINT fk_refresh_tokens_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- password_reset_tokens
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'password_reset_tokens') THEN
    ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_userId_fkey;
    ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS fk_password_reset_tokens_user;
    ALTER TABLE password_reset_tokens ADD CONSTRAINT fk_password_reset_tokens_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- human_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'human_sessions') THEN
    ALTER TABLE human_sessions DROP CONSTRAINT IF EXISTS human_sessions_userId_fkey;
    ALTER TABLE human_sessions DROP CONSTRAINT IF EXISTS fk_human_sessions_user;
    ALTER TABLE human_sessions ADD CONSTRAINT fk_human_sessions_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- posts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'posts') THEN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_userId_fkey;
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS fk_posts_user;
    ALTER TABLE posts ADD CONSTRAINT fk_posts_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- replies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'replies') THEN
    ALTER TABLE replies DROP CONSTRAINT IF EXISTS replies_userId_fkey;
    ALTER TABLE replies DROP CONSTRAINT IF EXISTS fk_replies_user;
    ALTER TABLE replies ADD CONSTRAINT fk_replies_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- connection_requests
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connection_requests') THEN
    ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS connection_requests_senderUserId_fkey;
    ALTER TABLE connection_requests DROP CONSTRAINT IF EXISTS connection_requests_receiverUserId_fkey;
    ALTER TABLE connection_requests ADD CONSTRAINT fk_conn_req_sender FOREIGN KEY ("senderUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE connection_requests ADD CONSTRAINT fk_conn_req_receiver FOREIGN KEY ("receiverUserId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- connections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'connections') THEN
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_postOwnerUserId_fkey;
    ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_replyAuthorUserId_fkey;
    ALTER TABLE connections ADD CONSTRAINT fk_connections_post_owner FOREIGN KEY ("postOwnerUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE connections ADD CONSTRAINT fk_connections_reply_author FOREIGN KEY ("replyAuthorUserId") REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- messages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages') THEN
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_senderUserId_fkey;
    ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_connectionId_fkey;
    ALTER TABLE messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY ("senderUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE messages ADD CONSTRAINT fk_messages_connection FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE CASCADE;
  END IF;

  -- reviews
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_reviewerUserId_fkey;
    ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_connectionId_fkey;
    ALTER TABLE reviews ADD CONSTRAINT fk_reviews_reviewer FOREIGN KEY ("reviewerUserId") REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE reviews ADD CONSTRAINT fk_reviews_connection FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE CASCADE;
  END IF;

  -- agent_footprints
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_footprints') THEN
    ALTER TABLE agent_footprints DROP CONSTRAINT IF EXISTS agent_footprints_user_id_fkey;
    ALTER TABLE agent_footprints ADD CONSTRAINT fk_agent_footprints_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  -- external_events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'external_events') THEN
    ALTER TABLE external_events DROP CONSTRAINT IF EXISTS external_events_user_id_fkey;
    ALTER TABLE external_events ADD CONSTRAINT fk_external_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Trigger: When public.users is deleted, cascade-delete from auth.users
CREATE OR REPLACE FUNCTION public.handle_user_delete_auth_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent infinite recursion between public and auth delete triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Delete corresponding Supabase Auth user by ID
  BEGIN
    DELETE FROM auth.users WHERE id::text = OLD.id::text;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Also delete any old auth records for this user's email if present
  IF OLD.email IS NOT NULL THEN
    BEGIN
      DELETE FROM auth.users WHERE LOWER(email) = LOWER(OLD.email);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS tr_cascade_delete_auth_user ON public.users;
CREATE TRIGGER tr_cascade_delete_auth_user
AFTER DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_delete_auth_cascade();

-- 4. Trigger: When auth.users is deleted, cascade-delete from public.users
CREATE OR REPLACE FUNCTION public.handle_auth_user_delete_cascade()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent infinite recursion between public and auth delete triggers
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  -- Delete public.users record by matching ID or email
  DELETE FROM public.users 
  WHERE id::text = OLD.id::text 
     OR (OLD.email IS NOT NULL AND LOWER(email) = LOWER(OLD.email));

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS tr_cascade_delete_public_user ON auth.users;
CREATE TRIGGER tr_cascade_delete_public_user
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_delete_cascade();

-- Migration: Add contracts table, award fields, and atomic award RPC
-- Requirement A & B: Database integrity and atomic award/contract creation

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  "ticketId" TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  "bidId" TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  "ownerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "ownerAgentId" TEXT NOT NULL,
  "selectedAgentId" TEXT NOT NULL,
  terms TEXT NOT NULL,
  "bidContent" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS "ticketStatus" TEXT DEFAULT 'open';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS "awardedBidId" TEXT;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_contracts_ticket_id ON contracts("ticketId");
CREATE INDEX IF NOT EXISTS idx_contracts_bid_id ON contracts("bidId");
CREATE INDEX IF NOT EXISTS idx_posts_ticket_status ON posts("ticketStatus");

-- Function: award_ticket_and_create_contract
CREATE OR REPLACE FUNCTION award_ticket_and_create_contract(
  p_ticket_id TEXT,
  p_bid_id TEXT,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post RECORD;
  v_bid RECORD;
  v_contract_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_contract RECORD;
  v_result JSONB;
BEGIN
  -- 1. Lock and fetch post
  SELECT * INTO v_post FROM posts WHERE id::TEXT = p_ticket_id::TEXT FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found.';
  END IF;

  -- 2. Verify ownership
  IF v_post."userId"::TEXT <> p_user_id::TEXT THEN
    RAISE EXCEPTION 'Forbidden: Only the ticket owner can award applications.';
  END IF;

  -- 3. Verify status
  IF v_post."ticketStatus" = 'awarded' OR v_post."awardedBidId" IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket has already been awarded.';
  END IF;

  -- 4. Verify bid
  SELECT * INTO v_bid FROM replies WHERE id::TEXT = p_bid_id::TEXT AND "postId"::TEXT = p_ticket_id::TEXT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application/Bid not found on this ticket.';
  END IF;

  -- 5. Atomic CAS update on posts
  UPDATE posts
  SET "ticketStatus" = 'awarded', "awardedBidId" = p_bid_id, "updatedAt" = v_now
  WHERE id::TEXT = p_ticket_id::TEXT AND ("awardedBidId" IS NULL OR "awardedBidId" = '');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrency conflict: Ticket was already awarded by another request.';
  END IF;

  -- 6. Update bid status
  UPDATE replies
  SET status = 'awarded'
  WHERE id::TEXT = p_bid_id::TEXT;

  -- 7. Create contract record
  v_contract_id := 'cnt_' || gen_random_uuid()::TEXT;

  INSERT INTO contracts (
    id,
    "ticketId",
    "bidId",
    "ownerUserId",
    "ownerAgentId",
    "selectedAgentId",
    terms,
    "bidContent",
    status,
    "createdAt"
  ) VALUES (
    v_contract_id,
    p_ticket_id,
    p_bid_id,
    v_post."userId",
    v_post."agentId",
    v_bid."agentId",
    v_post.content,
    v_bid.content,
    'active',
    v_now
  );

  SELECT * INTO v_contract FROM contracts WHERE id = v_contract_id;

  v_result := jsonb_build_object(
    'success', true,
    'contractId', v_contract_id,
    'ticketId', p_ticket_id,
    'bidId', p_bid_id,
    'contract', to_jsonb(v_contract)
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

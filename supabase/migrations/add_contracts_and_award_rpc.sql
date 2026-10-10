-- Migration: Add contracts table with mutual acceptance tracking, one-contract-per-ticket unique constraint, ON DELETE RESTRICT integrity, and secured RPCs for award and concurrency-safe mutual acceptance

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  "ticketId" TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE RESTRICT,
  "bidId" TEXT NOT NULL REFERENCES replies(id) ON DELETE RESTRICT,
  "ownerUserId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "ownerAgentId" TEXT NOT NULL,
  "selectedAgentId" TEXT NOT NULL,
  terms TEXT NOT NULL,
  "bidContent" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_acceptance',
  "ownerAccepted" BOOLEAN DEFAULT FALSE,
  "agentAccepted" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE posts ADD COLUMN IF NOT EXISTS "ticketStatus" TEXT DEFAULT 'open';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS "awardedBidId" TEXT;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "ownerAccepted" BOOLEAN DEFAULT FALSE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS "agentAccepted" BOOLEAN DEFAULT FALSE;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_ticketId_key'
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_ticketId_key UNIQUE ("ticketId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_ticket_id ON contracts("ticketId");
CREATE INDEX IF NOT EXISTS idx_contracts_bid_id ON contracts("bidId");
CREATE INDEX IF NOT EXISTS idx_posts_ticket_status ON posts("ticketStatus");

-- Function: award_ticket_and_create_contract (Atomic, transactional, rolls back completely on any error)
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
  -- 1. Lock and fetch post (prevents concurrent race conditions)
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
  SET "ticketStatus" = 'awarded", "awardedBidId" = p_bid_id, "updatedAt" = v_now
  WHERE id::TEXT = p_ticket_id::TEXT AND ("awardedBidId" IS NULL OR "awardedBidId" = '');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrency conflict: Ticket was already awarded by another request.';
  END IF;

  -- 6. Update bid status
  UPDATE replies
  SET status = 'awarded'
  WHERE id::TEXT = p_bid_id::TEXT;

  -- 7. Create contract record in pending_acceptance state
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
    "ownerAccepted",
    "agentAccepted",
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
    'pending_acceptance',
    FALSE,
    FALSE,
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

-- Function: accept_contract (Concurrency-safe, row-locked transactional mutual acceptance)
CREATE OR REPLACE FUNCTION accept_contract(
  p_contract_id TEXT,
  p_user_id TEXT,
  p_agent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_is_owner BOOLEAN;
  v_is_agent BOOLEAN;
  v_new_owner BOOLEAN;
  v_new_agent BOOLEAN;
  v_new_status TEXT;
  v_updated RECORD;
BEGIN
  -- 1. Lock contract row for update to ensure concurrency safety
  SELECT * INTO v_contract FROM contracts WHERE id::TEXT = p_contract_id::TEXT FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found.';
  END IF;

  IF v_contract.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'contract', to_jsonb(v_contract));
  END IF;

  IF v_contract.status <> 'pending_acceptance' THEN
    RAISE EXCEPTION 'Contract is already in % state.', v_contract.status;
  END IF;

  v_is_owner := (v_contract."ownerUserId" = p_user_id) OR (v_contract."ownerAgentId" IS NOT NULL AND p_agent_id IS NOT NULL AND LOWER(v_contract."ownerAgentId") = LOWER(p_agent_id));
  v_is_agent := (v_contract."selectedAgentId" IS NOT NULL AND p_agent_id IS NOT NULL AND LOWER(v_contract."selectedAgentId") = LOWER(p_agent_id));

  IF NOT v_is_owner AND NOT v_is_agent THEN
    RAISE EXCEPTION 'Forbidden: Only contract parties (ticket owner or selected agent) can accept contract terms.';
  END IF;

  v_new_owner := COALESCE(v_contract."ownerAccepted", FALSE) OR v_is_owner;
  v_new_agent := COALESCE(v_contract."agentAccepted", FALSE) OR v_is_agent;
  v_new_status := CASE WHEN v_new_owner AND v_new_agent THEN 'active' ELSE 'pending_acceptance' END;

  UPDATE contracts
  SET "ownerAccepted" = v_new_owner,
      "agentAccepted" = v_new_agent,
      status = v_new_status
  WHERE id::TEXT = p_contract_id::TEXT;

  SELECT * INTO v_updated FROM contracts WHERE id::TEXT = p_contract_id::TEXT;

  RETURN jsonb_build_object(
    'success', true,
    'contract', to_jsonb(v_updated)
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

-- Secure RPC execution privileges: restrict to service_role and authenticated, revoke from public and anon
REVOKE EXECUTE ON FUNCTION award_ticket_and_create_contract(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION award_ticket_and_create_contract(TEXT, TEXT, TEXT) TO service_role, authenticated;

REVOKE EXECUTE ON FUNCTION accept_contract(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_contract(TEXT, TEXT, TEXT) TO service_role, authenticated;

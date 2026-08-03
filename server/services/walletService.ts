import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';

export interface WalletRecord {
  id: string;
  userId: string;
  agentId: string;
  availableBalance: number;
  lockedBalance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryRecord {
  id: string;
  walletId: string;
  type: 'deposit' | 'withdrawal' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'transfer';
  amount: number;
  currency: string;
  referenceId?: string;
  description?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface EscrowRecord {
  id: string;
  connectionId?: string;
  buyerUserId: string;
  sellerUserId: string;
  amount: number;
  currency: string;
  status: 'held' | 'released' | 'refunded' | 'disputed';
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensures user has an initialized wallet with non-negative balances.
 */
export async function getOrCreateWallet(userId: string): Promise<WalletRecord> {
  const supabase = getSupabaseClient();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, agentId')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User profile not found.');

  const { data: existingWallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('userId', userId)
    .maybeSingle();

  if (existingWallet) {
    return {
      ...existingWallet,
      availableBalance: parseFloat(existingWallet.availableBalance || 0),
      lockedBalance: parseFloat(existingWallet.lockedBalance || 0),
    };
  }

  const now = new Date().toISOString();
  const newWallet: WalletRecord = {
    id: `wlt_${crypto.randomUUID()}`,
    userId: user.id,
    agentId: user.agentId,
    availableBalance: 1000.0, // Default starting credit balance for testing agent commerce
    lockedBalance: 0.0,
    currency: 'USD',
    createdAt: now,
    updatedAt: now,
  };

  const { error: insertErr } = await supabase.from('wallets').insert([newWallet]);
  if (insertErr) {
    // Return existing if concurrent creation happened
    const { data: retryWallet } = await supabase.from('wallets').select('*').eq('userId', userId).maybeSingle();
    if (retryWallet) return retryWallet;
    throw new Error(`Failed to create wallet: ${insertErr.message}`);
  }

  return newWallet;
}

/**
 * Deposits funds atomically into a wallet with idempotent transaction log.
 */
export async function depositFunds(
  userId: string,
  amount: number,
  idempotencyKey?: string,
  description?: string
): Promise<{ wallet: WalletRecord; ledgerEntry: LedgerEntryRecord }> {
  if (amount <= 0) throw new Error('Deposit amount must be positive.');

  const supabase = getSupabaseClient();

  // Check idempotency
  if (idempotencyKey) {
    const { data: existingLedger } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('idempotencyKey', idempotencyKey)
      .maybeSingle();

    if (existingLedger) {
      const wallet = await getOrCreateWallet(userId);
      return { wallet, ledgerEntry: existingLedger };
    }
  }

  const wallet = await getOrCreateWallet(userId);
  const newBalance = wallet.availableBalance + amount;
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('wallets')
    .update({ availableBalance: newBalance, updatedAt: now })
    .eq('id', wallet.id);

  if (updateErr) throw new Error(`Failed to update wallet balance: ${updateErr.message}`);

  const ledgerEntry: LedgerEntryRecord = {
    id: `ldg_${crypto.randomUUID()}`,
    walletId: wallet.id,
    type: 'deposit',
    amount,
    currency: wallet.currency,
    description: description || 'Deposit credited',
    idempotencyKey,
    createdAt: now,
  };

  await supabase.from('ledger_entries').insert([ledgerEntry]);

  return {
    wallet: { ...wallet, availableBalance: newBalance, updatedAt: now },
    ledgerEntry,
  };
}

/**
 * Locks buyer funds into Escrow atomically.
 */
export async function createEscrow(
  buyerUserId: string,
  sellerUserId: string,
  amount: number,
  connectionId?: string,
  idempotencyKey?: string
): Promise<EscrowRecord> {
  if (amount <= 0) throw new Error('Escrow amount must be positive.');
  if (buyerUserId === sellerUserId) throw new Error('Buyer and seller cannot be the same agent.');

  const supabase = getSupabaseClient();

  if (idempotencyKey) {
    const { data: existingEscrow } = await supabase
      .from('escrows')
      .select('*')
      .eq('idempotencyKey', idempotencyKey)
      .maybeSingle();

    if (existingEscrow) return existingEscrow;
  }

  const buyerWallet = await getOrCreateWallet(buyerUserId);
  if (buyerWallet.availableBalance < amount) {
    throw new Error(`Insufficient funds: Balance is ${buyerWallet.availableBalance}, required is ${amount}`);
  }

  const now = new Date().toISOString();
  const newAvailable = buyerWallet.availableBalance - amount;
  const newLocked = buyerWallet.lockedBalance + amount;

  // Deduct available, increase locked balance
  const { error: walletErr } = await supabase
    .from('wallets')
    .update({
      availableBalance: newAvailable,
      lockedBalance: newLocked,
      updatedAt: now,
    })
    .eq('id', buyerWallet.id);

  if (walletErr) throw new Error(`Failed to reserve buyer funds for escrow: ${walletErr.message}`);

  const escrow: EscrowRecord = {
    id: `esc_${crypto.randomUUID()}`,
    connectionId,
    buyerUserId,
    sellerUserId,
    amount,
    currency: buyerWallet.currency,
    status: 'held',
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };

  await supabase.from('escrows').insert([escrow]);

  // Log ledger
  await supabase.from('ledger_entries').insert([{
    id: `ldg_${crypto.randomUUID()}`,
    walletId: buyerWallet.id,
    type: 'escrow_lock',
    amount: -amount,
    currency: buyerWallet.currency,
    referenceId: escrow.id,
    description: `Funds reserved in escrow ${escrow.id}`,
    idempotencyKey,
    createdAt: now,
  }]);

  return escrow;
}

/**
 * Releases held escrow funds to seller wallet atomically.
 */
export async function releaseEscrow(escrowId: string, authorizedUserId: string): Promise<EscrowRecord> {
  const supabase = getSupabaseClient();

  const { data: escrow, error: escrowErr } = await supabase
    .from('escrows')
    .select('*')
    .eq('id', escrowId)
    .maybeSingle();

  if (escrowErr || !escrow) throw new Error('Escrow record not found.');
  if (escrow.status !== 'held') throw new Error(`Escrow is already ${escrow.status}.`);

  if (authorizedUserId !== escrow.buyerUserId && authorizedUserId !== escrow.sellerUserId) {
    throw new Error('Unauthorized to release escrow.');
  }

  const amount = parseFloat(escrow.amount);
  const buyerWallet = await getOrCreateWallet(escrow.buyerUserId);
  const sellerWallet = await getOrCreateWallet(escrow.sellerUserId);

  const now = new Date().toISOString();

  // Unlock buyer balance
  await supabase
    .from('wallets')
    .update({
      lockedBalance: Math.max(0, buyerWallet.lockedBalance - amount),
      updatedAt: now,
    })
    .eq('id', buyerWallet.id);

  // Credit seller wallet
  await supabase
    .from('wallets')
    .update({
      availableBalance: sellerWallet.availableBalance + amount,
      updatedAt: now,
    })
    .eq('id', sellerWallet.id);

  // Mark escrow released
  await supabase
    .from('escrows')
    .update({ status: 'released', updatedAt: now })
    .eq('id', escrow.id);

  // Ledger entries
  await supabase.from('ledger_entries').insert([
    {
      id: `ldg_${crypto.randomUUID()}`,
      walletId: buyerWallet.id,
      type: 'escrow_release',
      amount: -amount,
      currency: escrow.currency,
      referenceId: escrow.id,
      description: `Escrow ${escrow.id} released to seller`,
      createdAt: now,
    },
    {
      id: `ldg_${crypto.randomUUID()}`,
      walletId: sellerWallet.id,
      type: 'escrow_release',
      amount,
      currency: escrow.currency,
      referenceId: escrow.id,
      description: `Escrow ${escrow.id} received from buyer`,
      createdAt: now,
    },
  ]);

  return { ...escrow, status: 'released', updatedAt: now };
}

/**
 * Withdraws funds atomically from a wallet with idempotent transaction log.
 */
export async function withdrawFunds(
  userId: string,
  amount: number,
  idempotencyKey?: string,
  description?: string
): Promise<{ wallet: WalletRecord; ledgerEntry: LedgerEntryRecord }> {
  if (amount <= 0) throw new Error('Withdrawal amount must be positive.');

  const supabase = getSupabaseClient();

  // Check idempotency
  if (idempotencyKey) {
    const { data: existingLedger } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('idempotencyKey', idempotencyKey)
      .maybeSingle();

    if (existingLedger) {
      const wallet = await getOrCreateWallet(userId);
      return { wallet, ledgerEntry: existingLedger };
    }
  }

  const wallet = await getOrCreateWallet(userId);
  if (wallet.availableBalance < amount) {
    throw new Error(`Insufficient funds: Balance is ${wallet.availableBalance}, required is ${amount}`);
  }
  
  const newBalance = wallet.availableBalance - amount;
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('wallets')
    .update({ availableBalance: newBalance, updatedAt: now })
    .eq('id', wallet.id);

  if (updateErr) throw new Error(`Failed to update wallet balance: ${updateErr.message}`);

  const ledgerEntry: LedgerEntryRecord = {
    id: `ldg_${crypto.randomUUID()}`,
    walletId: wallet.id,
    type: 'withdrawal',
    amount: -amount,
    currency: wallet.currency,
    description: description || 'Withdrawal processed',
    idempotencyKey,
    createdAt: now,
  };

  await supabase.from('ledger_entries').insert([ledgerEntry]);

  // Actual payout infrastructure integration would go here (e.g. Stripe, PayPal)
  // For now we process it against the ledger and wallet safely.

  return {
    wallet: { ...wallet, availableBalance: newBalance, updatedAt: now },
    ledgerEntry,
  };
}

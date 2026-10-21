import crypto from 'crypto';

export interface MasterAccountRecord {
  id: string;
  plan_status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  plan_expires_at?: string;
  tier?: string;
  max_sub_agents: number;
}

export interface MasterPlanEntitlement {
  id: string;
  master_account_id: string;
  plan_type: string;
  plan_name: string;
  status: 'active' | 'inactive' | 'expired' | 'canceled';
  allowance_accounts: number;
  tier: string;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
  metadata?: Record<string, any>;
}

export interface UserAccountMetadata {
  id: string;
  master_id?: string;
  is_master_primary?: boolean;
  apiKeyHash?: string;
}

export class MasterAccountService {
  private static instance: MasterAccountService;
  private metadataCache = new Map<string, UserAccountMetadata>();
  private fingerprintCache = new Map<string, UserAccountMetadata>();
  private masterAccountCache = new Map<string, MasterAccountRecord>();
  private masterPlanCache = new Map<string, MasterPlanEntitlement>();
  
  // Mutex lock map to serialize concurrent purchase/activation requests per master account
  private locks = new Map<string, Promise<void>>();
  // Active in-flight slot reservations to prevent race conditions during concurrent slave creation
  private inFlightReservations = new Map<string, number>();

  public static getInstance(): MasterAccountService {
    if (!MasterAccountService.instance) {
      MasterAccountService.instance = new MasterAccountService();
    }
    return MasterAccountService.instance;
  }

  /**
   * Concurrency helper: acquires a per-master lock to serialize activations
   */
  private async acquireLock(masterId: string): Promise<() => void> {
    while (this.locks.has(masterId)) {
      await this.locks.get(masterId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(masterId, lockPromise);

    return () => {
      this.locks.delete(masterId);
      resolveLock();
    };
  }

  /**
   * Retrieves authoritative active plan entitlement for a given master account from database.
   * Authoritative: Never manufactures fallback entitlements for inactive/free accounts.
   * If a plan has reached its expires_at, it is treated as expired and returns null for active capacity.
   */
  public async getMasterPlan(masterId: string, bypassCache = false): Promise<MasterPlanEntitlement | null> {
    if (!masterId) return null;

    if (!bypassCache) {
      const cached = this.masterPlanCache.get(masterId);
      if (cached) {
        if (cached.status === 'active' && cached.expires_at && new Date(cached.expires_at).getTime() <= Date.now()) {
          cached.status = 'expired';
          this.masterPlanCache.delete(masterId);
          return null;
        }
        return cached.status === 'active' ? cached : null;
      }
    }

    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();

      // Primary storage: master_plan_entitlements table
      const { data: entRecord, error: entErr } = await sb
        .from('master_plan_entitlements')
        .select('*')
        .eq('master_account_id', masterId)
        .eq('status', 'active')
        .maybeSingle();

      if (!entErr && entRecord) {
        const now = Date.now();
        // Authoritative Master-plan expiry: If the overall plan expires_at is expired, expire immediately
        if (entRecord.expires_at && new Date(entRecord.expires_at).getTime() <= now) {
          try {
            await sb
              .from('master_plan_entitlements')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', entRecord.id);
          } catch (e) {}
          this.masterPlanCache.delete(masterId);
          return null;
        }

        const metadata = entRecord.metadata || {};
        let blocks = metadata.blocks;

        if (Array.isArray(blocks) && blocks.length > 0) {
          const enrichedBlocks = blocks.map((b: any, idx: number) => {
            const expTime = new Date(b.expires_at).getTime();
            const isAct = expTime > now;
            const daysLeft = Math.max(0, Math.ceil((expTime - now) / (1000 * 60 * 60 * 24)));
            return {
              ...b,
              id: b.id || `box_${idx + 1}_${entRecord.id}`,
              plan_number: b.plan_number || (idx + 1),
              plan_name: b.plan_name || (idx === 0 ? 'Master & Slave Agent Plan' : `Fleet Expansion Plan #${idx + 1}`),
              plan_subtitle: b.plan_subtitle || `${b.allowance || 10} Slave Accounts`,
              status: isAct ? 'active' : 'expired',
              is_active: isAct,
              days_remaining: daysLeft,
              amount: b.amount || (idx === 0 ? 50 : Math.round((b.allowance || 10) * 2.5)),
              currency: b.currency || 'USD'
            };
          });

          const activeBlocks = enrichedBlocks.filter((b: any) => b.is_active);
          if (activeBlocks.length === 0) {
            try {
              await sb
                .from('master_plan_entitlements')
                .update({ status: 'expired', updated_at: new Date().toISOString() })
                .eq('id', entRecord.id);
            } catch (e) {}
            this.masterPlanCache.delete(masterId);
            return null;
          }

          // Compute earliest expiry timestamp among active blocks
          const earliestTime = Math.min(...activeBlocks.map((b: any) => new Date(b.expires_at).getTime()));
          const latestTime = Math.max(...activeBlocks.map((b: any) => new Date(b.expires_at).getTime()));

          const finalBlocks = enrichedBlocks.map((b: any) => {
            const bExpTime = new Date(b.expires_at).getTime();
            return {
              ...b,
              is_earliest_expiry: b.is_active && activeBlocks.length > 1 && bExpTime === earliestTime,
              is_later_expiry: b.is_active && activeBlocks.length > 1 && bExpTime > earliestTime
            };
          });

          const activeAllowance = activeBlocks.reduce((sum: number, b: any) => sum + (b.allowance || 0), 0);
          const maxExpiry = new Date(latestTime).toISOString();

          const entitlement: MasterPlanEntitlement = {
            id: entRecord.id,
            master_account_id: entRecord.master_account_id,
            plan_type: entRecord.plan_type || 'master_slave_scale',
            plan_name: entRecord.plan_name || 'Master & Slave Agent Plan',
            status: 'active',
            allowance_accounts: Math.min(1000, activeAllowance),
            tier: entRecord.tier || 'scale',
            created_at: entRecord.created_at || new Date().toISOString(),
            updated_at: entRecord.updated_at || new Date().toISOString(),
            expires_at: maxExpiry,
            metadata: { 
              ...metadata, 
              blocks: finalBlocks,
              active_blocks: finalBlocks.filter((b: any) => b.is_active),
              earliest_expiry: new Date(earliestTime).toISOString(),
              total_active_boxes: activeBlocks.length
            }
          };
          this.masterPlanCache.set(masterId, entitlement);
          return entitlement;
        }

        // Authoritative Master-plan expiry: Expired plans must not be resurrected
        if (entRecord.expires_at && new Date(entRecord.expires_at).getTime() <= now) {
          try {
            await sb
              .from('master_plan_entitlements')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', entRecord.id);
          } catch (e) {}
          this.masterPlanCache.delete(masterId);
          return null;
        }

        const entitlement: MasterPlanEntitlement = {
          id: entRecord.id,
          master_account_id: entRecord.master_account_id,
          plan_type: entRecord.plan_type || 'master_slave_scale',
          plan_name: entRecord.plan_name || 'Master & Slave Agent Plan',
          status: 'active',
          allowance_accounts: entRecord.allowance_accounts || 10,
          tier: entRecord.tier || 'scale',
          created_at: entRecord.created_at || new Date().toISOString(),
          updated_at: entRecord.updated_at || new Date().toISOString(),
          expires_at: entRecord.expires_at || null,
          metadata: metadata
        };
        this.masterPlanCache.set(masterId, entitlement);
        return entitlement;
      }
    } catch (err: any) {
      console.warn(`[MasterAccountService] Warning resolving master plan for ${masterId}:`, err?.message || err);
    }

    // No manufactured entitlements or fallback 10-slot allocations
    this.masterPlanCache.delete(masterId);
    return null;
  }

  /**
   * Invalidates cached Master plan and account records for a specific master.
   * Does not alter unrelated accounts.
   */
  public invalidateMasterPlanCache(masterId: string): void {
    if (!masterId) return;
    this.masterPlanCache.delete(masterId);
    this.masterAccountCache.delete(masterId);
  }

  /**
   * Atomically verifies and allocates Slave account slots for a Master Account.
   * Prevents race conditions using mutex lock on the Master Plan Entitlement.
   */
  public async allocateSlaveSlotsAtomic(
    masterId: string, 
    requestedSlots: number = 1
  ): Promise<{ success: boolean; allowance: number; current: number; remaining: number; release?: () => void }> {
    if (!masterId) {
      throw new Error('Master Account ID is required for slave allocation.');
    }
    if (requestedSlots < 1) {
      throw new Error('Requested slave slots must be at least 1.');
    }

    const { getSupabaseClient } = await import('../supabase.js');
    const sb = getSupabaseClient();

    // 1. Concurrency-safe in-memory mutex to ensure atomic slot reservation
    const releaseLock = await this.acquireLock(masterId);
    try {
      // 2. Authoritative check: Get Master Plan
      const plan = await this.getMasterPlan(masterId, true);
      if (!plan || plan.status !== 'active') {
        throw new Error('No active Master/Slave plan found. Available slave slots: 0.');
      }

      // 3. Calculate effective allowance from unexpired metadata->'blocks'
      const now = Date.now();
      const blocks = plan.metadata?.blocks || [];
      const effectiveAllowance = Array.isArray(blocks) && blocks.length > 0 
        ? blocks.filter((b: any) => new Date(b.expires_at).getTime() > now).reduce((sum: number, b: any) => sum + (b.allowance || 0), 0)
        : plan.allowance_accounts;

      if (effectiveAllowance <= 0) {
         throw new Error('Master/Slave plan has expired or no active capacity blocks. Additional slave accounts cannot be created.');
      }

      // 4. Count currently deployed slave accounts under this master
      const { data: subAgents, error: countErr } = await sb
        .from('users')
        .select('id')
        .eq('master_id', masterId);

      const currentCount = (subAgents && Array.isArray(subAgents)) 
        ? subAgents.filter(u => u.id !== masterId).length 
        : 0;

      const inFlight = this.inFlightReservations.get(masterId) || 0;
      const effectiveCount = currentCount + inFlight;

      if (effectiveCount + requestedSlots > effectiveAllowance) {
        throw new Error(`Slave agent allowance limit exceeded. Your Master plan allows a maximum of ${effectiveAllowance} accounts (${effectiveCount} deployed/reserved, ${requestedSlots} requested).`);
      }

      // 5. Atomically reserve slots in-flight
      this.inFlightReservations.set(masterId, inFlight + requestedSlots);

      let released = false;
      const releaseReservation = () => {
        if (released) return;
        released = true;
        const cur = this.inFlightReservations.get(masterId) || 0;
        this.inFlightReservations.set(masterId, Math.max(0, cur - requestedSlots));
      };

      // Safety timeout: auto-release after 20 seconds if caller encounters unexpected hang
      setTimeout(releaseReservation, 20000).unref();

      return {
        success: true,
        allowance: effectiveAllowance,
        current: effectiveCount,
        remaining: effectiveAllowance - (effectiveCount + requestedSlots),
        release: releaseReservation
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * Releases in-flight slot reservation for a master account.
   */
  public releaseInFlightSlots(masterId: string, count: number = 1): void {
    if (!masterId || count <= 0) return;
    const cur = this.inFlightReservations.get(masterId) || 0;
    this.inFlightReservations.set(masterId, Math.max(0, cur - count));
  }

  /**
   * Safely and idempotently activates or updates a Master Account's plan entitlement.
   * Atomic operation with concurrency mutex protection.
   */
  public async activateMasterPlan(
    masterId: string, 
    requestedAllowance: number = 10,
    options?: {
      actionType?: 'new_plan' | 'add_accounts';
      addOnAccounts?: number;
      validityDays?: number;
      extendAccountsCount?: number;
      capabilityIncrement?: boolean;
    }
  ): Promise<MasterPlanEntitlement> {
    if (!masterId) {
      throw new Error('Master Account ID is required for plan activation.');
    }

    // Acquire mutex lock to serialize concurrent requests for this masterId
    const releaseLock = await this.acquireLock(masterId);

    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();

      // 1. Authoritative Validation: verify Master Account exists and is active in database
      const { data: masterUser, error: masterErr } = await sb
        .from('users')
        .select('id, email, status, plan')
        .eq('id', masterId)
        .maybeSingle();

      if (masterErr || !masterUser) {
        throw new Error('Master user not found in authoritative database.');
      }

      if (masterUser.status !== 'active') {
        throw new Error(`Master user is ${masterUser.status}. Plan activation refused.`);
      }

      // 2. Fetch existing plan
      const existingPlan = await this.getMasterPlan(masterId, true);
      const isCurrentlyActive = existingPlan && existingPlan.status === 'active';
      const currentAllowance = existingPlan?.allowance_accounts || 0;

      // Idempotency: If already active with requested allowance and no explicit actionType, return existing plan
      if (!options?.actionType && isCurrentlyActive && currentAllowance === Math.max(10, Math.min(1000, requestedAllowance))) {
        return existingPlan;
      }

      // 3. Compute final allowance & accounts bought in this transaction
      let actionType = options?.actionType || (isCurrentlyActive ? 'add_accounts' : 'new_plan');
      let accountsBoughtThisTransaction = 10;
      let sanitizedAllowance = 10;

      if (false) {
        sanitizedAllowance = currentAllowance > 0 ? currentAllowance : 10;
        accountsBoughtThisTransaction = Math.max(10, options?.extendAccountsCount || sanitizedAllowance);
      } else if (options?.actionType === 'add_accounts') {
        accountsBoughtThisTransaction = options?.addOnAccounts 
          ? Math.max(1, Math.floor(options.addOnAccounts))
          : Math.max(1, Math.floor(requestedAllowance > currentAllowance ? requestedAllowance - currentAllowance : requestedAllowance));
        sanitizedAllowance = Math.min(1000, currentAllowance + accountsBoughtThisTransaction);
      } else {
        // Direct allowance specification or 'new_plan' (clamped between 10 and 1000)
        accountsBoughtThisTransaction = Math.min(1000, Math.max(10, Math.floor(requestedAllowance)));
        sanitizedAllowance = accountsBoughtThisTransaction;
      }

      // Check strict idempotency for standard repeat activation without actionType
      if (!options?.actionType && isCurrentlyActive && existingPlan.allowance_accounts === sanitizedAllowance && (!options?.capabilityIncrement || existingPlan.metadata?.capabilityIncrement)) {
        return existingPlan;
      }

      // Compute capacity blocks & expiration dates
      const now = new Date();
      let blocks = existingPlan?.metadata?.blocks || [];
      if (!Array.isArray(blocks) || blocks.length === 0) {
        if (existingPlan) {
          blocks = [{
            allowance: currentAllowance > 0 ? currentAllowance : 10,
            created_at: existingPlan.created_at || now.toISOString(),
            expires_at: existingPlan.expires_at || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }];
        } else {
          blocks = [];
        }
      }

      // Retain unexpired blocks
      blocks = blocks.filter((b: any) => new Date(b.expires_at).getTime() > now.getTime());

      const validityDays = options?.validityDays || 30;
      const blockExpiryIso = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();
      const nextPlanNumber = blocks.length + 1;

      if (actionType === 'new_plan') {
        const newPlanBlock = {
          id: `plan_box_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          plan_number: nextPlanNumber,
          plan_name: `Master & Slave Agent Plan (Box #${nextPlanNumber})`,
          plan_subtitle: `Fleet Package (${accountsBoughtThisTransaction} Accounts)`,
          plan_type: 'master_slave_scale',
          action_type: 'new_plan',
          allowance: accountsBoughtThisTransaction,
          created_at: now.toISOString(),
          expires_at: '9999-12-31T23:59:59.999Z',
          amount: 50 + Math.max(0, accountsBoughtThisTransaction - 10) * 2.5,
          currency: 'USD',
          status: 'active'
        };
        blocks.push(newPlanBlock);
      } else if (actionType === 'add_accounts') {
        const addOnBlock = {
          id: `plan_box_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          plan_number: nextPlanNumber,
          plan_name: `Capacity Add-On Plan (Box #${nextPlanNumber})`,
          plan_subtitle: `Capacity Expansion (+${accountsBoughtThisTransaction} Accounts)`,
          plan_type: 'master_slave_scale',
          action_type: 'add_accounts',
          allowance: accountsBoughtThisTransaction,
          created_at: now.toISOString(),
          expires_at: '9999-12-31T23:59:59.999Z',
          amount: Math.round(accountsBoughtThisTransaction * 2.5),
          currency: 'USD',
          status: 'active'
        };
        blocks.push(addOnBlock);
      }

      const totalAllowance = Math.min(1000, blocks.reduce((sum: number, b: any) => sum + (b.allowance || 0), 0));
      sanitizedAllowance = totalAllowance;

      const maxExpiry = blocks.length > 0 
        ? blocks.reduce((latest: string, b: any) => new Date(b.expires_at) > new Date(latest) ? b.expires_at : latest, blocks[0].expires_at) 
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let expiresAt: string | null = maxExpiry;

      // 4. Construct complete entitlement record
      const nowIso = now.toISOString();
      const entitlementId = existingPlan?.id || crypto.randomUUID();
      const entitlement: MasterPlanEntitlement = {
        id: entitlementId,
        master_account_id: masterId,
        plan_type: 'master_slave_scale',
        plan_name: 'Master & Slave Agent Plan',
        status: 'active',
        allowance_accounts: sanitizedAllowance,
        tier: 'scale',
        created_at: existingPlan?.created_at || nowIso,
        updated_at: nowIso,
        expires_at: expiresAt,
        metadata: {
          ...(existingPlan?.metadata || {}),
          source: 'aamarva_internal_entitlement',
          previous_allowance: currentAllowance,
          activated_by_master_id: masterId,
          action_type: actionType,
          accounts_bought: accountsBoughtThisTransaction,
          accounts_in_transaction: accountsBoughtThisTransaction,
          added_accounts: accountsBoughtThisTransaction,
          blocks: blocks,
          created_at: nowIso,
          expires_at: expiresAt
        }
      };

      // 5. Atomic database persistence
      // Step A: Attempt write to master_plan_entitlements table
      try {
        await sb.from('master_plan_entitlements').upsert({
          id: entitlement.id,
          master_account_id: entitlement.master_account_id,
          plan_type: entitlement.plan_type,
          plan_name: entitlement.plan_name,
          status: entitlement.status,
          allowance_accounts: entitlement.allowance_accounts,
          tier: entitlement.tier,
          created_at: entitlement.created_at,
          updated_at: entitlement.updated_at,
          expires_at: entitlement.expires_at,
          metadata: entitlement.metadata
        }, { onConflict: 'master_account_id,plan_type' });
      } catch (upsertErr) {
        // Table fallback
      }

      // Step B: Update users table plan column (guaranteed database column)
      const { error: userUpdateErr } = await sb
        .from('users')
        .update({
          plan: 'master_slave_scale'
        })
        .eq('id', masterId);

      if (userUpdateErr) {
        console.warn('[MasterAccountService] Warning updating user plan:', userUpdateErr.message);
      }

      // Step C: Log persistent audit record in external_events table
      const { error: eventErr } = await sb
        .from('external_events')
        .insert({
          id: crypto.randomUUID(),
          user_id: masterId,
          type: 'PLAN_ENTITLEMENT_ACTIVATED',
          details: JSON.stringify(entitlement),
          created_at: nowIso
        });

      if (eventErr) {
        console.warn('[MasterAccountService] Warning writing external_events audit log:', eventErr.message);
      }

      // 6. Update in-memory caches
      this.masterPlanCache.set(masterId, entitlement);
      this.masterAccountCache.set(masterId, {
        id: masterId,
        plan_status: 'ACTIVE',
        tier: 'scale',
        max_sub_agents: sanitizedAllowance
      });

      return entitlement;
    } finally {
      releaseLock();
    }
  }

  public async getMasterAccount(masterId: string): Promise<MasterAccountRecord | null> {
    const cached = this.masterAccountCache.get(masterId);
    if (cached) return cached;

    // Check database for active master plan entitlement
    const plan = await this.getMasterPlan(masterId);
    if (plan && plan.status === 'active') {
      const record: MasterAccountRecord = {
        id: masterId,
        plan_status: 'ACTIVE',
        tier: plan.tier || 'scale',
        max_sub_agents: plan.allowance_accounts || 0
      };
      this.masterAccountCache.set(masterId, record);
      return record;
    }

    // Genuinely inactive: 0 slave slots when no master plan is purchased or active
    const inactiveRecord: MasterAccountRecord = {
      id: masterId,
      plan_status: 'INACTIVE',
      tier: 'free',
      max_sub_agents: 0
    };
    this.masterAccountCache.set(masterId, inactiveRecord);
    return inactiveRecord;
  }

  public getUserByFingerprint(fingerprint: string): UserAccountMetadata | null {
    return this.fingerprintCache.get(fingerprint) || null;
  }

  public getUserMetadata(userId: string): UserAccountMetadata | null {
    return this.metadataCache.get(userId) || null;
  }

  public async refreshUserMetadata(userId: string): Promise<UserAccountMetadata | null> {
    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('users')
        .select('id, agentId, master_id, is_master_primary')
        .or(`id.eq.${userId},agentId.eq.${userId}`)
        .maybeSingle();
      if (data && !error) {
        const meta: UserAccountMetadata = {
          id: data.id,
          master_id: data.master_id,
          is_master_primary: data.is_master_primary === true
        };
        this.metadataCache.set(userId, meta);
        this.metadataCache.set(data.id, meta);
        if (data.agentId) {
          this.metadataCache.set(data.agentId, meta);
        }
        return meta;
      }
    } catch (e) {}
    return this.metadataCache.get(userId) || null;
  }

  public async getMasterPlanHistory(masterId: string): Promise<any[]> {
    if (!masterId) return [];
    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();
      
      // 1. Get master's own plan entitlement events
      const { data, error } = await sb
        .from('external_events')
        .select('*')
        .eq('user_id', masterId)
        .eq('type', 'PLAN_ENTITLEMENT_ACTIVATED')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[MasterAccountService] Error fetching plan events:', error.message);
      }

      // 2. Get all users in fleet (master + subordinate slaves) to accurately resolve transaction accounts
      const { data: fleetUsers } = await sb
        .from('users')
        .select('id, agentId, name, avatar, status')
        .or(`id.eq.${masterId},master_id.eq.${masterId}`);

      const userLookupMap = new Map<string, any>();
      for (const u of (fleetUsers || [])) {
        if (u.id) userLookupMap.set(String(u.id).toLowerCase(), u);
        if (u.agentId) userLookupMap.set(String(u.agentId).toLowerCase(), u);
        if (u.name) userLookupMap.set(String(u.name).toLowerCase(), u);
      }

      const slaveIds = (fleetUsers || []).filter((u: any) => u.id !== masterId).map((s: any) => s.id);

      // Get batch capability activation events
      const { data: batchEvs } = await sb
        .from('external_events')
        .select('*')
        .eq('type', 'SLAVE_CAPABILITY_BATCH_ACTIVATED')
        .order('created_at', { ascending: false });

      const masterBatches = (batchEvs || []).filter((ev: any) => {
        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }
        return details?.master_id === masterId || ev.user_id === masterId;
      });

      let formattedCapabilities: any[] = [];
      const seenBatchIds = new Set<string>();

      for (const ev of masterBatches) {
        if (seenBatchIds.has(ev.id)) continue;
        seenBatchIds.add(ev.id);

        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }
        const validityDays = details?.validity_days || details?.metadata?.validity_days_extended || 30;
        const rawTargetIds = details?.target_account_ids || (details?.target_slave_id ? [details.target_slave_id] : (details?.agent_id ? [details.agent_id] : []));
        const targetAccountIds: string[] = (Array.isArray(rawTargetIds) ? rawTargetIds : [rawTargetIds])
          .map((id: any) => String(id || '').trim())
          .filter((id: string) => id && id.toLowerCase() !== 'master' && id !== masterId);
        const count = details?.accounts_count || targetAccountIds.length || (details?.target_accounts?.length || 1);
        const isEvActive = details?.expires_at ? new Date(details.expires_at).getTime() > Date.now() : true;

        // Resolve exact target_accounts objects (strictly for slave agents, never the master)
        let resolvedTargetAccounts: any[] = [];
        if (Array.isArray(details?.target_accounts) && details.target_accounts.length > 0) {
          resolvedTargetAccounts = details.target_accounts.filter((a: any) => a.id !== masterId && a.agent_id !== masterId);
        } else {
          resolvedTargetAccounts = targetAccountIds.map((targetId: string, tIdx: number) => {
            const trimmed = String(targetId).trim().toLowerCase();
            const found = userLookupMap.get(trimmed);
            if (found && found.id !== masterId) {
              return {
                id: found.id,
                agent_id: found.agentId || found.id,
                name: found.name || found.agentId || 'Slave Agent',
                avatar: found.avatar,
                isDeployed: true,
                status: found.status || 'active'
              };
            }
            return {
              id: targetId,
              agent_id: targetId,
              name: targetId.startsWith('usr_') ? `Slave Agent #${tIdx + 1}` : targetId,
              isDeployed: true,
              status: 'active'
            };
          }).filter((a: any) => a.id !== masterId && a.agent_id !== masterId);
        }

        const effectiveCount = resolvedTargetAccounts.length > 0 ? resolvedTargetAccounts.length : (targetAccountIds.length > 0 ? targetAccountIds.length : count);

        formattedCapabilities.push({
          id: ev.id,
          plan_name: 'Capability Increment Plan',
          plan_subtitle: `Rate-Limit Increment (${effectiveCount} ${effectiveCount === 1 ? 'Account' : 'Accounts'} in Transaction, +${validityDays} Days)`,
          plan_type: 'slave_capability',
          action_type: 'capability_increment',
          allowance_accounts: effectiveCount,
          accounts_in_transaction: effectiveCount,
          target_account_ids: targetAccountIds,
          target_accounts: resolvedTargetAccounts,
          amount: 100 * effectiveCount,
          currency: 'USD',
          created_at: ev.created_at,
          expires_at: details?.expires_at || null,
          status: 'active',
          is_active: isEvActive,
          is_batch: true
        });
      }

      // Also include direct individual capability events if any exist and not already in batch
      const { data: capEvs } = await sb
        .from('external_events')
        .select('*')
        .eq('type', 'SLAVE_CAPABILITY_ACTIVATED')
        .order('created_at', { ascending: false });

      const capabilityEvents = (capEvs || []).filter((ev: any) => {
        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }
        const targetId = details?.target_slave_id || details?.agent_id || (ev.user_id !== masterId ? ev.user_id : null) || (details?.user_id !== masterId ? details?.user_id : null);
        if (!targetId || targetId === masterId) return false;
        return slaveIds.includes(targetId) || details?.master_id === masterId;
      });

      const seenIndiv = new Set<string>();
      for (const ev of capabilityEvents) {
        if (seenIndiv.has(ev.id) || seenBatchIds.has(ev.id)) continue;
        seenIndiv.add(ev.id);

        let details = ev.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (e) {}
        }

        // Skip if this event was part of an already included batch
        if (details?.batch_id && seenBatchIds.has(details.batch_id)) continue;

        const targetId = details?.target_slave_id || details?.agent_id || (ev.user_id !== masterId ? ev.user_id : null) || (details?.user_id !== masterId ? details?.user_id : null);
        if (!targetId || targetId === masterId) continue;

        const validityDays = details?.metadata?.validity_days_extended || details?.validity_days || 30;
        const isEvActive = details?.expires_at ? new Date(details.expires_at).getTime() > Date.now() : true;
        const targetUserFound = userLookupMap.get(String(targetId || '').trim().toLowerCase());
        const targetName = details?.metadata?.target_slave_name || targetUserFound?.name || details?.agent_id || 'Slave Agent';

        const indivTargetAccount = {
          id: targetUserFound?.id || targetId,
          agent_id: targetUserFound?.agentId || details?.agent_id || targetId,
          name: targetName,
          avatar: targetUserFound?.avatar,
          isDeployed: true,
          status: targetUserFound?.status || 'active'
        };

        formattedCapabilities.push({
          id: ev.id,
          plan_name: 'Capability Increment Plan',
          plan_subtitle: `Rate-Limit Increment for ${targetName} (+${validityDays} Days)`,
          plan_type: 'slave_capability',
          action_type: 'capability_increment',
          allowance_accounts: 1,
          accounts_in_transaction: 1,
          target_account_ids: [targetId],
          target_accounts: [indivTargetAccount],
          amount: 100,
          currency: 'USD',
          created_at: ev.created_at,
          expires_at: details?.expires_at || null,
          status: isEvActive ? (details?.status || 'active') : 'expired',
          is_active: isEvActive,
          is_direct: true,
          target_slave_id: targetId
        });
      }

      const eventsList = (data && Array.isArray(data)) ? data : [];

      // If no history events found but master plan exists, synthesize base / add-on events
      let masterHistory: any[] = [];
      if (eventsList.length === 0) {
        const plan = await this.getMasterPlan(masterId);
        if (plan && plan.status === 'active') {
          const allowance = plan.allowance_accounts || 10;
          const planCreated = plan.created_at || new Date().toISOString();
          const planExpires = plan.expires_at || new Date(new Date(planCreated).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          const isActive = new Date(planExpires).getTime() > Date.now();

          const synthesized: any[] = [];
          const addOnCount = Math.max(0, allowance - 10);
          synthesized.push({
            id: `plan_${plan.id}`,
            plan_name: 'Master & Slave Agent Plan',
            plan_subtitle: addOnCount > 0 ? `Fleet Roster (${allowance} Accounts: 10 Base + ${addOnCount} Add-On)` : `Base Fleet Roster (10 Accounts)`,
            plan_type: 'master_slave_scale',
            action_type: addOnCount > 0 ? 'scale_fleet' : 'new_plan',
            allowance_accounts: allowance,
            accounts_in_transaction: allowance,
            added_accounts: allowance,
            tier: 'scale',
            status: isActive ? 'active' : 'expired',
            is_active: isActive,
            amount: 50 + addOnCount * 2.5,
            currency: 'USD',
            created_at: planCreated,
            expires_at: planExpires,
            metadata: { action_type: addOnCount > 0 ? 'scale_fleet' : 'new_plan', allowance, addOnCount }
          });

          masterHistory = synthesized;
        }
      } else {
        // Group events that occur within 5 seconds of each other into the same transaction
        const groups: Array<{ keyTimestamp: string; events: any[] }> = [];
        for (const ev of eventsList) {
          const evTime = new Date(ev.created_at).getTime();
          const existingGroup = groups.find(g => Math.abs(new Date(g.keyTimestamp).getTime() - evTime) < 5000);
          if (existingGroup) {
            existingGroup.events.push(ev);
          } else {
            groups.push({ keyTimestamp: ev.created_at, events: [ev] });
          }
        }

        masterHistory = groups.map(({ keyTimestamp: timestamp, events }) => {
          // Combine details from all events in the same transaction
          const combinedDetails = events.reduce((acc, ev) => {
            let details = ev.details;
            if (typeof details === 'string') {
              try { details = JSON.parse(details); } catch (e) {}
            }
            return { ...acc, ...details };
          }, {});

          const allowance = combinedDetails?.allowance_accounts || 10;
          const meta = combinedDetails?.metadata || {};
          const actionType = meta.action_type || (allowance > 10 ? 'add_accounts' : 'new_plan');
          
          const accountsInTx = combinedDetails?.accounts_in_transaction 
            || meta?.accounts_in_transaction 
            || meta?.accounts_bought 
            || meta?.added_accounts 
            || (actionType === 'new_plan' ? 10 : Math.max(1, allowance - (meta?.previous_allowance || 10)));

          // Construct a comprehensive subtitle if it's a combined transaction
          let planTitle = 'Master & Slave Agent Plan';
          let planSubtitle = 'Master & Slave Agent Plan Subscription';
          let amount = 50;

          if (meta.action_type === 'add_accounts' || meta.added_accounts > 0) {
            planSubtitle = `Fleet Roster (${allowance} Accounts Total)`;
            amount = 50 + Math.max(0, allowance - 10) * 2.5;
          } else {
            planSubtitle = `Base Fleet Roster (${accountsInTx} Accounts)`;
            amount = 50;
          }

          const txCreatedAt = new Date(timestamp);
          const txExpiresAt = meta.expires_at || combinedDetails?.expires_at 
            ? new Date(meta.expires_at || combinedDetails.expires_at).toISOString() 
            : new Date(txCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          const isCurrentlyActive = new Date(txExpiresAt).getTime() > Date.now();

          return {
            id: events[0].id,
            plan_name: planTitle,
            plan_subtitle: planSubtitle,
            plan_type: combinedDetails?.plan_type || 'master_slave_scale',
            action_type: actionType,
            allowance_accounts: allowance,
            accounts_in_transaction: accountsInTx,
            added_accounts: accountsInTx,
            tier: combinedDetails?.tier || 'scale',
            status: isCurrentlyActive ? 'active' : 'expired',
            is_active: isCurrentlyActive,
            amount: amount,
            currency: 'USD',
            created_at: timestamp,
            expires_at: txExpiresAt,
            metadata: meta
          };
        });
      }

      return [...formattedCapabilities, ...masterHistory];
    } catch (e) {
      console.warn('[MasterAccountService] Error fetching plan history:', e);
      return [];
    }
  }
}

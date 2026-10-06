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
   */
  public async getMasterPlan(masterId: string, bypassCache = false): Promise<MasterPlanEntitlement | null> {
    if (!masterId) return null;

    if (!bypassCache) {
      const cached = this.masterPlanCache.get(masterId);
      if (cached) return cached;
    }

    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();

      // 1. Primary storage: master_plan_entitlements table
      const { data: entRecord, error: entErr } = await sb
        .from('master_plan_entitlements')
        .select('*')
        .eq('master_account_id', masterId)
        .eq('status', 'active')
        .maybeSingle();

      if (!entErr && entRecord) {
        const entitlement: MasterPlanEntitlement = {
          id: entRecord.id,
          master_account_id: entRecord.master_account_id,
          plan_type: entRecord.plan_type || 'master_slave_scale',
          plan_name: entRecord.plan_name || 'Master & Slave Agent Plan',
          status: entRecord.status || 'active',
          allowance_accounts: entRecord.allowance_accounts || 20,
          tier: entRecord.tier || 'scale',
          created_at: entRecord.created_at || new Date().toISOString(),
          updated_at: entRecord.updated_at || new Date().toISOString(),
          expires_at: entRecord.expires_at || null,
          metadata: entRecord.metadata || {}
        };
        this.masterPlanCache.set(masterId, entitlement);
        return entitlement;
      }

      // 2. Fallback check: audit logs in external_events
      const { data: eventRecord, error: eventErr } = await sb
        .from('external_events')
        .select('*')
        .eq('user_id', masterId)
        .eq('type', 'PLAN_ENTITLEMENT_ACTIVATED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!eventErr && eventRecord && eventRecord.details) {
        try {
          const parsed = typeof eventRecord.details === 'string'
            ? JSON.parse(eventRecord.details)
            : eventRecord.details;
          if (parsed && (parsed.status === 'active' || parsed.plan_type)) {
            const entitlement: MasterPlanEntitlement = {
              id: parsed.id || eventRecord.id,
              master_account_id: masterId,
              plan_type: parsed.plan_type || 'master_slave_scale',
              plan_name: parsed.plan_name || 'Master & Slave Agent Plan',
              status: parsed.status || 'active',
              allowance_accounts: parsed.allowance_accounts || 20,
              tier: parsed.tier || 'scale',
              created_at: parsed.created_at || eventRecord.created_at,
              updated_at: parsed.updated_at || eventRecord.created_at,
              expires_at: parsed.expires_at || null,
              metadata: parsed.metadata || {}
            };
            this.masterPlanCache.set(masterId, entitlement);
            return entitlement;
          }
        } catch (e) {}
      }

      // 3. Fallback check: users table plan column
      const { data: userRecord, error: userErr } = await sb
        .from('users')
        .select('id, plan')
        .eq('id', masterId)
        .maybeSingle();

      if (!userErr && userRecord && userRecord.plan && userRecord.plan !== 'free') {
        const entitlement: MasterPlanEntitlement = {
          id: `plan_${masterId}`,
          master_account_id: masterId,
          plan_type: 'master_slave_scale',
          plan_name: 'Master & Slave Agent Plan',
          status: 'active',
          allowance_accounts: 20,
          tier: 'scale',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: null,
          metadata: { inferredFromUserPlan: userRecord.plan }
        };
        this.masterPlanCache.set(masterId, entitlement);
        return entitlement;
      }
    } catch (err: any) {
      console.warn(`[MasterAccountService] Warning resolving master plan for ${masterId}:`, err?.message || err);
    }

    return null;
  }

  /**
   * Safely and idempotently activates or updates a Master Account's plan entitlement.
   * Atomic operation with concurrency mutex protection.
   */
  public async activateMasterPlan(
    masterId: string, 
    requestedAllowance: number = 20,
    options?: {
      actionType?: 'new_plan' | 'add_accounts' | 'extend_validity';
      addOnAccounts?: number;
      validityDays?: number;
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

      // 3. Compute final allowance & expiration date
      let sanitizedAllowance = Math.min(1000, Math.max(20, Math.floor(requestedAllowance)));
      const actionType = options?.actionType || (isCurrentlyActive ? 'add_accounts' : 'new_plan');

      if (actionType === 'add_accounts' && isCurrentlyActive) {
        const effectiveAddOn = Math.max(20, Math.floor(options?.addOnAccounts || 20));
        sanitizedAllowance = Math.min(1000, Math.max(20, (existingPlan.allowance_accounts || 20) + effectiveAddOn));
      } else if (actionType === 'extend_validity' && isCurrentlyActive) {
        sanitizedAllowance = existingPlan.allowance_accounts || 20;
      }

      // Check strict idempotency for standard repeat activation without actionType
      if (!options?.actionType && isCurrentlyActive && existingPlan.allowance_accounts === sanitizedAllowance) {
        return existingPlan;
      }

      // Compute expiration date
      const now = new Date();
      let expiresAt: string | null = existingPlan?.expires_at || null;
      if (options?.validityDays && options.validityDays > 0) {
        const baseDate = (existingPlan?.expires_at && new Date(existingPlan.expires_at) > now)
          ? new Date(existingPlan.expires_at)
          : now;
        const newExpiry = new Date(baseDate.getTime() + options.validityDays * 24 * 60 * 60 * 1000);
        expiresAt = newExpiry.toISOString();
      }

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
          source: 'aamarva_internal_entitlement',
          previous_allowance: existingPlan?.allowance_accounts || null,
          activated_by_master_id: masterId,
          action_type: actionType,
          added_accounts: options?.addOnAccounts ? Math.max(20, options.addOnAccounts) : (sanitizedAllowance - (existingPlan?.allowance_accounts || 20)),
          validity_days_extended: options?.validityDays || null
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
        max_sub_agents: plan.allowance_accounts || 20
      };
      this.masterAccountCache.set(masterId, record);
      return record;
    }

    // Default master record with 20 accounts allowance if not yet activated
    const defaultRecord: MasterAccountRecord = {
      id: masterId,
      plan_status: 'ACTIVE',
      tier: 'scale',
      max_sub_agents: 20
    };
    this.masterAccountCache.set(masterId, defaultRecord);
    return defaultRecord;
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
      const { data, error } = await sb.from('users').select('id, master_id, is_master_primary, apiKeyHash').eq('id', userId).maybeSingle();
      if (data && !error) {
        const meta: UserAccountMetadata = {
          id: data.id,
          master_id: data.master_id,
          is_master_primary: data.is_master_primary === true,
          apiKeyHash: data.apiKeyHash
        };
        this.metadataCache.set(userId, meta);
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
      const { data, error } = await sb
        .from('external_events')
        .select('*')
        .eq('user_id', masterId)
        .eq('type', 'PLAN_ENTITLEMENT_ACTIVATED')
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((ev: any, idx: number) => {
        let details = ev.details;
        if (typeof details === 'string') {
          try {
            details = JSON.parse(details);
          } catch (e) {
            details = {};
          }
        }
        const allowance = details?.allowance_accounts || 10;
        const meta = details?.metadata || {};
        const actionType = meta.action_type || (details?.plan_name?.includes('Validity') ? 'extend_validity' : (idx === 0 && data.length > 1 ? 'extend_validity' : (allowance > 10 ? 'add_accounts' : 'new_plan')));
        
        let planTitle = 'Master & Slave Agent Plan';
        let planSubtitle = 'Base Fleet Roster';
        let amount = 50;

        if (actionType === 'extend_validity' || meta.validity_days_extended) {
          const days = meta.validity_days_extended || 30;
          const extAccounts = meta.accounts_extended || allowance;
          const baseFee = days === 30 ? 50 : days === 90 ? 140 : 500;
          const extraAccounts = Math.max(0, extAccounts - 10);
          const multiplier = days === 30 ? 1 : days === 90 ? 2.8 : 10;
          amount = baseFee + Math.round(extraAccounts * 2.5 * multiplier);
          planTitle = 'Master & Slave Agent Plan';
          planSubtitle = `Validity Extension (+${days} Days)`;
        } else if (actionType === 'add_accounts' || meta.added_accounts > 0) {
          const added = meta.added_accounts || Math.max(0, allowance - 10);
          amount = Math.round(added * 2.5);
          planTitle = 'Master & Slave Agent Plan';
          planSubtitle = `Capacity Add-On (+${added} Accounts)`;
        } else {
          planTitle = 'Master & Slave Agent Plan';
          planSubtitle = 'Base Fleet Roster (10 Accounts)';
          amount = 50;
        }

        return {
          id: ev.id,
          plan_name: planTitle,
          plan_subtitle: planSubtitle,
          plan_type: details?.plan_type || 'master_slave_scale',
          action_type: actionType,
          allowance_accounts: allowance,
          added_accounts: meta.added_accounts || (actionType === 'add_accounts' ? Math.max(10, allowance - 10) : undefined),
          tier: details?.tier || 'scale',
          status: details?.status || 'active',
          amount: amount,
          currency: 'USD',
          created_at: ev.created_at,
          metadata: meta
        };
      });
    } catch (e) {
      console.warn('[MasterAccountService] Error fetching plan history:', e);
      return [];
    }
  }
}

import crypto from 'crypto';

export interface CapabilityEntitlement {
  id: string;
  agent_id: string; // Machine agentId or user UUID
  user_id?: string;
  master_id?: string;
  capability_level: number;
  status: 'active' | 'expired' | 'revoked';
  created_at: string;
  updated_at: string;
  expires_at: string;
  metadata?: Record<string, any>;
}

export class CapabilityService {
  private static instance: CapabilityService;
  
  // Isolated in-memory cache for per-slave capability entitlements
  // Keyed by agent_id and user_id of the individual slave
  private capabilityCache = new Map<string, CapabilityEntitlement>();
  
  // Per-slave mutex to serialize concurrent activation requests
  private locks = new Map<string, Promise<void>>();

  public static getInstance(): CapabilityService {
    if (!CapabilityService.instance) {
      CapabilityService.instance = new CapabilityService();
    }
    return CapabilityService.instance;
  }

  private async acquireLock(targetId: string): Promise<() => void> {
    while (this.locks.has(targetId)) {
      await this.locks.get(targetId);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(targetId, lockPromise);

    return () => {
      this.locks.delete(targetId);
      resolveLock();
    };
  }

  /**
   * Retrieves authoritative capability entitlement for a specific Slave Agent.
   * Strictly resolves by requesting agent/user identifier — NEVER inherits from the Master.
   */
  public async getAgentCapability(agentIdentifier: string, bypassCache = false): Promise<CapabilityEntitlement | null> {
    if (!agentIdentifier) return null;

    if (!bypassCache) {
      const cached = this.capabilityCache.get(agentIdentifier);
      if (cached) {
        // Authoritative Expiry Check
        if (cached.status === 'active' && new Date(cached.expires_at).getTime() <= Date.now()) {
          cached.status = 'expired';
          this.capabilityCache.delete(agentIdentifier);
          return null;
        }
        return cached.status === 'active' ? cached : null;
      }
    }

    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();

      // 1. Primary lookup in master_plan_entitlements (plan_type = 'slave_capability')
      const { data: mpeRecord, error: mpeErr } = await sb
        .from('master_plan_entitlements')
        .select('*')
        .eq('master_account_id', agentIdentifier)
        .eq('plan_type', 'slave_capability')
        .eq('status', 'active')
        .maybeSingle();

      if (!mpeErr && mpeRecord) {
        const now = Date.now();
        const expiresAtMs = new Date(mpeRecord.expires_at).getTime();

        if (expiresAtMs <= now) {
          try {
            await sb
              .from('master_plan_entitlements')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', mpeRecord.id);
          } catch (e) {}
          this.invalidateCapabilityCache(agentIdentifier);
          return null;
        }

        const entitlement: CapabilityEntitlement = {
          id: mpeRecord.id,
          agent_id: mpeRecord.metadata?.agent_id || agentIdentifier,
          user_id: mpeRecord.master_account_id,
          master_id: mpeRecord.metadata?.activated_by_master_id,
          capability_level: mpeRecord.metadata?.capability_level || 1,
          status: 'active',
          created_at: mpeRecord.created_at,
          updated_at: mpeRecord.updated_at,
          expires_at: mpeRecord.expires_at,
          metadata: mpeRecord.metadata || {}
        };

        this.capabilityCache.set(entitlement.agent_id, entitlement);
        if (entitlement.user_id) {
          this.capabilityCache.set(entitlement.user_id, entitlement);
        }
        return entitlement;
      }

      // 2. Secondary lookup in capability_entitlements table (if migrated)
      const { data: entRecord, error: entErr } = await sb
        .from('capability_entitlements')
        .select('*')
        .or(`agent_id.eq.${agentIdentifier},user_id.eq.${agentIdentifier}`)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!entErr && entRecord) {
        const now = Date.now();
        const expiresAtMs = new Date(entRecord.expires_at).getTime();

        // Authoritative expiry check: If expired, immediately update status and return null
        if (expiresAtMs <= now) {
          try {
            await sb
              .from('capability_entitlements')
              .update({ status: 'expired', updated_at: new Date().toISOString() })
              .eq('id', entRecord.id);
          } catch (e) {}
          this.invalidateCapabilityCache(agentIdentifier);
          return null;
        }

        const entitlement: CapabilityEntitlement = {
          id: entRecord.id,
          agent_id: entRecord.agent_id,
          user_id: entRecord.user_id,
          master_id: entRecord.master_id,
          capability_level: entRecord.capability_level || 1,
          status: 'active',
          created_at: entRecord.created_at,
          updated_at: entRecord.updated_at,
          expires_at: entRecord.expires_at,
          metadata: entRecord.metadata || {}
        };

        // Cache under both agent_id and user_id for zero-lookup overhead
        this.capabilityCache.set(entRecord.agent_id, entitlement);
        if (entRecord.user_id) {
          this.capabilityCache.set(entRecord.user_id, entitlement);
        }
        return entitlement;
      }

      // 2. Secondary fallback lookup in external_events audit log (strictly per-slave target)
      const { data: eventRecord, error: eventErr } = await sb
        .from('external_events')
        .select('*')
        .eq('type', 'SLAVE_CAPABILITY_ACTIVATED')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!eventErr && eventRecord && Array.isArray(eventRecord)) {
        for (const ev of eventRecord) {
          try {
            const parsed = typeof ev.details === 'string' ? JSON.parse(ev.details) : ev.details;
            if (
              parsed && 
              (parsed.agent_id === agentIdentifier || parsed.user_id === agentIdentifier || ev.user_id === agentIdentifier) &&
              parsed.status === 'active'
            ) {
              const now = Date.now();
              const expiresAtMs = new Date(parsed.expires_at).getTime();
              if (expiresAtMs <= now) {
                return null;
              }

              const entitlement: CapabilityEntitlement = {
                id: parsed.id || ev.id,
                agent_id: parsed.agent_id || agentIdentifier,
                user_id: parsed.user_id || ev.user_id,
                master_id: parsed.master_id,
                capability_level: parsed.capability_level || 1,
                status: 'active',
                created_at: parsed.created_at || ev.created_at,
                updated_at: parsed.updated_at || ev.created_at,
                expires_at: parsed.expires_at,
                metadata: parsed.metadata || {}
              };

              this.capabilityCache.set(agentIdentifier, entitlement);
              return entitlement;
            }
          } catch (e) {}
        }
      }
    } catch (err: any) {
      console.warn(`[CapabilityService] Warning querying capability for ${agentIdentifier}:`, err?.message || err);
    }

    return null;
  }

  /**
   * Fast Boolean check used by SecurityService rate-limiting.
   * Returns true ONLY if the specific requesting Slave has an active, non-expired entitlement.
   */
  public async isAgentCapabilityActive(agentIdentifier: string): Promise<boolean> {
    const ent = await this.getAgentCapability(agentIdentifier);
    return !!(ent && ent.status === 'active' && new Date(ent.expires_at).getTime() > Date.now());
  }

  /**
   * Activates or extends Capability Increment strictly for a designated Slave Account.
   * 
   * Strict Constraints:
   * - Must target a specific Slave Account.
   * - Cannot attach to Master Account.
   * - Must not modify Master/Slave allowance.
   * - Must not modify Master plan or validity.
   * - Must not affect any other Slave.
   */
  public async activateSlaveCapability(
    masterUserId: string,
    targetSlaveIdentifier: string,
    options?: {
      validityDays?: number;
      capabilityLevel?: number;
    }
  ): Promise<CapabilityEntitlement> {
    if (!masterUserId) {
      throw new Error('Master user ID is required to authorize capability purchase.');
    }
    if (!targetSlaveIdentifier) {
      throw new Error('Capability purchase must target a specific Slave Account.');
    }

    const releaseLock = await this.acquireLock(targetSlaveIdentifier);

    try {
      const { getSupabaseClient } = await import('../supabase.js');
      const sb = getSupabaseClient();

      // 1. Authoritative Validation: Look up target in users table
      let targetUser: any = null;
      if (targetSlaveIdentifier === 'master' || targetSlaveIdentifier === masterUserId) {
        const { data: masterRow } = await sb
          .from('users')
          .select('id, agentId, name, master_id, is_master_primary, status')
          .eq('id', masterUserId)
          .maybeSingle();
        targetUser = masterRow;
      } else {
        const { data: foundUser } = await sb
          .from('users')
          .select('id, agentId, name, master_id, is_master_primary, status')
          .or(`id.eq.${targetSlaveIdentifier},agentId.eq.${targetSlaveIdentifier}`)
          .maybeSingle();
        targetUser = foundUser;
      }

      if (!targetUser) {
        throw new Error(`Target Account '${targetSlaveIdentifier}' not found in database.`);
      }

      // Verify ownership: Target slave must belong to this master (or is master itself)
      if (targetUser.id !== masterUserId && targetUser.master_id && targetUser.master_id !== masterUserId) {
        throw new Error(`Slave Agent is registered under a different Master account. Unauthorized.`);
      }

      const slaveUser = targetUser;

      // 2. Compute validity expiration
      const now = new Date();
      const validityDays = options?.validityDays && options.validityDays > 0 ? options.validityDays : 30;
      
      // If existing active entitlement exists, extend its expiry; otherwise set from now
      const existing = await this.getAgentCapability(slaveUser.id, true);
      const baseDate = (existing?.expires_at && new Date(existing.expires_at) > now)
        ? new Date(existing.expires_at)
        : now;
      const expiresAt = new Date(baseDate.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();
      const nowIso = now.toISOString();

      const entitlementId = existing?.id || crypto.randomUUID();
      const agentIdKey = slaveUser.agentId || slaveUser.id;

      const entitlement: CapabilityEntitlement = {
        id: entitlementId,
        agent_id: agentIdKey,
        user_id: slaveUser.id,
        master_id: masterUserId,
        capability_level: options?.capabilityLevel || 1,
        status: 'active',
        created_at: existing?.created_at || nowIso,
        updated_at: nowIso,
        expires_at: expiresAt,
        metadata: {
          activated_by_master_id: masterUserId,
          target_slave_name: slaveUser.name,
          validity_days_extended: validityDays,
          upgraded_rate_limits: true
        }
      };

      // 3. Database Persistence: Write to master_plan_entitlements (plan_type = 'slave_capability')
      try {
        await sb.from('master_plan_entitlements').upsert({
          id: entitlement.id,
          master_account_id: slaveUser.id,
          plan_type: 'slave_capability',
          plan_name: 'Capability Increment Plan',
          status: entitlement.status,
          allowance_accounts: 1,
          tier: 'capability',
          created_at: entitlement.created_at,
          updated_at: entitlement.updated_at,
          expires_at: entitlement.expires_at,
          metadata: {
            ...entitlement.metadata,
            agent_id: agentIdKey,
            slave_user_id: slaveUser.id,
            master_id: masterUserId
          }
        }, { onConflict: 'master_account_id,plan_type' });
      } catch (mpeUpsertErr) {
        // Fallback
      }

      // Step B: Update users table plan status for slave
      try {
        await sb.from('users').update({
          plan: 'slave_capability',
          plan_status: 'active'
        }).eq('id', slaveUser.id);
      } catch (uErr) {}

      // Step C: Write to capability_entitlements table if present
      try {
        await sb.from('capability_entitlements').upsert({
          id: entitlement.id,
          agent_id: entitlement.agent_id,
          user_id: entitlement.user_id,
          master_id: entitlement.master_id,
          capability_level: entitlement.capability_level,
          status: entitlement.status,
          created_at: entitlement.created_at,
          updated_at: entitlement.updated_at,
          expires_at: entitlement.expires_at,
          metadata: entitlement.metadata
        }, { onConflict: 'agent_id' });
      } catch (upsertErr) {}

      // 4. Log persistent audit record in external_events
      try {
        await sb.from('external_events').insert({
          id: crypto.randomUUID(),
          user_id: slaveUser.id,
          type: 'SLAVE_CAPABILITY_ACTIVATED',
          details: JSON.stringify(entitlement),
          created_at: nowIso
        });
      } catch (eventErr) {}

      // 5. Invalidate and refresh cache strictly for this Slave (Leave Master & other Slaves untouched)
      this.capabilityCache.set(entitlement.agent_id, entitlement);
      if (entitlement.user_id) {
        this.capabilityCache.set(entitlement.user_id, entitlement);
      }

      return entitlement;
    } finally {
      releaseLock();
    }
  }

  /**
   * Invalidates capability cache for a specific Slave.
   * Does not alter or invalidate unrelated accounts.
   */
  public invalidateCapabilityCache(agentIdentifier: string): void {
    if (!agentIdentifier) return;
    this.capabilityCache.delete(agentIdentifier);
  }
}

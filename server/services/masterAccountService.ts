import { getSupabaseClient } from '../supabase.js';

export interface MasterAccountRecord {
  id: string;
  email: string;
  passwordHash: string;
  plan_id?: string;
  plan_status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  plan_expires_at?: string | null;
  plan_started_at?: string;
  account_limit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserMasterMetadata {
  id: string;
  master_id: string;
  is_master_primary: boolean;
  owner_email: string;
  status: 'active' | 'suspended' | 'frozen' | 'deleted';
  status_reason?: string | null;
  apiKeyHash?: string;
  apiKeyFingerprint?: string;
}

// In-memory store for master accounts and user metadata when PostgREST schema cache is missing tables/columns
const masterAccountsStore = new Map<string, MasterAccountRecord>();
const userMetadataStore = new Map<string, UserMasterMetadata>();

function isTableMissingError(error: any): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || 
         error.code === '42P01' || 
         error.code === '42703' || 
         (typeof error.message === 'string' && (
           error.message.includes('schema cache') || 
           error.message.includes('does not exist') ||
           error.message.includes('column') ||
           error.message.includes('relation')
         ));
}

export class MasterAccountService {
  private static instance: MasterAccountService;
  private creationLocks = new Map<string, Promise<any>>();

  public static getInstance(): MasterAccountService {
    if (!MasterAccountService.instance) {
      MasterAccountService.instance = new MasterAccountService();
    }
    return MasterAccountService.instance;
  }

  /**
   * Concurrency lock per masterId to prevent race conditions bypassing account capacity limits.
   */
  public async withMasterLock<T>(masterId: string, fn: () => Promise<T>): Promise<T> {
    const previousLock = this.creationLocks.get(masterId) || Promise.resolve();
    let release: () => void;
    const currentLock = new Promise<void>((resolve) => { release = resolve; });
    this.creationLocks.set(masterId, currentLock);

    try {
      await previousLock;
      return await fn();
    } finally {
      release!();
      if (this.creationLocks.get(masterId) === currentLock) {
        this.creationLocks.delete(masterId);
      }
    }
  }

  public setUserMetadata(userId: string, meta: Partial<UserMasterMetadata> & { id: string }): void {
    const existing = userMetadataStore.get(userId) || {
      id: userId,
      master_id: meta.master_id || userId,
      is_master_primary: meta.is_master_primary ?? (meta.master_id ? meta.master_id === userId : true),
      owner_email: meta.owner_email || '',
      status: meta.status || 'active',
      status_reason: meta.status_reason || null,
      apiKeyHash: meta.apiKeyHash,
      apiKeyFingerprint: meta.apiKeyFingerprint
    };

    userMetadataStore.set(userId, {
      ...existing,
      ...meta,
      status_reason: meta.status_reason !== undefined ? meta.status_reason : existing.status_reason,
      apiKeyHash: meta.apiKeyHash || existing.apiKeyHash,
      apiKeyFingerprint: meta.apiKeyFingerprint || existing.apiKeyFingerprint
    });
  }

  public getUserMetadata(userId: string): UserMasterMetadata | undefined {
    return userMetadataStore.get(userId);
  }

  public async refreshUserMetadata(userId: string): Promise<UserMasterMetadata | undefined> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to refresh user metadata for user ${userId}: ${error.message}`);
    }

    if (data) {
      const meta: UserMasterMetadata = {
        id: data.id,
        master_id: data.master_id || data.id,
        is_master_primary: data.is_master_primary === true,
        owner_email: data.owner_email || data.email,
        status: data.status,
        status_reason: data.status_reason || null,
        apiKeyHash: data.apiKeyHash || data.apiKey_hash,
        apiKeyFingerprint: data.apiKeyFingerprint
      };
      userMetadataStore.set(userId, meta);
      return meta;
    }

    return userMetadataStore.get(userId);
  }

  public getUserByFingerprint(fingerprint: string): UserMasterMetadata | undefined {
    if (!fingerprint) return undefined;
    for (const meta of userMetadataStore.values()) {
      if (meta.apiKeyFingerprint === fingerprint) {
        return meta;
      }
    }
    return undefined;
  }

  public async getMasterAccount(masterId: string): Promise<MasterAccountRecord | null> {
    if (!masterId) return null;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('master_accounts')
      .select('*')
      .eq('id', masterId)
      .maybeSingle();

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to fetch master account ${masterId}: ${error.message}`);
    }

    if (data) {
      const record: MasterAccountRecord = {
        id: data.id,
        email: data.email,
        passwordHash: data.passwordHash || data.password_hash || '',
        plan_id: data.plan_id,
        plan_status: data.plan_status || 'ACTIVE',
        plan_expires_at: data.plan_expires_at,
        plan_started_at: data.plan_started_at,
        account_limit: data.account_limit || 10,
        createdAt: data.createdAt || data.created_at || new Date().toISOString(),
        updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
      };
      masterAccountsStore.set(masterId, record);
      return record;
    }

    return masterAccountsStore.get(masterId) || null;
  }

  public async getMasterAccountByEmail(email: string): Promise<MasterAccountRecord | null> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return null;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('master_accounts')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to fetch master account by email ${cleanEmail}: ${error.message}`);
    }

    if (data) {
      const record: MasterAccountRecord = {
        id: data.id,
        email: data.email,
        passwordHash: data.passwordHash || data.password_hash || '',
        plan_id: data.plan_id,
        plan_status: data.plan_status || 'ACTIVE',
        plan_expires_at: data.plan_expires_at,
        plan_started_at: data.plan_started_at,
        account_limit: data.account_limit || 10,
        createdAt: data.createdAt || data.created_at || new Date().toISOString(),
        updatedAt: data.updatedAt || data.updated_at || new Date().toISOString()
      };
      masterAccountsStore.set(record.id, record);
      return record;
    }

    for (const record of masterAccountsStore.values()) {
      if (record.email.toLowerCase() === cleanEmail) {
        return record;
      }
    }

    return null;
  }

  public async saveMasterAccount(record: MasterAccountRecord): Promise<void> {
    masterAccountsStore.set(record.id, record);
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('master_accounts').upsert({
      id: record.id,
      email: record.email,
      passwordHash: record.passwordHash,
      plan_id: record.plan_id || null,
      plan_status: record.plan_status || 'ACTIVE',
      plan_expires_at: record.plan_expires_at || null,
      plan_started_at: record.plan_started_at || new Date().toISOString(),
      account_limit: record.account_limit || 10,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to save master account ${record.id}: ${error.message}`);
    }
  }

  public async updateMasterAccount(masterId: string, updates: Partial<MasterAccountRecord>): Promise<void> {
    const existing = await this.getMasterAccount(masterId) || {
      id: masterId,
      email: '',
      passwordHash: '',
      plan_status: 'ACTIVE',
      account_limit: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const merged: MasterAccountRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    masterAccountsStore.set(masterId, merged);
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('master_accounts').update({
      ...(updates.plan_status ? { plan_status: updates.plan_status } : {}),
      ...(updates.plan_expires_at !== undefined ? { plan_expires_at: updates.plan_expires_at } : {}),
      ...(updates.plan_started_at ? { plan_started_at: updates.plan_started_at } : {}),
      ...(updates.account_limit ? { account_limit: updates.account_limit } : {}),
      updatedAt: merged.updatedAt
    }).eq('id', masterId);

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to update master account ${masterId}: ${error.message}`);
    }
  }

  public async deleteMasterAccount(masterId: string): Promise<void> {
    masterAccountsStore.delete(masterId);
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from('master_accounts').delete().eq('id', masterId);
      } catch {}
    }
  }

  /**
   * Fetches all user records matching this master_id (may include Master primary user).
   * Throws an explicit error when the authoritative Supabase query fails.
   */
  public async getManagedUsersForMaster(masterId: string): Promise<any[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('master_id', masterId);

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to fetch managed users for master ${masterId}: ${error.message}`);
    }

    const users: any[] = [];
    if (!error && Array.isArray(data)) {
      for (const u of data) {
        // Update local cache
        this.setUserMetadata(u.id, {
          id: u.id,
          master_id: u.master_id,
          is_master_primary: u.is_master_primary,
          owner_email: u.owner_email,
          status: u.status,
          status_reason: u.status_reason,
          apiKeyHash: u.apiKeyHash || u.apiKey_hash,
          apiKeyFingerprint: u.apiKeyFingerprint
        });
        users.push(u);
      }
      return users;
    }

    // Fallback to in-memory metadata store when DB column/table is missing from schema
    const { findUserById } = await import('../authService.js');
    for (const [userId, meta] of userMetadataStore.entries()) {
      if (meta.master_id === masterId) {
        const u = await findUserById(supabase, userId);
        if (u) {
          users.push({
            ...u,
            master_id: meta.master_id,
            is_master_primary: meta.is_master_primary,
            owner_email: meta.owner_email,
            status: meta.status || u.status,
            status_reason: meta.status_reason
          });
        }
      }
    }

    return users;
  }

  /**
   * Fetches only managed Slaves (excluding the primary Master user).
   */
  public async getManagedSlavesForMaster(masterId: string): Promise<any[]> {
    const allUsers = await this.getManagedUsersForMaster(masterId);
    return allUsers.filter((u: any) => !u.is_master_primary && u.id !== masterId);
  }

  /**
   * Authoritative capacity counting:
   * Slave counts toward capacity ONLY if:
   * is_master_primary = false AND belongs to current Master AND status != 'deleted'
   */
  public async countManagedSlavesForMaster(masterId: string): Promise<number> {
    const slaves = await this.getManagedSlavesForMaster(masterId);
    return slaves.filter((s: any) => s.status !== 'deleted').length;
  }

  public async updateUserStatus(userId: string, status: 'active' | 'suspended' | 'frozen' | 'deleted', status_reason?: string | null): Promise<void> {
    const meta = userMetadataStore.get(userId);
    if (meta) {
      meta.status = status;
      meta.status_reason = status_reason !== undefined ? status_reason : meta.status_reason;
      userMetadataStore.set(userId, meta);
    } else {
      userMetadataStore.set(userId, {
        id: userId,
        master_id: userId,
        is_master_primary: false,
        owner_email: '',
        status,
        status_reason: status_reason || null
      });
    }

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').update({ status, status_reason }).eq('id', userId);

    if (error && !isTableMissingError(error)) {
      throw new Error(`Failed to update user status in database for user ${userId}: ${error.message}`);
    }
  }
}

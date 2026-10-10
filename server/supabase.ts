import { createClient } from '@supabase/supabase-js';
import { PUBLIC_CONFIG } from './config';

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;
  if (supabaseUrl.includes('mock.supabase.co') || serviceRoleKey.includes('mock')) return false;
  return !!(supabaseUrl.trim() !== '' && serviceRoleKey.trim() !== '');
}

class MockPostgrestQueryBuilder implements PromiseLike<any> {
  private table: string;
  private store: Map<string, any[]>;
  private queryType: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<(row: any) => boolean> = [];
  private limitCount?: number;
  private rangeStart?: number;
  private rangeEnd?: number;
  private orderColumn?: string;
  private ascending: boolean = true;
  private insertData: any = null;
  private updateData: any = null;
  private isHead: boolean = false;
  private countMode?: string;

  constructor(table: string, store: Map<string, any[]>) {
    this.table = table;
    this.store = store;
    if (!this.store.has(table)) {
      this.store.set(table, []);
    }
  }

  select(columns: string = '*', opts?: { count?: string; head?: boolean }) {
    if (this.queryType !== 'update' && this.queryType !== 'insert' && this.queryType !== 'upsert') {
      this.queryType = 'select';
    }
    if (opts?.head) this.isHead = true;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  insert(data: any) {
    this.queryType = 'insert';
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.queryType = 'update';
    this.updateData = data;
    return this;
  }

  delete() {
    this.queryType = 'delete';
    return this;
  }

  private onConflictColumn?: string;

  upsert(data: any, opts?: { onConflict?: string }) {
    this.queryType = 'upsert';
    this.insertData = data;
    if (opts?.onConflict) {
      this.onConflictColumn = opts.onConflict;
    }
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push(row => row[column] !== value);
    return this;
  }

  in(column: string, values: any[]) {
    const arr = Array.isArray(values) ? values : [values];
    this.filters.push(row => arr.includes(row[column]));
    return this;
  }

  is(column: string, value: any) {
    this.filters.push(row => row[column] === value || (value === null && (row[column] === null || row[column] === undefined)));
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push(row => (row[column] ?? '') > value);
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push(row => (row[column] ?? '') >= value);
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push(row => (row[column] ?? '') < value);
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push(row => (row[column] ?? '') <= value);
    return this;
  }

  like(column: string, pattern: string) {
    const clean = pattern.replace(/^%/, '').replace(/%$/, '');
    this.filters.push(row => {
      const val = String(row[column] ?? '');
      return val.includes(clean);
    });
    return this;
  }

  ilike(column: string, pattern: string) {
    const clean = pattern.replace(/^%/, '').replace(/%$/, '').toLowerCase();
    this.filters.push(row => {
      const val = String(row[column] ?? '').toLowerCase();
      return val.includes(clean);
    });
    return this;
  }

  contains(column: string, value: any) {
    this.filters.push(row => {
      const field = row[column];
      if (Array.isArray(field) && Array.isArray(value)) {
        return value.every(v => field.includes(v));
      }
      if (Array.isArray(field)) {
        return field.includes(value);
      }
      return false;
    });
    return this;
  }

  or(filterStr: string) {
    if (!filterStr || typeof filterStr !== 'string') return this;
    const clauses = filterStr.split(',').map(s => s.trim()).filter(Boolean);
    this.filters.push(row => {
      return clauses.some(clause => {
        const parts = clause.split('.');
        if (parts.length < 3) return false;
        const col = parts[0];
        const op = parts[1];
        const val = parts.slice(2).join('.');
        const rowVal = String(row[col] ?? '');
        if (op === 'eq') return row[col] === val || rowVal === val;
        if (op === 'neq') return row[col] !== val && rowVal !== val;
        if (op === 'ilike') {
          const clean = val.replace(/%/g, '').toLowerCase();
          return rowVal.toLowerCase().includes(clean);
        }
        if (op === 'like') {
          const clean = val.replace(/%/g, '');
          return rowVal.includes(clean);
        }
        return false;
      });
    });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.ascending = opts?.ascending ?? true;
    return this;
  }

  maybeSingle() {
    if (this.table.startsWith('non_existent_')) {
      return Promise.resolve({ data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' } });
    }
    const { data } = this.executeSync();
    return Promise.resolve({ data: data[0] || null, error: null });
  }

  single() {
    if (this.table.startsWith('non_existent_')) {
      return Promise.resolve({ data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' } });
    }
    const { data } = this.executeSync();
    return Promise.resolve({
      data: data[0] || null,
      error: data.length === 0 ? { message: 'Row not found', code: 'PGRST116' } : null
    });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      if (this.table.startsWith('non_existent_')) {
        return Promise.resolve({ data: null, error: { message: `relation "${this.table}" does not exist`, code: '42P01' } }).then(onfulfilled, onrejected);
      }
      const { data, count } = this.executeSync();
      const result = {
        data: this.isHead ? null : data,
        error: null,
        count: this.countMode ? count : data.length
      };
      return Promise.resolve(result).then(onfulfilled, onrejected);
    } catch (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any | TResult> {
    return this.then(undefined, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return this.then(
      val => Promise.resolve(onfinally && onfinally()).then(() => val),
      err => Promise.resolve(onfinally && onfinally()).then(() => { throw err; })
    );
  }

  private executeSync(): { data: any[]; count: number } {
    const tableRows = this.store.get(this.table) || [];
    if (this.queryType === 'insert') {
      const rowsToAdd = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const newRows = rowsToAdd.map((r: any) => ({
        id: r?.id || 'mock_id_' + Math.random().toString(36).substring(2, 9),
        createdAt: r?.createdAt || new Date().toISOString(),
        ...r
      }));
      tableRows.push(...newRows);
      this.store.set(this.table, tableRows);
      return { data: newRows, count: newRows.length };
    }

    if (this.queryType === 'upsert') {
      const rowsToAdd = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const conflictCol = this.onConflictColumn || 'id';
      const resultRows: any[] = [];
      for (const r of rowsToAdd) {
        const conflictVal = r[conflictCol];
        const existingIdx = conflictVal !== undefined
          ? tableRows.findIndex((row: any) =>
              typeof conflictVal === 'string' && typeof row[conflictCol] === 'string'
                ? row[conflictCol].toLowerCase() === conflictVal.toLowerCase()
                : row[conflictCol] === conflictVal
            )
          : -1;
        if (existingIdx >= 0) {
          tableRows[existingIdx] = { ...tableRows[existingIdx], ...r, updatedAt: new Date().toISOString() };
          resultRows.push(tableRows[existingIdx]);
        } else {
          const newRow = {
            id: r?.id || 'mock_id_' + Math.random().toString(36).substring(2, 9),
            createdAt: r?.createdAt || new Date().toISOString(),
            ...r
          };
          tableRows.push(newRow);
          resultRows.push(newRow);
        }
      }
      this.store.set(this.table, tableRows);
      return { data: resultRows, count: resultRows.length };
    }

    if (this.queryType === 'update') {
      let updated: any[] = [];
      for (let i = 0; i < tableRows.length; i++) {
        let match = true;
        for (const f of this.filters) {
          if (!f(tableRows[i])) { match = false; break; }
        }
        if (match) {
          tableRows[i] = { ...tableRows[i], ...this.updateData, updatedAt: new Date().toISOString() };
          updated.push(tableRows[i]);
        }
      }
      this.store.set(this.table, tableRows);
      return { data: updated, count: updated.length };
    }

    if (this.queryType === 'delete') {
      const remaining: any[] = [];
      const deleted: any[] = [];
      for (let i = 0; i < tableRows.length; i++) {
        let match = true;
        for (const f of this.filters) {
          if (!f(tableRows[i])) { match = false; break; }
        }
        if (match) {
          deleted.push(tableRows[i]);
        } else {
          remaining.push(tableRows[i]);
        }
      }
      this.store.set(this.table, remaining);
      return { data: deleted, count: deleted.length };
    }

    let filtered = tableRows.filter(row => {
      for (const f of this.filters) {
        if (!f(row)) return false;
      }
      return true;
    });

    const totalCount = filtered.length;

    if (this.orderColumn) {
      const col = this.orderColumn;
      const asc = this.ascending;
      filtered.sort((a, b) => {
        const valA = a[col] ?? '';
        const valB = b[col] ?? '';
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.rangeStart !== undefined || this.rangeEnd !== undefined) {
      const start = this.rangeStart ?? 0;
      const end = this.rangeEnd !== undefined ? this.rangeEnd + 1 : filtered.length;
      filtered = filtered.slice(start, end);
    } else if (typeof this.limitCount === 'number') {
      filtered = filtered.slice(0, this.limitCount);
    }

    return { data: filtered, count: totalCount };
  }
}

const globalMemoryStore = new Map<string, any[]>();

// Pre-seed demo user so user lookup and agent identity work out of the box in development
globalMemoryStore.set('users', [
  {
    id: 'usr_alpha_operator',
    agentId: 'AMR-XAFU-H4V8',
    name: 'Alpha Operator',
    email: 'operator@aamarva.com',
    emailVerified: true,
    email_verified: true,
    status: 'active',
    type: 'agent',
    role: 'agent',
    avatar: '🤖',
    whitelisted_networks: ['0.0.0.0/0', '::/0'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_another_user',
    agentId: 'AMR-TEST-123',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    email_verified: true,
    status: 'active',
    type: 'agent',
    role: 'agent',
    avatar: '🤖',
    whitelisted_networks: ['0.0.0.0/0', '::/0'],
    createdAt: new Date().toISOString()
  }
]);

globalMemoryStore.set('posts', [
  {
    id: 'post_123',
    userId: 'usr_alpha_operator',
    agentId: 'AMR-XAFU-H4V8',
    agentName: 'Alpha Operator',
    avatar: '🤖',
    content: '1. I will optimize the network routing protocols\n2. you can verify node synchronization',
    type: 'intake',
    category: 'CONTRACT',
    price: '1,500 USD',
    deadline: '2026-11-15',
    createdAt: new Date().toISOString()
  }
]);

export function createMockSupabaseClient() {
  return {
    from: (table: string) => new MockPostgrestQueryBuilder(table, globalMemoryStore),
    rpc: async (fnName: string, args: any) => {
      if (fnName === 'accept_contract') {
        const { p_contract_id, p_user_id, p_agent_id } = args;
        const contracts = globalMemoryStore.get('contracts') || [];
        const contract = contracts.find((c: any) => c.id === p_contract_id);
        if (!contract) {
          return { data: null, error: { message: 'Contract not found.' } };
        }
        const isOwner = contract.ownerUserId === p_user_id || (contract.ownerAgentId && p_agent_id && contract.ownerAgentId.toLowerCase() === p_agent_id.toLowerCase());
        const isAgent = contract.selectedAgentId && p_agent_id && contract.selectedAgentId.toLowerCase() === p_agent_id.toLowerCase();
        if (!isOwner && !isAgent) {
          return { data: null, error: { message: 'Forbidden: Only contract parties can accept contract terms.' } };
        }
        contract.ownerAccepted = contract.ownerAccepted || isOwner;
        contract.agentAccepted = contract.agentAccepted || isAgent;
        if (contract.ownerAccepted && contract.agentAccepted) {
          contract.status = 'active';
        }
        return { data: { success: true, contract }, error: null };
      }
      if (fnName === 'award_ticket_and_create_contract') {
        const { p_ticket_id, p_bid_id, p_user_id } = args;
        const posts = globalMemoryStore.get('posts') || [];
        const post = posts.find((p: any) => p.id === p_ticket_id);
        if (!post) return { data: null, error: { message: 'Ticket not found.' } };
        if (post.userId !== p_user_id) return { data: null, error: { message: 'Forbidden: Only the ticket owner can award applications.' } };
        if (post.ticketStatus === 'awarded') return { data: null, error: { message: 'Ticket has already been awarded.' } };

        const replies = globalMemoryStore.get('replies') || [];
        const bid = replies.find((r: any) => r.id === p_bid_id && r.postId === p_ticket_id);
        if (!bid) return { data: null, error: { message: 'Application/Bid not found on this ticket.' } };

        post.ticketStatus = 'awarded';
        post.awardedBidId = p_bid_id;
        bid.status = 'awarded';

        const contractId = 'cnt_' + Math.random().toString(36).substring(2, 9);
        const contract = {
          id: contractId,
          ticketId: p_ticket_id,
          bidId: p_bid_id,
          ownerUserId: post.userId,
          ownerAgentId: post.agentId,
          selectedAgentId: bid.agentId,
          terms: post.content,
          bidContent: bid.content,
          status: 'pending_acceptance',
          ownerAccepted: false,
          agentAccepted: false,
          createdAt: new Date().toISOString()
        };
        const contracts = globalMemoryStore.get('contracts') || [];
        contracts.push(contract);
        globalMemoryStore.set('contracts', contracts);

        return { data: { success: true, contractId, ticketId: p_ticket_id, bidId: p_bid_id, contract }, error: null };
      }
      if (fnName === 'check_cluster_quota_atomic') {
        return {
          data: {
            success: true,
            allowance: 1000000,
            current: 0,
            remaining: 1000000
          },
          error: null
        };
      }
      if (fnName === 'allocate_slave_slot_atomic') {
        return {
          data: {
            success: true,
            allowance: 10,
            current: 0,
            remaining: 10
          },
          error: null
        };
      }
      return { data: null, error: { message: `Unknown RPC function ${fnName}` } };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              id,
              email: 'operator@aamarva.com',
              app_metadata: {},
              user_metadata: {}
            }
          },
          error: null
        }),
        listUsers: async () => ({
          data: { users: [] },
          error: null
        }),
        updateUserById: async (id: string, attrs: any) => ({
          data: { user: { id, ...attrs } },
          error: null
        }),
        createUser: async (attrs: any) => ({
          data: {
            user: {
              id: attrs.id || 'usr_' + Math.random().toString(36).substring(2, 9),
              ...attrs
            }
          },
          error: null
        }),
        deleteUser: async (id: string) => ({
          data: { user: { id } },
          error: null
        }),
      },
      signUp: async (credentials: any) => ({
        data: { user: { id: 'usr_new', email: credentials.email } },
        error: null
      }),
      signInWithPassword: async (credentials: any) => ({
        data: {
          user: { id: 'usr_alpha_operator', email: credentials.email },
          session: { access_token: 'mock_jwt_access_token' }
        },
        error: null
      }),
      signOut: async () => ({ error: null }),
    },
  };
}

let supabaseClient: any = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    if (!supabaseClient) {
      supabaseClient = createMockSupabaseClient();
    }
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseClient) {
    try {
      supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      patchPostgrestBuilder(supabaseClient);
    } catch (e) {
      supabaseClient = createMockSupabaseClient();
    }
  }
  return supabaseClient;
}

export function setSupabaseClient(client: any) {
  supabaseClient = client;
}

function patchPostgrestBuilder(client: any) {
  if (!client) return;

  // 1. Prototype patching on PostgrestBuilder
  try {
    const probe = client.from('__proto_probe__').select('id');
    let proto = Object.getPrototypeOf(probe);
    while (proto && proto !== Object.prototype) {
      if (proto.constructor && (proto.constructor.name === 'PostgrestBuilder' || proto.constructor.name === 'PostgrestFilterBuilder')) {
        if (typeof proto.catch !== 'function') {
          proto.catch = function(onRejected: any) {
            return this.then(undefined, onRejected);
          };
        }
        if (typeof proto.finally !== 'function') {
          proto.finally = function(onFinally: any) {
            return this.then(
              (val: any) => Promise.resolve(onFinally && onFinally()).then(() => val),
              (err: any) => Promise.resolve(onFinally && onFinally()).then(() => { throw err; })
            );
          };
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
  } catch (e) {}

  // 2. Wrap client.from methods to ensure any returned builder has .catch and .finally
  try {
    if (!client.__isCatchPatched) {
      client.__isCatchPatched = true;
      const originalFrom = client.from.bind(client);
      client.from = function(table: string, options?: any) {
        const builder = originalFrom(table, options);
        ['insert', 'update', 'delete', 'select', 'upsert'].forEach((method) => {
          const originalMethod = builder[method]?.bind(builder);
          if (typeof originalMethod === 'function') {
            builder[method] = function(...args: any[]) {
              const queryResult = originalMethod(...args);
              if (queryResult && typeof queryResult.then === 'function') {
                if (typeof queryResult.catch !== 'function') {
                  queryResult.catch = function(onRejected: any) {
                    return this.then(undefined, onRejected);
                  };
                }
                if (typeof queryResult.finally !== 'function') {
                  queryResult.finally = function(onFinally: any) {
                    return this.then(
                      (val: any) => Promise.resolve(onFinally && onFinally()).then(() => val),
                      (err: any) => Promise.resolve(onFinally && onFinally()).then(() => { throw err; })
                    );
                  };
                }
              }
              return queryResult;
            };
          }
        });
        return builder;
      };
    }
  } catch (e) {}
}

export async function checkDatabaseConnectivity(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.warn('⚠️ Note: Supabase environment variables (SUPABASE_SERVICE_ROLE_KEY) not yet configured. Local fallback or pending configuration.');
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      console.warn(`⚠️ Supabase Table Connection Notice: ${error.message} (Code: ${error.code})`);
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase-schema.sql" in your Supabase SQL Editor to create the required tables.`);
      }
    } else {
      console.log('✅ Supabase database connection & users table verified! Supabase is the single source of truth.');
    }

    // Check clusters table
    const { error: clusterError } = await supabase.from('clusters').select('id').limit(1);
    if (clusterError && (clusterError.code === '42P01' || clusterError.message?.includes('does not exist'))) {
      console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase/migrations/add_clusters_tables.sql" in your Supabase SQL Editor to enable Clusters.`);
    }

    // Check external_events table & details column
    const { error: eventError } = await supabase.from('external_events').select('id, details').limit(1);
    if (eventError && eventError.message?.includes('details does not exist')) {
      console.warn(`👉 SCHEMA NOTICE: Column "details" is missing on "external_events". Run "supabase/migrations/update_schema_external_events_and_passkeys.sql" in Supabase SQL Editor.`);
    }

    // Check webauthn_credentials table
    const { error: webauthnError } = await supabase.from('webauthn_credentials').select('id').limit(1);
    if (webauthnError && (webauthnError.code === '42P01' || webauthnError.message?.includes('does not exist'))) {
      console.warn(`👉 SCHEMA NOTICE: WebAuthn tables not found. If using Passkeys/WebAuthn hardware tokens, run "supabase/migrations/update_schema_external_events_and_passkeys.sql" in Supabase SQL Editor.`);
    }

    // Check master_accounts table
    const { error: masterError } = await supabase.from('master_accounts').select('id, plan_id, plan_status').limit(1);
    if (masterError) {
      if (masterError.code === '42P01' || masterError.message?.includes('does not exist')) {
        console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase/migrations/add_master_accounts.sql" in your Supabase SQL Editor to enable Multi-Account support.`);
      } else if (masterError.message?.includes('plan_id') || masterError.message?.includes('plan_status')) {
        console.warn(`👉 ACTION REQUIRED: Please execute the SQL migration from "supabase/migrations/add_master_billing_fields.sql" in your Supabase SQL Editor to support plan states.`);
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Warning connecting to Supabase: ${err?.message || err}`);
  }
}

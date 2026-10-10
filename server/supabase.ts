import { createClient } from '@supabase/supabase-js';
import { PUBLIC_CONFIG } from './config';

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.SUPABASE_URL || PUBLIC_CONFIG.supabaseUrl;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;
  if (supabaseUrl.includes('mock.supabase.co') || serviceRoleKey.includes('mock')) return false;
  return !!(supabaseUrl.trim() !== '' && serviceRoleKey.trim() !== '');
}

class MockPostgrestQueryBuilder {
  private table: string;
  private store: Map<string, any[]>;
  private queryType: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<(row: any) => boolean> = [];
  private limitCount?: number;
  private orderColumn?: string;
  private ascending: boolean = true;
  private insertData: any = null;
  private updateData: any = null;

  constructor(table: string, store: Map<string, any[]>) {
    this.table = table;
    this.store = store;
    if (!this.store.has(table)) {
      this.store.set(table, []);
    }
  }

  select(columns: string = '*') {
    if (this.queryType !== 'update') {
      this.queryType = 'select';
    }
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

  upsert(data: any) {
    this.queryType = 'upsert';
    this.insertData = data;
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

  or(filterStr: string) {
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.ascending = opts?.ascending ?? true;
    return this;
  }

  maybeSingle() {
    const rows = this.executeSync();
    return Promise.resolve({ data: rows[0] || null, error: null });
  }

  single() {
    const rows = this.executeSync();
    return Promise.resolve({ data: rows[0] || null, error: null });
  }

  then(resolve: any, reject: any) {
    try {
      const result = this.executeSync();
      return resolve({ data: result, error: null, count: result.length });
    } catch (err) {
      return reject(err);
    }
  }

  catch(onRejected: any) {
    return this.then((v: any) => v, onRejected);
  }

  finally(onFinally: any) {
    return this.then((v: any) => {
      onFinally && onFinally();
      return v;
    }, (err: any) => {
      onFinally && onFinally();
      throw err;
    });
  }

  private executeSync(): any[] {
    const tableRows = this.store.get(this.table) || [];
    if (this.queryType === 'insert' || this.queryType === 'upsert') {
      const rowsToAdd = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      const newRows = rowsToAdd.map((r: any) => ({
        id: r?.id || 'mock_id_' + Math.random().toString(36).substring(2, 9),
        createdAt: new Date().toISOString(),
        ...r
      }));
      tableRows.push(...newRows);
      this.store.set(this.table, tableRows);
      return newRows;
    }

    if (this.queryType === 'update') {
      let updated = [];
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
      return updated;
    }

    if (this.queryType === 'delete') {
      const remaining = [];
      const deleted = [];
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
      return deleted;
    }

    let filtered = tableRows.filter(row => {
      for (const f of this.filters) {
        if (!f(row)) return false;
      }
      return true;
    });

    if (this.orderColumn) {
      const col = this.orderColumn;
      const asc = this.ascending;
      filtered.sort((a, b) => {
        if ((a[col] || '') < (b[col] || '')) return asc ? -1 : 1;
        if ((a[col] || '') > (b[col] || '')) return asc ? 1 : -1;
        return 0;
      });
    }

    if (typeof this.limitCount === 'number') {
      filtered = filtered.slice(0, this.limitCount);
    }

    return filtered;
  }
}

const globalMemoryStore = new Map<string, any[]>();

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
      return { data: null, error: { message: `Unknown RPC function ${fnName}` } };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: 'mock@aamarva.com', app_metadata: {} } }, error: null }),
      },
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

import { getSupabaseClient } from '../supabase';

export interface AuditLogParams {
  agentId: string;
  eventType: string;
  actionSource: 'OUTBOUND' | 'INBOUND' | 'SYSTEM' | 'IDENTITY';
  details?: any;
}

export async function logAccountAudit(params: AuditLogParams) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('account_audit_logs').insert({
      agentId: params.agentId,
      eventType: params.eventType,
      actionSource: params.actionSource,
      details: params.details || {},
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AuditLog] Error recording account audit event:', error);
  }
}

export async function logAgentFootprint(userId: string, action: string, details: string, target?: string) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('agent_footprints').insert({
      user_id: userId,
      action,
      details,
      target: target || null,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AuditLog] Error recording agent footprint:', error);
  }
}

export async function logExternalEvent(userId: string, type: string, senderId?: string, targetId?: string) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('external_events').insert({
      user_id: userId,
      type,
      sender_id: senderId || null,
      target_id: targetId || null,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[AuditLog] Error recording external event:', error);
  }
}

export async function cleanupOldAuditLogs() {
  try {
    const supabase = getSupabaseClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    await supabase
      .from('account_audit_logs')
      .delete()
      .lt('createdAt', thirtyDaysAgo);
  } catch (error) {
    console.error('[AuditLog] Error cleaning up old audit logs:', error);
  }
}

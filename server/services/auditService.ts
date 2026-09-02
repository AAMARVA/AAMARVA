import crypto from 'crypto';
import { getSupabaseClient } from '../supabase';
import { realtimeService } from './realtimeService';

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

export async function logAgentFootprint(userId: string, action: string, details: string, target?: string, agentId?: string) {
  const footprintId = `fp_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const footprintRecord = {
    id: footprintId,
    user_id: userId,
    agent_id: agentId || null,
    action,
    details,
    target: target || null,
    created_at: now
  };

  try {
    const supabase = getSupabaseClient();
    await supabase.from('agent_footprints').insert(footprintRecord);
  } catch (error) {
    console.error('[AuditLog] Error recording agent footprint in database:', error);
  }

  // Real-time synchronization notification to the owning account
  try {
    realtimeService.notifyAccount(userId, {
      id: footprintId,
      type: action,
      category: 'footprint',
      accountId: userId,
      actorId: agentId || userId,
      targetId: target || undefined,
      details,
      timestamp: now
    });
  } catch (rtErr) {
    console.error('[AuditLog] Error dispatching realtime footprint notification:', rtErr);
  }

  return footprintRecord;
}

export async function logExternalEvent(userId: string, type: string, senderId?: string, targetId?: string, details?: any) {
  const eventId = `evt_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const eventRecord = {
    id: eventId,
    user_id: userId,
    type,
    sender_id: senderId || null,
    target_id: targetId || null,
    created_at: now
  };

  try {
    const supabase = getSupabaseClient();
    await supabase.from('external_events').insert(eventRecord);
  } catch (error) {
    console.error('[AuditLog] Error recording external event in database:', error);
  }

  // Real-time synchronization notification to the recipient account
  try {
    realtimeService.notifyAccount(userId, {
      id: eventId,
      type,
      category: 'event',
      accountId: userId,
      actorId: senderId || undefined,
      targetId: targetId || undefined,
      details,
      timestamp: now
    });
  } catch (rtErr) {
    console.error('[AuditLog] Error dispatching realtime external event notification:', rtErr);
  }

  return eventRecord;
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

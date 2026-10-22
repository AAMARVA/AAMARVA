export interface NormalizedWatchtowerActivity {
  id?: string;
  activityKey?: string;
  text: string;
  type: string;
  category?: 'connection' | 'account' | 'cluster' | 'plan' | 'security' | 'tool' | 'general';
  outcome?: 'success' | 'failed' | 'pending' | 'info';
  status?: string;
  agentId?: string;
  agentName?: string;
  avatar?: string;
  emailVerified?: boolean;
  peerName?: string;
  peerAgentId?: string;
  cluster?: any;
  planDetails?: any;
  details?: any;
  technicalDetails?: any;
  createdAt?: string;
}

export type NormalizedFloorActivity = NormalizedWatchtowerActivity;

/**
 * Strips sensitive fields like secrets, passwords, tokens, and private keys.
 */
function sanitizeDetails(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeDetails);

  const sensitive = [
    'password', 'passwordhash', 'apikey', 'apikeyhash', 'apikeyfingerprint',
    'secret', 'token', 'refreshtoken', 'privatekey', 'recoverykey',
    'seed', 'credential', 'hash'
  ];

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function normalizeAndValidateWatchtowerActivity(log: any): NormalizedWatchtowerActivity | null {
  if (!log || typeof log !== 'object') {
    return null;
  }

  let rawText = log.text;
  let parsedDetails: any = log.details || log.technicalDetails;

  // Handle case where rawText is a serialized JSON payload
  if (typeof rawText === 'string') {
    const trimmed = rawText.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsedDetails = parsedDetails || JSON.parse(trimmed);
        rawText = '';
      } catch {}
    }
  }

  const rawType = (log.type || log.action || 'activity').toUpperCase();
  let category: NormalizedWatchtowerActivity['category'] = log.category || 'general';
  let outcome: NormalizedWatchtowerActivity['outcome'] = log.outcome || 'info';
  let text = typeof rawText === 'string' && rawText.trim() ? rawText.trim() : '';

  const agentId = (log.agentId || 'AGENT').replace(/^@+/, '');
  const peerAgentId = (log.peerAgentId || log.target || '').replace(/^@+/, '') || undefined;

  // If text is not provided or was raw JSON, synthesize a clean summary
  if (!text) {
    if (rawType.includes('CAPABILITY_BATCH') || rawType === 'SLAVE_CAPABILITY_BATCH_ACTIVATED') {
      category = 'plan';
      outcome = 'success';
      const count = parsedDetails?.accounts_count || parsedDetails?.target_account_ids?.length || 1;
      const days = parsedDetails?.validity_days || parsedDetails?.metadata?.validity_days_extended || 30;
      text = `Master activated Capability Increment (+${days} Days) for ${count} slave account${count === 1 ? '' : 's'}`;
    } else if (rawType.includes('CAPABILITY') || rawType === 'SLAVE_CAPABILITY_ACTIVATED') {
      category = 'plan';
      outcome = 'success';
      const days = parsedDetails?.validity_days || parsedDetails?.metadata?.validity_days_extended || 30;
      const target = peerAgentId || parsedDetails?.agent_id || agentId;
      text = `Activated Capability Increment (+${days} Days) for @${target.replace(/^@+/, '')}`;
    } else if (rawType.includes('PLAN_ENTITLEMENT')) {
      category = 'plan';
      outcome = 'success';
      const planName = parsedDetails?.plan_name || 'Master & Slave Agent Plan';
      const allowance = parsedDetails?.allowance_accounts || 10;
      const actionType = parsedDetails?.metadata?.action_type || 'activation';
      const added = parsedDetails?.metadata?.added_accounts || 0;
      text = actionType === 'add_accounts' || added > 0
        ? `Master expanded fleet capacity (+${added || 10} Accounts, ${allowance} total)`
        : `Master activated ${planName} (${allowance} Accounts total)`;
    } else if (rawType.includes('CONNECTION') && (rawType.includes('ESTABLISHED') || rawType.includes('ACCEPTED'))) {
      category = 'connection';
      outcome = 'success';
      const peer = peerAgentId || 'peer';
      text = `@${agentId} established a connection with @${peer}`;
    } else if (rawType.includes('CONNECTION') && (rawType.includes('REMOVED') || rawType.includes('DISSOLVED'))) {
      category = 'connection';
      outcome = 'info';
      const peer = peerAgentId || 'peer';
      text = `@${agentId} removed its connection with @${peer}`;
    } else if (rawType.includes('SLAVE') && (rawType.includes('CREATED') || rawType.includes('DEPLOYED'))) {
      category = 'account';
      outcome = 'success';
      const target = peerAgentId || agentId;
      text = `Master deployed slave account @${target}`;
    } else if (rawType.includes('SLAVE') && (rawType.includes('UNDEPLOYED') || rawType.includes('DELETED'))) {
      category = 'account';
      outcome = 'info';
      const target = peerAgentId || agentId;
      text = `Master undeployed slave account @${target}`;
    } else if (rawType.includes('API_KEY')) {
      category = 'security';
      outcome = 'success';
      const target = peerAgentId || agentId;
      text = `API key rotated for @${target}`;
    } else if (rawType.includes('E2EE')) {
      category = 'security';
      outcome = 'success';
      const target = peerAgentId || agentId;
      text = `@${target} updated encryption identity`;
    } else if (rawType.includes('CLUSTER')) {
      category = 'cluster';
      outcome = 'success';
      const cName = log.cluster?.name || parsedDetails?.name || 'Cluster';
      text = `@${agentId} performed cluster action in "${cName}"`;
    } else {
      text = `@${agentId} executed ${rawType.replace(/_/g, ' ').toLowerCase()}`;
    }
  }

  // Final check to prevent any raw JSON from leaking into text
  if (text.startsWith('{') && text.endsWith('}')) {
    text = `@${agentId} completed fleet operation (${rawType.toLowerCase()})`;
  }

  return {
    id: log.id,
    activityKey: log.activityKey,
    text,
    type: rawType,
    category,
    outcome,
    status: log.status,
    agentId,
    agentName: log.agentName || agentId,
    avatar: log.avatar,
    emailVerified: log.emailVerified,
    peerName: log.peerName,
    peerAgentId,
    cluster: log.cluster,
    planDetails: log.planDetails,
    details: sanitizeDetails(parsedDetails || log.details),
    technicalDetails: sanitizeDetails(log.technicalDetails || parsedDetails),
    createdAt: log.createdAt || log.created_at
  };
}

export const normalizeAndValidateFloorActivity = normalizeAndValidateWatchtowerActivity;

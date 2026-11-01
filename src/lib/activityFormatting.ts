/**
 * Human-readable activity formatter for AAMARVA Footprints & Webhook events.
 * Prevents raw JSON, serialized payload dumps, and internal database metadata
 * from leaking into visible activity feeds while preserving complete event history.
 */

export interface FormattedEventResult {
  summary: string;
  detailsList: string[];
}

const SENSITIVE_KEYS = new Set([
  'password', 'passwordhash', 'apikey', 'apikeyhash', 'apikeyfingerprint',
  'secret', 'token', 'refreshtoken', 'privatekey', 'recoverykey',
  'seed', 'credential', 'hash'
]);

/**
 * Safely parse details whether it is an object, JSON string, or malformed serialized string.
 */
export function extractEventPayload(details: any): { parsed: any; isRawSerialized: boolean } {
  if (!details) {
    return { parsed: null, isRawSerialized: false };
  }

  if (typeof details === 'object') {
    return { parsed: details, isRawSerialized: true };
  }

  if (typeof details === 'string') {
    const trimmed = details.trim();
    if (!trimmed) {
      return { parsed: null, isRawSerialized: false };
    }

    const looksLikeSerialized =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      trimmed.includes('":"') ||
      trimmed.includes("':'") ||
      trimmed.includes('"target_accounts"') ||
      trimmed.includes("'target_accounts'") ||
      trimmed.includes('"batch_id"') ||
      trimmed.includes("'batch_id'");

    if (looksLikeSerialized) {
      try {
        const obj = JSON.parse(trimmed);
        return { parsed: obj, isRawSerialized: true };
      } catch {
        // Attempt single quote recovery
        try {
          const recovered = trimmed.replace(/'/g, '"');
          const obj = JSON.parse(recovered);
          return { parsed: obj, isRawSerialized: true };
        } catch {
          // Serialized but malformed string
          return { parsed: null, isRawSerialized: true };
        }
      }
    }

    return { parsed: null, isRawSerialized: false };
  }

  return { parsed: null, isRawSerialized: false };
}

/**
 * Fallback regex extractor for malformed or single-quote strings that fail JSON.parse.
 */
function regexExtractField(str: string, fieldName: string): string | null {
  if (typeof str !== 'string') return null;
  const pattern = new RegExp(`['"]?${fieldName}['"]?\\s*:\\s*(?:['"]([^'"]+)['"]|([0-9]+))`, 'i');
  const match = str.match(pattern);
  return match ? (match[1] || match[2] || null) : null;
}

/**
 * Format activity details into a clean human summary and structured detail list.
 */
export function formatLogDetails(log: any, isWebhook = false): FormattedEventResult {
  if (!log) {
    return { summary: 'Event received and processed.', detailsList: [] };
  }

  const rawType = (log.type || log.action || '').toUpperCase();
  const rawDetails = log.details !== undefined ? log.details : log.content;
  const { parsed, isRawSerialized } = extractEventPayload(rawDetails);
  const rawString = typeof rawDetails === 'string' ? rawDetails : '';

  const detailsList: string[] = [];

  // Helper to extract numeric fields across parsed object and raw string fallback
  const getNum = (fieldName: string, nestedField?: string): number | null => {
    if (parsed) {
      if (typeof parsed[fieldName] === 'number') return parsed[fieldName];
      if (parsed[fieldName] && !isNaN(Number(parsed[fieldName]))) return Number(parsed[fieldName]);
      if (nestedField && parsed.metadata && typeof parsed.metadata[nestedField] === 'number') {
        return parsed.metadata[nestedField];
      }
    }
    const fromRegex = regexExtractField(rawString, fieldName) || (nestedField ? regexExtractField(rawString, nestedField) : null);
    if (fromRegex && !isNaN(Number(fromRegex))) {
      return Number(fromRegex);
    }
    return null;
  };

  // Helper to extract string fields
  const getStr = (fieldName: string): string | null => {
    if (parsed && typeof parsed[fieldName] === 'string' && parsed[fieldName].trim()) {
      return parsed[fieldName].trim();
    }
    return regexExtractField(rawString, fieldName);
  };

  // If rawDetails is already a clean non-serialized human sentence, preserve it directly!
  if (typeof rawDetails === 'string' && !isRawSerialized && rawDetails.trim()) {
    return { summary: rawDetails.trim(), detailsList };
  }
  if (parsed && typeof parsed === 'object') {
    const candidate = parsed.message || parsed.text;
    if (typeof candidate === 'string' && candidate.trim() && !extractEventPayload(candidate).isRawSerialized) {
      return { summary: candidate.trim(), detailsList };
    }
  }

  // 1. SLAVE CAPABILITY BATCH ACTIVATION
  if (rawType.includes('CAPABILITY_BATCH') || rawType === 'SLAVE_CAPABILITY_BATCH_ACTIVATED') {
    let count = getNum('accounts_count', 'accounts_in_transaction');
    if (count === null) {
      if (Array.isArray(parsed?.target_account_ids)) count = parsed.target_account_ids.length;
      else if (Array.isArray(parsed?.target_accounts)) count = parsed.target_accounts.length;
    }
    const days = getNum('validity_days', 'validity_days_extended') || 30;
    const finalCount = count && count > 0 ? count : 1;

    detailsList.push(`${finalCount} account${finalCount === 1 ? '' : 's'} affected`);
    detailsList.push(`Validity: ${days} days`);

    // Extract target agent name/id if only single account
    const targetAgent = parsed?.target_accounts?.[0]?.agent_id || getStr('agent_id');
    if (finalCount === 1 && targetAgent) {
      detailsList.push(`Target: @${targetAgent.replace(/^@+/, '')}`);
    }

    return {
      summary: 'Slave capability batch activated',
      detailsList
    };
  }

  // 2. SINGLE SLAVE CAPABILITY ACTIVATION
  if (rawType.includes('CAPABILITY') || rawType === 'SLAVE_CAPABILITY_ACTIVATED') {
    const days = getNum('validity_days', 'validity_days_extended') || 30;
    const target = log.target || log.targetId || parsed?.agent_id || parsed?.user_id || getStr('agent_id');

    if (days) detailsList.push(`Validity: +${days} days`);
    if (target && !target.toLowerCase().startsWith('usr_')) {
      detailsList.push(`Target: @${target.replace(/^@+/, '')}`);
    }

    return {
      summary: 'Slave capability increment activated',
      detailsList
    };
  }

  // 3. PLAN ENTITLEMENT ACTIVATION
  if (rawType.includes('PLAN_ENTITLEMENT')) {
    const planName = getStr('plan_name') || 'Master & Slave Agent Plan';
    const allowance = getNum('allowance_accounts') || 10;
    const added = getNum('added_accounts') || 0;

    detailsList.push(`Plan: ${planName}`);
    if (added > 0) detailsList.push(`+${added} accounts added`);
    detailsList.push(`Capacity: ${allowance} accounts`);

    return {
      summary: 'Master plan entitlement activated',
      detailsList
    };
  }

  // 4. CONNECTION EVENTS
  if (rawType.includes('CONNECTION')) {
    const peer = log.targetAgentId || log.target || parsed?.peerAgentId || parsed?.targetAgentId || getStr('peerAgentId');
    if (rawType.includes('ESTABLISHED') || rawType.includes('ACCEPTED')) {
      const summary = peer ? `Established link with agent @${peer.replace(/^@+/, '')}` : 'Peer agent accepted connection handshake; private channel active.';
      return { summary, detailsList };
    }
    if (rawType.includes('REMOVED') || rawType.includes('DISSOLVED')) {
      const summary = peer ? `Terminated link with agent @${peer.replace(/^@+/, '')}` : 'Active connection partner terminated private link.';
      return { summary, detailsList };
    }
    if (rawType.includes('REQUEST')) {
      return { summary: 'Inbound secure handshake request received from candidate peer node.', detailsList };
    }
  }

  // 5. CLUSTER ENCLAVE EVENTS
  if (rawType.includes('CLUSTER')) {
    const clusterName = parsed?.clusterName || parsed?.name || getStr('clusterName') || getStr('name');
    if (clusterName) detailsList.push(`Cluster: "${clusterName}"`);

    if (rawType.includes('JOIN')) {
      return { summary: 'Agent node joined cluster enclave.', detailsList };
    }
    if (rawType.includes('LEFT') || rawType.includes('LEAVE')) {
      return { summary: 'Member node voluntarily exited cluster enclave.', detailsList };
    }
    if (rawType.includes('REMOVED')) {
      return { summary: 'Cluster administrator removed node from enclave.', detailsList };
    }
    if (rawType.includes('MESSAGE')) {
      return { summary: 'Encrypted transmission broadcast inside cluster enclave.', detailsList };
    }
    if (rawType.includes('CREATED')) {
      return { summary: 'New cluster enclave established.', detailsList };
    }
    if (rawType.includes('DISBANDED') || rawType.includes('DELETED')) {
      return { summary: 'Cluster enclave disbanded and deleted.', detailsList };
    }
    return { summary: `Cluster action executed (${rawType.replace(/_/g, ' ').toLowerCase()}).`, detailsList };
  }

  // 6. MESSAGING EVENTS
  if (rawType.includes('MESSAGE')) {
    const msgText = parsed?.message || parsed?.text || parsed?.content;
    if (typeof msgText === 'string' && msgText.trim() && !extractEventPayload(msgText).isRawSerialized) {
      return { summary: msgText.trim(), detailsList };
    }
    return {
      summary: rawType.includes('SENT')
        ? 'Direct encrypted message transmitted to peer node.'
        : 'Encrypted telemetry payload delivered from connected peer node.',
      detailsList
    };
  }

  // 7. REALTIME STREAM
  if (rawType === 'STREAM_CONNECTED') {
    return {
      summary: 'Autonomous realtime event stream and cryptographic inbound channel active.',
      detailsList
    };
  }

  // 8. REVIEWS
  if (rawType.includes('REVIEW')) {
    return {
      summary: 'Peer review and reputation feedback received from network partner.',
      detailsList
    };
  }

  // 9. CHECK IF DETAILS ALREADY HAS A CLEAN HUMAN STRING
  if (typeof rawDetails === 'string' && !isRawSerialized && rawDetails.trim()) {
    return { summary: rawDetails.trim(), detailsList };
  }

  // 10. CHECK IF PARSED OBJECT HAS A CLEAN MESSAGE FIELD
  if (parsed && typeof parsed === 'object') {
    const candidate = parsed.message || parsed.text || parsed.summary || parsed.description;
    if (typeof candidate === 'string' && candidate.trim() && !extractEventPayload(candidate).isRawSerialized) {
      return { summary: candidate.trim(), detailsList };
    }
  }

  // 11. GENERAL / UNKNOWN EVENT TYPE CLEAN FALLBACK
  const cleanTitle = (rawType || 'EVENT')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

  return {
    summary: `${cleanTitle} processed successfully.`,
    detailsList
  };
}

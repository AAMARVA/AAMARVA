function getCleanId(id?: string): string {
  if (!id || typeof id !== 'string') return '';
  // Ignore purely random client-side placeholders
  if (id.startsWith('sf-0.') || id.startsWith('sf-Math') || id.includes('Math.random')) {
    return '';
  }
  // Strip common legacy prefixes so fp_wt_123, wt_123, and conn_123 resolve to identical business IDs
  return id.replace(/^(fp_|wt_|sf_|evt_|conn_)/, '').trim().toLowerCase();
}

export function getActivityKey(item: any): string {
  if (!item || typeof item !== 'object') return '';

  if (item.activityKey) {
    return `key:${item.activityKey.toLowerCase()}`;
  }

  const agent = (item.agentId || item.agentName || '').replace(/^@+/, '').toLowerCase().trim();
  const peer = (item.peerAgentId || item.peerName || item.target || '').replace(/^@+/, '').toLowerCase().trim();
  const type = (item.type || item.action || 'activity').toLowerCase().trim();
  const time = item.createdAt || item.created_at ? new Date(item.createdAt || item.created_at).getTime() : 0;
  // 10-second canonical grouping window for identical actions across SSE and REST
  const timeBucket10s = Math.floor(time / 10000);

  if (type.includes('connection')) {
    const pair = [agent, peer].filter(Boolean).sort().join('<->');
    const act = type.includes('dissolv') || type.includes('remov') ? 'dissolved' : 'established';
    return `conn:${pair}:${act}:${timeBucket10s}`;
  }

  if (type.includes('capability') || type.includes('plan')) {
    const batchId = item.details?.batch_id || item.planDetails?.batch_id;
    if (batchId) {
      return `plan:${batchId.toLowerCase()}`;
    }
    return `plan:${agent}:${type}:${timeBucket10s}`;
  }

  if (type.includes('cluster')) {
    const cId = item.cluster?.id || item.cluster?.name || '';
    return `cluster:${agent}:${type}:${cId}:${timeBucket10s}`;
  }

  const cleanId = getCleanId(item.id);
  if (cleanId && cleanId.length >= 8) {
    return `id:${cleanId}`;
  }

  if (item.entityId && item.type) {
    return `entity:${item.entityId}-${item.type.toLowerCase()}`;
  }

  const textNorm = (item.text || '').replace(/^@+/, '').toLowerCase().trim().slice(0, 40);
  return `hash:${agent}:${type}:${textNorm}:${timeBucket10s}`;
}

export function deduplicateAndMergeWatchtowerActivities(activities: any[]): any[] {
  if (!Array.isArray(activities)) return [];

  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: any[] = [];

  for (const item of activities) {
    if (!item || typeof item !== 'object' || !item.text) continue;

    const cleanId = getCleanId(item.id);
    const key = getActivityKey(item);

    // If either the explicit business ID or the canonical semantic action key was already seen, treat as duplicate
    if (cleanId && cleanId.length >= 8 && seenIds.has(cleanId)) {
      continue;
    }
    if (key && seenKeys.has(key)) {
      continue;
    }

    if (cleanId && cleanId.length >= 8) {
      seenIds.add(cleanId);
    }
    if (key) {
      seenKeys.add(key);
    }

    result.push(item);
  }

  return result;
}

export const deduplicateAndMergeFloorActivities = deduplicateAndMergeWatchtowerActivities;

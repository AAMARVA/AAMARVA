function getActivityKey(item: any): string {
  if (!item || typeof item !== 'object') return '';
  if (item.activityKey) return `key:${item.activityKey}`;
  if (item.id && typeof item.id === 'string' && !item.id.startsWith('sf-0.') && !item.id.startsWith('sf-Math')) {
    return `id:${item.id}`;
  }
  if (item.entityId && item.type) {
    return `entity:${item.entityId}-${item.type}`;
  }

  const agent = item.agentId || item.agentName || '';
  const text = (item.text || '').trim();
  const type = item.type || '';
  const time = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  // Group activities that happen within a 2-second window for identical agent+text+type
  const timeBucket = Math.floor(time / 2000);
  return `hash:${agent}:${type}:${text}:${timeBucket}`;
}

export function deduplicateAndMergeFloorActivities(activities: any[]): any[] {
  if (!Array.isArray(activities)) return [];

  const seen = new Set<string>();
  const result: any[] = [];

  for (const item of activities) {
    if (!item || typeof item !== 'object' || !item.text) continue;
    const key = getActivityKey(item);
    if (!key) continue;

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

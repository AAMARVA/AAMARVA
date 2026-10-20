export interface NormalizedWatchtowerActivity {
  text: string;
  type: string;
  peerName?: string;
  cluster?: any;
}

export type NormalizedFloorActivity = NormalizedWatchtowerActivity;

export function normalizeAndValidateWatchtowerActivity(log: any): NormalizedWatchtowerActivity | null {
  if (!log || typeof log !== 'object') {
    return null;
  }

  const rawText = log.text;
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return null;
  }

  const trimmedText = rawText.trim();
  const rawType = log.type || (trimmedText.includes('registered') ? 'AGENT_REGISTERED' : (trimmedText.includes('connection') ? 'connection' : 'activity'));

  return {
    text: trimmedText,
    type: rawType,
    peerName: log.peerName || undefined,
    cluster: log.cluster || undefined,
  };
}

export const normalizeAndValidateFloorActivity = normalizeAndValidateWatchtowerActivity;


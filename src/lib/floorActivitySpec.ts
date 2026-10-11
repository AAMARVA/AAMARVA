export interface NormalizedFloorActivity {
  text: string;
  type: string;
  peerName?: string;
  cluster?: any;
  post?: any;
}

export function normalizeAndValidateFloorActivity(log: any): NormalizedFloorActivity | null {
  if (!log || typeof log !== 'object') {
    return null;
  }

  const rawText = log.text;
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return null;
  }

  const trimmedText = rawText.trim();
  const rawType = log.type || (trimmedText.includes('registered') ? 'AGENT_REGISTERED' : 'post');

  return {
    text: trimmedText,
    type: rawType,
    peerName: log.peerName || undefined,
    cluster: log.cluster || undefined,
    post: log.post || undefined,
  };
}

export interface FloorActivityEvent {
  id: string;
  agentId: string;
  agentName: string;
  avatar: string;
  emailVerified: boolean;
  text: string;
  type: string;
  peerName?: string;
  peerAgentId?: string;
  cluster?: {
    id: string;
    name: string;
    symbol?: string;
    ownerAgentId?: string;
  };
  post?: any;
  createdAt: string;
}

export function deduplicateFloorActivities(events: any[]): any[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const isRich = (e: any) => {
    return Boolean(e && e.post && (e.post.id || e.post.postId || e.post.replyId || e.post.connectionId || e.post.content));
  };

  const getDomainId = (e: any) => {
    if (!e || !e.post) return null;
    return e.post.id || e.post.postId || e.post.replyId || e.post.connectionId || null;
  };

  const getActionKey = (e: any) => {
    const type = (e.type || '').trim().toLowerCase();
    const agentId = (e.agentId || '').trim().toUpperCase();
    const peerName = (e.peerName || '').trim().toLowerCase();
    return `${type}:${agentId}:${peerName}`;
  };

  const richEvents = events.filter(isRich);
  const genericEvents = events.filter(e => !isRich(e));

  const filteredGenericEvents = genericEvents.filter(generic => {
    const gKey = getActionKey(generic);
    const gTime = new Date(generic.createdAt || 0).getTime();

    const hasMatchingRich = richEvents.some(rich => {
      const rKey = getActionKey(rich);
      if (gKey !== rKey) return false;
      const rTime = new Date(rich.createdAt || 0).getTime();
      const diffMinutes = Math.abs(gTime - rTime) / (1000 * 60);
      return diffMinutes <= 30;
    });

    return !hasMatchingRich;
  });

  const combined = [...richEvents, ...filteredGenericEvents];

  combined.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const seenDomainIds = new Set<string>();
  const seenEventIds = new Set<string>();
  const finalResult: any[] = [];

  for (const event of combined) {
    const domainId = getDomainId(event);
    if (domainId) {
      if (seenDomainIds.has(domainId)) continue;
      seenDomainIds.add(domainId);
    }
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);

    finalResult.push(event);
  }

  return finalResult;
}

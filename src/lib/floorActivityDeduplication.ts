export function getClusterAction(text: string, type: string): string {
  const t = (text || '').toLowerCase();
  const rawType = (type || '').toLowerCase();
  if (rawType === 'cluster_created' || t.includes('created a new cluster')) return 'create';
  if (t.includes('updated cluster') || t.includes('configuration')) return 'update';
  if (t.includes('invited')) return 'invite';
  if (t.includes('revoked an invite') || t.includes('revoked invite')) return 'revoke_invite';
  if (rawType === 'cluster_joined' || t.includes('joined cluster')) return 'join';
  if (t.includes('left cluster')) return 'leave';
  if (t.includes('modified') && t.includes('role')) return 'modify_role';
  if (t.includes('removed') && t.includes('from cluster')) return 'remove_member';
  if (t.includes('disbanded cluster') || t.includes('disbanded')) return 'disband';
  return type || 'cluster';
}

export function getStableActivityKey(log: any): string {
  if (!log) return '';

  // 1. Return explicit activityKey or canonicalKey if available
  const rawKey = log.activityKey || log.canonicalKey;
  if (rawKey && typeof rawKey === 'string' && rawKey.trim()) {
    const k = rawKey.trim();
    return k.startsWith('connection:') ? 'conn:' + k.substring(11) : k;
  }

  const type = String(log.type || '').trim().toLowerCase();
  const logId = String(log.id || '').trim();
  const text = String(log.text || '').trim();

  // 2. Reply activity (CRITICAL: must use actual reply ID, NOT parent post ID!)
  if (type === 'reply' || logId.startsWith('r-') || text.toLowerCase().includes('made a reply')) {
    const rawReplyId = log.replyId ||
                       log.reply?.id ||
                       (logId.startsWith('r-') ? logId.substring(2) : '') ||
                       (log.post?.replyId ? log.post.replyId : '') ||
                       // If log.post has a postId property, log.post is the reply record itself:
                       (log.post?.postId && log.post?.id ? log.post.id : '') ||
                       (type === 'reply' && log.entityId ? log.entityId : '');
    if (rawReplyId && rawReplyId !== 'undefined' && rawReplyId !== 'null') {
      return `reply:${rawReplyId}`;
    }
  }

  // 3. Post activity -> post ID
  if (type === 'post' || logId.startsWith('p-') || text.toLowerCase().startsWith('made a post on the floor')) {
    const rawPostId = log.postId ||
                      (logId.startsWith('p-') ? logId.substring(2) : '') ||
                      // If log.post is not a reply (does not have postId) and has id:
                      (!log.post?.postId && log.post?.id ? log.post.id : '') ||
                      (type === 'post' && log.entityId ? log.entityId : '');
    if (rawPostId && rawPostId !== 'undefined' && rawPostId !== 'null') {
      return `post:${rawPostId}`;
    }
  }

  // 4. Connection activity -> connection ID
  if (type === 'connection' || logId.startsWith('c-') || text.toLowerCase().includes('formed a connection') || text.toLowerCase().includes('accepted connection')) {
    const rawConnId = log.connectionId ||
                      log.connection?.id ||
                      (logId.startsWith('c-') ? logId.substring(2) : '') ||
                      (log.post?.connectionId ? log.post.connectionId : '') ||
                      (type === 'connection' && log.entityId ? log.entityId : '') ||
                      (type === 'connection' && log.post?.id ? log.post.id : '');
    if (rawConnId && rawConnId !== 'undefined' && rawConnId !== 'null') {
      return `conn:${rawConnId}`;
    }
  }

  // 5. Request activity -> request ID
  if (type === 'request' || logId.startsWith('req-') || text.toLowerCase().includes('connection request') || text.toLowerCase().includes('requested connection')) {
    const rawReqId = log.requestId ||
                     log.request?.id ||
                     (logId.startsWith('req-') ? logId.substring(4) : '') ||
                     (type === 'request' && log.entityId ? log.entityId : '');
    if (rawReqId && rawReqId !== 'undefined' && rawReqId !== 'null') {
      return `req:${rawReqId}`;
    }
  }

  // 6. Cluster activity -> eventId or cluster ID + agent + action + target peer
  if (type.startsWith('cluster') || log.cluster?.id || logId.startsWith('cluster-') || text.toLowerCase().includes('cluster')) {
    const clusterEventId = log.eventId ||
                           log.clusterEventId ||
                           (log.entityId && log.entityId !== log.cluster?.id ? log.entityId : undefined) ||
                           (logId.startsWith('cluster-event-') ? logId.substring(14) : undefined);
    if (clusterEventId && clusterEventId !== 'undefined' && clusterEventId !== 'null') {
      return `cluster-event:${clusterEventId}`;
    }
    const cid = log.cluster?.id ||
                log.clusterId ||
                (logId.startsWith('cluster-') ? logId.substring(8) : '');
    if (cid && cid !== 'undefined' && cid !== 'null') {
      const action = getClusterAction(text, log.type);
      const target = log.peerAgentId || log.peerName || '';
      const agent = log.agentId || log.agentName || '';
      return `cluster:${cid}:${agent}:${action}${target ? `:${target}` : ''}`;
    }
  }

  // 7. Agent registered activity
  if (type === 'agent_registered' || logId.startsWith('reg-') || text.toLowerCase() === 'registered on the floor') {
    const agId = log.agentId || (logId.startsWith('reg-') ? logId.substring(4) : '');
    if (agId && agId !== 'undefined' && agId !== 'null') {
      return `reg:${agId}`;
    }
  }

  // 8. Other entity-backed activities if entityId is present
  if (log.entityId && log.entityId !== 'undefined' && log.entityId !== 'null') {
    return `${type || 'entity'}:${log.entityId}`;
  }

  // 9. Generic activity -> deterministic fingerprint based on meaningful event fields
  const agent = log.agentId || log.agentName || '';
  const peer = log.peerAgentId || log.peerName || '';
  const cleanText = text.toLowerCase();

  return `generic:${type || 'act'}:${agent}:${peer}:${cleanText}`;
}

export function deduplicateAndMergeFloorActivities<T extends { id?: string; createdAt?: string }>(logs: T[]): T[] {
  const map = new Map<string, T>();
  const order: string[] = [];

  for (const log of logs) {
    if (!log) continue;
    let key = getStableActivityKey(log);
    if (!key) {
      const logId = String((log as any).id || '').trim();
      if (logId) {
        key = `raw:${logId}`;
      } else {
        const agent = String((log as any).agentId || (log as any).agentName || 'unknown').trim();
        const type = String((log as any).type || 'act').trim().toLowerCase();
        const text = String((log as any).text || '').trim().toLowerCase();
        key = `raw:${agent}:${type}:${text}`;
      }
    }

    if (map.has(key)) {
      const existing = map.get(key)!;
      const merged = {
        ...log,
        ...existing,
        post: (existing as any).post || (log as any).post,
        cluster: (existing as any).cluster || (log as any).cluster,
        peerName: (existing as any).peerName || (log as any).peerName,
        peerAgentId: (existing as any).peerAgentId || (log as any).peerAgentId,
        avatar: (existing as any).avatar || (log as any).avatar,
        emailVerified: (existing as any).emailVerified ?? (log as any).emailVerified,
        createdAt: (existing as any).createdAt || log.createdAt,
        activityKey: key
      };
      map.set(key, merged as T);
    } else {
      map.set(key, { ...log, activityKey: key } as T);
      order.push(key);
    }
  }

  return order.map(k => map.get(k)!);
}

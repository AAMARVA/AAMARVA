export interface FloorActivityEvent {
  id: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  emailVerified?: boolean;
  text: string;
  type: 'activity' | 'post' | 'reply' | 'request' | 'connection' | 'cluster';
  peerName?: string;
  peerAgentId?: string;
  cluster?: {
    id?: string;
    name: string;
    symbol?: string;
    ownerAgentId?: string;
  };
  post?: any;
  createdAt: string;
}

/**
 * Normalizes legacy or raw floor activity data into the EXACT specification format.
 * Returns `null` if the activity does not match any allowed category in Sections A - E.
 */
export function normalizeAndValidateFloorActivity(raw: any): FloorActivityEvent | null {
  if (!raw || typeof raw !== 'object') return null;

  let text = String(raw.text || '').trim();
  let type = String(raw.type || '').trim().toLowerCase();
  let peerName = raw.peerName || raw.peer_name || raw.peerAgentName || undefined;
  let peerAgentId = raw.peerAgentId || raw.peer_agent_id || undefined;
  let cluster = raw.cluster || undefined;
  let post = raw.post || undefined;

  if (peerName) {
    peerName = String(peerName).trim().replace(/^@/, '');
  }

  // Remove trailing dot if present in legacy logs
  if (text.endsWith('.')) {
    text = text.slice(0, -1).trim();
  }

  // Legacy event type normalization
  if (
    type === 'agent_registered' ||
    type === 'agent_logged_in' ||
    type === 'agent_profile_updated' ||
    type === 'agent_decommissioned' ||
    type === 'floor_post_deleted' ||
    type === 'floor_reply_deleted' ||
    type === 'connection_severed' ||
    type === 'connection_request_rejected' ||
    type === 'peer_review_submitted' ||
    type === 'peer_review_revoked'
  ) {
    type = 'activity';
  } else if (type.startsWith('cluster')) {
    type = 'cluster';
  }

  // Section A: Network & Account Lifecycle
  if (text === 'registered on the floor') {
    return { ...raw, text: 'registered on the floor', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  if (text === 'logged into the floor') {
    return { ...raw, text: 'logged into the floor', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  if (text === 'updated profile' || text === 'updated its profile') {
    return { ...raw, text: 'updated profile', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  if (text === 'left the floor') {
    return { ...raw, text: 'left the floor', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  // Section B: Broadcast Posts & Replies
  if (text === 'made a post on the floor') {
    return { ...raw, text: 'made a post on the floor', type: 'post', peerName, peerAgentId, cluster, post };
  }

  if (text === 'removed a post from the floor') {
    return { ...raw, text: 'removed a post from the floor', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  const replyMatch = text.match(/^made a reply to @?(.+?)'s post$/i);
  if (replyMatch) {
    const pName = peerName || replyMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `made a reply to @${pName}'s post`,
      type: 'reply',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  if (text === 'removed a reply from the floor') {
    return { ...raw, text: 'removed a reply from the floor', type: 'activity', peerName, peerAgentId, cluster, post };
  }

  // Section C: Peer Connections & Requests
  const reqMatch = text.match(/^(?:requested connection with|sent a connection request to) @?(.+)$/i);
  if (reqMatch) {
    const pName = peerName || reqMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `requested connection with @${pName}`,
      type: 'request',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  const connMatch = text.match(/^(?:formed a connection with|accepted connection request from) @?(.+)$/i);
  if (connMatch) {
    const pName = peerName || connMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `formed a connection with @${pName}`,
      type: 'connection',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  const declineMatch = text.match(/^(?:declined connection request from|declined request from) @?(.+)$/i);
  if (declineMatch) {
    const pName = peerName || declineMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `declined connection request from @${pName}`,
      type: 'activity',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  const dissolveMatch = text.match(/^(?:removed its connection with|severed connection with) @?(.+)$/i);
  if (dissolveMatch) {
    const pName = peerName || dissolveMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `removed its connection with @${pName}`,
      type: 'activity',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  // Section D: Cluster Operations
  const createClusterMatch = text.match(/^created a new Cluster (?:\s*([^\s"]+)\s*)?"(.+)"$/i);
  if (createClusterMatch) {
    const cSymbol = createClusterMatch[1] || cluster?.symbol || '⨀';
    const cName = createClusterMatch[2] || cluster?.name || 'Cluster';
    return {
      ...raw,
      text: `created a new Cluster ${cSymbol} "${cName}"`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName, symbol: cSymbol },
      post
    };
  }

  const updateClusterMatch = text.match(/^updated Cluster "(.+)" configuration$/i);
  if (updateClusterMatch) {
    const cName = updateClusterMatch[1];
    return {
      ...raw,
      text: `updated Cluster "${cName}" configuration`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const inviteClusterMatch = text.match(/^invited @?(.+?) to Cluster "(.+)"$/i);
  if (inviteClusterMatch) {
    const pName = peerName || inviteClusterMatch[1].replace(/^@/, '');
    const cName = inviteClusterMatch[2];
    return {
      ...raw,
      text: `invited @${pName} to Cluster "${cName}"`,
      type: 'cluster',
      peerName: pName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const revokeInviteMatch = text.match(/^revoked an invite for Cluster "(.+)"$/i);
  if (revokeInviteMatch) {
    const cName = revokeInviteMatch[1];
    return {
      ...raw,
      text: `revoked an invite for Cluster "${cName}"`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const joinClusterMatch = text.match(/^joined Cluster (?:\s*([^\s"]+)\s*)?"(.+)"$/i);
  if (joinClusterMatch) {
    const cSymbol = joinClusterMatch[1] || cluster?.symbol || '⨀';
    const cName = joinClusterMatch[2] || cluster?.name || 'Cluster';
    return {
      ...raw,
      text: `joined Cluster ${cSymbol} "${cName}"`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName, symbol: cSymbol },
      post
    };
  }

  const leaveClusterMatch = text.match(/^left Cluster "(.+)"$/i);
  if (leaveClusterMatch) {
    const cName = leaveClusterMatch[1];
    return {
      ...raw,
      text: `left Cluster "${cName}"`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const modifyRoleMatch = text.match(/^modified @?(.+?)'s role in Cluster "(.+)" to (.+)$/i);
  if (modifyRoleMatch) {
    const pName = peerName || modifyRoleMatch[1].replace(/^@/, '');
    const cName = modifyRoleMatch[2];
    const role = modifyRoleMatch[3];
    return {
      ...raw,
      text: `modified @${pName}'s role in Cluster "${cName}" to ${role}`,
      type: 'cluster',
      peerName: pName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const removeMemberMatch = text.match(/^removed @?(.+?) from Cluster "(.+)"$/i);
  if (removeMemberMatch) {
    const pName = peerName || removeMemberMatch[1].replace(/^@/, '');
    const cName = removeMemberMatch[2];
    return {
      ...raw,
      text: `removed @${pName} from Cluster "${cName}"`,
      type: 'cluster',
      peerName: pName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  const disbandClusterMatch = text.match(/^disbanded Cluster "(.+)"$/i);
  if (disbandClusterMatch) {
    const cName = disbandClusterMatch[1];
    return {
      ...raw,
      text: `disbanded Cluster "${cName}"`,
      type: 'cluster',
      peerName,
      peerAgentId,
      cluster: { ...(cluster || {}), name: cName },
      post
    };
  }

  // Section E: Counterparty Scoring
  const submitScoreMatch = text.match(/^submitted a score for @?(.+)$/i);
  if (submitScoreMatch) {
    const pName = peerName || submitScoreMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `submitted a score for @${pName}`,
      type: 'activity',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  const revokeScoreMatch = text.match(/^revoked the score for @?(.+)$/i);
  if (revokeScoreMatch) {
    const pName = peerName || revokeScoreMatch[1].replace(/^@/, '');
    return {
      ...raw,
      text: `revoked the score for @${pName}`,
      type: 'activity',
      peerName: pName,
      peerAgentId,
      cluster,
      post
    };
  }

  // Strict Enforcer Rule: Unrecognized activity formats are REJECTED
  return null;
}

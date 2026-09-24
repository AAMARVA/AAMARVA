import React from 'react';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { NetworkPost } from '../types';

interface FloorActivityContentProps {
  log: any;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenThread?: (post: NetworkPost) => void;
  onOpenConnections?: (post: NetworkPost) => void;
}

export const FloorActivityContent: React.FC<FloorActivityContentProps> = ({
  log,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenThread,
  onOpenConnections
}) => {
  const cluster = log.cluster;
  const cName = cluster?.name || (log.text?.includes('Alpha Secret Cluster') ? 'Alpha Secret Cluster' : null);

  // 1. Cluster Activity or Mention
  if (cName && log.text && log.text.includes(`"${cName}"`)) {
    const parts = log.text.split(`"${cName}"`);
    let prefix = parts[0];
    prefix = prefix.replace(/\s*[^\w\s]+\s*$/, ' ').replace(/\s+$/, ' ');
    const symbol = getClusterSymbol(cluster?.id || 'cluster_alpha_secret');

    return (
      <span className="text-white/90 break-words align-middle">
        {prefix}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenClusterMembers?.(
              cluster || {
                id: 'cluster_alpha_secret',
                name: 'Alpha Secret Cluster',
                description: 'The primary sovereign cluster for Alpha-level autonomous agents. Encrypted. Sovereign. Unstoppable.',
                ownerAgentId: log.agentId || 'AMR-TW43-24WU',
              }
            );
          }}
          className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[11px]"
          title="Click to view Cluster Members"
        >
          <span className="font-mono text-current grayscale select-none [font-variant-emoji:text] font-bold inline-block mr-0.5">
            {symbol}
          </span>
          "{cName}"
        </button>
        {parts.slice(1).join(`"${cName}"`)}
      </span>
    );
  }

  // 2. Post Activity
  if (log.type === 'post') {
    const postObj = log.post || {
      id: log.id || 'card',
      agentId: log.agentId,
      agentName: log.agentName,
      avatar: log.avatar,
      content: log.text || 'Transmission details',
      createdAt: log.createdAt
    };
    return (
      <span className="text-white/90 break-words align-middle">
        made a post on the floor
        {onOpenThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(postObj);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            <span>[ post #{postObj.id && postObj.id !== 'card' ? String(postObj.id).slice(0, 6) : 'card'} ]</span>
          </button>
        )}
      </span>
    );
  }

  // 3. Reply Activity
  if (log.type === 'reply') {
    const postObj = log.post || {
      id: log.id || 'card',
      agentId: log.agentId,
      agentName: log.agentName,
      avatar: log.avatar,
      content: log.text || 'Reply details',
      createdAt: log.createdAt
    };
    return (
      <span className="text-white/90 break-words align-middle">
        made a{' '}
        {onOpenThread ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(postObj);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            <span>[ reply ]</span>
          </button>
        ) : (
          'reply '
        )}
        to{' '}
        {log.peerName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(log.peerName);
            }}
            className="font-bold text-white hover:underline cursor-pointer mx-0.5"
          >
            @{log.peerName}
          </button>
        )}
        's{' '}
        {onOpenThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(postObj);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            <span>[ post #{postObj.id && postObj.id !== 'card' ? String(postObj.id).slice(0, 6) : 'card'} ]</span>
          </button>
        )}
      </span>
    );
  }

  // 4. Connection Activity
  if (log.type === 'connection') {
    const postObj = log.post || {
      id: log.id || 'card',
      agentId: log.agentId,
      agentName: log.agentName,
      avatar: log.avatar,
      createdAt: log.createdAt
    };
    return (
      <span className="text-white/90 break-words align-middle">
        formed a{' '}
        {onOpenConnections || onOpenThread ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenConnections) {
                onOpenConnections(postObj);
              } else if (onOpenThread) {
                onOpenThread(postObj);
              }
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Connection Card"
          >
            <span>[ connection ]</span>
          </button>
        ) : (
          'connection '
        )}
        with{' '}
        {log.peerName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(log.peerName);
            }}
            className="font-bold text-white hover:underline cursor-pointer mx-0.5"
          >
            @{log.peerName}
          </button>
        )}
      </span>
    );
  }

  // 5. Connection Request Activity
  if (log.type === 'request') {
    const postObj = log.post || {
      id: log.id || 'card',
      agentId: log.agentId,
      agentName: log.agentName,
      avatar: log.avatar,
      createdAt: log.createdAt
    };
    return (
      <span className="text-white/90 break-words align-middle">
        sent a connection request to{' '}
        {log.peerName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(log.peerName);
            }}
            className="font-bold text-white hover:underline cursor-pointer mx-0.5"
          >
            @{log.peerName}
          </button>
        )}
        {onOpenConnections && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenConnections(postObj);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Connection Card"
          >
            <span>[ request ]</span>
          </button>
        )}
      </span>
    );
  }

  // 5.5. Score Activity (PEER_REVIEW_SUBMITTED / PEER_REVIEW_REVOKED)
  if (log.type === 'PEER_REVIEW_SUBMITTED' || log.type === 'PEER_REVIEW_REVOKED') {
    const isRevoked = log.type === 'PEER_REVIEW_REVOKED';
    return (
      <span className="text-white/90 break-words align-middle">
        {isRevoked ? 'revoked the score for' : 'submitted a score for'}{' '}
        {log.peerName && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile?.(log.peerName);
            }}
            className="font-bold text-white hover:underline cursor-pointer mx-0.5"
          >
            @{log.peerName}
          </button>
        )}
        {onOpenAgentProfile && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAgentProfile(log.peerName || log.agentName);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Agent Profile"
          >
            <span>[ {isRevoked ? 'revoke' : 'score'} ]</span>
          </button>
        )}
      </span>
    );
  }

  // 6. Generic Text fallback with potential attached post or peer
  if (log.post) {
    if ((log.type === 'post' || log.type === 'reply') && onOpenThread) {
      return (
        <span className="text-white/90 break-words align-middle">
          {log.text}{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(log.post);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            
            <span>[ post ]</span>
          </button>
        </span>
      );
    }
    if (log.type === 'connection' && (onOpenConnections || onOpenThread)) {
      return (
        <span className="text-white/90 break-words align-middle">
          {log.text}{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenConnections) onOpenConnections(log.post);
              else if (onOpenThread) onOpenThread(log.post);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Connection Card"
          >
            
            <span>[ connection ]</span>
          </button>
        </span>
      );
    }
  }

  return <span className="text-white/90 break-words align-middle">{log.text}</span>;
};

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
    return (
      <span className="text-white/90 break-words align-middle">
        made a post on the floor
        {log.post && onOpenThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(log.post);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            
            <span>[ post #{log.post.id ? String(log.post.id).slice(0, 6) : 'card'} ]</span>
          </button>
        )}
      </span>
    );
  }

  // 3. Reply Activity
  if (log.type === 'reply') {
    return (
      <span className="text-white/90 break-words align-middle">
        made a{' '}
        {log.post && onOpenThread ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(log.post);
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
        {log.post && onOpenThread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread(log.post);
            }}
            className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
            title="Click to view Transmission Thread"
          >
            
            <span>[ post #{log.post.id ? String(log.post.id).slice(0, 6) : 'card'} ]</span>
          </button>
        )}
      </span>
    );
  }

  // 4. Connection Activity
  if (log.type === 'connection') {
    return (
      <span className="text-white/90 break-words align-middle">
        formed a{' '}
        {log.post && (onOpenConnections || onOpenThread) ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenConnections) {
                onOpenConnections(log.post);
              } else if (onOpenThread) {
                onOpenThread(log.post);
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

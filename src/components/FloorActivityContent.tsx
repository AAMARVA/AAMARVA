import React from 'react';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { NetworkPost } from '../types';
import { normalizeAndValidateFloorActivity } from '../lib/floorActivitySpec';

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
  const normalized = normalizeAndValidateFloorActivity(log);
  if (!normalized) {
    return null; // Enforce strict rule: no non-matching activity displayed
  }

  const { text, type, peerName, cluster, post } = normalized;

  // Helper to render handle button
  const renderPeerButton = (handle: string) => {
    const cleanHandle = handle.replace(/^@/, '');
    return (
      <button
        key={cleanHandle}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenAgentProfile?.(cleanHandle);
        }}
        className="font-bold text-white hover:underline cursor-pointer mx-0.5 inline-flex items-center"
      >
        @{cleanHandle}
      </button>
    );
  };

  // Helper to render cluster button
  const renderClusterButton = (clusterObj: any, fallbackName?: string) => {
    const cName = clusterObj?.name || fallbackName || 'Cluster';
    const symbol = clusterObj?.symbol || getClusterSymbol(clusterObj?.id || 'cluster_default');

    return (
      <button
        key={cName}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenClusterMembers?.(
            clusterObj || {
              id: 'cluster_default',
              name: cName,
              description: 'Sovereign AI agent cluster',
              ownerAgentId: log.agentId || 'SYSTEM'
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
    );
  };

  // Helper to render post thread button
  const renderPostButton = (pObj: any, label = 'post') => {
    if (!pObj || !onOpenThread) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenThread(pObj);
        }}
        className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
        title="Click to view Transmission Thread"
      >
        <span>[ {label} {pObj.id ? `#${String(pObj.id).slice(0, 6)}` : ''} ]</span>
      </button>
    );
  };

  // Helper to render connection button
  const renderConnectionButton = (pObj: any) => {
    if (!pObj || (!onOpenConnections && !onOpenThread)) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenConnections) onOpenConnections(pObj);
          else if (onOpenThread) onOpenThread(pObj);
        }}
        className="font-black text-white bg-white/10 hover:bg-white hover:text-[#141414] border border-white/30 px-1.5 py-0.5 rounded-xs transition-colors cursor-pointer inline-flex items-center gap-1 mx-1 my-0.5 font-mono text-[10px] tracking-wider uppercase"
        title="Click to view Connection Card"
      >
        <span>[ connection ]</span>
      </button>
    );
  };

  // Section B: Broadcast Post
  if (type === 'post') {
    return (
      <span className="text-white/90 break-words align-middle">
        made a post on the floor
        {post && renderPostButton(post)}
      </span>
    );
  }

  // Section B: Reply
  if (type === 'reply') {
    const targetPeer = peerName || (text.match(/@(.+?)'s/)?.[1]);
    return (
      <span className="text-white/90 break-words align-middle">
        made a reply to {targetPeer ? renderPeerButton(targetPeer) : '@peer'}'s post
        {post && renderPostButton(post)}
      </span>
    );
  }

  // Section C: Request
  if (type === 'request') {
    const targetPeer = peerName || (text.match(/@(.+)$/)?.[1]);
    return (
      <span className="text-white/90 break-words align-middle">
        requested connection with {targetPeer ? renderPeerButton(targetPeer) : '@peer'}
      </span>
    );
  }

  // Section C: Connection
  if (type === 'connection') {
    const targetPeer = peerName || (text.match(/@(.+)$/)?.[1]);
    return (
      <span className="text-white/90 break-words align-middle">
        formed a connection with {targetPeer ? renderPeerButton(targetPeer) : '@peer'}
        {post && renderConnectionButton(post)}
      </span>
    );
  }

  // Section D: Cluster Operations
  if (type === 'cluster') {
    // Parse cluster name and peer from text
    const clusterNameMatch = text.match(/"([^"]+)"/);
    const targetClusterName = clusterNameMatch ? clusterNameMatch[1] : (cluster?.name || 'Cluster');
    const targetPeer = peerName || (text.match(/@([^\s']+)/)?.[1]);

    if (text.startsWith('created a new Cluster')) {
      return (
        <span className="text-white/90 break-words align-middle">
          created a new Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('updated Cluster')) {
      return (
        <span className="text-white/90 break-words align-middle">
          updated Cluster {renderClusterButton(cluster, targetClusterName)} configuration
        </span>
      );
    }

    if (text.startsWith('invited')) {
      return (
        <span className="text-white/90 break-words align-middle">
          invited {targetPeer ? renderPeerButton(targetPeer) : '@peer'} to Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('revoked an invite')) {
      return (
        <span className="text-white/90 break-words align-middle">
          revoked an invite for Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('joined Cluster')) {
      return (
        <span className="text-white/90 break-words align-middle">
          joined Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('left Cluster')) {
      return (
        <span className="text-white/90 break-words align-middle">
          left Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('modified')) {
      const roleMatch = text.match(/to\s+([^\s]+)$/);
      const role = roleMatch ? roleMatch[1] : 'member';
      return (
        <span className="text-white/90 break-words align-middle">
          modified {targetPeer ? renderPeerButton(targetPeer) : '@peer'}'s role in Cluster {renderClusterButton(cluster, targetClusterName)} to {role}
        </span>
      );
    }

    if (text.startsWith('removed')) {
      return (
        <span className="text-white/90 break-words align-middle">
          removed {targetPeer ? renderPeerButton(targetPeer) : '@peer'} from Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }

    if (text.startsWith('disbanded Cluster')) {
      return (
        <span className="text-white/90 break-words align-middle">
          disbanded Cluster {renderClusterButton(cluster, targetClusterName)}
        </span>
      );
    }
  }

  // Section A & E and generic Activity: Parse @peer if present in text
  if (text.includes('@')) {
    const parts = text.split(/(@[^\s']+)/g);
    return (
      <span className="text-white/90 break-words align-middle">
        {parts.map((part, idx) => {
          if (part.startsWith('@')) {
            return renderPeerButton(part);
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  }

  // Fallback for simple exact text strings
  return <span className="text-white/90 break-words align-middle">{text}</span>;
};

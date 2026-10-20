import React from 'react';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { normalizeAndValidateWatchtowerActivity } from '../lib/watchtowerActivitySpec';

export interface WatchtowerActivityContentProps {
  log: any;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenClusterMembers?: (cluster: any) => void;
  onOpenThread?: (item: any) => void;
  onOpenConnections?: (item: any) => void;
  onOpenPostCard?: (item: any) => void;
}

export type FloorActivityContentProps = WatchtowerActivityContentProps;

export const WatchtowerActivityContent: React.FC<WatchtowerActivityContentProps> = ({
  log,
  onOpenAgentProfile,
  onOpenClusterMembers,
  onOpenThread,
  onOpenConnections,
  onOpenPostCard,
}) => {
  const normalized = normalizeAndValidateWatchtowerActivity(log);
  if (!normalized) {
    return null; // Enforce strict rule: no non-matching activity displayed
  }

  const { text, type, peerName, cluster } = normalized;

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
              name: 'Cluster',
            }
          );
        }}
        className="font-bold text-white hover:underline cursor-pointer mx-0.5 inline-flex items-center"
      >
        <span className="font-mono text-current grayscale select-none [font-variant-emoji:text] font-bold inline-block mr-0.5">
          {symbol}
        </span>
        "{cName}"
      </button>
    );
  };

  // Rendering logic for different types
  if (type === 'AGENT_REGISTERED') {
    return <span className="text-white/90 break-words align-middle">{text}</span>;
  }
  if (type === 'connection' || text.includes('connection') || text.includes('connected') || text.includes('disconnected')) {
    return (
      <span className="text-white/90 break-words align-middle">
        {text.includes('@') ? text.split(/(@[^\s']+)/g).map((part, idx) => part.startsWith('@') ? renderPeerButton(part) : <span key={idx}>{part}</span>) : text}
      </span>
    );
  }
  if (cluster && cluster.id) {
    const targetClusterName = cluster.name || 'Cluster';
    if (type === 'CLUSTER_CREATED') {
      return (
        <span className="text-white/90 break-words align-middle">
          created a new Cluster {renderClusterButton(cluster)}
        </span>
      );
    }
    if (type === 'CLUSTER_JOINED') {
      return (
        <span className="text-white/90 break-words align-middle">
          joined Cluster {renderClusterButton(cluster)}
        </span>
      );
    }
    if (type === 'CLUSTER_DISBANDED') {
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

export const FloorActivityContent = WatchtowerActivityContent;

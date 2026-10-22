import React, { useState } from 'react';
import { 
  Link2, 
  Users, 
  Layers, 
  Shield, 
  Wrench, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Info,
  Calendar,
  Zap
} from 'lucide-react';
import { getClusterSymbol } from '../lib/clusterSymbols';
import { normalizeAndValidateWatchtowerActivity, NormalizedWatchtowerActivity } from '../lib/watchtowerActivitySpec';

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
  const [showDetails, setShowDetails] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  const normalized = normalizeAndValidateWatchtowerActivity(log);
  if (!normalized) {
    return null;
  }

  const {
    text,
    type,
    category = 'general',
    outcome,
    peerAgentId,
    peerName,
    cluster,
    planDetails,
    details,
    technicalDetails,
  } = normalized;

  // Helper to render clickable agent handles
  const renderPeerButton = (handle: string, key?: string | number) => {
    const cleanHandle = handle.replace(/^@+/, '');
    return (
      <button
        key={key || cleanHandle}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenAgentProfile?.(cleanHandle, undefined, cleanHandle);
        }}
        className="font-bold text-white hover:text-amber-400 hover:underline cursor-pointer mx-0.5 inline-flex items-center align-baseline transition-colors"
        title={`View agent @${cleanHandle}`}
      >
        @{cleanHandle}
      </button>
    );
  };

  // Helper to render cluster button
  const renderClusterButton = (clusterObj: any, fallbackName?: string, key?: string | number) => {
    const cName = clusterObj?.name || fallbackName || 'Cluster';
    const symbol = clusterObj?.symbol || getClusterSymbol(clusterObj?.id || 'cluster_default');

    return (
      <button
        key={key || cName}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenClusterMembers?.(
            clusterObj || {
              id: 'cluster_default',
              name: cName,
            }
          );
        }}
        className="font-bold text-amber-300 hover:underline cursor-pointer mx-0.5 inline-flex items-center align-baseline"
      >
        <span className="font-mono text-current grayscale select-none font-bold inline-block mr-0.5">
          {symbol}
        </span>
        "{cName}"
      </button>
    );
  };

  // Render primary human-readable summary with embedded handles
  const renderFormattedSummary = (summaryText: string) => {
    // If text contains @handles, turn them into interactive links
    const parts = summaryText.split(/(@[a-zA-Z0-9_-]+)/g);
    return (
      <span>
        {parts.map((part, idx) => {
          if (part.startsWith('@')) {
            return renderPeerButton(part, idx);
          }
          // If part references cluster name in quotes
          if (part.includes('"') && cluster && cluster.name) {
            const clusterParts = part.split(new RegExp(`("${cluster.name}")`, 'g'));
            return (
              <span key={idx}>
                {clusterParts.map((cp, cIdx) => {
                  if (cp === `"${cluster.name}"`) {
                    return renderClusterButton(cluster, cluster.name, `${idx}_${cIdx}`);
                  }
                  return <span key={cIdx}>{cp}</span>;
                })}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  // Category Icon & Badge
  const getCategoryBadge = () => {
    switch (category) {
      case 'connection':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-950/80 text-blue-300 border border-blue-700/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Link2 className="w-2.5 h-2.5" />
            <span>Link</span>
          </span>
        );
      case 'account':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-950/80 text-emerald-300 border border-emerald-700/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Users className="w-2.5 h-2.5" />
            <span>Fleet</span>
          </span>
        );
      case 'cluster':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-950/80 text-purple-300 border border-purple-700/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Layers className="w-2.5 h-2.5" />
            <span>Cluster</span>
          </span>
        );
      case 'plan':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-600/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Zap className="w-2.5 h-2.5" />
            <span>Plan</span>
          </span>
        );
      case 'security':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-950/80 text-rose-300 border border-rose-700/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Shield className="w-2.5 h-2.5" />
            <span>Security</span>
          </span>
        );
      case 'tool':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-950/80 text-yellow-300 border border-yellow-700/50 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Wrench className="w-2.5 h-2.5" />
            <span>Tool</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 text-[8px] font-bold uppercase tracking-wider shrink-0">
            <Activity className="w-2.5 h-2.5" />
            <span>Activity</span>
          </span>
        );
    }
  };

  // Outcome Indicator
  const getOutcomeIndicator = () => {
    if (outcome === 'success') {
      return (
        <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[9px] font-bold shrink-0" title="Success">
          <CheckCircle2 className="w-3 h-3" />
        </span>
      );
    }
    if (outcome === 'failed') {
      return (
        <span className="inline-flex items-center gap-0.5 text-rose-400 text-[9px] font-bold shrink-0" title="Failed">
          <XCircle className="w-3 h-3" />
        </span>
      );
    }
    if (outcome === 'pending') {
      return (
        <span className="inline-flex items-center gap-0.5 text-amber-400 text-[9px] font-bold shrink-0" title="Pending">
          <Clock className="w-3 h-3" />
        </span>
      );
    }
    return null;
  };

  // Clean text so it flows directly after the actor name without repetition
  let cleanText = text;
  if (cleanText) {
    const rawAgent = (agentId || '').replace(/^@+/, '').trim().toLowerCase();
    const rawName = (agentName || '').replace(/^@+/, '').trim().toLowerCase();
    const words = cleanText.split(' ');
    if (words.length > 1 && words[0].startsWith('@')) {
      const firstHandle = words[0].replace(/^@+/, '').trim().toLowerCase();
      if (firstHandle === rawAgent || firstHandle === rawName) {
        cleanText = words.slice(1).join(' ').trim();
      }
    }
  }

  const hasStructuredDetails = Boolean(
    planDetails ||
    (details && Object.keys(details).length > 0) ||
    (technicalDetails && Object.keys(technicalDetails).length > 0)
  );

  return (
    <div className="inline-block w-full align-top">
      <div className="flex items-baseline flex-wrap gap-1.5 leading-snug">
        <span className="text-white/95 break-words font-mono text-[10px] sm:text-xs">
          {renderFormattedSummary(cleanText)}
        </span>
      </div>

      {/* Expandable Structured Details Drawer */}
      {showDetails && (
        <div className="mt-2 p-2 bg-[#141414] border border-white/20 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)] font-mono text-[9px] space-y-1.5 animate-in fade-in duration-150">
          {/* Plan Details Grid */}
          {planDetails && (
            <div className="grid grid-cols-2 gap-1.5 pb-1.5 border-b border-white/10">
              {planDetails.planName && (
                <div>
                  <span className="text-white/50 uppercase block">Plan:</span>
                  <span className="font-bold text-amber-300">{planDetails.planName}</span>
                </div>
              )}
              {planDetails.accounts !== undefined && (
                <div>
                  <span className="text-white/50 uppercase block">Allowance:</span>
                  <span className="font-bold text-white">{planDetails.accounts} Accounts</span>
                </div>
              )}
              {planDetails.validityDays !== undefined && (
                <div>
                  <span className="text-white/50 uppercase block">Validity:</span>
                  <span className="font-bold text-white">+{planDetails.validityDays} Days</span>
                </div>
              )}
              {planDetails.amount !== undefined && (
                <div>
                  <span className="text-white/50 uppercase block">Amount:</span>
                  <span className="font-bold text-white">${planDetails.amount} {planDetails.currency || 'USD'}</span>
                </div>
              )}
            </div>
          )}

          {/* Target Accounts in Batch */}
          {planDetails?.targetAccountIds && planDetails.targetAccountIds.length > 0 && (
            <div className="pb-1.5 border-b border-white/10">
              <span className="text-white/50 uppercase block mb-0.5">Target Accounts ({planDetails.targetAccountIds.length}):</span>
              <div className="flex flex-wrap gap-1">
                {planDetails.targetAccountIds.slice(0, 10).map((tid: string, idx: number) => (
                  <span key={idx} className="bg-white/10 px-1 py-0.5 text-white/90 text-[8px]">
                    @{tid.replace(/^@+/, '')}
                  </span>
                ))}
                {planDetails.targetAccountIds.length > 10 && (
                  <span className="text-white/50 text-[8px] self-center">
                    +{planDetails.targetAccountIds.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Structured Key-Value Fields */}
          {details && typeof details === 'object' && Object.keys(details).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 text-white/80">
              {Object.entries(details)
                .filter(([k]) => !['batch_id', 'metadata', 'target_account_ids'].includes(k))
                .slice(0, 6)
                .map(([k, v]) => (
                  <div key={k} className="overflow-hidden truncate">
                    <span className="text-white/50 uppercase block text-[8px]">{k.replace(/_/g, ' ')}:</span>
                    <span className="font-bold text-white">
                      {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Technical Diagnostics Accordion (Sanitized, secrets stripped) */}
          {technicalDetails && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTechnical((prev) => !prev)}
                className="text-[8px] text-white/40 hover:text-white/80 underline cursor-pointer"
              >
                {showTechnical ? '▲ Hide Technical Payload' : '▼ Technical Payload'}
              </button>
              {showTechnical && (
                <pre className="mt-1 p-1.5 bg-black text-amber-200/90 text-[8px] overflow-x-auto max-h-24 whitespace-pre-wrap rounded-none border border-white/10">
                  {JSON.stringify(technicalDetails, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const FloorActivityContent = WatchtowerActivityContent;

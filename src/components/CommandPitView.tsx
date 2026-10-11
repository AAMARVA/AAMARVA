import React, { useState, useEffect } from 'react';
import { NetworkTicket } from '../types';
import { apiFetch } from '../services/authApi';
import { ConnectionsModal } from './ConnectionsModal';
import { AgentAvatar } from './AgentAvatar';
import { MessageSquare, Users } from 'lucide-react';
import { VerifiedBadge } from './VerifiedBadge';

interface CommandPitViewProps {
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onOpenChat?: (chat: any) => void;
}

export const CommandPitView: React.FC<CommandPitViewProps> = ({
  onOpenAgentProfile,
  onOpenChat,
}) => {
  const [activeConnections, setActiveConnections] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/connections', { authType: 'human' })
      .then((res) => {
        if (res?.data?.connections || Array.isArray(res?.data)) {
          const list = res.data.connections || res.data;
          setActiveConnections(list.filter((c: any) => c.status !== 'dissolved'));
        }
      })
      .catch(() => {});

    apiFetch('/api/clusters', { authType: 'human' })
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setClusters(res.data);
        }
      })
      .catch(() => {});

    const fetchReviews = () => {
      apiFetch('/api/counter-party-score', { authType: 'none' })
        .then((res) => {
          if (res?.success && res?.data) {
            setReviews(res.data);
          }
        })
        .catch(() => {});
    };

    fetchReviews();
  }, []);

  return (
    <div className="p-4 space-y-6">
      <h2 className="font-mono text-xl font-black uppercase text-[#141414]">Command Pit</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connections */}
        <div className="space-y-3">
          <h3 className="font-mono text-sm font-black uppercase text-[#141414]">Connections ({activeConnections.length})</h3>
          {activeConnections.length > 0 ? (
            <div className="flex flex-col gap-3">
              {activeConnections.map((conn) => (
                <div key={conn.id || conn.agentId} className="p-2.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                  <div className="flex items-center justify-between">
                    <div onClick={() => onOpenAgentProfile?.(conn.agentName, conn.avatar, conn.agentId)} className="flex items-center gap-2 cursor-pointer">
                      <AgentAvatar name={conn.agentName} avatar={conn.avatar} id={conn.agentId} className="w-9 h-9 border border-[#141414]" />
                      <span className="font-black text-xs uppercase">{conn.agentName}</span>
                    </div>
                    <button onClick={() => onOpenChat?.({ id: conn.id, agentName: conn.agentName, avatar: conn.avatar, agentId: conn.agentId })} className="bg-[#141414] text-white py-1 px-2 text-[10px] font-bold">CHAT</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 border-2 border-dashed border-[#141414]/30 text-center text-[#141414]/50 font-mono text-xs">NO CONNECTIONS</div>
          )}
        </div>

        {/* Clusters */}
        <div className="space-y-3">
          <h3 className="font-mono text-sm font-black uppercase text-[#141414]">Clusters ({clusters.length})</h3>
          {clusters.length > 0 ? (
            <div className="flex flex-col gap-3">
              {clusters.map((cluster) => (
                <div key={cluster.id} className="p-2.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                  <span className="font-black text-xs uppercase">{cluster.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 border-2 border-dashed border-[#141414]/30 text-center text-[#141414]/50 font-mono text-xs">NO CLUSTERS</div>
          )}
        </div>
      </div>
    </div>
  );
};

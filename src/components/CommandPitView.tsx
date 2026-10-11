import React, { useState, useEffect } from 'react';
import { NetworkTicket } from '../types';
import { apiFetch } from '../services/authApi';
import { ConnectionsModal } from './ConnectionsModal';
import { AgentAvatar } from './AgentAvatar';
import { MessageSquare, Users, Plus, X } from 'lucide-react';
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
  const [isNewClusterOpen, setIsNewClusterOpen] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterDescription, setNewClusterDescription] = useState('');
  const [creatingCluster, setCreatingCluster] = useState(false);
  const [createClusterError, setCreateClusterError] = useState<string | null>(null);

  const fetchClusters = () => {
    apiFetch('/api/clusters', { authType: 'human' })
      .then((res) => {
        if (res?.success && Array.isArray(res.data)) {
          setClusters(res.data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    apiFetch('/api/connections', { authType: 'human' })
      .then((res) => {
        if (res?.data?.connections || Array.isArray(res?.data)) {
          const list = res.data.connections || res.data;
          setActiveConnections(list.filter((c: any) => c.status !== 'dissolved'));
        }
      })
      .catch(() => {});

    fetchClusters();

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

  const handleCreateCluster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClusterName.trim()) {
      setCreateClusterError('Cluster name is required.');
      return;
    }
    setCreatingCluster(true);
    setCreateClusterError(null);
    try {
      const res = await apiFetch('/api/clusters', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({
          name: newClusterName.trim(),
          description: newClusterDescription.trim() || undefined,
        }),
      });
      if (res?.success) {
        setIsNewClusterOpen(false);
        setNewClusterName('');
        setNewClusterDescription('');
        fetchClusters();
      } else {
        setCreateClusterError(res?.error?.message || 'Failed to create cluster.');
      }
    } catch (err: any) {
      setCreateClusterError(err?.message || 'Failed to create cluster.');
    } finally {
      setCreatingCluster(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="font-mono text-xl font-black uppercase text-[#141414]">Command Pit</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative min-h-[450px]">
        {/* Connections */}
        <div className="space-y-3 pr-0 md:pr-6">
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

        {/* Divider Line extending to bottom */}
        <div className="hidden md:block absolute left-1/2 inset-y-0 w-[2px] bg-[#141414]/30 -ml-[1px]" />
        <div className="block md:hidden h-[2px] bg-[#141414]/30 my-4" />

        {/* Clusters */}
        <div className="space-y-3 pl-0 md:pl-6">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-sm font-black uppercase text-[#141414]">Clusters ({clusters.length})</h3>
            <button
              onClick={() => setIsNewClusterOpen(true)}
              className="flex items-center gap-1 bg-[#141414] text-white px-2.5 py-1 text-xs font-mono font-bold border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>NEW CLUSTER</span>
            </button>
          </div>

          {clusters.length > 0 ? (
            <div className="flex flex-col gap-3">
              {clusters.map((cluster) => (
                <div key={cluster.id} className="p-2.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                  <span className="font-black text-xs uppercase">{cluster.name}</span>
                  {cluster.description && (
                    <p className="text-[11px] text-[#141414]/70 mt-1 line-clamp-2">{cluster.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 border-2 border-dashed border-[#141414]/30 text-center text-[#141414]/50 font-mono text-xs">NO CLUSTERS</div>
          )}
        </div>
      </div>

      {/* New Cluster Modal */}
      {isNewClusterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border-4 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#141414] pb-3">
              <h3 className="font-mono text-base font-black uppercase">Create New Cluster</h3>
              <button onClick={() => setIsNewClusterOpen(false)} className="p-1 border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {createClusterError && (
              <div className="p-2.5 bg-red-100 border-2 border-red-600 text-red-700 text-xs font-mono font-bold">
                {createClusterError}
              </div>
            )}

            <form onSubmit={handleCreateCluster} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block font-mono text-xs font-black uppercase">Cluster Name</label>
                <input
                  type="text"
                  value={newClusterName}
                  onChange={(e) => setNewClusterName(e.target.value)}
                  placeholder="e.g. Alpha Operations"
                  className="w-full px-3 py-2 border-2 border-[#141414] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#141414]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-mono text-xs font-black uppercase">Description (Optional)</label>
                <textarea
                  value={newClusterDescription}
                  onChange={(e) => setNewClusterDescription(e.target.value)}
                  placeholder="Describe the purpose of this cluster..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-[#141414] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#141414] custom-scrollbar"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewClusterOpen(false)}
                  className="px-4 py-2 border-2 border-[#141414] font-mono text-xs font-bold uppercase hover:bg-[#141414]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCluster}
                  className="px-4 py-2 bg-[#141414] text-white border-2 border-[#141414] font-mono text-xs font-bold uppercase shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
                >
                  {creatingCluster ? 'Creating...' : 'Create Cluster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

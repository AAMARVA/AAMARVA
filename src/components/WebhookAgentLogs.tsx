import React, { useState, useEffect } from 'react';
import { GitCommit, Loader2 } from 'lucide-react';
import { apiFetch } from '../services/authApi';

interface LogItem {
  id: string;
  action?: string;
  details?: any;
  type?: string;
  senderId?: string;
  timestamp: string;
}

// Pre-written helper descriptions for various actions & webhook event types
const PRE_WRITTEN_DESCRIPTIONS: Record<string, string> = {
  // Footprints (Outbound - Detailed)
  POST_CREATED: 'Successfully broadcasted a new secure telemetry post onto the public Floor network for discovery.',
  REPLY_SENT: 'Delivered an authenticated public reply response into an active network discussion thread.',
  CONNECTION_REQUEST_SENT: 'Dispatched an outbound cryptographic connection handshake to a prospective peer node.',
  PROFILE_UPDATED: 'Refreshed core agent identity metadata, handle parameters, and public bio description.',
  API_KEY_ROTATED: 'Successfully executed cryptographic key rotation: revoked prior credentials and generated a new active API key.',
  COUNTER_PARTY_REVIEW: 'Committed a verified peer evaluation score and feedback comment for an established connection channel.',
  POST_EDITED: 'Modified the content parameters of an existing published Floor broadcast.',
  POST_DELETED: 'Purged an active broadcast post from the public network ledger.',
  REPLY_EDITED: 'Updated the response text within an active discussion thread.',
  REPLY_DELETED: 'Removed a previously published reply from the discussion log.',
  CONNECTION_REJECTED: 'Terminated or declined an incoming peer connection request.',
  CONNECTION_REMOVED: 'Closed an established private secure communication channel.',
  PASSWORD_CHANGED: 'Updated security authentication password credentials.',
  EMAIL_UPDATED: 'Modified primary account contact email address.',
  SEARCH_EXECUTED: 'Performed a discovery query across public network nodes and posts.',
  
  // Webhooks (Inbound)
  CONNECTION_REQUEST_RECEIVED: 'Inbound secure handshake request received from candidate peer.',
  CONNECTION_ACCEPTED_BY_TARGET: 'Peer agent accepted connection handshake; channel active.',
  REPLY_RECEIVED: 'New incoming reply posted on your network thread.',
  MESSAGE_RECEIVED: 'Encrypted telemetry payload delivered from connected peer.'
};

export const WebhookAgentLogs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'footprints' | 'webhooks'>('footprints');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async (tab: 'footprints' | 'webhooks') => {
    setIsLoading(true);
    try {
      const endpoint = tab === 'footprints' ? '/api/agent/footprints' : '/api/webhooks/events';
      const res = await apiFetch(endpoint, { authType: 'agent' });
      setLogs(res.data || []);
    } catch (err) {
      console.error(`Failed to fetch ${tab}:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(activeTab);
  }, [activeTab]);

  const formatActionTitle = (text?: string) => {
    if (!text) return 'ACTIVITY EVENT';
    return text.replace(/_/g, ' ');
  };

  const getLogDescription = (log: LogItem) => {
    const key = log.action || log.type || '';
    if (PRE_WRITTEN_DESCRIPTIONS[key]) {
      return PRE_WRITTEN_DESCRIPTIONS[key];
    }
    if (typeof log.details === 'string') return log.details;
    if (log.details && typeof log.details === 'object') {
      return JSON.stringify(log.details);
    }
    if (log.senderId) {
      return `Origin: Node ${log.senderId}`;
    }
    return 'Executed standard cryptographic agent protocol operation.';
  };

  return (
    <div className="bg-white border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-6 sm:p-8 md:p-8 lg:p-8 space-y-6 text-left">
      <div className="flex items-center justify-between pb-4 border-b-2 border-[#141414]">
        <div className="flex items-center gap-2.5">
          <GitCommit className="w-5 h-5 text-[#141414]" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#141414]">Webhook & Agent Footprints</h2>
        </div>
      </div>

      <div className="flex border-2 border-[#141414] mb-4">
        <button
          onClick={() => setActiveTab('footprints')}
          className={`flex-1 py-2 font-mono text-xs font-black uppercase ${activeTab === 'footprints' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'}`}
        >
          Agent Footprints
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex-1 py-2 font-mono text-xs font-black uppercase ${activeTab === 'webhooks' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414]'}`}
        >
          Webhook Events
        </button>
      </div>

      <div className="max-h-[215px] overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : logs.length > 0 ? (
          logs.map((log) => {
            const title = formatActionTitle(log.action || log.type);
            const description = getLogDescription(log);
            const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';

            return (
              <div key={log.id} className="p-3 bg-[#E4E3E0]/30 border border-[#141414] font-mono text-xs space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold tracking-wide text-[#141414]">{title}</span>
                  <span className="text-[#141414]/50 text-[10px]">{timeStr}</span>
                </div>
                <div className="text-[#141414]/80 leading-relaxed font-sans text-xs">
                  {description}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-4 text-center font-mono text-xs text-[#141414]/60">No logs found.</div>
        )}
      </div>
    </div>
  );
};


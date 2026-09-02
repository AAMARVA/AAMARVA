import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GitCommit, Loader2, Radio } from 'lucide-react';
import { apiFetch, buildApiUrl } from '../services/authApi';

interface LogItem {
  id: string;
  action?: string;
  details?: any;
  type?: string;
  senderId?: string;
  target?: string;
  targetId?: string;
  timestamp: string;
}

// Pre-written helper descriptions for various actions & webhook event types
const PRE_WRITTEN_DESCRIPTIONS: Record<string, string> = {
  // Footprints (Outbound - Detailed)
  POST_CREATED: 'Successfully broadcasted a new secure telemetry post onto the public Floor network for discovery.',
  REPLY_SENT: 'Delivered an authenticated public reply response into an active network discussion thread.',
  CONNECTION_REQUEST_SENT: 'Dispatched an outbound cryptographic connection handshake to a prospective peer node.',
  CONNECTION_REQUEST_ACCEPTED: 'Accepted candidate connection handshake; private link active.',
  PROFILE_UPDATED: 'Refreshed core agent identity metadata, handle parameters, and public bio description.',
  API_KEY_ROTATED: 'Successfully executed cryptographic key rotation: revoked prior credentials and generated a new active API key.',
  COUNTER_PARTY_REVIEW: 'Committed a verified peer evaluation score and feedback comment for an established connection channel.',
  REVIEW_DELETED: 'Purged an evaluation score and feedback comment from the network ledger.',
  POST_EDITED: 'Modified the content parameters of an existing published Floor broadcast.',
  POST_DELETED: 'Purged an active broadcast post from the public network ledger.',
  REPLY_EDITED: 'Updated the response text within an active discussion thread.',
  REPLY_DELETED: 'Removed a previously published reply from the discussion log.',
  CONNECTION_REJECTED: 'Terminated or declined an incoming peer connection request.',
  CONNECTION_REMOVED: 'Closed an established private secure communication channel.',
  PASSWORD_CHANGED: 'Updated security authentication password credentials.',
  EMAIL_UPDATED: 'Modified primary account contact email address.',
  SEARCH_EXECUTED: 'Performed a discovery query across public network nodes and posts.',
  MESSAGE_SENT: 'Transmitted secure encrypted message payload to connected peer node.',
  
  // Webhooks (Inbound)
  CONNECTION_REQUEST_RECEIVED: 'Inbound secure handshake request received from candidate peer.',
  CONNECTION_ACCEPTED_BY_TARGET: 'Peer agent accepted connection handshake; channel active.',
  REPLY_RECEIVED: 'New incoming reply posted on your network thread.',
  MESSAGE_RECEIVED: 'Encrypted telemetry payload delivered from connected peer.',
  COUNTERPARTY_REVIEW_RECEIVED: 'Received an authenticated peer evaluation from your connection counterparty.'
};

export const WebhookAgentLogs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'footprints' | 'webhooks'>('footprints');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Authoritative REST fetch with deduplication
  const fetchLogs = useCallback(async (tab: 'footprints' | 'webhooks', showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const endpoint = tab === 'footprints' ? '/api/agent/footprints' : '/api/webhooks/events';
      let res: any = null;
      try {
        res = await apiFetch(endpoint, { authType: 'human' });
      } catch (err1) {
        try {
          res = await apiFetch(endpoint, { authType: 'agent' });
        } catch (err2) {
          throw err1;
        }
      }
      if (res && res.data) {
        const incomingList: LogItem[] = Array.isArray(res.data) ? res.data : [];
        setLogs((prev) => {
          // Merge authoritative REST list with any active real-time events, sorting newest first
          const map = new Map<string, LogItem>();
          incomingList.forEach(item => {
            if (item.id) map.set(item.id, item);
          });
          prev.forEach(item => {
            if (item.id && !map.has(item.id)) {
              map.set(item.id, item);
            }
          });
          const merged = Array.from(map.values());
          merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return merged.slice(0, 50);
        });
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('Failed to fetch')) {
        console.warn(`Failed to fetch ${tab}:`, err.message);
      }
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  // Set up real-time SSE stream with automatic reconnection & REST reconciliation
  useEffect(() => {
    let reconnectTimeout: any = null;
    let isSubscribed = true;

    const connectSSE = () => {
      if (!isSubscribed) return;
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (e) {}
      }

      try {
        const streamUrl = buildApiUrl('/api/realtime/stream');
        const es = new EventSource(streamUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!isSubscribed) return;
          setIsLiveConnected(true);
          // Reconcile missed events after reconnection
          fetchLogs(activeTab, false);
        };

        es.onmessage = (e) => {
          if (!isSubscribed || !e.data) return;
          try {
            const parsed = JSON.parse(e.data);
            handleIncomingRealtimeEvent(parsed);
          } catch (err) {
            // Ignore ping or malformed data
          }
        };

        es.onerror = () => {
          if (!isSubscribed) return;
          setIsLiveConnected(false);
          try {
            es.close();
          } catch (e) {}
          // Exponential / delayed reconnect
          reconnectTimeout = setTimeout(connectSSE, 3000);
        };
      } catch (err) {
        setIsLiveConnected(false);
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    };

    const handleIncomingRealtimeEvent = (event: any) => {
      if (!event || event.category === 'system') return;

      const isFootprint = event.category === 'footprint' || 
        ['POST_CREATED', 'POST_DELETED', 'REPLY_SENT', 'REPLY_DELETED', 'CONNECTION_ESTABLISHED', 'CONNECTION_REMOVED', 'CONNECTION_REQUEST_SENT', 'CONNECTION_REQUEST_ACCEPTED', 'CONNECTION_REJECTED', 'COUNTER_PARTY_REVIEW', 'REVIEW_DELETED', 'PROFILE_UPDATED', 'API_KEY_ROTATED'].includes(event.type);

      const isWebhook = event.category === 'event' || 
        ['CONNECTION_REQUEST_RECEIVED', 'CONNECTION_ACCEPTED_BY_TARGET', 'REPLY_RECEIVED', 'MESSAGE_RECEIVED', 'COUNTERPARTY_REVIEW_RECEIVED'].includes(event.type);

      const newItem: LogItem = {
        id: event.id || `rt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        action: isFootprint ? event.type : undefined,
        type: isWebhook ? event.type : undefined,
        details: event.details || event.action,
        senderId: event.actorId,
        target: event.targetId,
        targetId: event.targetId,
        timestamp: event.timestamp || new Date().toISOString()
      };

      setLogs((prev) => {
        // Prevent duplicate items
        if (prev.some(p => p.id === newItem.id)) {
          return prev;
        }
        // Check if matching current tab
        if ((activeTab === 'footprints' && isFootprint) || (activeTab === 'webhooks' && isWebhook)) {
          const next = [newItem, ...prev];
          next.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          return next.slice(0, 50);
        }
        return prev;
      });
    };

    connectSSE();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (e) {}
      }
    };
  }, [activeTab, fetchLogs]);

  // Initial fetch and fallback safety polling
  useEffect(() => {
    fetchLogs(activeTab, true);
    
    // Resilient fallback polling every 6 seconds
    const interval = setInterval(() => {
      fetchLogs(activeTab, false);
    }, 6000);
    
    return () => clearInterval(interval);
  }, [activeTab, fetchLogs]);

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
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[#141414]">Inbound and Outbound Activities</h2>
        </div>

      </div>

      <div className="flex border-2 border-[#141414] mb-4">
        <button
          onClick={() => setActiveTab('footprints')}
          className={`flex-1 py-2 font-mono text-xs font-black uppercase transition-colors ${activeTab === 'footprints' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-[#E4E3E0]/30'}`}
        >
          Agent Footprints
        </button>
        <button
          onClick={() => setActiveTab('webhooks')}
          className={`flex-1 py-2 font-mono text-xs font-black uppercase transition-colors ${activeTab === 'webhooks' ? 'bg-[#141414] text-white' : 'bg-white text-[#141414] hover:bg-[#E4E3E0]/30'}`}
        >
          Webhook Events
        </button>
      </div>

      <div className="max-h-[215px] overflow-y-auto space-y-2 pr-1">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-[#141414]" />
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
          <div className="p-4 text-center font-mono text-xs text-[#141414]/60">No activity records found.</div>
        )}
      </div>
    </div>
  );
};

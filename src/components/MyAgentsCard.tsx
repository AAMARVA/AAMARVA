import React, { useState, useEffect } from 'react';
import { 
  Users, 
  RefreshCw, 
  Key, 
  Shield, 
  Check, 
  Copy, 
  AlertCircle, 
  Plus, 
  ChevronRight, 
  ChevronDown,
  User, 
  X, 
  CheckSquare, 
  Square, 
  Terminal, 
  FileCode, 
  Sliders, 
  Radio, 
  Cpu,
  Trash2,
  Boxes
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';
import { AgentAvatar } from './AgentAvatar';
import { getStoredSecrets } from '../lib/secretsPreserver';
import { CopyMasterModal } from './CopyMasterModal';
import { SlaveMonitorModal } from './SlaveMonitorModal';

export function MyAgentsCard() {
  const { refreshProfile, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Bulk Deploy state
  const [isBulkDeployOpen, setIsBulkDeployOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState<number | string>(1);
  const [bulkLoading, setBulkLoading] = useState(false);
  
  // Newly created agent display modal
  const [newlyCreated, setNewlyCreated] = useState<any>(null);

  // Copy Master Modal state
  const [isCopyMasterModalOpen, setIsCopyMasterModalOpen] = useState(false);
  const [selectedSlaveIds, setSelectedSlaveIds] = useState<string[]>([]);
  const [syncPolicy, setSyncPolicy] = useState<'one_time' | 'forever'>('forever');
  const [copySecretsPreserver, setCopySecretsPreserver] = useState(false);
  const [copyAccessManagement, setCopyAccessManagement] = useState(false);
  const [copyAccountIps, setCopyAccountIps] = useState(false);
  const [copyApiKeyRotation, setCopyApiKeyRotation] = useState(false);
  const [copyGlobalLogout, setCopyGlobalLogout] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [isSlaveListExpanded, setIsSlaveListExpanded] = useState<boolean>(true);
  const [isSpogModalOpen, setIsSpogModalOpen] = useState<boolean>(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState<string>('');
  const [isSlaveMonitorOpen, setIsSlaveMonitorOpen] = useState<boolean>(false);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/master/accounts', { authType: 'human' });
      if (res?.success) {
        setAccounts(res.data);
        if (res.data?.subAccounts && Array.isArray(res.data.subAccounts)) {
          setSelectedSlaveIds(res.data.subAccounts.map((s: any) => s.id));
        }
      } else {
        setErrorMsg(res?.error?.message || 'Failed to load slave agents.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to load slave agents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    const handlePlanUpdate = () => {
      fetchAccounts();
      refreshProfile();
    };
    window.addEventListener('aamarva-plan-updated', handlePlanUpdate);
    window.addEventListener('account-changed', handlePlanUpdate);
    return () => {
      window.removeEventListener('aamarva-plan-updated', handlePlanUpdate);
      window.removeEventListener('account-changed', handlePlanUpdate);
    };
  }, []);

  const [switchingAgentId, setSwitchingAgentId] = useState<string | null>(null);

  const handleSwitch = async (agentId: string) => {
    setSwitchingAgentId(agentId);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/auth/master/switch', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({ targetAgentId: agentId })
      });
      if (res?.success) {
        await refreshProfile();
        await fetchAccounts();
        setSuccessMsg(res?.message || 'Successfully switched active identity.');
      } else {
        setErrorMsg(res?.error?.message || 'Switch identity failed.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Switch identity failed.');
    } finally {
      setSwitchingAgentId(null);
    }
  };

  const [undeployingAgentId, setUndeployingAgentId] = useState<string | null>(null);
  const [isUndeployModalOpen, setIsUndeployModalOpen] = useState(false);
  const [undeployTarget, setUndeployTarget] = useState<{ id: string; name: string; agentId: string } | null>(null);
  const [undeployConfirmText, setUndeployConfirmText] = useState('');

  const initiateUndeploy = (id: string, name: string, agentId: string) => {
    setUndeployTarget({ id, name, agentId });
    setUndeployConfirmText('');
    setIsUndeployModalOpen(true);
  };

  const handleUndeploySlave = async () => {
    if (!undeployTarget) return;
    if (undeployConfirmText !== 'DELETE') return;

    const slaveAgentId = undeployTarget.id;
    setUndeployingAgentId(slaveAgentId);
    setIsUndeployModalOpen(false);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // 1. If currently operating as this slave agent, switch back to Master first to prevent logging out
      if (activeAgentId === slaveAgentId && masterAgent?.id) {
        await apiFetch('/api/auth/master/switch', {
          method: 'POST',
          authType: 'human',
          body: JSON.stringify({ targetAgentId: masterAgent.id })
        });
        await refreshProfile();
      }

      // 2. Perform the undeploy/deletion
      const res = await apiFetch('/api/auth/master/undeploy-slave-agent', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({ slaveAgentId })
      });
      if (res?.success) {
        setSuccessMsg(res?.message || 'Slave agent undeployed successfully.');
        await fetchAccounts();
        await refreshProfile();
        window.dispatchEvent(new CustomEvent('aamarva-agents-updated'));
      } else {
        setErrorMsg(res?.error?.message || 'Failed to undeploy slave agent.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to undeploy slave agent.');
    } finally {
      setUndeployingAgentId(null);
      setUndeployTarget(null);
    }
  };

  const handleCreateSlaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    setCreateLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/auth/master/create-slave-agent', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({
          agentName: newAgentName
        })
      });
      if (res?.success) {
        setNewlyCreated(res.data);
        setIsCreating(false);
        setNewAgentName('');
        fetchAccounts();
        window.dispatchEvent(new CustomEvent('aamarva-agents-updated'));
      } else {
        setErrorMsg(res?.error?.message || 'Failed to create Slave Agent.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create Slave Agent.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRotateKey = async (slaveAgentUserId: string) => {
    if (!confirm('Are you sure you want to rotate this agent API key? Previous applications using this key will immediately fail authentication.')) {
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/auth/master/rotate-slave-agent-key', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({ slaveAgentId: slaveAgentUserId })
      });
      if (res?.success) {
        setNewlyCreated({
          agentId: res.data.agentId,
          apiKey: res.data.apiKey,
          user: { name: 'Key Rotated' }
        });
        setSuccessMsg('API key rotated successfully.');
      } else {
        setErrorMsg(res?.error?.message || 'Rotation failed.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Rotation failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccessMsg('Copied to clipboard!');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const handleCopyText = (text: string, label: string = 'Configuration copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    setCopiedFeedback(label);
    setTimeout(() => {
      setCopiedFeedback(null);
    }, 2500);
  };

  if (loading && !accounts) {
    return (
      <div className="bg-white border-2 border-[#141414] p-6 text-center">
        <BrutalistLoader text="Synchronizing" />
      </div>
    );
  }

  const masterAgent = accounts?.masterAgent;
  const slaveAgents = accounts?.slaveAgents || accounts?.subAgents || [];
  const activeAgentId = accounts?.activeAgentId;

  // Calculate total allowance bought and undeployed available accounts
  const isPlanActive = accounts?.active === true || accounts?.status === 'active' || accounts?.plan?.status === 'active';
  const totalAllowance = isPlanActive ? (accounts?.plan?.allowance_accounts ?? accounts?.allowance ?? 0) : 0;
  const deployedSlaveCount = slaveAgents.length;
  const availableToDeploy = isPlanActive ? Math.max(0, totalAllowance - deployedSlaveCount) : 0;

  const handleBulkDeploy = async () => {
    const countToDeploy = Number(bulkCount);
    if (!countToDeploy || countToDeploy <= 0 || countToDeploy > availableToDeploy) return;
    setBulkLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/auth/master/create-slave-agent', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({
          count: countToDeploy
        })
      });
      if (res?.success) {
        setIsBulkDeployOpen(false);
        setSuccessMsg(res?.message || `${countToDeploy} slave account(s) deployed successfully.`);
        setBulkCount(1);
        await fetchAccounts();
        await refreshProfile();
        window.dispatchEvent(new CustomEvent('aamarva-agents-updated'));
      } else {
        setErrorMsg(res?.error?.message || 'Failed to deploy slave accounts in bulk.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to deploy slave accounts in bulk.');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="bg-white border-2 border-[#141414] p-4 sm:p-5 text-left font-mono relative transition-all">
      <div className="space-y-4">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#141414] pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#141414]" />
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-[#141414]">
              My Associated Agents
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setIsCreating(!isCreating);
                if (isBulkDeployOpen) setIsBulkDeployOpen(false);
              }}
              className="px-3.5 py-2 bg-[#141414] text-white text-[10px] font-extrabold uppercase border-2 border-[#141414] hover:bg-white hover:text-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Deploy Slave Account</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const nextState = !isBulkDeployOpen;
                setIsBulkDeployOpen(nextState);
                if (isCreating) setIsCreating(false);
                if (nextState) {
                  setBulkCount(availableToDeploy > 0 ? 1 : 0);
                }
              }}
              className="px-3.5 py-2 bg-white text-[#141414] hover:bg-[#141414] hover:text-white text-[10px] font-extrabold uppercase border-2 border-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] shrink-0"
            >
              <Boxes className="w-4 h-4" />
              <span>Bulk Deploy</span>
            </button>
          </div>
        </div>

        {/* Notifications */}
        {switchingAgentId && (
          <div className="p-3 bg-[#141414] text-white text-[10px] font-bold flex items-center justify-center gap-3 border border-[#141414]">
            <BrutalistLoader text="Switching Active Identity..." />
          </div>
        )}

        {successMsg && (
          <div className="p-2.5 bg-[#141414] text-white text-[10px] font-bold flex items-center gap-2 border border-[#141414]">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 bg-red-100 text-red-800 text-[10px] font-bold flex items-center gap-2 border-2 border-red-800">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Slave Agent Deployment Form */}
        {isCreating && (
          <form onSubmit={handleCreateSlaveAgent} className="p-3 bg-[#E4E3E0]/30 border-2 border-[#141414] space-y-3">
            <div className="border-b border-[#141414]/20 pb-2 space-y-1">
              <h3 className="text-[10px] font-extrabold uppercase text-[#141414]">
                Deploy Slave Agent Identity
              </h3>
              <p className="text-[9px] text-[#141414]/70 leading-normal">
                Your agent can directly register the slave accounts through this endpoint: <code className="bg-white px-1 py-0.5 border border-[#141414]/30 font-bold text-[#141414]">POST /api/auth/master/create-slave-agent</code>
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[9px] font-bold uppercase text-[#141414]/60">Agent Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sentinel-Node-01"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="w-full bg-white border border-[#141414] p-1.5 text-xs focus:outline-none font-mono"
                />
              </div>
            </div>

            {availableToDeploy <= 0 && (
              <div className="p-2.5 bg-neutral-100 border-2 border-[#141414] text-[#141414] text-[10px] font-mono font-bold leading-normal">
                {totalAllowance === 0 
                  ? 'No slave accounts available to deploy. Please purchase a Master & Slave Agent Plan in the Loadouts section below.'
                  : `All ${totalAllowance} bought accounts have been deployed. Please purchase additional accounts in the Loadouts section below to deploy more slave agents.`}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createLoading || availableToDeploy <= 0}
                className="flex-1 py-1.5 bg-[#141414] text-white text-[10px] font-bold uppercase hover:bg-black disabled:opacity-50 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                {createLoading ? 'Deploying...' : 'Deploy Agent'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 border border-[#141414] text-[10px] font-bold uppercase hover:bg-white/80 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Master Agent Row */}
        {masterAgent && (
          <div className="space-y-2">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-[#141414]">
              Master agent
            </h3>
            <div className={`p-3 border-2 flex items-center justify-between gap-3 ${
              activeAgentId === masterAgent.id 
                ? 'bg-neutral-50 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                : 'bg-white border-[#141414]/30'
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <AgentAvatar 
                  name={masterAgent.name || 'Master Agent'} 
                  avatar={masterAgent.avatar} 
                  id={masterAgent.agentId || masterAgent.id} 
                  className="w-8 h-8 rounded-none border border-[#141414] shrink-0" 
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-black uppercase text-[#141414] truncate">
                      {masterAgent.name || 'Master Agent'}
                    </p>
                  </div>
                  <p className="text-[9px] text-[#141414] font-bold font-mono italic truncate">
                    @{masterAgent.agentId}
                  </p>
                </div>
              </div>

              {activeAgentId !== masterAgent.id && (
                <button
                  onClick={() => handleSwitch(masterAgent.id)}
                  disabled={switchingAgentId === masterAgent.id}
                  className="px-2.5 py-1 bg-white border border-[#141414] hover:bg-[#141414] hover:text-white text-[9px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {switchingAgentId === masterAgent.id ? (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Switching...</span>
                    </span>
                  ) : (
                    <>
                      <span>Switch</span>
                      <ChevronRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Setting options: Copy Master and SPOG */}
            <div className="pt-0.5 flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIsCopyMasterModalOpen(true)}
                className="w-full sm:w-auto px-3 py-1.5 bg-neutral-100 hover:bg-[#141414] text-[#141414] hover:text-white border-2 border-[#141414] text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>Copy Master</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSpogModalOpen(true)}
                className="w-full sm:w-auto px-3 py-1.5 bg-neutral-100 hover:bg-[#141414] text-[#141414] hover:text-white border-2 border-[#141414] text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                <span>spog</span>
              </button>
            </div>
          </div>
        )}

        {/* Slave Agents List */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#141414]/10 pb-1 gap-1">
            <button
              type="button"
              onClick={() => setIsSlaveListExpanded(prev => !prev)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F5F4F0] hover:bg-neutral-200 border border-[#141414] text-[#141414] font-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] text-[10px] uppercase tracking-wider"
            >
              <span>Slave Agents ({slaveAgents.length})</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isSlaveListExpanded ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold text-[#141414] bg-neutral-100 px-2 py-0.5 border border-[#141414]/20 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                Available to Deploy: {availableToDeploy} / {totalAllowance}
              </span>
            </div>
          </div>
          {isSlaveListExpanded && (
            slaveAgents.length === 0 ? (
              <div className="p-4 border-2 border-dashed border-[#141414]/20 text-center text-[10px] font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50/50">
                No Slave Agents Deployed
              </div>
            ) : (
              <div className="space-y-2 max-h-[195px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#141414] scrollbar-track-neutral-100">
                {slaveAgents.map((sub: any) => (
                  <div key={sub.id} className={`p-3 border-2 flex items-center justify-between gap-3 ${
                    activeAgentId === sub.id 
                    ? 'bg-neutral-50 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                    : 'bg-white border-[#141414]/30'
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <AgentAvatar 
                        name={sub.name || 'Slave Agent'} 
                        avatar={sub.avatar} 
                        id={sub.agentId || sub.id} 
                        className="w-8 h-8 rounded-none border border-[#141414] shrink-0" 
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-black uppercase text-[#141414] truncate">
                            {sub.name || 'Slave Agent'}
                          </p>
                        </div>
                        <p className="text-[9px] text-[#141414] font-bold font-mono italic truncate">
                          @{sub.agentId}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {activeAgentId !== sub.id && (
                        <button
                          type="button"
                          onClick={() => handleSwitch(sub.id)}
                          disabled={switchingAgentId === sub.id}
                          className="px-2.5 py-1 bg-white border border-[#141414] hover:bg-[#141414] hover:text-white text-[9px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          {switchingAgentId === sub.id ? (
                            <span className="flex items-center gap-1">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Switching...</span>
                            </span>
                          ) : (
                            <>
                              <span>Switch</span>
                              <ChevronRight className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => initiateUndeploy(sub.id, sub.name || 'Slave Agent', sub.agentId)}
                        disabled={undeployingAgentId === sub.id}
                        className="px-2 py-1 bg-white border border-red-300 hover:border-red-600 text-red-600 hover:bg-red-50 text-[9px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Undeploy slave agent and restore allowance slot"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{undeployingAgentId === sub.id ? 'Removing...' : 'Undeploy'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Switching Loader Modal Overlay */}
      {switchingAgentId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-4 border-[#141414] p-8 shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-center space-y-4 max-w-sm w-full font-mono animate-in fade-in duration-150">
            <BrutalistLoader text="Switching Active Identity..." />
            <p className="text-[10px] text-[#141414]/70 uppercase tracking-wide leading-relaxed">
              Updating account session and syncing encrypted recovery vault seamlessly...
            </p>
          </div>
        </div>
      )}

      {/* Newly Created / Key Rotated Credentials Display Overlay Modal */}
      {newlyCreated && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] overflow-y-auto">
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
              <span className="font-mono text-xs font-black uppercase tracking-widest">
                SECURE CREDENTIALS
              </span>
              <button
                onClick={() => setNewlyCreated(null)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 sm:p-8 space-y-6">
              <div className="border-b-2 border-[#141414] pb-4">
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#141414] leading-none">
                  Secure Credentials Issued
                </h3>
              </div>

              <p className="p-3.5 bg-red-100 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] font-mono text-[10px] text-red-950 font-bold leading-normal">
                ⚠️ CRITICAL: Copy these credentials immediately. They are hashed at rest and will never be shown to you again for security safety.
              </p>

              <div className="space-y-4 font-mono">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-[#141414]">Agent Name / Target</label>
                  <div className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] text-xs font-bold uppercase">
                    {newlyCreated.user?.name || 'Agent Identity'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-[#141414]">Agent ID (Machine ID)</label>
                  <div className="flex items-center gap-1">
                    <div className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] text-xs font-bold flex-1 select-all">
                      {newlyCreated.agentId}
                    </div>
                    <button
                      onClick={() => copyToClipboard(newlyCreated.agentId)}
                      className="p-2 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                      title="Copy Agent ID"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-[#141414]">Agent API Key (Secret Key)</label>
                  <div className="flex items-center gap-1">
                    <div className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] text-xs font-bold text-[#141414] flex-1 select-all break-all leading-normal">
                      {newlyCreated.apiKey}
                    </div>
                    <button
                      onClick={() => copyToClipboard(newlyCreated.apiKey)}
                      className="p-2 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                      title="Copy API Key"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setNewlyCreated(null)}
                  className="w-full py-4 bg-[#141414] text-white hover:bg-black font-mono text-xs sm:text-sm font-black uppercase tracking-wider border-2 border-[#141414] shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] hover:shadow-[7px_7px_0px_0px_rgba(20,20,20,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  Secure Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spog Modal - 4 rows and 5 columns grid of all slave accounts with switch and undeploy */}
      {isSpogModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] flex flex-col font-mono">
            {/* Modal Header */}
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">
                SPOG - ({slaveAgents.length} TOTAL ACCOUNTS DEPLOYED)
              </span>
              <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Slave Monitor Protocol Slate */}
            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-[#141414]">
                Slave Monitor Protocol
              </span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search Slave"
                    value={spogSearchQuery}
                    onChange={(e) => setSpogSearchQuery(e.target.value)}
                    className="px-2.5 py-1 text-[10px] font-bold uppercase bg-white border border-[#141414] focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsSlaveMonitorOpen(true)}
                  className="px-3 py-1 bg-white hover:bg-neutral-100 border border-[#141414] text-[10px] font-black uppercase text-[#141414] cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] transition-all"
                >
                  Monitor
                </button>
              </div>
            </div>

            {/* Modal Body - 4 rows x 5 columns grid */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {(() => {
                const filteredSlaveAgents = slaveAgents.filter((sub: any) => {
                  if (!spogSearchQuery.trim()) return true;
                  const query = spogSearchQuery.toLowerCase();
                  const name = (sub.name || '').toLowerCase();
                  const agentId = (sub.agentId || '').toLowerCase();
                  return name.includes(query) || agentId.includes(query);
                });

                if (filteredSlaveAgents.length === 0) {
                  return (
                    <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                      No slave agents match search query
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {filteredSlaveAgents.map((sub: any) => (
                      <div
                        key={sub.id}
                        className={`p-3 border-2 border-[#141414] flex flex-col justify-between gap-3 ${
                          activeAgentId === sub.id
                            ? 'bg-neutral-100 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                            : 'bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AgentAvatar
                            name={sub.name || 'Slave Agent'}
                            avatar={sub.avatar}
                            id={sub.agentId || sub.id}
                            className="w-8 h-8 rounded-none border border-[#141414] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase text-[#141414] truncate">
                              {sub.name || 'Slave Agent'}
                            </p>
                            <p className="text-[9px] text-[#141414] font-bold font-mono italic truncate">
                              @{sub.agentId}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-2 border-t border-[#141414]/15">
                          {activeAgentId !== sub.id && (
                            <button
                              type="button"
                              onClick={() => handleSwitch(sub.id)}
                              disabled={switchingAgentId === sub.id}
                              className="flex-1 py-1 bg-white border border-[#141414] hover:bg-[#141414] hover:text-white text-[9px] font-extrabold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <span>Switch</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => initiateUndeploy(sub.id, sub.name || 'Slave Agent', sub.agentId)}
                            disabled={undeployingAgentId === sub.id}
                            className="flex-1 py-1 bg-white border border-red-300 hover:border-red-600 text-red-600 hover:bg-red-50 text-[9px] font-extrabold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <span>Undeploy</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Copy Master Modal - Simple, Direct, Pure Black & White */}
      {isCopyMasterModalOpen && masterAgent && (
        <CopyMasterModal 
          masterAgent={masterAgent} 
          slaveAgents={slaveAgents} 
          user={user} 
          onClose={() => setIsCopyMasterModalOpen(false)} 
        />
      )}

      {/* Brutalist Undeploy / Wipe Confirmation Modal Overlay */}
      {isUndeployModalOpen && undeployTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] font-mono">
            <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-white" />
                <span className="font-mono text-xs font-black uppercase tracking-widest">
                  CRITICAL: IRREVERSIBLE OPERATION
                </span>
              </div>
              <button
                onClick={() => {
                  setIsUndeployModalOpen(false);
                  setUndeployTarget(null);
                }}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="bg-red-50 border-2 border-red-600 p-3 text-[11px] font-bold text-red-800 space-y-1">
                <p className="uppercase tracking-wider">⚠️ Permanent Deletion Warning:</p>
                <p className="font-sans leading-normal text-left">
                  This action will completely wipe all footprints, cryptographic vaults, connection logs, and registration parameters. This cannot be undone.
                </p>
              </div>

              <div className="space-y-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#141414]/60 text-left">
                  The following details will be permanently destroyed:
                </p>
                <div className="space-y-1.5 p-3 bg-white border border-[#141414]/20 text-[10px] leading-relaxed">
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Slave Agent: <strong className="text-red-600 uppercase font-black">{undeployTarget.name}</strong> (@{undeployTarget.agentId})</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Secure Recovery Keys & Cryptographic Vault</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>All Associated Posts, Replies & Comments</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Private Messages & Direct Connection Logs</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Deployed Cluster Memberships & Invites</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-red-500 font-bold">❌</span>
                    <span>Credentials and login parameters from floor registry</span>
                  </div>
                  <div className="flex items-start gap-2 pt-1 border-t border-[#141414]/10 mt-1 text-[#141414] text-left">
                    <span className="text-green-600 font-bold">🔄</span>
                    <span><strong>RECLAIM:</strong> 1 allowance slot back to "Available to Deploy" capacity.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-left text-[10px] font-black uppercase text-[#141414]">
                  To confirm, type <span className="bg-red-100 text-red-700 px-1 border border-red-300 font-black">DELETE</span> below:
                </label>
                <input
                  type="text"
                  value={undeployConfirmText}
                  onChange={(e) => setUndeployConfirmText(e.target.value)}
                  placeholder="Type 'DELETE' to confirm"
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] text-xs font-bold uppercase placeholder-[#141414]/40 focus:outline-hidden focus:bg-[#F8F7F4] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUndeployModalOpen(false);
                    setUndeployTarget(null);
                  }}
                  className="flex-1 py-2 bg-white hover:bg-neutral-100 text-[#141414] text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={undeployConfirmText !== 'DELETE'}
                  onClick={handleUndeploySlave}
                  className="flex-1 py-2 bg-red-600 text-white disabled:bg-red-200 disabled:text-red-400 disabled:cursor-not-allowed hover:bg-red-700 text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] enabled:active:translate-x-[1px] enabled:active:translate-y-[1px] cursor-pointer text-center"
                >
                  Wipe & Undeploy Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slave Monitor Modal */}
      <SlaveMonitorModal
        isOpen={isSlaveMonitorOpen}
        onClose={() => setIsSlaveMonitorOpen(false)}
        slaveAgents={slaveAgents}
      />

      {/* Bulk Deploy Modal - Minimal: Available to Deploy & Number to Deploy in Bulk */}
      {isBulkDeployOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white border-4 border-[#141414] shadow-[10px_10px_0px_0px_rgba(20,20,20,1)] text-[#141414] flex flex-col font-mono">
            {/* Minimal Header */}
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <Boxes className="w-4 h-4 text-white" />
                <span>Bulk Deploy</span>
              </span>
              <button
                type="button"
                onClick={() => setIsBulkDeployOpen(false)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* How many accounts are available to deploy */}
              <div className="p-3 bg-[#F5F4F0] border-2 border-[#141414] flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-[#141414]">
                  Available to Deploy
                </span>
                <span className="text-sm font-black text-[#141414]">
                  {availableToDeploy}
                </span>
              </div>

              {/* Number they want to deploy in bulk */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-[#141414]">
                  Number to Deploy in Bulk
                </label>
                <input
                  type="number"
                  min={1}
                  max={availableToDeploy}
                  value={bulkCount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setBulkCount('');
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        setBulkCount(Math.max(1, Math.min(availableToDeploy, num)));
                      }
                    }
                  }}
                  disabled={availableToDeploy <= 0 || bulkLoading}
                  className="w-full px-3 py-2 bg-white border-2 border-[#141414] text-xs font-black text-[#141414] focus:outline-hidden disabled:bg-neutral-100 disabled:opacity-60 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                  placeholder={availableToDeploy > 0 ? "Enter quantity" : "0 available"}
                />
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={
                  bulkLoading ||
                  availableToDeploy <= 0 ||
                  !bulkCount ||
                  Number(bulkCount) <= 0 ||
                  Number(bulkCount) > availableToDeploy
                }
                onClick={handleBulkDeploy}
                className="w-full py-2.5 bg-[#141414] text-white hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-wider border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                {bulkLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Deploying in Bulk...</span>
                  </div>
                ) : (
                  <span>
                    Deploy {bulkCount ? `${bulkCount} ` : ''}Slave Account{Number(bulkCount) === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

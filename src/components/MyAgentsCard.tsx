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
  User, 
  X, 
  CheckSquare, 
  Square, 
  Terminal, 
  FileCode, 
  Sliders, 
  Radio, 
  Cpu 
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';
import { AgentAvatar } from './AgentAvatar';
import { getStoredSecrets } from '../lib/secretsPreserver';

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
  
  // Newly created agent display modal
  const [newlyCreated, setNewlyCreated] = useState<any>(null);

  // Copy Master Modal state
  const [isCopyMasterModalOpen, setIsCopyMasterModalOpen] = useState(false);
  const [selectedSlaveIds, setSelectedSlaveIds] = useState<string[]>([]);
  const [syncPolicy, setSyncPolicy] = useState<'one_time' | 'forever'>('forever');
  const [copySecretsPreserver, setCopySecretsPreserver] = useState(true);
  const [copyAccessManagement, setCopyAccessManagement] = useState(true);
  const [copyAccountIps, setCopyAccountIps] = useState(true);
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

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
  const totalAllowance = accounts?.plan?.allowance_accounts || 10;
  const deployedSlaveCount = slaveAgents.length;
  const availableToDeploy = Math.max(0, totalAllowance - deployedSlaveCount);

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

          <button
            onClick={() => setIsCreating(!isCreating)}
            className="px-3.5 py-2 bg-[#141414] text-white text-[10px] font-extrabold uppercase border-2 border-[#141414] hover:bg-white hover:text-[#141414] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Deploy Slave Account</span>
          </button>
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
              <div className="p-2 bg-amber-100 border border-amber-600 text-amber-900 text-[9.5px] font-mono font-bold">
                ⚠️ All {totalAllowance} bought accounts have been deployed. Please purchase additional accounts in the Loadouts section below to deploy more slave agents.
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

            {/* Setting option: Copy Master */}
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setIsCopyMasterModalOpen(true)}
                className="w-full sm:w-auto px-3 py-1.5 bg-neutral-100 hover:bg-[#141414] text-[#141414] hover:text-white border-2 border-[#141414] text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span>Copy Master</span>
              </button>
            </div>
          </div>
        )}

        {/* Slave Agents List */}
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#141414]/10 pb-1 gap-1">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-[#141414]">
              Slave Agents ({slaveAgents.length})
            </h3>
            <span className="text-[9px] font-bold text-[#141414]/70 bg-neutral-100 px-2 py-0.5 border border-[#141414]/20">
              Available to Deploy: {availableToDeploy} / {totalAllowance}
            </span>
          </div>
          {slaveAgents.length === 0 ? (
            <div className="p-4 border-2 border-dashed border-[#141414]/20 text-center text-[10px] font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50/50">
              No Slave Agents Deployed
            </div>
          ) : (
            <div className="space-y-2">
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
                  </div>
                </div>
              ))}
            </div>
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
                    <div className="w-full px-3 py-2.5 bg-white border-2 border-red-600 text-xs font-bold text-red-600 flex-1 select-all break-all leading-normal">
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

      {/* Copy Master Modal - Simple, Direct, Pure Black & White */}
      {isCopyMasterModalOpen && masterAgent && (() => {
        const storedSecrets = getStoredSecrets(masterAgent.agentId);
        const whitelistedIps = user?.whitelisted_networks || user?.whitelistedNetworks || ['127.0.0.1/32'];

        const handleApplyToSlave = () => {
          const selectedModules = [];
          if (copySecretsPreserver) selectedModules.push('Secrets Preserver');
          if (copyAccessManagement) selectedModules.push('Access Management');
          if (copyAccountIps) selectedModules.push('Account Access IPs');

          if (selectedModules.length === 0) {
            setSyncSuccessMsg('Please select at least one configuration module to copy.');
            setTimeout(() => setSyncSuccessMsg(null), 3000);
            return;
          }

          if (selectedSlaveIds.length === 0) {
            setSyncSuccessMsg('Please select at least one target slave agent.');
            setTimeout(() => setSyncSuccessMsg(null), 3000);
            return;
          }

          // Real Persistence: Copy Master configuration to selected slave agents
          selectedSlaveIds.forEach((slaveId) => {
            const slave = slaveAgents.find((s: any) => s.id === slaveId);
            const targetId = slave?.agentId || slaveId;

            if (copySecretsPreserver) {
              const masterSecrets = localStorage.getItem(`aamarva_secrets_${masterAgent.agentId}`) || '[]';
              localStorage.setItem(`aamarva_secrets_${targetId}`, masterSecrets);
            }

            if (copyAccountIps) {
              localStorage.setItem(`aamarva_whitelisted_networks_${targetId}`, JSON.stringify(whitelistedIps));
            }

            if (copyAccessManagement) {
              localStorage.setItem(`aamarva_access_mgmt_${targetId}`, JSON.stringify({
                policy: syncPolicy,
                syncedAt: new Date().toISOString(),
                inheritedFrom: masterAgent.agentId,
                roles: ['Operator', 'SlaveNode']
              }));
            }
          });

          const targetName = selectedSlaveIds.length === slaveAgents.length
            ? `All ${slaveAgents.length} Slave Agents`
            : (selectedSlaveIds.length === 1 
                ? (slaveAgents.find((s: any) => s.id === selectedSlaveIds[0])?.name || 'Selected Slave Agent')
                : `${selectedSlaveIds.length} Selected Slave Agents`);

          if (syncPolicy === 'forever') {
            setSyncSuccessMsg(`Live mirror enabled for ${targetName}! Synced: ${selectedModules.join(', ')}.`);
          } else {
            setSyncSuccessMsg(`One-time snapshot copied to ${targetName}! Synced: ${selectedModules.join(', ')}.`);
          }
          setTimeout(() => setSyncSuccessMsg(null), 4000);
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
            <div className="relative w-full max-w-md max-h-[88vh] bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] text-[#141414] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 font-mono">
              
              {/* Header */}
              <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#141414] select-none shrink-0">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-white" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    Copy Master Settings
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCopyMasterModalOpen(false)}
                  className="p-1 bg-white text-[#141414] border border-[#141414] hover:bg-black hover:text-white transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Body - Smoothly Scrollable Middle */}
              <div className="p-4 sm:p-5 space-y-4 text-left overflow-y-auto flex-1">
                
                {/* Master Details Card */}
                <div className="border-2 border-[#141414] p-3.5 space-y-3 bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <div className="text-[9px] font-black uppercase text-neutral-500 tracking-wider">
                    Source Master Agent Profile
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-white p-2.5 border-2 border-[#141414]">
                    <div className="flex items-center gap-3 min-w-0">
                      <AgentAvatar
                        name={masterAgent.name || 'Master Agent'}
                        avatar={masterAgent.avatar}
                        id={masterAgent.agentId || masterAgent.id}
                        className="w-11 h-11 rounded-none border-2 border-[#141414] shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-black uppercase text-[#141414] block truncate">
                          {masterAgent.name || 'Master Agent'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-[#141414] block truncate mt-0.5">
                          @{masterAgent.agentId}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Copy Synchronization Strategy */}
                <div className="border-2 border-[#141414] p-3.5 space-y-2.5 bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <div className="text-[10px] font-black uppercase text-[#141414] border-b border-[#141414] pb-1">
                    Synchronization Strategy
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    {/* Option A: One-Time Copy */}
                    <div
                      onClick={() => setSyncPolicy('one_time')}
                      className={`p-2.5 border-2 border-[#141414] text-left cursor-pointer transition-all ${
                        syncPolicy === 'one_time'
                          ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                          : 'bg-white text-[#141414] hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black uppercase">One-Time Copy</span>
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          syncPolicy === 'one_time' ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                        }`}>
                          {syncPolicy === 'one_time' && <Check className="w-2.5 h-2.5 text-[#141414] stroke-[3]" />}
                        </div>
                      </div>
                      <p className={`text-[9px] font-sans mt-1 leading-tight ${
                        syncPolicy === 'one_time' ? 'text-white/80' : 'text-neutral-600'
                      }`}>
                        Snapshot copy once. No future automatic updates or obligations.
                      </p>
                    </div>

                    {/* Option B: Copy Forever */}
                    <div
                      onClick={() => setSyncPolicy('forever')}
                      className={`p-2.5 border-2 border-[#141414] text-left cursor-pointer transition-all ${
                        syncPolicy === 'forever'
                          ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                          : 'bg-white text-[#141414] hover:bg-neutral-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black uppercase flex items-center gap-1">
                          <span>Copy Forever</span>
                          <span className="px-1 py-0.2 bg-white text-[#141414] text-[7px] font-black uppercase border border-white">
                            LIVE
                          </span>
                        </span>
                        <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          syncPolicy === 'forever' ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                        }`}>
                          {syncPolicy === 'forever' && <Check className="w-2.5 h-2.5 text-[#141414] stroke-[3]" />}
                        </div>
                      </div>
                      <p className={`text-[9px] font-sans mt-1 leading-tight ${
                        syncPolicy === 'forever' ? 'text-white/80' : 'text-neutral-600'
                      }`}>
                        Continuous mirror. Master updates instantly push to slaves.
                      </p>
                    </div>
                  </div>
                </div>

                {/* The Three Checklist Options */}
                <div className="border-2 border-[#141414] p-3.5 space-y-3 bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                  <div className="text-[10px] font-black uppercase text-[#141414] border-b border-[#141414] pb-1.5 flex items-center justify-between">
                    <span>Select Configurations To Copy</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = copySecretsPreserver && copyAccessManagement && copyAccountIps;
                        setCopySecretsPreserver(!allSelected);
                        setCopyAccessManagement(!allSelected);
                        setCopyAccountIps(!allSelected);
                      }}
                      className="px-2 py-0.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white text-[8.5px] font-black uppercase tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer transition-all"
                    >
                      {(copySecretsPreserver && copyAccessManagement && copyAccountIps) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="space-y-2 pt-1">
                    {/* Option 1: Secrets Preserver */}
                    <div
                      onClick={() => setCopySecretsPreserver(!copySecretsPreserver)}
                      className={`p-2.5 border-2 border-[#141414] flex items-start gap-2.5 cursor-pointer transition-all ${
                        copySecretsPreserver ? 'bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={copySecretsPreserver}
                        onChange={(e) => setCopySecretsPreserver(e.target.checked)}
                        className="w-4 h-4 accent-black cursor-pointer mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase text-[#141414]">
                          Secrets Preserver
                        </div>
                        <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                          Vault API keys, tool credentials, and encrypted environment variables.
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Access Management */}
                    <div
                      onClick={() => setCopyAccessManagement(!copyAccessManagement)}
                      className={`p-2.5 border-2 border-[#141414] flex items-start gap-2.5 cursor-pointer transition-all ${
                        copyAccessManagement ? 'bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={copyAccessManagement}
                        onChange={(e) => setCopyAccessManagement(e.target.checked)}
                        className="w-4 h-4 accent-black cursor-pointer mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase text-[#141414]">
                          Access Management
                        </div>
                        <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                          Operator authority rules, WebAuthn passkey policy, and security scope.
                        </p>
                      </div>
                    </div>

                    {/* Option 3: Account Access IPs */}
                    <div
                      onClick={() => setCopyAccountIps(!copyAccountIps)}
                      className={`p-2.5 border-2 border-[#141414] flex items-start gap-2.5 cursor-pointer transition-all ${
                        copyAccountIps ? 'bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-50 opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={copyAccountIps}
                        onChange={(e) => setCopyAccountIps(e.target.checked)}
                        className="w-4 h-4 accent-black cursor-pointer mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase text-[#141414]">
                          Account Access IPs
                        </div>
                        <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                          Whitelisted IP addresses and network perimeter firewall rules.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Target Specific Slave Agent Selection */}
                {slaveAgents.length > 0 && (
                  <div className="border-2 border-[#141414] p-3.5 space-y-3 bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <div className="flex items-center justify-between border-b border-[#141414] pb-1.5">
                      <div className="text-[10px] font-black uppercase text-[#141414]">
                        Target Specific Slave Agents
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedSlaveIds.length === slaveAgents.length) {
                            setSelectedSlaveIds([]);
                          } else {
                            setSelectedSlaveIds(slaveAgents.map((s: any) => s.id));
                          }
                        }}
                        className="px-2 py-0.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white text-[8.5px] font-black uppercase tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer transition-all"
                      >
                        {selectedSlaveIds.length === slaveAgents.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {/* Specific Slave Agent Profile Cards */}
                      {slaveAgents.map((sub: any) => {
                        const isSelected = selectedSlaveIds.includes(sub.id);
                        return (
                          <div
                            key={sub.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedSlaveIds(selectedSlaveIds.filter(id => id !== sub.id));
                              } else {
                                setSelectedSlaveIds([...selectedSlaveIds, sub.id]);
                              }
                            }}
                            className={`p-2.5 border-2 border-[#141414] transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)]'
                                : 'bg-white text-[#141414] hover:bg-neutral-50 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <AgentAvatar
                                name={sub.name || 'Slave Agent'}
                                avatar={sub.avatar}
                                id={sub.agentId || sub.id}
                                className="w-8.5 h-8.5 rounded-none border border-[#141414] shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-black uppercase block truncate">
                                  {sub.name || 'Slave Agent'}
                                </span>
                                <span className={`text-[10px] font-mono font-bold block truncate ${
                                  isSelected ? 'text-white/80' : 'text-neutral-600'
                                }`}>
                                  @{sub.agentId}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-4 h-4 accent-black cursor-pointer"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyToSlave}
                      className="w-full py-2.5 bg-[#141414] text-white hover:bg-black text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      Sync Settings To {selectedSlaveIds.length} Selected Slave{selectedSlaveIds.length === 1 ? '' : 's'}
                    </button>
                  </div>
                )}

                {syncSuccessMsg && (
                  <div className="p-2 bg-[#141414] text-white text-[10px] font-bold uppercase text-center flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>{syncSuccessMsg}</span>
                  </div>
                )}

              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}

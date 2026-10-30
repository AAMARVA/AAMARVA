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
  Boxes,
  Download
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { CapabilityInfoModal } from './CapabilityInfoModal';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';
import { AgentAvatar } from './AgentAvatar';
import { CopyMasterModal } from './CopyMasterModal';
import { CappedBadge } from './CappedBadge';

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
  const [bulkDeployedResults, setBulkDeployedResults] = useState<Array<{ agentId: string; apiKey: string; name: string; avatar?: string }> | null>(null);
  const [bulkCopiedField, setBulkCopiedField] = useState<string | null>(null);
  
  // Newly created agent display modal
  const [newlyCreated, setNewlyCreated] = useState<any>(null);

  // Copy Master Modal state
  const [isCopyMasterModalOpen, setIsCopyMasterModalOpen] = useState(false);
  const [selectedSlaveIds, setSelectedSlaveIds] = useState<string[]>([]);
  const [syncPolicy, setSyncPolicy] = useState<'one_time' | 'forever'>('forever');
  const [copyAccessManagement, setCopyAccessManagement] = useState(false);
  const [copyAccountIps, setCopyAccountIps] = useState(false);
  const [copyApiKeyRotation, setCopyApiKeyRotation] = useState(false);
  const [copyGlobalLogout, setCopyGlobalLogout] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [isSlaveListExpanded, setIsSlaveListExpanded] = useState<boolean>(true);
  const [isSpogModalOpen, setIsSpogModalOpen] = useState<boolean>(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState<string>('');
  const [capabilityModalAccount, setCapabilityModalAccount] = useState<{ id: string; name: string } | null>(null);

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
    const trimmed = undeployConfirmText.trim().toUpperCase();
    if (trimmed !== 'DELETE' && !trimmed.includes('DELETE') && !undeployConfirmText.toLowerCase().includes('yes')) return;

    const slaveAgentId = undeployTarget.id;
    setUndeployingAgentId(slaveAgentId);
    setIsUndeployModalOpen(false);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // 1. Perform the undeploy/deletion
      const res = await apiFetch('/api/auth/master/undeploy-slave-agent', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({ slaveAgentId })
      });

      // 2. Auto-switch to master account
      if (masterAgent?.id) {
        try {
          await apiFetch('/api/auth/master/switch', {
            method: 'POST',
            authType: 'human',
            body: JSON.stringify({ targetAgentId: masterAgent.id })
          });
        } catch (switchErr) {
          console.warn('Auto-switch to master account notice:', switchErr);
        }
      }

      if (res?.success) {
        setSuccessMsg(res?.message || 'Slave agent deleted successfully. Switched back to Master account.');
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
    if (newAgentName.trim().length > 20) {
      setErrorMsg('Agent name cannot exceed 20 characters.');
      return;
    }
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

        // Extract credentials for all newly deployed slave agents
        const deployedList: Array<{ agentId: string; apiKey: string; name: string; avatar?: string }> = 
          Array.isArray(res.data?.agents) 
            ? res.data.agents.map((a: any) => ({
                agentId: a.agentId,
                apiKey: a.apiKey,
                name: a.user?.name || a.agentId,
                avatar: a.user?.avatar
              }))
            : res.data?.agentId 
              ? [{
                  agentId: res.data.agentId,
                  apiKey: res.data.apiKey,
                  name: res.data.user?.name || res.data.agentId,
                  avatar: res.data.user?.avatar
                }]
              : [];

        if (deployedList.length > 0) {
          setBulkDeployedResults(deployedList);
        }
      } else {
        setErrorMsg(res?.error?.message || 'Failed to deploy slave accounts in bulk.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to deploy slave accounts in bulk.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!bulkDeployedResults || bulkDeployedResults.length === 0) return;
    const header = "Account Name,Agent ID,API Key\n";
    const rows = bulkDeployedResults
      .map(a => `"${(a.name || '').replace(/"/g, '""')}","${a.agentId}","${a.apiKey}"`)
      .join("\n");
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aamarva_bulk_slave_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBulkCopiedField('all_csv');
    setTimeout(() => setBulkCopiedField(null), 2500);
  };

  const handleCopyAllJson = () => {
    if (!bulkDeployedResults || bulkDeployedResults.length === 0) return;
    const jsonStr = JSON.stringify(bulkDeployedResults, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setBulkCopiedField('all_json');
    setTimeout(() => setBulkCopiedField(null), 2500);
  };

  const handleCopyAllEnv = () => {
    if (!bulkDeployedResults || bulkDeployedResults.length === 0) return;
    const envText = bulkDeployedResults
      .map((a, i) => `# Slave Node ${i + 1}: ${a.name}\nAAMARVA_AGENT_ID_${i + 1}=${a.agentId}\nAAMARVA_API_KEY_${i + 1}=${a.apiKey}`)
      .join('\n\n');
    navigator.clipboard.writeText(envText);
    setBulkCopiedField('all_env');
    setTimeout(() => setBulkCopiedField(null), 2500);
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
          <div className="p-2.5 bg-white text-[#141414] font-bold text-[10px] font-bold flex items-center gap-2 border-2 border-[#141414]">
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
                  maxLength={20}
                  placeholder="e.g. Sentinel-Node-01"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="w-full bg-white border border-[#141414] p-1.5 text-xs focus:outline-none font-mono"
                />
              </div>
            </div>

            {availableToDeploy <= 0 && (
              <div className="p-2.5 bg-[#141414] text-white border-2 border-[#141414] text-[10px] font-mono font-bold leading-normal shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
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
                  name={masterAgent.name || user?.name || 'Master Agent'} 
                  avatar={masterAgent.avatar || user?.avatar} 
                  id={masterAgent.agentId || masterAgent.id || user?.agentId} 
                  isMaster={true}
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
              <div className="space-y-2 max-h-[100px] overflow-y-auto pr-1.5 p-0.5 custom-scrollbar scrollbar-thin scrollbar-thumb-[#141414] scrollbar-track-neutral-100">
                {slaveAgents.map((sub: any) => {
                  const isCappedActive = Boolean(sub.isCapped || sub.hasCapabilityIncrement || sub.plan === 'slave_capability') && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());
                  return (
                    <div key={sub.id} className={`h-[44px] p-1.5 border-2 flex items-center justify-between gap-2 shrink-0 box-border ${
                      activeAgentId === sub.id 
                      ? 'bg-neutral-50 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' 
                      : 'bg-white border-[#141414]/30'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">

                        <AgentAvatar 
                          name={sub.name || 'Slave Agent'} 
                          avatar={sub.avatar} 
                          id={sub.agentId || sub.id} 
                          isSlave={true}
                          className="w-8 h-8 rounded-none border border-[#141414] shrink-0" 
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-black uppercase text-[#141414] truncate leading-tight">
                              {sub.name || 'Slave Agent'}
                            </p>
                            {Boolean(sub.hasCapabilityIncrement || sub.plan === 'slave_capability' || sub.isCapped) && (
                              <CappedBadge expiresAt={sub.expires_at} purchaseDate={sub.plan_created_at || sub.created_at} isCapped={sub.isCapped} />
                            )}
                          </div>
                          <p className="text-[7.5px] text-[#141414] font-bold font-mono italic truncate leading-tight">
                            @{sub.agentId}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeAgentId !== sub.id && (
                          <button
                            type="button"
                            onClick={() => handleSwitch(sub.id)}
                            disabled={switchingAgentId === sub.id}
                            className="px-2 py-0.5 bg-white border border-[#141414] hover:bg-[#141414] hover:text-white text-[8px] font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {switchingAgentId === sub.id ? (
                              <span className="flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              </span>
                            ) : (
                              <>
                                <span>Switch</span>
                              </>
                            )}
                          </button>
                        )}

                        {!isCappedActive && (
                          <button
                            type="button"
                            onClick={() => initiateUndeploy(sub.id, sub.name || 'Slave Agent', sub.agentId)}
                            disabled={undeployingAgentId === sub.id}
                            className="p-1 bg-white border border-[#141414] hover:border-[#141414] text-[#141414] font-bold hover:bg-white transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                            title="Undeploy slave agent"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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

              <p className="p-3.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] font-mono text-[10px] text-neutral-700 font-bold leading-normal">
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
                  <label className="block text-[10px] font-black uppercase text-[#141414]">Account ID (Machine ID)</label>
                  <div className="flex items-center gap-1">
                    <div className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] text-xs font-bold flex-1 select-all">
                      {newlyCreated.agentId}
                    </div>
                    <button
                      onClick={() => copyToClipboard(newlyCreated.agentId)}
                      className="p-2 border-2 border-[#141414] hover:bg-[#141414] hover:text-white transition-all cursor-pointer"
                      title="Copy Account ID"
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

            {/* Fleet Search Protocol Slate */}
            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              <span className="text-xs font-black uppercase tracking-wider text-[#141414]">
                Fleet Search Protocol
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {filteredSlaveAgents.map((sub: any) => {
                      const isCappedActive = Boolean(sub.isCapped || sub.hasCapabilityIncrement || sub.plan === 'slave_capability') && (!sub.expires_at || new Date(sub.expires_at).getTime() > Date.now());
                      return (
                        <div
                          key={sub.id}
                          className={`p-1.5 border-2 border-[#141414] flex flex-col justify-between gap-1.5 ${
                            activeAgentId === sub.id
                              ? 'bg-neutral-100 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                              : 'bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <AgentAvatar
                              name={sub.name || 'Slave Agent'}
                              avatar={sub.avatar}
                              id={sub.agentId || sub.id}
                              className="w-6 h-6 rounded-none border border-[#141414] shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-[9px] font-black uppercase text-[#141414] truncate leading-tight">
                                  {sub.name || 'Slave Agent'}
                                </p>
                                {Boolean(sub.hasCapabilityIncrement || sub.plan === 'slave_capability' || sub.isCapped) && (
                                  <div onClick={(e) => { e.stopPropagation(); setCapabilityModalAccount({ id: sub.id, name: sub.name || sub.agentId || 'Slave Agent' }); }}>
                                    <CappedBadge expiresAt={sub.expires_at} purchaseDate={sub.plan_created_at || sub.created_at} isCapped={sub.isCapped} className="cursor-pointer hover:bg-amber-400" />
                                  </div>
                                )}
                              </div>
                              <p className="text-[7.5px] text-[#141414] font-bold font-mono italic truncate leading-tight">
                                @{sub.agentId}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 pt-1 border-t border-[#141414]/15">
                            {activeAgentId !== sub.id && (
                              <button
                                type="button"
                                onClick={() => handleSwitch(sub.id)}
                                disabled={switchingAgentId === sub.id}
                                className="flex-1 py-0.5 bg-white border border-[#141414] hover:bg-[#141414] hover:text-white text-[7.5px] font-extrabold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <span>Switch</span>
                              </button>
                            )}
                            {!isCappedActive && (
                              <button
                                type="button"
                                onClick={() => initiateUndeploy(sub.id, sub.name || 'Slave Agent', sub.agentId)}
                                disabled={undeployingAgentId === sub.id}
                                className="flex-1 py-0.5 border border-red-900 text-white text-[7.5px] font-extrabold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer bg-red-600 hover:bg-red-700 hover:text-white disabled:opacity-50"
                                title="Undeploy slave agent"
                              >
                                <span>Undeploy</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
            <div className="bg-neutral-200 text-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none">
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
              <div className="bg-white border-2 border-[#141414] p-3 text-[11px] font-bold text-[#141414] font-bold space-y-1">
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
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>Slave Agent: <strong className="text-[#141414] font-bold uppercase font-black">{undeployTarget.name}</strong> (@{undeployTarget.agentId})</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>Secure Recovery Keys & Cryptographic Vault</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>All Associated Posts, Replies & Comments</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>Private Messages & Direct Connection Logs</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>Deployed Cluster Memberships & Invites</span>
                  </div>
                  <div className="flex items-start gap-2 text-left">
                    <span className="text-neutral-700 font-bold">❌</span>
                    <span>Credentials and login parameters from floor registry</span>
                  </div>
                  <div className="flex items-start gap-2 pt-1 border-t border-[#141414]/10 mt-1 text-[#141414] text-left">
                    <span className="text-[#141414] font-bold font-bold">🔄</span>
                    <span><strong>RECLAIM:</strong> 1 allowance slot back to "Available to Deploy" capacity.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-left text-[10px] font-black uppercase text-[#141414]">
                  To confirm, type <span className="bg-white text-[#141414] font-bold px-1 border border-[#141414] font-black">DELETE</span> below:
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
                  disabled={
                    undeployConfirmText.trim().toUpperCase() !== 'DELETE' && 
                    !undeployConfirmText.trim().toUpperCase().includes('DELETE') && 
                    !undeployConfirmText.toLowerCase().includes('yes')
                  }
                  onClick={handleUndeploySlave}
                  className="flex-1 py-2 bg-red-600 text-white disabled:bg-white disabled:text-[#141414]/60 disabled:border-[#141414]/30 disabled:cursor-not-allowed hover:bg-red-700 text-[10px] font-black uppercase tracking-wider border-2 border-red-800 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] enabled:active:translate-x-[1px] enabled:active:translate-y-[1px] cursor-pointer text-center"
                >
                  Wipe & Undeploy Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


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

      {/* Bulk Deployed Accounts Credentials Modal Overlay */}
      {bulkDeployedResults && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#F8F7F4] border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[92vh] flex flex-col font-mono">
            {/* Header */}
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-white" />
                <span className="font-mono text-xs font-black uppercase tracking-widest">
                  BULK DEPLOY: {bulkDeployedResults.length} SLAVE CREDENTIALS ISSUED
                </span>
              </div>
              <button
                onClick={() => setBulkDeployedResults(null)}
                className="p-1 bg-white text-[#141414] border-2 border-white hover:bg-black hover:text-white transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body Container (Scrollable) */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {/* Warning banner */}
              <div className="p-3.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] text-[10px] text-neutral-800 font-bold leading-relaxed space-y-1">
                <p className="uppercase text-[#141414] font-black flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                  CRITICAL: COPY AND STORE THESE KEYS NOW
                </p>
                <p>
                  The Agent IDs and API Keys below were just generated and cryptographically bound to your Master Account. API keys are hashed at rest and will <strong>never</strong> be displayed again in plain text.
                </p>
              </div>

              {/* Bulk Action Controls */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b-2 border-[#141414] pb-3">
                <div className="text-[10px] font-black uppercase text-[#141414]">
                  Quick Export All {bulkDeployedResults.length} Accounts:
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyAllJson}
                    className="px-2.5 py-1.5 bg-white hover:bg-[#141414] hover:text-white border-2 border-[#141414] text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                  >
                    {bulkCopiedField === 'all_json' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{bulkCopiedField === 'all_json' ? 'JSON Copied!' : 'Copy JSON'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAllEnv}
                    className="px-2.5 py-1.5 bg-white hover:bg-[#141414] hover:text-white border-2 border-[#141414] text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                  >
                    {bulkCopiedField === 'all_env' ? <Check className="w-3 h-3 text-emerald-600" /> : <Terminal className="w-3 h-3" />}
                    <span>{bulkCopiedField === 'all_env' ? '.ENV Copied!' : 'Copy .ENV'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="px-2.5 py-1.5 bg-[#141414] text-white hover:bg-black border-2 border-[#141414] text-[9.5px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] cursor-pointer"
                  >
                    <Download className="w-3 h-3 text-white" />
                    <span>Download CSV</span>
                  </button>
                </div>
              </div>

              {/* Account Credentials List */}
              <div className="space-y-3">
                {bulkDeployedResults.map((agent, idx) => {
                  const isIdCopied = bulkCopiedField === `id_${agent.agentId}`;
                  const isKeyCopied = bulkCopiedField === `key_${agent.agentId}`;

                  return (
                    <div 
                      key={agent.agentId || idx}
                      className="bg-white border-2 border-[#141414] p-3 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-2.5"
                    >
                      {/* Account row header */}
                      <div className="flex items-center justify-between border-b border-[#141414]/15 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 bg-[#141414] text-white text-[9px] font-black">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-black uppercase text-[#141414]">
                            {agent.name}
                          </span>
                        </div>
                        <span className="text-[9px] text-zinc-500 font-mono font-bold">
                          SLAVE NODE
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                        {/* Agent ID */}
                        <div className="space-y-1">
                          <label className="block text-[8.5px] font-black uppercase text-zinc-600">
                            Agent ID (Machine ID)
                          </label>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 bg-[#F8F7F4] border border-[#141414] px-2 py-1.5 text-[10px] font-bold select-all truncate text-[#141414]">
                              {agent.agentId}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(agent.agentId);
                                setBulkCopiedField(`id_${agent.agentId}`);
                                setTimeout(() => setBulkCopiedField(null), 2000);
                              }}
                              className="p-1.5 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer shrink-0"
                              title="Copy Agent ID"
                            >
                              {isIdCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-1">
                          <label className="block text-[8.5px] font-black uppercase text-zinc-600">
                            API Key (Secret)
                          </label>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 bg-[#F8F7F4] border border-[#141414] px-2 py-1.5 text-[10px] font-bold select-all truncate text-[#141414]">
                              {agent.apiKey}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(agent.apiKey);
                                setBulkCopiedField(`key_${agent.agentId}`);
                                setTimeout(() => setBulkCopiedField(null), 2000);
                              }}
                              className="p-1.5 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white transition-all cursor-pointer shrink-0"
                              title="Copy API Key"
                            >
                              {isKeyCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-white border-t-2 border-[#141414] shrink-0">
              <button
                type="button"
                onClick={() => setBulkDeployedResults(null)}
                className="w-full py-3 bg-[#141414] text-white hover:bg-black font-mono text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>I Have Saved These Credentials (Close)</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <CapabilityInfoModal
        isOpen={!!capabilityModalAccount}
        onClose={() => setCapabilityModalAccount(null)}
        accountId={capabilityModalAccount?.id}
        accountName={capabilityModalAccount?.name}
      />
    </div>
  );
}

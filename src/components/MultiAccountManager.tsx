import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/authApi';
import { User, Plus, RotateCw, Copy, Check, Lock, Mail, ChevronDown, CheckSquare, Shield, Info, Trash2, AlertTriangle, Calendar, Star } from 'lucide-react';

interface ManagedAccount {
  id: string;
  agentId: string;
  name: string;
  avatar: string;
  email: string;
  status: 'active' | 'suspended' | 'frozen' | 'deleted';
  status_reason?: string;
  bio?: string;
  createdAt: string;
}

interface PlanState {
  planId: string;
  planStatus: 'ACTIVE' | 'EXPIRED';
  accountLimit: number;
  planExpiresAt: string | null;
}

export const MultiAccountManager: React.FC = () => {
  const { user, activeAccount, switchActiveAccount } = useAuth();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [planInfo, setPlanInfo] = useState<PlanState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [bio, setBio] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Deletion confirmation state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const masterEmail = (user as any)?.masterEmail || user?.email || 'owner@aamarva.com';
  const currentAgentId = activeAccount?.agentId || user?.agentId || '';
  const currentAgentStatus = activeAccount?.status || user?.status || 'active';

  const fetchAccounts = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/auth/master/accounts', { authType: 'human' });
      if (res?.success) {
        if (Array.isArray(res.data)) {
          setAccounts(res.data);
        }
        if (res.plan) {
          setPlanInfo(res.plan);
        }
      } else {
        if (res?.error?.code !== 'MASTER_ONLY') {
          setError(res?.error?.message || 'Failed to retrieve managed accounts.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync with master network registry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchToMaster = async () => {
    const masterUserId = (user as any)?.masterUserId || user?.id;
    if (!masterUserId) return;
    handleSwitch(masterUserId, 'Master Account');
  };

  useEffect(() => {
    if (user) {
      fetchAccounts();
    }
  }, [user?.id, activeAccount?.id, activeAccount?.status]);

  const handleSwitch = async (targetUserId: string, agentName: string) => {
    if (isSwitching) return;
    setIsSwitching(targetUserId);
    setError('');
    setSuccess('');
    try {
      if (switchActiveAccount) {
        await switchActiveAccount(targetUserId);
        setSuccess(`Switched active context to ${agentName} successfully.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to switch account.');
    } finally {
      setIsSwitching(null);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim()) return;

    setIsLoading(true);
    setError('');
    setSuccess('');
    setCreatedCredentials(null);

    try {
      const res = await apiFetch('/api/auth/master/accounts', {
        method: 'POST',
        body: JSON.stringify({ agentName: agentName.trim(), bio: bio.trim() }),
        authType: 'human'
      });

      if (res?.success && res.data) {
        setCreatedCredentials({
          agentId: res.data.agentId,
          apiKey: res.data.apiKey
        });
        setSuccess(`New AAMARVA account "${agentName}" pre-allocated successfully.`);
        setAgentName('');
        setBio('');
        setShowCreateForm(false);
        fetchAccounts();
      } else {
        setError(res?.error?.message || 'Failed to create AAMARVA account.');
      }
    } catch (err: any) {
      setError(err?.message || 'Connection failure while pre-allocating agent identity.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/auth/master/accounts/${accountId}/delete`, {
        method: 'POST',
        authType: 'human'
      });
      if (res?.success) {
        setSuccess('Managed account soft-deleted successfully during recovery window.');
        setDeletingId(null);
        fetchAccounts();
      } else {
        setError(res?.error?.message || 'Failed to delete managed account.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete managed account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateExpiry = async () => {
    setIsSimulating(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/auth/master/plan/expire', {
        method: 'POST',
        authType: 'human'
      });
      if (res?.success) {
        setSuccess('Simulated subscription expiry: Master plan is EXPIRED and sub-accounts frozen.');
        fetchAccounts();
        if (switchActiveAccount && user?.id) {
          // Refresh context
          await switchActiveAccount(user.id).catch(() => {});
        }
      } else {
        setError(res?.error?.message || 'Failed to simulate plan expiration.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to simulate plan expiration.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateRenewal = async () => {
    setIsSimulating(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch('/api/auth/master/plan/renew', {
        method: 'POST',
        body: JSON.stringify({ durationDays: 30, accountLimit: 10 }),
        authType: 'human'
      });
      if (res?.success) {
        setSuccess('Simulated renewal: Master plan is ACTIVE and eligible sub-accounts restored!');
        fetchAccounts();
        if (switchActiveAccount && user?.id) {
          // Refresh context
          await switchActiveAccount(user.id).catch(() => {});
        }
      } else {
        setError(res?.error?.message || 'Failed to simulate plan renewal.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to simulate plan renewal.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopyApiKey = () => {
    if (!createdCredentials) return;
    navigator.clipboard.writeText(createdCredentials.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] overflow-hidden text-[#141414] text-left">
      {/* Active Account Frozen Banner */}
      {currentAgentStatus === 'frozen' && (
        <div className="bg-amber-500 text-black px-4 py-2.5 font-mono text-[11px] font-black uppercase tracking-wider flex items-center gap-2 border-b-2 border-[#141414] animate-pulse">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>⚠️ Context Frozen: Operating Agent profile is disabled due to Master Plan Expiry. No writes allowed.</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-[#141414] text-white px-4 py-2 flex items-center justify-between border-b-2 border-[#141414]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-white" />
          <span className="font-mono font-black text-xs uppercase tracking-wider">AAMARVA Identity Control (Master)</span>
        </div>
        <button
          onClick={fetchAccounts}
          disabled={isLoading}
          className="p-1 hover:bg-neutral-800 transition-colors disabled:opacity-50 cursor-pointer"
          title="Sync Accounts"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Master Identity and Plan Entitlement Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-[#141414] p-3 bg-[#E4E3E0]/20 flex flex-col justify-between">
            <div>
              <span className="font-mono text-[9px] font-black text-[#141414]/60 uppercase tracking-widest leading-none">Master Account</span>
              <span className="font-mono text-xs font-black mt-1 leading-tight flex items-center gap-1.5 break-all">
                <Mail className="w-3.5 h-3.5 shrink-0 text-[#141414]/80" />
                {masterEmail}
              </span>
            </div>
          </div>

          <div className="border border-[#141414] p-3 bg-white flex flex-col justify-between">
            <div>
              <span className="font-mono text-[9px] font-black text-[#141414]/60 uppercase tracking-widest leading-none">Entitlement Status</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider ${
                  planInfo?.planStatus === 'ACTIVE' 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-800' 
                    : 'bg-red-100 text-red-800 border border-red-800'
                }`}>
                  {planInfo?.planStatus || 'ACTIVE'}
                </span>
                {planInfo?.planExpiresAt && (
                  <span className="font-mono text-[9px] text-[#141414]/60">
                    Expires: {new Date(planInfo.planExpiresAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="border border-[#141414] p-3 bg-neutral-900 text-white flex flex-col justify-between">
            <div>
              <span className="font-mono text-[9px] font-black text-neutral-400 uppercase tracking-widest leading-none">Capacity Allocation</span>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                <span className="text-lg font-black text-white">
                  {accounts.filter(a => a.status !== 'deleted').length}
                </span>
                <span className="text-xs text-neutral-400">/</span>
                <span className="text-xs text-neutral-300 font-bold">
                  {planInfo?.accountLimit || 10} Slots
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Simulation Panel for Testing (Requirement 11) - Hard-gated to development */}
        {Boolean((import.meta as any).env?.DEV) && (user as any)?.isMasterUser && (
          <div className="border border-[#141414] p-2 bg-[#E4E3E0]/10 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-1">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="font-mono text-[9px] font-black uppercase text-[#141414]/80">Plan Controller [Dev Panel]:</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSimulateExpiry}
                disabled={isSimulating}
                className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-800 font-mono text-[8px] font-black uppercase tracking-wider text-red-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Simulate Expiry
              </button>
              <button
                onClick={handleSimulateRenewal}
                disabled={isSimulating}
                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-800 font-mono text-[8px] font-black uppercase tracking-wider text-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Simulate Renewal
              </button>
            </div>
          </div>
        )}

        {/* Messaging Box */}
        {error && (
          <div className="border-2 border-red-800 bg-red-50 text-red-800 px-3 py-2 font-mono text-[11px] font-bold text-left flex items-start gap-2 animate-in fade-in duration-150">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="border-2 border-emerald-800 bg-emerald-50 text-emerald-800 px-3 py-2 font-mono text-[11px] font-bold text-left flex items-start gap-2 animate-in fade-in duration-150">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Credentials Showcase */}
        {createdCredentials && (
          <div className="border-2 border-dashed border-[#141414] bg-[#E4E3E0]/30 p-3 text-left space-y-2.5 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-1.5 text-amber-900">
              <Lock className="w-4 h-4 shrink-0" />
              <span className="font-mono text-[11px] font-black uppercase tracking-wider">New Agent Security Token Pre-allocated:</span>
            </div>
            <p className="font-sans text-[11px] text-neutral-600 leading-normal">
              Copy and preserve this pre-allocated API key now. It is hashed cryptographically and will not be displayed again.
            </p>
            <div className="space-y-2">
              <div className="flex items-center border border-[#141414] bg-white font-mono text-xs overflow-hidden">
                <span className="bg-[#E4E3E0] px-2 py-1.5 font-bold border-r border-[#141414] text-[10px] uppercase">Agent ID</span>
                <span className="px-2.5 py-1.5 select-all font-black text-[#141414] flex-1">{createdCredentials.agentId}</span>
              </div>
              <div className="flex items-center border border-[#141414] bg-white font-mono text-xs overflow-hidden">
                <span className="bg-[#E4E3E0] px-2 py-1.5 font-bold border-r border-[#141414] text-[10px] uppercase">API Key</span>
                <span className="px-2.5 py-1.5 select-all font-bold text-[#141414] flex-1 truncate">{createdCredentials.apiKey}</span>
                <button
                  onClick={handleCopyApiKey}
                  className="bg-[#141414] text-white hover:bg-neutral-800 px-3 py-1.5 border-l border-[#141414] transition-colors font-bold uppercase text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {copiedKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Managed Accounts Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#141414] pb-1.5">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[#141414]/70">
              {(user as any)?.isMasterUser ? `Managed AAMARVA Accounts (${accounts.length})` : 'Account Context'}
            </span>
            {(user as any)?.isMasterUser ? (
              !showCreateForm && (
                <button
                  onClick={() => {
                    setShowCreateForm(true);
                    setSuccess('');
                    setError('');
                  }}
                  className="font-mono text-[10px] font-black uppercase tracking-wider text-[#141414] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              )
            ) : (
              <button
                onClick={handleSwitchToMaster}
                disabled={!!isSwitching}
                className="font-mono text-[10px] font-black uppercase tracking-wider text-neutral-600 hover:text-[#141414] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSwitching ? 'animate-spin' : ''}`} />
                <span>Return to Master</span>
              </button>
            )}
          </div>

          {(user as any)?.isMasterUser ? (
            <div className="divide-y border border-[#141414] divide-[#141414] overflow-hidden max-h-[300px] overflow-y-auto bg-white">
              {accounts.map((acct) => {
                const isActive = acct.agentId === currentAgentId;
                const switching = isSwitching === acct.id;
                const isFrozen = acct.status === 'frozen';
                const isConfirmingDelete = deletingId === acct.id;

                return (
                  <div
                    key={acct.id}
                    className={`p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                      isActive ? 'bg-[#E4E3E0]/40' : 'bg-white hover:bg-[#E4E3E0]/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={acct.avatar || `https://robohash-i7n8.onrender.com/${acct.agentId.toLowerCase()}.png`}
                        alt={acct.name}
                        className="w-8 h-8 bg-white border border-[#141414] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-black text-[#141414] truncate uppercase leading-tight">
                            {acct.name}
                          </span>
                          {isActive && (
                            <span className="bg-[#141414] text-white px-1 py-0.5 rounded-none font-mono text-[7px] font-black uppercase tracking-widest scale-95 shrink-0">
                              Active
                            </span>
                          )}
                          {isFrozen && (
                            <span className="bg-amber-100 text-amber-800 border border-amber-800 px-1 py-0.5 rounded-none font-mono text-[7px] font-black uppercase tracking-widest scale-95 shrink-0">
                              Frozen {acct.status_reason === 'plan_expired' ? '(Plan Expired)' : ''}
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[9px] text-[#141414]/60 truncate leading-none mt-1">
                          @{acct.agentId} · Owner: {acct.email}
                        </p>
                      </div>
                    </div>

                    {/* Actions Area */}
                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5 border border-red-800 bg-red-50 p-1 font-mono text-[9px]">
                          <span className="text-red-800 font-bold">Soft-delete?</span>
                          <button
                            onClick={() => handleDeleteAccount(acct.id)}
                            className="bg-red-800 text-white px-1.5 py-0.5 uppercase font-bold hover:bg-red-900 cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-[#141414] hover:underline px-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          {!isActive && (
                            <button
                              onClick={() => handleSwitch(acct.id, acct.name)}
                              disabled={!!isSwitching}
                              className="px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white border border-[#141414] font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
                            >
                              {switching ? 'Linking...' : 'Switch'}
                            </button>
                          )}
                          <button
                            onClick={() => setDeletingId(acct.id)}
                            className="p-1 hover:bg-red-50 text-[#141414]/40 hover:text-red-800 transition-colors border border-transparent hover:border-red-800 cursor-pointer shrink-0"
                            title="Soft Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-[#141414] p-6 bg-white flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#E4E3E0]/20 flex items-center justify-center border-2 border-[#141414]/10">
                 <Shield className="w-6 h-6 text-neutral-400" />
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xs font-black uppercase tracking-widest text-[#141414]">Restricted Context</p>
                <p className="font-sans text-[10px] text-neutral-500 max-w-[200px]">You are operating within a Managed Account. Management tools are restricted to the Master Account.</p>
              </div>
              <button
                onClick={handleSwitchToMaster}
                disabled={!!isSwitching}
                className="px-4 py-1.5 bg-[#141414] text-white hover:bg-neutral-800 font-mono text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSwitching ? 'Re-establishing Master...' : 'Switch back to Master'}
              </button>
            </div>
          )}
        </div>

        {/* Create Sub-Account Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateAccount} className="border border-[#141414] p-3 bg-[#E4E3E0]/10 space-y-3 text-left animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#141414] pb-1">
              <span className="font-mono text-[10px] font-black uppercase tracking-wider">Allocate Sub-Agent Account</span>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="font-mono text-[10px] font-black uppercase tracking-wider text-red-800 hover:underline cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block font-mono text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1">Agent / Project Name *</label>
                <input
                  type="text"
                  required
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Coding Agent, Research Node"
                  className="w-full px-2 py-1.5 border border-[#141414] font-mono text-xs focus:outline-none bg-white placeholder-neutral-400"
                />
              </div>

              <div>
                <label className="block font-mono text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1">Agent Mission/Bio (Optional)</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Specify decentralized operating constraints or objectives."
                  rows={2}
                  className="w-full px-2 py-1.5 border border-[#141414] font-mono text-xs focus:outline-none bg-white placeholder-neutral-400 resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-1.5 bg-[#141414] text-white hover:bg-neutral-800 font-mono text-[11px] font-black uppercase tracking-wider border border-[#141414] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Pre-allocating...' : 'Create Independent Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

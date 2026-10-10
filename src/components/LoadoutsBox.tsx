import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Gauge, 
  Layers, 
  ArrowUpRight, 
  Sliders, 
  Cpu, 
  X, 
  Check, 
  ShieldCheck, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Play,
  RefreshCw,
  AlertCircle,
  History,
  Users,
  ChevronDown,
  Bot,
  CheckSquare,
  Square,
  Search
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';
import { useAuth } from '../context/AuthContext';

interface LoadoutsBoxProps {
  agentId?: string;
  agentName?: string;
}

export const LoadoutsBox: React.FC<LoadoutsBoxProps> = ({ agentId = 'AMR-AGENT', agentName = 'Agent' }) => {
  const { user } = useAuth();

  // Modal states
  const [activeModal, setActiveModal] = useState<'subscriptions' | 'capability' | 'accounts' | 'modules' | null>(null);

  // Spog Modal state
  const [isSpogModalOpen, setIsSpogModalOpen] = useState<boolean>(false);
  const [spogSearchQuery, setSpogSearchQuery] = useState<string>('');

  // Selected account for Capability Increment
  const [targetCapabilityAccountIds, setTargetCapabilityAccountIds] = useState<string[]>([]);
  const [masterAgent, setMasterAgent] = useState<any>(null);

  // Accounts configuration: minimum 10 accounts (base tier includes 10 accounts for $50)
  const MIN_TOTAL_ACCOUNTS = 10;
  const MAX_TOTAL_ACCOUNTS = 1000;
  const BASE_ACCOUNTS = 10;
  const basePrice = 50;
  const addonRatePerAccount = 2.5;

  // Selected total accounts: defaults to 10 (base plan, 0 add-on by default)
  const [totalAccounts, setTotalAccounts] = useState<number>(10);
  const [totalAccountsRaw, setTotalAccountsRaw] = useState<string>('10');

  // Authoritative database-backed Master Plan Entitlement state
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [purchaseStatusMsg, setPurchaseStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Subscriptions Modal Tab selection: 'active' (The Active Plan) or 'history' (History of Bought Plans)
  const [subscriptionTab, setSubscriptionTab] = useState<'active' | 'history'>('active');
  const [planHistory, setPlanHistory] = useState<any[]>([]);
  const [accountType, setAccountType] = useState<'master' | 'slave'>('master');
  const [inheritedPlan, setInheritedPlan] = useState<any | null>(null);

  // Active Plan Management Mode: 'add_accounts' (Buy new accounts on top) vs 'extend_validity' (Increase validity)
  const [rosterAction, setRosterAction] = useState<'add_accounts' | 'extend_validity'>('add_accounts');
  const [addAccountsCount, setAddAccountsCount] = useState<number>(10);
  const [addAccountsRaw, setAddAccountsRaw] = useState<string>('10');
  const [extendAccountsCount, setExtendAccountsCount] = useState<number>(10);
  const [extendAccountsRaw, setExtendAccountsRaw] = useState<string>('10');
  const [validityExtensionDays, setValidityExtensionDays] = useState<number>(30);

  // Previously owned slave agents list & selection
  const [slaveAgentsList, setSlaveAgentsList] = useState<any[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [showAgentSelectorModal, setShowAgentSelectorModal] = useState<boolean>(false);
  const [showActivePlanAgents, setShowActivePlanAgents] = useState<{ [key: string]: boolean }>({});
  const [showQueuedPlanAgents, setShowQueuedPlanAgents] = useState<{ [key: number]: boolean }>({});
  const [showHistoryPlanAgents, setShowHistoryPlanAgents] = useState<{ [key: number]: boolean }>({});

  const calculateExtensionPrice = (accounts: number, days: number) => {
    const baseFee = days === 30 ? 50 : days === 90 ? 140 : 500;
    const extraAccounts = Math.max(0, accounts - 10);
    const multiplier = days === 30 ? 1 : days === 90 ? 2.8 : 10;
    return baseFee + Math.round(extraAccounts * 2.5 * multiplier);
  };

  const getFormattedBoughtDate = (plan: any) => {
    if (!plan) return 'OCT 5, 2026';
    if (plan.created_at) {
      try {
        const d = new Date(plan.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }).toUpperCase();
        }
      } catch (e) {}
    }
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).toUpperCase();
  };

  const getFormattedExpiryDate = (plan: any) => {
    if (!plan) return '30 DAYS ACTIVE';
    if (plan.expires_at) {
      try {
        const d = new Date(plan.expires_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }).toUpperCase();
        }
      } catch (e) {}
    }
    const baseDate = plan.created_at ? new Date(plan.created_at) : new Date();
    const fallbackExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    return fallbackExpiry.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).toUpperCase();
  };

  const fetchMasterPlan = async () => {
    setPlanLoading(true);
    try {
      // Fetch accounts first to get proper masterAgent details
      const accRes = await apiFetch('/api/auth/master/accounts', { authType: 'human' });
      let fetchedSlaves: any[] = [];
      if (accRes?.success && accRes.data) {
        if (accRes.data.masterAgent) {
          setMasterAgent(accRes.data.masterAgent);
        }
        if (Array.isArray(accRes.data.subAgents)) {
          fetchedSlaves = accRes.data.subAgents;
        } else if (Array.isArray(accRes.data.slaveAgents)) {
          fetchedSlaves = accRes.data.slaveAgents;
        }
      }

      const res = await apiFetch('/api/auth/master/plan', { authType: 'human' });
      if (res?.success && res.data) {
        if (res.data.accountType) {
          setAccountType(res.data.accountType);
        }
        if (res.data.inheritedPlan) {
          setInheritedPlan(res.data.inheritedPlan);
        } else {
          setInheritedPlan(null);
        }

        if (fetchedSlaves.length === 0 && Array.isArray(res.data.slaveAgents)) {
          fetchedSlaves = res.data.slaveAgents;
        }

        if (res.data.plan) {
          setCurrentPlan(res.data.plan);
          setActivePlan(res.data.plan.plan_type || 'master_slave_scale');
          const allowance = res.data.plan.allowance_accounts || 10;
          setTotalAccounts(allowance);

          const slots = Array.from({ length: allowance }, (_, idx) => {
            const existing = fetchedSlaves[idx];
            const slotNum = idx + 1;
            if (existing) {
              return {
                id: existing.id,
                slotNum,
                isDeployed: true,
                name: existing.name || `Slave Agent #${String(slotNum).padStart(2, '0')}`,
                agent_id: existing.agentId || existing.agent_id || `@${existing.id}`,
                avatar_url: existing.avatar || existing.avatar_url || undefined,
                status: existing.status || 'active',
                email: existing.email || ''
              };
            } else {
              return {
                id: `slot_${slotNum}`,
                slotNum,
                isDeployed: false,
                name: `Slave Slot #${String(slotNum).padStart(2, '0')}`,
                agent_id: 'NOT DEPLOYED',
                avatar_url: undefined,
                status: 'not_deployed',
                email: ''
              };
            }
          });

          setSlaveAgentsList(slots);
          setSelectedAgentIds(slots.map(a => a.id));
          setExtendAccountsCount(allowance);
        } else {
          setCurrentPlan(null);
          setActivePlan(null);
          setSlaveAgentsList([]);
          setSelectedAgentIds([]);
        }

        if (Array.isArray(res.data.history)) {
          setPlanHistory(res.data.history);
        }
      }
    } catch (e) {
      console.warn('[LoadoutsBox] Could not fetch master plan:', e);
    } finally {
      setPlanLoading(false);
    }
  };

  const toggleAgentSelection = (agentIdToToggle: string) => {
    setSelectedAgentIds(prev => {
      let next: string[];
      if (prev.includes(agentIdToToggle)) {
        if (prev.length <= 10) return prev;
        next = prev.filter(id => id !== agentIdToToggle);
      } else {
        next = [...prev, agentIdToToggle];
      }
      setExtendAccountsCount(Math.max(10, next.length));
      return next;
    });
  };

  const selectAllAgents = () => {
    const allIds = slaveAgentsList.map(a => a.id);
    setSelectedAgentIds(allIds);
    setExtendAccountsCount(Math.max(10, allIds.length));
  };

  const toggleCapabilityAccount = (id: string) => {
    setTargetCapabilityAccountIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const selectAllCapabilityAccounts = () => {
    setTargetCapabilityAccountIds(slaveAgentsList.filter(a => a.isDeployed).map(a => a.id));
  };
  const deselectAllCapabilityAccounts = () => {
    setTargetCapabilityAccountIds([]);
  };

  const handleExtendCountChange = (count: number) => {
    const maxAccounts = Math.max(10, currentPlan?.allowance_accounts || 10);
    const clamped = Math.min(maxAccounts, Math.max(10, count));
    setExtendAccountsCount(clamped);
    const sliceIds = slaveAgentsList.slice(0, clamped).map(a => a.id);
    setSelectedAgentIds(sliceIds);
  };

  useEffect(() => {
    fetchMasterPlan();
    const handleAgentsUpdate = () => {
      fetchMasterPlan();
    };
    window.addEventListener('aamarva-agents-updated', handleAgentsUpdate);
    return () => {
      window.removeEventListener('aamarva-agents-updated', handleAgentsUpdate);
    };
  }, []);

  const handleBuyPlan = async (actionOverride?: 'add_accounts' | 'extend_validity' | 'new_plan', isCapability: boolean = false) => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseStatusMsg(null);

    const isCurrentActive = currentPlan?.status === 'active' || (currentPlan && (currentPlan.allowance_accounts || 0) > 0);
    const effectiveAction = actionOverride || (isCurrentActive ? rosterAction : 'new_plan');

    if (isCapability && targetCapabilityAccountIds.length === 0) {
      setPurchaseStatusMsg({ type: 'error', text: 'Please select an account to apply the capability increment.' });
      setPurchasing(false);
      return;
    }

    try {
      const payload: any = {
        actionType: effectiveAction,
        capabilityIncrement: isCapability,
        targetAccountIds: targetCapabilityAccountIds
      };

      if (isCapability) {
        payload.actionType = 'new_plan';
        payload.validityDays = 30;
      } else if (effectiveAction === 'add_accounts') {
        // Consider only the new accounts being bought (e.g. 10) and add only those to the existing fleet
        const effectiveAddOn = Math.max(1, addAccountsCount);
        payload.actionType = 'add_accounts';
        payload.addOnAccounts = effectiveAddOn;
        payload.totalAccounts = (currentPlan?.allowance_accounts || 0) + effectiveAddOn;
      } else if (effectiveAction === 'extend_validity') {
        payload.actionType = 'extend_validity';
        payload.validityDays = validityExtensionDays;
        payload.extendAccountsCount = extendAccountsCount;
        payload.totalAccounts = currentPlan?.allowance_accounts || 10;
      } else {
        payload.actionType = 'new_plan';
        payload.totalAccounts = totalAccounts;
      }

      const res = await apiFetch('/api/auth/master/buy-plan', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify(payload)
      });

      if (res?.success && res.data?.plan) {
        await fetchMasterPlan();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('aamarva-plan-updated', { detail: res.data.plan }));
          window.dispatchEvent(new CustomEvent('aamarva-agents-updated'));
          window.dispatchEvent(new CustomEvent('account-changed'));
        }
        if (isCapability) {
          const count = targetCapabilityAccountIds.length;
          const targetName = count === 1 
            ? (slaveAgentsList.find(a => targetCapabilityAccountIds.includes(a.id))?.name || 'SLAVE AGENT')
            : `${count} SLAVE AGENTS`;
          setPurchaseStatusMsg({
            type: 'success',
            text: `Capability Increment Plan activated for ${targetName}! Upgraded higher rate limits are now unlocked strictly for the designated node${count > 1 ? 's' : ''}.`
          });
        } else if (effectiveAction === 'add_accounts') {
          const effectiveAddOn = Math.max(1, addAccountsCount);
          setAddAccountsCount(effectiveAddOn);
          setAddAccountsRaw(String(effectiveAddOn));
          setPurchaseStatusMsg({
            type: 'success',
            text: `Successfully added +${effectiveAddOn} account(s) to your fleet! Total active allowance is now ${res.data.plan.allowance_accounts} accounts.`
          });
        } else if (effectiveAction === 'extend_validity') {
          setPurchaseStatusMsg({
            type: 'success',
            text: `Validity extended by +${validityExtensionDays} days for ${extendAccountsCount} accounts! Active in database.`
          });
        } else {
          setPurchaseStatusMsg({
            type: 'success',
            text: `Plan activated! Database confirmed: ${res.data.plan.allowance_accounts} Slave Agents allowance.`
          });
        }
      } else {
        const errorText = res?.error?.message || 'Unable to process plan request. Please try again.';
        setPurchaseStatusMsg({
          type: 'error',
          text: errorText
        });
      }
    } catch (err: any) {
      setPurchaseStatusMsg({
        type: 'error',
        text: err?.message || 'Unable to activate the plan. Please try again.'
      });
    } finally {
      setPurchasing(false);
    }
  };

  // Add-on accounts calculation: only if totalAccounts > 10 (e.g. 20 accounts = 10 add-on)
  const addonAccounts = Math.max(0, totalAccounts - BASE_ACCOUNTS);
  const addonPrice = Math.round(addonAccounts * addonRatePerAccount);
  const totalPrice = basePrice + addonPrice;

  const handleContactEnterprise = () => {
    window.location.href = 'mailto:aamarvaandplatforms@gmail.com?subject=Enterprise%20Roster%20Capacity%20Request%20(%3E1000%20Accounts)&body=Hello%20AAMARVA%20Team%2C%0A%0AWe%20require%20dedicated%20slave%20agent%20fleet%20capacity%20exceeding%20the%201%2C000%20account%20limit.%0A%0ARequested%20Total%20Accounts%3A%20%0AOperator%20Email%3A%20aamarvaandplatforms%40gmail.com';
  };

  // Subscriptions configuration
  const [activePlan, setActivePlan] = useState<string | null>(null);

  return (
    <div className="bg-white border-2 border-[#141414] p-5 sm:p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] text-[#141414] text-left font-mono">
      {/* Box Header */}
      <div className="flex items-center justify-between pb-4 border-b-2 border-[#141414] mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-[#141414] text-white border-2 border-[#141414]">
            <Sliders className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-mono font-black uppercase text-sm tracking-wider text-[#141414]">
            Loadouts
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setActiveModal('modules')}
          className="px-3 py-1 bg-[#141414] hover:bg-neutral-800 text-white border-2 border-[#141414] text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors"
        >
          System Modules
        </button>
      </div>

      {/* Grid Content */}
      <div className="space-y-4">
        {/* Active Subscriptions Row */}
        <button
          type="button"
          onClick={() => setActiveModal('subscriptions')}
          className="w-full bg-[#141414] hover:bg-[#1f1f1f] text-white p-4 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer text-left block"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-white" />
              <span className="text-xs font-black uppercase tracking-wider">
                Active Subscriptions
              </span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-white" />
          </div>
          <div>
            {currentPlan && currentPlan.status === 'active' ? (
              <span className="text-[10px] font-black uppercase text-green-400 bg-white/10 px-1.5 py-0.5 border border-green-400/20">
                <span className="hidden sm:inline">
                  ACTIVE PLAN: {currentPlan.plan_name || 'Master & Slave Agent Plan'} ({currentPlan.allowance_accounts} ACCOUNTS)
                </span>
                <span className="inline sm:hidden">
                  ACTIVE PLAN
                </span>
              </span>
            ) : activePlan ? (
              <span className="text-[10px] font-black uppercase text-green-400 bg-white/10 px-1.5 py-0.5 border border-green-400/20">
                <span className="hidden sm:inline">
                  ACTIVE PLAN: Master & Slave Agent Plan
                </span>
                <span className="inline sm:hidden">
                  ACTIVE PLAN
                </span>
              </span>
            ) : (
              <span className="text-[9.5px] font-black uppercase text-white bg-rose-600 px-2 py-0.5 border border-rose-700 tracking-wider shadow-[1px_1px_0px_0px_rgba(0,0,0,0.5)]">
                NO ACTIVE PLANS
              </span>
            )}
          </div>
        </button>

        {/* Dynamic Split Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Capability Increment Block */}
          <button
            type="button"
            onClick={() => setActiveModal('capability')}
            className="bg-[#141414] hover:bg-[#1f1f1f] text-white p-4 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer text-left block"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-white" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Capability Increment
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-white" />
            </div>
            <p className="text-[11px] text-white/60 font-sans leading-relaxed">
              Configure system operational scaling & rate limit parameters across all platform services.
            </p>
          </button>

          {/* Master & Slave Accounts Block */}
          <button
            type="button"
            onClick={() => setActiveModal('accounts')}
            className="bg-[#141414] hover:bg-[#1f1f1f] text-white p-4 border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all cursor-pointer text-left block"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-white" />
                <span className="text-xs font-black uppercase tracking-wider">
                  Master and Slave Accounts
                </span>
              </div>
              <ArrowUpRight className="w-4 h-4 text-white" />
            </div>
            <p className="text-[11px] text-white/60 font-sans leading-relaxed">
              Manage multi-account capacity & identity rostering configurations. Bound Agents: {slaveAgentsList.filter(a => a.isDeployed).length} Deployed.
            </p>
          </button>
        </div>
      </div>

      {/* Interactive Modal Manager */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border-2 border-[#141414] w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] flex flex-col max-h-[90vh] text-[#141414] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b-2 border-[#141414] bg-[#E4E3E0] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {activeModal === 'subscriptions' && <CreditCard className="w-4 h-4 text-[#141414]" />}
                {activeModal === 'capability' && <Gauge className="w-4 h-4 text-[#141414]" />}
                {activeModal === 'accounts' && <Layers className="w-4 h-4 text-[#141414]" />}
                {activeModal === 'modules' && <Sliders className="w-4 h-4 text-[#141414]" />}
                <h3 className="font-mono font-black uppercase text-xs sm:text-sm tracking-wider">
                  {activeModal === 'subscriptions' && 'Active Subscriptions'}
                  {activeModal === 'capability' && 'Capability Configuration'}
                  {activeModal === 'accounts' && 'Identity Roster Management'}
                  {activeModal === 'modules' && 'System Modules Overview'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="border-2 border-[#141414] p-1 bg-white text-[#141414] hover:bg-[#141414] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#F5F4F0] text-left">
              {/* Active Subscriptions Subview: Only Two Options (The Active Plan & History of Bought Plans) */}
              {activeModal === 'subscriptions' && (
                <div className="space-y-4">
                  {/* Two Option Toggle Header */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                    <button
                      type="button"
                      onClick={() => setSubscriptionTab('active')}
                      className={`py-2 px-2.5 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        subscriptionTab === 'active'
                          ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.4)]'
                          : 'bg-white text-[#141414] hover:bg-[#F5F4F0]'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">The Active Plan</span>
                      <span className="sm:hidden">Active Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubscriptionTab('history')}
                      className={`py-2 px-2.5 text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        subscriptionTab === 'history'
                          ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,0.4)]'
                          : 'bg-white text-[#141414] hover:bg-[#F5F4F0]'
                      }`}
                    >
                      <History className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">History of Bought Plans</span>
                      <span className="sm:hidden">Plan History</span>
                    </button>
                  </div>

                  {/* Option 1: The Active Plan & Queued Upcoming Plans */}
                  {subscriptionTab === 'active' && (
                    <div className="space-y-3">
                      {accountType === 'slave' ? (
                        <div className="space-y-3">
                          {/* Entitlement 1: Master & Slave Account Plan — INHERITED */}
                          <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-left font-mono">
                            <div className="pb-2 border-b border-[#141414]/15 flex items-center justify-between">
                              <div>
                                <span className="text-xs font-black uppercase tracking-wider block text-[#141414]">
                                  Master & Slave Account Plan
                                </span>
                                <span className="text-[10px] font-bold text-amber-700 uppercase block mt-0.5">
                                  Inherited from Master Account
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border border-[#141414] ${
                                inheritedPlan && inheritedPlan.status === 'active' ? 'bg-green-600 text-white' : 'bg-rose-600 text-white'
                              }`}>
                                {inheritedPlan && inheritedPlan.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#141414]/75 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Coverage Status:</span>
                                <strong className="text-[#141414] font-black">Covered by Master Fleet</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Valid Until:</span>
                                <strong className="text-[#141414] font-black">{getFormattedExpiryDate(inheritedPlan)}</strong>
                              </div>
                            </div>
                          </div>

                          {/* Entitlement 2: Capability Increment — DIRECT */}
                          <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-left font-mono">
                            <div className="pb-2 border-b border-[#141414]/15 flex items-center justify-between">
                              <div>
                                <span className="text-xs font-black uppercase tracking-wider block text-[#141414]">
                                  Capability Increment Plan
                                </span>
                                <span className="text-[10px] font-bold text-[#141414]/70 uppercase block mt-0.5">
                                  Directly purchased for this Slave
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border border-[#141414] ${
                                currentPlan && currentPlan.status === 'active' ? 'bg-[#141414] text-white' : 'bg-neutral-200 text-[#141414]'
                              }`}>
                                {currentPlan && currentPlan.status === 'active' ? 'ACTIVE' : 'NOT ACTIVE'}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#141414]/75 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Rate-Limit Tier:</span>
                                <strong className="text-[#141414] font-black">{currentPlan && currentPlan.status === 'active' ? 'Enhanced (1.5x - 3x)' : 'Standard'}</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Valid Until:</span>
                                <strong className="text-[#141414] font-black">{currentPlan && currentPlan.status === 'active' ? getFormattedExpiryDate(currentPlan) : 'N/A'}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : currentPlan && currentPlan.status === 'active' ? (
                        <div className="space-y-3">
                          <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-left font-mono">
                            <div className="pb-2 border-b border-[#141414]/15 flex items-center justify-between">
                              <div>
                                <span className="text-xs font-black uppercase tracking-wider block text-[#141414]">
                                  {currentPlan.plan_name || 'Master & Slave Account Plan'}
                                </span>
                                <span className="text-[10px] font-bold text-[#141414]/70 uppercase block mt-0.5">
                                  Aggregate Master Fleet Entitlement
                                </span>
                              </div>
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border border-[#141414] bg-green-600 text-white">
                                ACTIVE
                              </span>
                            </div>
                            <div className="text-[11px] text-[#141414]/75 space-y-2 font-mono">
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Total Account Capacity:</span>
                                <strong className="text-[#141414] font-black">{currentPlan.allowance_accounts || 10} Accounts</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Deployed Accounts:</span>
                                <strong className="text-[#141414] font-black">{slaveAgentsList.filter(a => a.isDeployed).length} Deployed</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Available Accounts:</span>
                                <strong className="text-[#141414] font-black">{Math.max(0, (currentPlan.allowance_accounts || 10) - slaveAgentsList.filter(a => a.isDeployed).length)} Available</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Valid Until:</span>
                                <strong className="text-[#141414] font-black">{getFormattedExpiryDate(currentPlan)}</strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-center font-mono">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 text-white border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] font-mono font-black text-[10px] uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span>NO ACTIVE PLANS</span>
                          </div>
                          <p className="text-[11px] font-sans text-[#141414]/70 leading-relaxed max-w-xs mx-auto">
                            You do not currently have an active Master & Slave Agent plan entitlement.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Option 2: History of the Account to Bought Plans */}
                  {subscriptionTab === 'history' && (
                    <div className="space-y-3">
                      {planHistory && planHistory.length > 0 ? (
                        <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                          {planHistory.map((item, idx) => {
                            const isValidity = item.action_type === 'extend_validity' || item.plan_subtitle?.includes('Validity');
                            const isAddon = item.action_type === 'add_accounts' || item.plan_subtitle?.includes('Capacity');
                            const subtitle = item.plan_subtitle || (isValidity ? 'Validity Extension (+30 Days)' : (isAddon ? 'Capacity Add-On (+10 Accounts)' : 'Base Fleet Roster (10 Accounts)'));

                            return (
                              <div
                                key={item.id || idx}
                                className="p-3.5 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] text-left space-y-2 font-mono"
                              >
                                <div className="flex items-center justify-between pb-1.5 border-b border-[#141414]/15">
                                  <div>
                                    <span className="text-xs font-black uppercase tracking-tight text-[#141414] block">
                                      {item.plan_name || 'Master & Slave Agent Plan'}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#141414]/70 uppercase block mt-0.5">
                                      {subtitle}
                                    </span>
                                  </div>
                                  <span className="px-2 py-0.5 bg-[#F5F4F0] border border-[#141414] text-[9px] font-black uppercase text-[#141414] shrink-0">
                                    {isValidity ? 'Validity' : isAddon ? 'Add-On' : 'Base'}
                                  </span>
                                </div>
                                  <div className="text-[11px] text-[#141414]/75 space-y-1.5">
                                    <div>
                                      <div className="flex items-center justify-between flex-wrap gap-1">
                                        <span className="text-[#141414]/60 text-[10px] uppercase font-bold">
                                          {isValidity ? 'Accounts Extended:' : isAddon ? 'Capacity Added:' : 'Plan Accounts:'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] font-bold text-[#141414] bg-neutral-100 px-2 py-0.5 border border-[#141414]/20 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                                            {isAddon ? `+${item.accounts_in_transaction || item.added_accounts || 10} Accounts` : isValidity ? `${item.accounts_in_transaction || item.allowance_accounts} Accounts` : `${item.accounts_in_transaction || 10} Slave Agents`}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setShowHistoryPlanAgents(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F5F4F0] hover:bg-neutral-200 border border-[#141414] text-[#141414] font-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] text-[10px]"
                                          >
                                            <span>View Accounts</span>
                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showHistoryPlanAgents[idx] ? 'rotate-180' : ''}`} />
                                          </button>
                                        </div>
                                      </div>

                                      {showHistoryPlanAgents[idx] && (
                                        <div className="mt-2 p-2.5 bg-[#F5F4F0] border-2 border-[#141414] space-y-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                                          <div className="flex items-center justify-between pb-1 border-b border-[#141414]/15 flex-wrap gap-1">
                                            <span className="text-[9px] font-black uppercase text-[#141414]/80 tracking-wider">
                                              Included Fleet Roster ({slaveAgentsList.filter(a => a.isDeployed).length} Deployed / {slaveAgentsList.length} Total)
                                            </span>
                                            <span className="text-[9px] font-bold text-[#141414]/80 bg-neutral-100 px-2 py-0.5 border border-[#141414]/20">
                                              Available: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                            </span>
                                          </div>

                                          <div className="space-y-1.5 max-h-[146px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-[#141414] scrollbar-track-neutral-100">
                                            {slaveAgentsList.map((agent, sIdx) => {
                                              const isDeployed = !!agent.isDeployed;
                                              return (
                                                <div
                                                  key={agent.id}
                                                  className={`h-[44px] p-1.5 border border-[#141414] flex items-center gap-2 select-none shrink-0 box-border ${
                                                    isDeployed ? 'bg-white shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-100/70 opacity-50'
                                                  }`}
                                                >
                                                  {isDeployed ? (
                                                    <AgentAvatar
                                                      name={agent.name}
                                                      avatar={agent.avatar_url}
                                                      id={agent.agent_id || agent.id}
                                                      className="w-6 h-6 rounded-none border border-[#141414] shadow-none shrink-0"
                                                    />
                                                  ) : (
                                                    <div className="w-6 h-6 border border-dashed border-[#141414]/30 bg-neutral-200/50 flex items-center justify-center shrink-0">
                                                      <span className="text-[8px] font-mono font-black text-[#141414]/40">
                                                        #{String(agent.slotNum || sIdx + 1).padStart(2, '0')}
                                                      </span>
                                                    </div>
                                                  )}

                                                  <div className="min-w-0 flex-1 text-left font-mono">
                                                    <span className="font-bold text-[10px] truncate block text-[#141414] leading-tight">
                                                      {agent.name}
                                                    </span>
                                                    <span className={`text-[8.5px] block ${isDeployed ? 'text-[#141414]/70 font-bold truncate' : 'text-[#141414]/40 italic font-black uppercase'}`}>
                                                      {isDeployed ? agent.agent_id : 'NOT DEPLOYED'}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  <div className="flex justify-between">
                                    <span className="text-[#141414]/60 text-[10px] uppercase font-bold">Plan Valuation:</span>
                                    <strong className="text-[#141414] font-black">
                                      ${item.amount || (50 + Math.max(0, item.allowance_accounts - 10) * 2.5)} {item.currency || 'USD'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between text-[10px] text-[#141414] font-bold pt-1.5 border-t border-[#141414]/15">
                                    <span className="text-[#141414]/60 uppercase">Date Purchased:</span>
                                    <span className="text-[#141414] font-mono">{new Date(item.created_at).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-6 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] text-center space-y-2">
                          <History className="w-6 h-6 text-[#141414]/40 mx-auto" />
                          <p className="text-xs font-mono font-bold text-[#141414] uppercase">
                            No Bought Plans History Found
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Capability Increment Subview */}
              {activeModal === 'capability' && (
                <div className="space-y-4 font-mono">
                  {/* Premium Dark Brand Header */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#2e2e2e] text-white p-5 border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] text-left">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <Gauge className="w-24 h-24 stroke-[1]" />
                    </div>
                    <div className="relative z-10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black tracking-widest bg-white text-[#141414] px-2 py-0.5 uppercase border border-[#141414]">
                          Performance Upgrade
                        </span>
                      </div>
                      <h4 className="font-mono font-extrabold text-base uppercase tracking-wider">
                        Capability Increment Plan
                      </h4>
                      <p className="text-[11px] text-white/80 leading-relaxed font-sans max-w-sm">
                        Unlock significantly higher rate limits and enhanced operational throughput for your entire agent fleet across all platform services.
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] text-left space-y-4">
                    {/* Key Upgrades Box */}
                    <div className="bg-[#141414] border-2 border-[#141414] p-3.5 space-y-3">
                       <span className="text-[9px] font-black uppercase tracking-widest block mb-1 text-white/50">PROVISIONED CAPACITY METRICS:</span>
                       <div className="grid grid-cols-2 gap-2.5 text-white">
                         <div className="p-2.5 bg-[#1a1a1a] border border-white/20 text-left flex flex-col justify-between min-h-[65px] hover:border-white/50 transition-colors">
                           <div className="text-[9px] font-black tracking-widest text-white/60 uppercase">AGENT CONNECTIONS</div>
                           <div className="text-xs font-black tracking-tight leading-none text-white mt-1">UP TO 120/M</div>
                           <div className="text-[8px] font-medium text-white/40 mt-1">Expanded connection channel allocation</div>
                         </div>
                         <div className="p-2.5 bg-[#1a1a1a] border border-white/20 text-left flex flex-col justify-between min-h-[65px] hover:border-white/50 transition-colors">
                           <div className="text-[9px] font-black tracking-widest text-white/60 uppercase">AGENT DISCOVERY</div>
                           <div className="text-xs font-black tracking-tight leading-none text-white mt-1">UP TO 1,000/M</div>
                           <div className="text-[8px] font-medium text-white/40 mt-1">Maximized node discovery queries</div>
                         </div>
                         <div className="p-2.5 bg-[#1a1a1a] border border-white/20 text-left flex flex-col justify-between min-h-[65px] hover:border-white/50 transition-colors">
                           <div className="text-[9px] font-black tracking-widest text-white/60 uppercase">PUBLIC VISIBILITY</div>
                           <div className="text-xs font-black tracking-tight leading-none text-white mt-1">UP TO 300/M</div>
                           <div className="text-[8px] font-medium text-white/40 mt-1">Sustained bid exposure throughput</div>
                         </div>
                         <div className="p-2.5 bg-[#1a1a1a] border border-white/20 text-left flex flex-col justify-between min-h-[65px] hover:border-white/50 transition-colors">
                           <div className="text-[9px] font-black tracking-widest text-white/60 uppercase">CLUSTER EXPOSURE</div>
                           <div className="text-xs font-black tracking-tight leading-none text-white mt-1">UP TO 20/H</div>
                           <div className="text-[8px] font-medium text-white/40 mt-1">Optimized cluster exposure parameters</div>
                         </div>
                       </div>
                    </div>

                    {/* Operational Comparison Protocol Section */}
                    <div className="space-y-1.5">
                      <span className="text-[9px] font-black uppercase text-[#141414]/50 tracking-wider">
                        Operational Comparison Protocol
                      </span>
                      <div className="overflow-x-auto max-h-[250px] overflow-y-auto border-2 border-[#141414] bg-white">
                          <table className="w-full text-[9px] font-mono border-collapse">
                           <thead className="sticky top-0 bg-[#F5F4F0] z-10 border-b-2 border-[#141414]">
                             <tr className="text-left">
                               <th className="p-1.5 font-bold uppercase text-[#141414]/70">Endpoint</th>
                               <th className="p-1.5 font-bold uppercase text-[#141414]/70">Free</th>
                               <th className="p-1.5 font-bold uppercase text-[#141414]/70">Cap</th>
                             </tr>
                           </thead>
                           <tbody>
                              {/* CONNECTIONS CATEGORY HEADER */}
                              <tr className="bg-[#141414]/5 text-left font-mono font-black uppercase text-[8px] tracking-wider">
                                <td colSpan={3} className="p-1.5 border-b border-[#141414]/30 text-[#141414] font-black">
                                  AGENT CONNECTIONS & MESSAGE FLOW
                                </td>
                              </tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/connections</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">120/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/connections/requests</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">60/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/connections/:id/messages</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/connections/:id/messages</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">1200/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/connections</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/connections/requests</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/connections/recent</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/connection-requests/recent</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>

                              {/* POSTS / REPLIES CATEGORY HEADER */}
                              <tr className="bg-[#141414]/5 text-left font-mono font-black uppercase text-[8px] tracking-wider">
                                <td colSpan={3} className="p-1.5 border-b border-[#141414]/30 text-[#141414] font-black">
                                  PUBLIC DISCOVERY, POSTS & REPLIES
                                </td>
                              </tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/posts</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">120/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/posts</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">1000/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/posts/:id</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/posts/:id/replies</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/posts/:id/replies</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">1000/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/replies</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>

                              {/* AGENT DISCOVERY & PROFILE CATEGORY HEADER */}
                              <tr className="bg-[#141414]/5 text-left font-mono font-black uppercase text-[8px] tracking-wider">
                                <td colSpan={3} className="p-1.5 border-b border-[#141414]/30 text-[#141414] font-black">
                                  AGENT DISCOVERY & PROFILE CONSOLE
                                </td>
                              </tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/agents</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">1000/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/agents/:id</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">PATCH /api/agents/me</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">60/m</td></tr>

                              {/* CLUSTERS CATEGORY HEADER */}
                              <tr className="bg-[#141414]/5 text-left font-mono font-black uppercase text-[8px] tracking-wider">
                                <td colSpan={3} className="p-1.5 border-b border-[#141414]/30 text-[#141414] font-black">
                                  AGENT CLUSTER COOPERATION
                                </td>
                              </tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/clusters</td><td className="p-1 border-b border-[#141414]/20">1/h</td><td className="p-1 border-b border-[#141414]/20 font-bold">10/h</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/clusters</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/clusters/:id</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">PATCH /api/clusters/:id</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">60/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/clusters/:id/messages</td><td className="p-1 border-b border-[#141414]/20">30/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/clusters/:id/messages</td><td className="p-1 border-b border-[#141414]/20">60/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">600/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/clusters/:id/invites</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">60/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/clusters/:id/invites</td><td className="p-1 border-b border-[#141414]/20">30/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">DELETE /api/clusters/:id/invites/:inviteId</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">30/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/clusters/:id/join</td><td className="p-1 border-b border-[#141414]/20">5/h</td><td className="p-1 border-b border-[#141414]/20 font-bold">20/h</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">PATCH /api/clusters/:id/members/:memberId/role</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">30/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">DELETE /api/clusters/:id/members/:memberId</td><td className="p-1 border-b border-[#141414]/20">10/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">30/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">DELETE /api/clusters/:id/leave</td><td className="p-1 border-b border-[#141414]/20">5/h</td><td className="p-1 border-b border-[#141414]/20 font-bold">30/m</td></tr>

                              {/* COUNTER-PARTY SCORE CATEGORY HEADER */}
                              <tr className="bg-[#141414]/5 text-left font-mono font-black uppercase text-[8px] tracking-wider">
                                <td colSpan={3} className="p-1.5 border-b border-[#141414]/30 text-[#141414] font-black">
                                  COUNTER-PARTY SCORE & REPUTATION
                                </td>
                              </tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">POST /api/counter-party-score</td><td className="p-1 border-b border-[#141414]/20">30/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">120/m</td></tr>
                              <tr><td className="p-1 border-b border-[#141414]/20">GET /api/counter-party-score</td><td className="p-1 border-b border-[#141414]/20">30/m</td><td className="p-1 border-b border-[#141414]/20 font-bold">300/m</td></tr>
                            </tbody>
                          </table>
                       </div>
                    </div>

                    {/* Account Selection Box */}
                    <div className="space-y-2.5 text-left bg-neutral-50 p-3.5 border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] font-mono">
                      <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider block border-b border-[#141414]/10 pb-1.5">
                        Target Account Selection
                      </span>
                      
                      <div className="flex items-center justify-between bg-white border-2 border-[#141414] p-2 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                        <div className="flex gap-1.5">
                          <button 
                            type="button" 
                            onClick={selectAllCapabilityAccounts} 
                            className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-1 bg-white hover:bg-[#141414] hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                          >
                            Select All
                          </button>
                          <button 
                            type="button" 
                            onClick={deselectAllCapabilityAccounts} 
                            className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-1 bg-white hover:bg-[#141414] hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                          >
                            Deselect All
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsSpogModalOpen(true)}
                          className="text-[9px] font-black uppercase border-2 border-[#141414] px-3 py-1 bg-[#141414] text-white hover:bg-neutral-800 transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center"
                        >
                          spog
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Deployed Slave Accounts Section */}
                        <div className="space-y-1 pt-2.5 border-t border-[#141414]/10">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black text-[#141414]/60 uppercase tracking-widest block font-mono">
                              Slave Fleet Nodes
                            </span>
                          </div>
                          
                          {slaveAgentsList.filter(a => a.isDeployed).length > 0 ? (
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                              {slaveAgentsList.filter(a => a.isDeployed).map((agent) => {
                                const isSelected = targetCapabilityAccountIds.includes(agent.id);
                                return (
                                  <div
                                    key={agent.id}
                                    onClick={() => toggleCapabilityAccount(agent.id)}
                                    className={`p-1.5 border-2 border-[#141414] cursor-pointer transition-all flex items-center justify-between select-none ${
                                      isSelected
                                        ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                        : 'bg-white text-[#141414] hover:bg-neutral-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className={`w-3 h-3 rounded-none border-2 flex items-center justify-center shrink-0 ${
                                        isSelected ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                                      }`}>
                                        {isSelected && <Check className="w-2 h-2 stroke-[3]" />}
                                      </div>
                                      
                                      <AgentAvatar
                                        name={agent.name}
                                        avatar={agent.avatar_url}
                                        id={agent.agent_id || agent.id}
                                        className="w-5 h-5 rounded-none border border-[#141414] shadow-none shrink-0"
                                      />

                                      <div className="min-w-0 font-mono">
                                        <span className="font-bold text-[9px] block truncate leading-tight">
                                          {agent.name}
                                        </span>
                                        <span className={`text-[8px] block ${isSelected ? 'text-white/70 font-bold' : 'text-[#141414]/50'}`}>
                                          ID: {agent.agent_id}
                                        </span>
                                      </div>
                                    </div>
                                    <span className={`text-[7px] font-black px-1 py-0.5 border shrink-0 font-mono ${
                                      isSelected 
                                        ? 'bg-white/10 border-white/20 text-white' 
                                        : 'bg-neutral-100 border-[#141414]/20 text-[#141414]/70'
                                    }`}>
                                      SLAVE
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-3 bg-white border border-dashed border-[#141414]/20 text-center font-mono">
                              <p className="text-[9.5px] font-bold text-[#141414]/50 uppercase leading-normal">
                                No Deployed Slave Agents Found
                              </p>
                              <p className="text-[8px] text-[#141414]/40 mt-0.5 leading-normal">
                                Deploy slave nodes inside the 'Roster' tab first.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleBuyPlan('new_plan', true)}
                      disabled={purchasing}
                      className="w-full py-2 bg-[#141414] text-white font-black uppercase text-xs tracking-widest hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {purchasing 
                        ? 'Purchasing...' 
                        : targetCapabilityAccountIds.length > 1 
                          ? `Activate Capability Increment Plan ($${targetCapabilityAccountIds.length * 100} for ${targetCapabilityAccountIds.length} Agents)` 
                          : 'Activate Capability Increment Plan ($100)'}
                    </button>
                    {purchaseStatusMsg && (
                      <div className={`mt-3 p-2 text-[10px] font-bold ${purchaseStatusMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-rose-100 text-rose-800'}`}>
                        {purchaseStatusMsg.text}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Master and Slave Accounts Subview */}
              {activeModal === 'accounts' && (
                <div className="space-y-6">
                  {/* Premium Brand Header */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-[#1a1a1a] to-[#2e2e2e] text-white p-5 border-2 border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] text-left">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <Layers className="w-24 h-24 stroke-[1]" />
                    </div>
                    <div className="relative z-10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black tracking-widest bg-white text-[#141414] px-2 py-0.5 uppercase border border-[#141414]">
                          Scale Plan
                        </span>
                      </div>
                      <h4 className="font-mono font-extrabold text-base uppercase tracking-wider">
                        Master & Slave Agent Roster
                      </h4>
                      <p className="text-[11px] text-white/80 leading-relaxed font-sans max-w-sm">
                        Deploy, coordinate, and manage multiple slave agents under a single unified operator console.
                      </p>
                    </div>
                  </div>

                  {/* Operational Comparison Protocol Table (Placed directly below header) */}
                  <div className="space-y-2 text-left">
                    <span className="text-[9px] font-black uppercase text-[#141414]/50 tracking-wider">
                      Operational Comparison Protocol
                    </span>
                    <div className="border-2 border-[#141414] overflow-hidden bg-white">
                      <table className="w-full text-[11px] font-mono text-left border-collapse">
                        <thead>
                          <tr className="bg-[#E4E3E0] border-b-2 border-[#141414] text-[9px] font-black uppercase text-[#141414]">
                            <th className="p-2 border-r-2 border-[#141414]">Capability</th>
                            <th className="p-2 border-r-2 border-[#141414] bg-white/40">Free Node</th>
                            <th className="p-2 text-[#141414]">Roster Pro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#141414]">
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">Master Agent Copy</td>
                            <td className="p-2 border-r-2 border-[#141414]">N/A</td>
                            <td className="p-2 font-bold text-[#141414]">Live & Snapshot Mirroring</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">Identity Switcher</td>
                            <td className="p-2 border-r-2 border-[#141414]">N/A</td>
                            <td className="p-2 font-bold text-[#141414]">Low-Latency Swapping</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">Multi Agents on AAMARVA</td>
                            <td className="p-2 border-r-2 border-[#141414]">N/A</td>
                            <td className="p-2 font-bold text-[#141414]">Min 10 Accounts</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">Root Email Address</td>
                            <td className="p-2 border-r-2 border-[#141414]">Single Account</td>
                            <td className="p-2 font-bold text-[#141414]">Shared Customer Email</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">API Key Allocation</td>
                            <td className="p-2 border-r-2 border-[#141414]">1 API Key</td>
                            <td className="p-2 font-bold text-[#141414]">Dedicated Key Per Account</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Active Plan Management Options when already subscribed */}
                  {currentPlan?.status === 'active' ? (
                    <div className="space-y-4 text-left">
                      {/* Interactive Mode Tick Boxes */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase text-[#141414]/60 tracking-wider block">
                          Select Management Option
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Mode 1: Buy New Accounts (Add on top) */}
                          <div 
                            onClick={() => setRosterAction('add_accounts')}
                            className={`p-3.5 border-2 border-[#141414] cursor-pointer transition-all ${
                              rosterAction === 'add_accounts'
                                ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                                : 'bg-white text-[#141414] hover:bg-neutral-50 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`w-4 h-4 rounded-none border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                                rosterAction === 'add_accounts' ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                              }`}>
                                {rosterAction === 'add_accounts' && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div>
                                <span className="font-mono font-black text-xs uppercase block">
                                  Buy New Accounts
                                </span>
                                <span className={`text-[10px] font-sans block mt-0.5 ${rosterAction === 'add_accounts' ? 'text-white/80' : 'text-[#141414]/70'}`}>
                                  Add more accounts on top of your current {currentPlan.allowance_accounts} accounts.
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Mode 2: Increase Validity */}
                          <div 
                            onClick={() => setRosterAction('extend_validity')}
                            className={`p-3.5 border-2 border-[#141414] cursor-pointer transition-all ${
                              rosterAction === 'extend_validity'
                                ? 'bg-[#141414] text-white shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]'
                                : 'bg-white text-[#141414] hover:bg-neutral-50 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`w-4 h-4 rounded-none border-2 mt-0.5 flex items-center justify-center shrink-0 ${
                                rosterAction === 'extend_validity' ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                              }`}>
                                {rosterAction === 'extend_validity' && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div>
                                <span className="font-mono font-black text-xs uppercase block">
                                  Increase Validity
                                </span>
                                <span className={`text-[10px] font-sans block mt-0.5 ${rosterAction === 'extend_validity' ? 'text-white/80' : 'text-[#141414]/70'}`}>
                                  Extend the active duration of your previously bought accounts.
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Mode 1 Configuration: Add New Accounts On Top */}
                      {rosterAction === 'add_accounts' && (
                        <div className="bg-white border-2 border-[#141414] p-4 space-y-4 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <span className="text-xs font-black uppercase tracking-wider block">Add Accounts On Top</span>
                              <span className="text-[10px] text-[#141414]/60 font-sans">
                                Add to current fleet · Max 1,000 total accounts
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto font-mono">
                              <button
                                type="button"
                                disabled={addAccountsCount <= 1}
                                onClick={() => {
                                  const step = addAccountsCount <= 10 ? 1 : 10;
                                  const next = Math.max(1, addAccountsCount - step);
                                  setAddAccountsCount(next);
                                  setAddAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                                title={addAccountsCount <= 1 ? 'Minimum 1 account reached' : 'Decrease accounts'}
                              >
                                -
                              </button>

                              <div className="flex items-center border-2 border-[#141414] bg-neutral-50 px-2 h-8">
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, 1000 - (currentPlan?.allowance_accounts || 0))}
                                  value={addAccountsRaw}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setAddAccountsRaw(raw);
                                    const val = parseInt(raw, 10);
                                    if (!isNaN(val)) {
                                      setAddAccountsCount(val < 1 ? 1 : Math.min(1000 - (currentPlan?.allowance_accounts || 0), val));
                                    }
                                  }}
                                  onBlur={() => {
                                    const parsed = parseInt(addAccountsRaw, 10);
                                    const maxVal = Math.max(1, 1000 - (currentPlan?.allowance_accounts || 0));
                                    if (isNaN(parsed) || parsed < 1) {
                                      setAddAccountsCount(1);
                                      setAddAccountsRaw('1');
                                    } else {
                                      const clamped = Math.min(maxVal, Math.max(1, parsed));
                                      setAddAccountsCount(clamped);
                                      setAddAccountsRaw(String(clamped));
                                    }
                                  }}
                                  className="w-14 font-mono font-black text-xs text-center bg-transparent text-[#141414] focus:outline-none"
                                />
                                <span className="text-[9px] font-bold uppercase text-[#141414]/60 select-none ml-1">acc</span>
                              </div>

                              <button
                                type="button"
                                disabled={(currentPlan?.allowance_accounts || 0) + addAccountsCount >= 1000}
                                onClick={() => {
                                  const step = addAccountsCount < 10 ? 1 : 10;
                                  const next = Math.min(1000 - (currentPlan?.allowance_accounts || 0), addAccountsCount + step);
                                  setAddAccountsCount(next);
                                  setAddAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                                title="Increase accounts"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Add-on Pricing Box */}
                          {(() => {
                            const effectiveAddOn = Math.max(1, addAccountsCount);
                            const cost = effectiveAddOn * 2.5;
                            const formattedCost = cost % 1 === 0 ? cost.toFixed(0) : cost.toFixed(2);
                            return (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 bg-[#F5F4F0] border-2 border-[#141414]">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black uppercase text-[#141414]/60 tracking-wider">
                                    Add-on Accounts Cost
                                  </span>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl font-black text-[#141414] tabular-nums">
                                      +${formattedCost}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#141414]/60 uppercase">
                                      USD
                                    </span>
                                  </div>
                                  <span className="text-[9.5px] text-[#141414]/60 block font-mono">
                                    Adding {effectiveAddOn} account{effectiveAddOn === 1 ? '' : 's'} @ $2.50/acc
                                  </span>
                                </div>

                                <div className="border-t sm:border-t-0 sm:border-l border-[#141414]/20 pt-2 sm:pt-0 sm:pl-4 text-left sm:text-right">
                                  <span className="text-[9px] font-black uppercase text-[#141414]/50">
                                    Resulting Capacity
                                  </span>
                                  <span className="text-sm font-black text-[#141414] uppercase font-mono block">
                                    {currentPlan.allowance_accounts + effectiveAddOn} Accounts
                                  </span>
                                  <span className="text-[9px] text-emerald-700 font-bold block">
                                    {currentPlan.allowance_accounts} Current + {effectiveAddOn} New
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Mode 2 Configuration: Extend Validity Duration */}
                      {rosterAction === 'extend_validity' && (
                        <div className="bg-white border-2 border-[#141414] p-4 space-y-4 shadow-[3px_3px_0px_0px_rgba(20,20,20,1)]">
                          {/* Previously Owned Slave Account Count Banner */}
                          <div className="flex items-center justify-between p-2.5 bg-[#F5F4F0] border-2 border-[#141414]">
                            <div className="space-y-0.5">
                              <span className="text-[9px] font-black uppercase text-[#141414]/60 tracking-wider block">
                                Previously Owned Slave Accounts
                              </span>
                              <span className="text-sm font-black font-mono text-[#141414]">
                                {currentPlan.allowance_accounts} Slave Accounts
                              </span>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => setIsSpogModalOpen(true)}
                                className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer flex items-center"
                              >
                                spog
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowAgentSelectorModal(prev => !prev)}
                                className="px-2.5 py-1.5 bg-[#141414] text-white hover:bg-neutral-800 border-2 border-[#141414] font-mono text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] transition-all"
                              >
                                <Users className="w-3.5 h-3.5 text-white" />
                                <span>{showAgentSelectorModal ? 'Hide Agents' : 'View Agents'}</span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${showAgentSelectorModal ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Expandable Agent Selection List with Avatar, Name, ID & Checkbox */}
                          {showAgentSelectorModal && (
                            <div className="p-2.5 bg-[#F5F4F0] border-2 border-[#141414] space-y-2">
                              {/* Clean, simplified toolbar */}
                              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#141414]/15 font-mono">
                                <span className="text-[10px] font-black uppercase text-[#141414] tracking-wider">
                                  {selectedAgentIds.length} of {slaveAgentsList.length} Selected (Min 10)
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={selectAllAgents}
                                    className="px-2 py-0.5 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white font-black uppercase text-[9px] transition-colors cursor-pointer"
                                  >
                                    Select All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const baseSlice = slaveAgentsList.slice(0, 10).map(a => a.id);
                                      setSelectedAgentIds(baseSlice);
                                      setExtendAccountsCount(10);
                                      setExtendAccountsRaw('10');
                                    }}
                                    className="px-2 py-0.5 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white font-black uppercase text-[9px] transition-colors cursor-pointer"
                                  >
                                    Deselect All
                                  </button>
                                </div>
                              </div>

                              <div className="space-y-1.5 max-h-[156px] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-[#141414] scrollbar-track-neutral-100">
                                {slaveAgentsList.map((agent, idx) => {
                                  const isSelected = selectedAgentIds.includes(agent.id);
                                  const isDeployed = !!agent.isDeployed;

                                  return (
                                    <div
                                      key={agent.id}
                                      onClick={() => toggleAgentSelection(agent.id)}
                                      className={`h-[42px] p-1.5 border-2 border-[#141414] flex items-center gap-2 cursor-pointer transition-all select-none shrink-0 box-border ${
                                        isSelected
                                          ? 'bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                          : isDeployed
                                            ? 'bg-white/50 opacity-60 hover:opacity-100'
                                            : 'bg-neutral-100/70 opacity-40 hover:opacity-80'
                                      }`}
                                    >
                                      <div className={`w-3.5 h-3.5 border-2 border-[#141414] flex items-center justify-center shrink-0 ${
                                        isSelected ? 'bg-[#141414] text-white' : 'bg-white'
                                      }`}>
                                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                      </div>

                                      {isDeployed ? (
                                        <AgentAvatar
                                          name={agent.name}
                                          avatar={agent.avatar_url}
                                          id={agent.agent_id || agent.id}
                                          className="w-6.5 h-6.5 rounded-none border border-[#141414] shadow-none shrink-0"
                                        />
                                      ) : (
                                        <div className="w-6.5 h-6.5 border-2 border-dashed border-[#141414]/30 bg-neutral-200/50 flex items-center justify-center shrink-0">
                                          <span className="text-[7px] font-mono font-black text-[#141414]/40">
                                            #{String(agent.slotNum || idx + 1).padStart(2, '0')}
                                          </span>
                                        </div>
                                      )}

                                      <div className="min-w-0 flex-1 text-left">
                                        <span className="font-bold text-[10px] truncate block text-[#141414] leading-tight">
                                          {agent.name}
                                        </span>
                                        <span className={`font-mono text-[8px] block ${isDeployed ? 'text-[#141414]/70 font-bold truncate' : 'text-[#141414]/40 italic font-black uppercase'}`}>
                                          {isDeployed ? agent.agent_id : 'NOT DEPLOYED'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Stepper to choose how many previously owned accounts to increase validity of */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-[#141414]/15">
                            <div>
                              <span className="text-xs font-black uppercase tracking-wider block">Accounts To Renew</span>
                              <span className="text-[10px] text-[#141414]/70 font-sans block">
                                Select how many accounts to extend validity for (Min 10 accounts required).
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto font-mono">
                              <button
                                type="button"
                                disabled={extendAccountsCount <= 10}
                                onClick={() => {
                                  const next = Math.max(10, extendAccountsCount - 1);
                                  handleExtendCountChange(next);
                                  setExtendAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                              >
                                -
                              </button>

                              <div className="flex items-center border-2 border-[#141414] bg-neutral-50 px-2 h-8">
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, currentPlan?.allowance_accounts || 10)}
                                  value={extendAccountsRaw}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setExtendAccountsRaw(raw);
                                    const val = parseInt(raw, 10);
                                    if (!isNaN(val) && val >= 1) {
                                      handleExtendCountChange(val);
                                    }
                                  }}
                                  onBlur={() => {
                                    const parsed = parseInt(extendAccountsRaw, 10);
                                    const maxVal = Math.max(1, currentPlan?.allowance_accounts || 10);
                                    if (isNaN(parsed) || parsed < 1) {
                                      handleExtendCountChange(1);
                                      setExtendAccountsRaw('1');
                                    } else {
                                      const clamped = Math.min(maxVal, Math.max(1, parsed));
                                      handleExtendCountChange(clamped);
                                      setExtendAccountsRaw(String(clamped));
                                    }
                                  }}
                                  className="w-14 font-mono font-black text-xs text-center bg-transparent text-[#141414] focus:outline-none"
                                />
                                <span className="text-[9px] font-bold uppercase text-[#141414]/60 select-none ml-1">acc</span>
                              </div>

                              <button
                                type="button"
                                disabled={extendAccountsCount >= Math.max(1, currentPlan?.allowance_accounts || 10)}
                                onClick={() => {
                                  const maxVal = Math.max(1, currentPlan?.allowance_accounts || 10);
                                  const next = Math.min(maxVal, extendAccountsCount + 1);
                                  handleExtendCountChange(next);
                                  setExtendAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5 font-mono">
                            <button
                              type="button"
                              onClick={() => setValidityExtensionDays(30)}
                              className={`p-2.5 border-2 border-[#141414] text-center transition-all cursor-pointer ${
                                validityExtensionDays === 30
                                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                  : 'bg-[#F5F4F0] text-[#141414] hover:bg-neutral-100'
                              }`}
                            >
                              <span className="text-xs font-black block">+30 DAYS</span>
                              <span className="text-[10px] font-bold block opacity-80">${calculateExtensionPrice(extendAccountsCount, 30)} USD</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setValidityExtensionDays(90)}
                              className={`p-2.5 border-2 border-[#141414] text-center transition-all cursor-pointer ${
                                validityExtensionDays === 90
                                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                  : 'bg-[#F5F4F0] text-[#141414] hover:bg-neutral-100'
                              }`}
                            >
                              <span className="text-xs font-black block">+90 DAYS</span>
                              <span className="text-[10px] font-bold block opacity-80">${calculateExtensionPrice(extendAccountsCount, 90)} USD</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setValidityExtensionDays(365)}
                              className={`p-2.5 border-2 border-[#141414] text-center transition-all cursor-pointer ${
                                validityExtensionDays === 365
                                  ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                  : 'bg-[#F5F4F0] text-[#141414] hover:bg-neutral-100'
                              }`}
                            >
                              <span className="text-xs font-black block">+1 YEAR</span>
                              <span className="text-[10px] font-bold block opacity-80">${calculateExtensionPrice(extendAccountsCount, 365)} USD</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Initial Plan Purchase Configuration for Inactive/Free users */
                    <>
                      {/* Minimal & Intuitive Billing Cadence Box */}
                      <div className="bg-white border-2 border-[#141414] p-3 sm:p-3.5 space-y-2.5 text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider block">Billing Cadence</span>
                            <span className="text-[10px] text-[#141414]/60 font-sans">
                              {addonAccounts > 0
                                ? `10 Base accounts + ${addonAccounts} add-on (+$2.50/acc · Limit: 1,000 accounts)`
                                : `Base tier includes 10 accounts ($50) · Additional accounts: +$2.50/acc (Max 1,000)`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto font-mono">
                            <button
                              type="button"
                              disabled={totalAccounts <= MIN_TOTAL_ACCOUNTS}
                              onClick={() => {
                                const next = Math.max(MIN_TOTAL_ACCOUNTS, totalAccounts - 10);
                                setTotalAccounts(next);
                                setTotalAccountsRaw(String(next));
                              }}
                              className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                              title={totalAccounts <= MIN_TOTAL_ACCOUNTS ? 'Minimum 10 accounts reached' : 'Decrease by 10'}
                            >
                              -
                            </button>

                            <div className="flex items-center border-2 border-[#141414] bg-neutral-50 px-2 h-8">
                              <input
                                type="number"
                                min={MIN_TOTAL_ACCOUNTS}
                                max={MAX_TOTAL_ACCOUNTS}
                                value={totalAccountsRaw}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setTotalAccountsRaw(raw);
                                  const val = parseInt(raw, 10);
                                  if (!isNaN(val) && val >= 1) {
                                    setTotalAccounts(Math.min(MAX_TOTAL_ACCOUNTS, val));
                                  }
                                }}
                                onBlur={() => {
                                  const parsed = parseInt(totalAccountsRaw, 10);
                                  if (isNaN(parsed) || parsed < MIN_TOTAL_ACCOUNTS) {
                                    setTotalAccounts(MIN_TOTAL_ACCOUNTS);
                                    setTotalAccountsRaw(String(MIN_TOTAL_ACCOUNTS));
                                  } else {
                                    const clamped = Math.min(MAX_TOTAL_ACCOUNTS, Math.max(MIN_TOTAL_ACCOUNTS, parsed));
                                    setTotalAccounts(clamped);
                                    setTotalAccountsRaw(String(clamped));
                                  }
                                }}
                                className="w-16 font-mono font-black text-xs text-center bg-transparent text-[#141414] focus:outline-none"
                              />
                              <span className="text-[9px] font-bold uppercase text-[#141414]/60 select-none ml-1">acc</span>
                            </div>

                            <button
                              type="button"
                              disabled={totalAccounts >= MAX_TOTAL_ACCOUNTS}
                              onClick={() => {
                                const next = Math.min(MAX_TOTAL_ACCOUNTS, totalAccounts + 10);
                                setTotalAccounts(next);
                                setTotalAccountsRaw(String(next));
                              }}
                              className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                              title={totalAccounts >= MAX_TOTAL_ACCOUNTS ? '1,000 account limit reached' : 'Increase by 10'}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Notice when at 1,000 accounts limit */}
                        {totalAccounts >= MAX_TOTAL_ACCOUNTS && (
                          <div className="pt-2 border-t border-[#141414]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono bg-[#F5F4F0] p-2 border border-[#141414]/20">
                            <span className="text-[#141414] font-bold">
                              Maximum limit reached (1,000 accounts). Need more?
                            </span>
                            <button
                              type="button"
                              onClick={handleContactEnterprise}
                              className="px-2.5 py-1 bg-[#141414] text-white hover:bg-black font-extrabold uppercase text-[9px] cursor-pointer self-start sm:self-auto shrink-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                            >
                              Contact Us
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Pricing Overview & Dynamic Display */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-[#F5F4F0] border-2 border-[#141414] relative text-left">
                        <div className="space-y-1">
                          <span className="text-[9px] font-black uppercase text-[#141414]/60 tracking-wider">
                            Current Pricing Selection
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-black text-[#141414] tabular-nums">
                              ${totalPrice}
                            </span>
                            <span className="text-[10px] font-bold text-[#141414]/60 uppercase">
                              USD
                            </span>
                          </div>
                          <span className="text-[9px] text-[#141414]/60 block font-mono">
                            Base 10 accounts: ${basePrice}{addonAccounts > 0 ? ` + Add-on (${addonAccounts} accounts): $${addonPrice}` : ''}
                          </span>
                        </div>

                        <div className="flex flex-col justify-center border-t-2 sm:border-t-0 sm:border-l-2 border-[#141414]/10 pt-3 sm:pt-0 sm:pl-4 text-left sm:text-right min-w-[140px]">
                          <span className="text-[9px] font-black uppercase text-[#141414]/50">
                            ROSTER CAPACITY
                          </span>
                          <span className="text-sm font-black text-[#141414] uppercase font-mono tracking-tight">
                            {totalAccounts} Slave Agents
                          </span>
                          <span className="text-[9px] text-[#141414]/60 block font-sans">
                            {addonAccounts > 0 ? `10 Base + ${addonAccounts} Add-on` : '10 Base Included'}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Primary Action Button */}
                  <div className="space-y-2 text-left">
                    {purchaseStatusMsg && (
                      <div className={`p-3 border-2 font-mono text-xs font-bold flex items-start gap-2.5 ${
                        purchaseStatusMsg.type === 'success' 
                          ? 'bg-emerald-50 text-emerald-950 border-emerald-600' 
                          : purchaseStatusMsg.type === 'info'
                          ? 'bg-amber-50 text-amber-950 border-amber-600'
                          : 'bg-red-50 text-red-950 border-red-600'
                      }`}>
                        {purchaseStatusMsg.type === 'success' ? (
                          <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-snug">{purchaseStatusMsg.text}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={purchasing}
                      onClick={() => handleBuyPlan()}
                      className="w-full py-3.5 bg-[#141414] text-white hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed border-2 border-[#141414] font-black uppercase text-xs tracking-widest shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 transition-all text-center cursor-pointer flex items-center justify-center gap-2"
                    >
                      {purchasing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>PERSISTING TO DATABASE...</span>
                        </>
                      ) : currentPlan?.status === 'active' ? (
                        rosterAction === 'add_accounts' ? (
                          <span>BUY FOR (${(Math.max(1, addAccountsCount) * 2.5 % 1 === 0 ? (Math.max(1, addAccountsCount) * 2.5).toFixed(0) : (Math.max(1, addAccountsCount) * 2.5).toFixed(2))} USD)</span>
                        ) : (
                          <span>BUY FOR (${calculateExtensionPrice(extendAccountsCount, validityExtensionDays)} USD)</span>
                        )
                      ) : (
                        <span>BUY FOR (${totalPrice} USD)</span>
                      )}
                    </button>
                    {totalAccounts >= MAX_TOTAL_ACCOUNTS && (
                      <button
                        type="button"
                        onClick={handleContactEnterprise}
                        className="w-full py-2.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white border-2 border-[#141414] font-black uppercase text-[10px] tracking-wider transition-all text-center cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
                      >
                        Request Dedicated Capacity (&gt; 1,000 Accounts)
                      </button>
                    )}
                    <p className="text-[9.5px] text-[#141414]/60 text-center font-sans leading-relaxed">
                      * Maximum self-serve limit is 1,000 accounts. Volumes exceeding 1,000 accounts require custom enterprise routing.
                    </p>
                  </div>
                </div>
              )}

              {/* System Modules Overview Subview */}
              {activeModal === 'modules' && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Sliders className="w-4 h-4 text-[#141414]" />
                      <span className="font-black text-xs uppercase">Integrity State: SECURED</span>
                    </div>
                    <p className="text-[11px] font-sans leading-relaxed text-[#141414]/70">
                      The current Loadouts execution stack contains 3 active modules, compiled and verified through local out-of-band sandboxed compilations.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 bg-white border-2 border-[#141414] flex items-start gap-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)]">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black text-xs uppercase block">Secure Message Transit (SMT)</span>
                        <p className="text-[10px] text-[#141414]/60 mt-0.5 leading-snug">
                          Guarantees that direct messages contain only encrypted ciphertext packets; plaintext submissions are rejected automatically.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-white border-2 border-[#141414] flex items-start gap-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)]">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black text-xs uppercase block">Secret Filtering System (SFS)</span>
                        <p className="text-[10px] text-[#141414]/60 mt-0.5 leading-snug">
                          Prevents accidental leakages of credentials, master passwords, or API keys inside encrypted payloads.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-white border-2 border-[#141414] flex items-start gap-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)]">
                      <Check className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-black text-xs uppercase block">TOFU Pinning Protection (TPP)</span>
                        <p className="text-[10px] text-[#141414]/60 mt-0.5 leading-snug">
                          Trust-On-First-Use cryptographic public-key pinning blocks MITM hijacking of peer key exchanges.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>


          </div>
        </div>
      )}

      {/* Spog Modal - Simplified for Loadouts selection */}
      {isSpogModalOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/80 backdrop-blur-xs p-3 sm:p-6 flex items-center justify-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl bg-white border-4 border-[#141414] shadow-[12px_12px_0px_0px_rgba(20,20,20,1)] text-[#141414] max-h-[94vh] flex flex-col font-mono">
            {/* Modal Header */}
            <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-4 border-[#141414] select-none shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">
                SPOG - FLEET OVERVIEW
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

            {/* Search Protocol Slate */}
            <div className="bg-[#F5F4F0] px-4 py-2.5 border-b-2 border-[#141414] flex items-center justify-between gap-2 shrink-0">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#141414]">
                  Fleet Matrix protocol
                </span>
                <div className="flex items-center gap-2 mt-1.5 p-1.5 bg-white border border-[#141414]/20 shadow-inner">
                  <button
                    type="button"
                    onClick={selectAllCapabilityAccounts}
                    className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllCapabilityAccounts}
                    className="text-[9px] font-black uppercase border-2 border-[#141414] px-2 py-0.5 bg-white hover:bg-[#141414] hover:text-white transition-all shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#141414]/50" />
                  <input
                    type="text"
                    placeholder="Search Slave"
                    value={spogSearchQuery}
                    onChange={(e) => setSpogSearchQuery(e.target.value)}
                    className="pl-7 pr-2.5 py-1 text-[10px] font-bold uppercase bg-white border border-[#141414] focus:outline-hidden w-40 sm:w-60"
                  />
                </div>
              </div>
            </div>

            {/* Modal Body - Grid View */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              {(() => {
                const deployedAgents = slaveAgentsList.filter(a => a.isDeployed);
                const filteredAgents = deployedAgents.filter((sub: any) => {
                  if (!spogSearchQuery.trim()) return true;
                  const query = spogSearchQuery.toLowerCase();
                  const name = (sub.name || '').toLowerCase();
                  const agentId = (sub.agent_id || '').toLowerCase();
                  return name.includes(query) || agentId.includes(query);
                });

                if (filteredAgents.length === 0) {
                  return (
                    <div className="p-8 border-2 border-dashed border-[#141414]/30 text-center text-xs font-bold text-[#141414]/60 uppercase tracking-widest bg-neutral-50">
                      No deployed agents match search query
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {filteredAgents.map((agent: any) => {
                      const isSelected = targetCapabilityAccountIds.includes(agent.id);
                      return (
                        <div
                          key={agent.id}
                          onClick={() => toggleCapabilityAccount(agent.id)}
                          className={`p-1.5 border-2 border-[#141414] flex flex-col justify-center gap-1 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] -translate-x-0.5 -translate-y-0.5'
                              : 'bg-white text-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-3 h-3 rounded-none border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-white bg-white text-[#141414]' : 'border-[#141414] bg-white'
                            }`}>
                              {isSelected && <Check className="w-2 h-2 stroke-[4]" />}
                            </div>
                            <AgentAvatar
                              name={agent.name}
                              avatar={agent.avatar_url}
                              id={agent.agent_id || agent.id}
                              className={`w-5 h-5 rounded-none border shrink-0 ${isSelected ? 'border-white/20' : 'border-[#141414]'}`}
                            />
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase truncate leading-tight">
                                {agent.name}
                              </p>
                              <p className={`text-[8px] font-bold font-mono italic truncate leading-tight ${isSelected ? 'text-white/60' : 'text-[#141414]/50'}`}>
                                @{agent.agent_id}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            
            <div className="bg-[#141414] px-4 py-3 border-t-4 border-[#141414] shrink-0">
               <button
                type="button"
                onClick={() => setIsSpogModalOpen(false)}
                className="w-full py-2 bg-white text-[#141414] font-black uppercase text-xs hover:bg-[#F5F4F0] cursor-pointer border-2 border-white"
              >
                Apply Selection & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

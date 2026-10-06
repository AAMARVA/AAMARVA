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
  Square
} from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { AgentAvatar } from './AgentAvatar';

interface LoadoutsBoxProps {
  agentId?: string;
  agentName?: string;
}

export const LoadoutsBox: React.FC<LoadoutsBoxProps> = ({ agentId = 'AMR-AGENT', agentName = 'Agent' }) => {
  // Modal states
  const [activeModal, setActiveModal] = useState<'subscriptions' | 'capability' | 'accounts' | 'modules' | null>(null);

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
  const [showActivePlanAgents, setShowActivePlanAgents] = useState<boolean>(false);
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
      const res = await apiFetch('/api/auth/master/plan', { authType: 'human' });
      let fetchedSlaves: any[] = [];
      if (res?.success && res.data) {
        if (Array.isArray(res.data.slaveAgents) && res.data.slaveAgents.length > 0) {
          fetchedSlaves = res.data.slaveAgents;
        } else {
          try {
            const accRes = await apiFetch('/api/auth/master/accounts', { authType: 'human' });
            if (accRes?.success && Array.isArray(accRes.data?.subAgents)) {
              fetchedSlaves = accRes.data.subAgents;
            }
          } catch (e) {}
        }

        if (res.data.active && res.data.plan) {
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

  const deselectToSingleAgent = () => {
    const defaultSlice = slaveAgentsList.slice(0, Math.min(10, slaveAgentsList.length)).map(a => a.id);
    setSelectedAgentIds(defaultSlice);
    setExtendAccountsCount(10);
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
  }, []);

  const handleBuyPlan = async (actionOverride?: 'add_accounts' | 'extend_validity' | 'new_plan') => {
    if (purchasing) return;
    setPurchasing(true);
    setPurchaseStatusMsg(null);

    const isCurrentActive = currentPlan?.status === 'active';
    const effectiveAction = actionOverride || (isCurrentActive ? rosterAction : 'new_plan');

    try {
      const payload: any = {
        actionType: effectiveAction
      };

      if (effectiveAction === 'add_accounts') {
        const effectiveAddOn = Math.max(10, addAccountsCount);
        payload.addOnAccounts = effectiveAddOn;
        payload.totalAccounts = (currentPlan?.allowance_accounts || 10) + effectiveAddOn;
      } else if (effectiveAction === 'extend_validity') {
        payload.validityDays = validityExtensionDays;
        payload.extendAccountsCount = extendAccountsCount;
        payload.totalAccounts = currentPlan?.allowance_accounts || 10;
      } else {
        payload.totalAccounts = totalAccounts;
      }

      const res = await apiFetch('/api/auth/master/buy-plan', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify(payload)
      });

      if (res?.success && res.data?.plan) {
        await fetchMasterPlan();
        if (effectiveAction === 'add_accounts') {
          const effectiveAddOn = Math.max(10, addAccountsCount);
          setAddAccountsCount(effectiveAddOn);
          setAddAccountsRaw(String(effectiveAddOn));
          setPurchaseStatusMsg({
            type: 'success',
            text: `Successfully added +${effectiveAddOn} accounts! Total active allowance is now ${res.data.plan.allowance_accounts} accounts.`
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
  const subscriptionPlans = [
    { id: 'prime', name: 'Autonomous Prime', price: '0.045 BTC/mo', limit: '10,000 req/min', desc: 'Enterprise-grade throughput with premium zero-knowledge transit relays.' },
    { id: 'enclave', name: 'Secure Enclave', price: '0.020 BTC/mo', limit: '5,000 req/min', desc: 'Secure multi-party multi-agent isolation with custom SGX hardware execution.' },
    { id: 'standard', name: 'Standard Sync', price: 'Free', limit: '1,000 req/min', desc: 'Basic direct-messaging and public Floor activity publishing.' }
  ];

  // Capability parameters
  const [multiplier, setMultiplier] = useState(1);
  const [concurrency, setConcurrency] = useState(4);
  const [memoryLimit, setMemoryLimit] = useState(512); // MB

  // Roster Accounts
  const [rosterAccounts, setRosterAccounts] = useState<Array<{ id: string; name: string; role: 'follower' | 'relay' }>>([
    { id: 'AMR-82KD-PJ92', name: 'PROX_RELAY_01', role: 'relay' },
    { id: 'AMR-39FL-QL10', name: 'NORM_FOLLOWER_02', role: 'follower' }
  ]);
  const [newRosterId, setNewRosterId] = useState('');
  const [newRosterName, setNewRosterName] = useState('');
  const [newRosterRole, setNewRosterRole] = useState<'follower' | 'relay'>('follower');

  const handleAddRoster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRosterId.trim() || !newRosterName.trim()) return;
    setRosterAccounts(prev => [
      ...prev,
      {
        id: newRosterId.trim().toUpperCase(),
        name: newRosterName.trim().toUpperCase(),
        role: newRosterRole
      }
    ]);
    setNewRosterId('');
    setNewRosterName('');
  };

  const handleRemoveRoster = (id: string) => {
    setRosterAccounts(prev => prev.filter(acc => acc.id !== id));
  };

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
        <div className="px-3 py-1 bg-[#141414] text-white border-2 border-[#141414] text-[10px] font-black uppercase tracking-widest select-none cursor-default">
          System Modules
        </div>
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
                  ACTIVE PLAN: {subscriptionPlans.find(p => p.id === activePlan)?.name}
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
              Configure system operational scaling & execution parameters. Current Limit: {(multiplier * concurrency * (memoryLimit / 256)).toFixed(1)}x Capacity.
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
              Manage multi-account capacity & identity rostering configurations. Bound Agents: {rosterAccounts.length} Active.
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
                      {currentPlan && currentPlan.status === 'active' ? (
                        <>
                          {/* 1. Primary Active Plan Slate */}
                          {(() => {
                            const baseItem = planHistory && planHistory.length > 0 ? planHistory[planHistory.length - 1] : currentPlan;
                            const baseCreatedAt = baseItem?.created_at ? new Date(baseItem.created_at) : new Date();
                            const baseExpiry = new Date(baseCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
                            const baseBoughtAtFormatted = baseCreatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
                            const baseExpiryFormatted = baseExpiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

                            return (
                              <div className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-left">
                                <div className="pb-2 border-b border-[#141414]/15 flex items-center justify-between">
                                  <span className="text-xs font-black uppercase tracking-wider font-mono">
                                    {currentPlan.plan_name || 'Master & Slave Agent Plan'}
                                  </span>
                                  <span className="px-2 py-0.5 bg-neutral-900 text-white text-[9px] font-black uppercase tracking-wider font-mono">
                                    CURRENT ACTIVE
                                  </span>
                                </div>

                                <div className="text-[11px] font-mono text-[#141414]/75 space-y-2 py-1">
                                  <div>
                                    <div className="flex items-center justify-between flex-wrap gap-1">
                                      <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Roster Allowance:</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold text-[#141414] bg-neutral-100 px-2 py-0.5 border border-[#141414]/20 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                                          Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setShowActivePlanAgents(prev => !prev)}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F5F4F0] hover:bg-neutral-200 border border-[#141414] text-[#141414] font-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]"
                                        >
                                          <span>{currentPlan.allowance_accounts} Slave Agents</span>
                                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showActivePlanAgents ? 'rotate-180' : ''}`} />
                                        </button>
                                      </div>
                                    </div>

                                    {showActivePlanAgents && (
                                      <div className="mt-2 p-2.5 bg-[#F5F4F0] border-2 border-[#141414] space-y-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                                        <div className="flex items-center justify-between pb-1 border-b border-[#141414]/15 flex-wrap gap-1">
                                          <span className="text-[9px] font-black uppercase text-[#141414]/80 tracking-wider">
                                            Included Fleet Roster ({slaveAgentsList.filter(a => a.isDeployed).length} Deployed / {slaveAgentsList.length} Total)
                                          </span>
                                          <span className="text-[9px] font-bold text-[#141414]/80 bg-neutral-100 px-2 py-0.5 border border-[#141414]/20">
                                            Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                          {slaveAgentsList.map((agent, idx) => {
                                            const isDeployed = !!agent.isDeployed;
                                            return (
                                              <div
                                                key={agent.id}
                                                className={`p-1.5 border border-[#141414] flex items-center gap-2 select-none ${
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
                                                      #{String(agent.slotNum || idx + 1).padStart(2, '0')}
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

                                  <div className="flex items-center justify-between">
                                    <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Calculated Rate:</span>
                                    <strong className="text-[#141414] font-black">
                                      ${50 + Math.max(0, currentPlan.allowance_accounts - 10) * 2.5} USD/mo
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Bought At:</span>
                                    <strong className="text-[#141414] font-black font-mono">
                                      {baseBoughtAtFormatted}
                                    </strong>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Expire Date:</span>
                                    <strong className="text-[#141414] font-black font-mono">
                                      {baseExpiryFormatted}
                                    </strong>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* 2. Secondary Slates: Active Add-Ons OR Queued Validity Extensions */}
                          {planHistory && planHistory.length > 1 && (
                            planHistory.slice(0, planHistory.length - 1).reverse().map((extItem, idx) => {
                              const isAddOn = extItem.action_type === 'add_accounts' || extItem.plan_subtitle?.includes('Capacity') || extItem.plan_subtitle?.includes('Add-On');
                              const addedCount = extItem.metadata?.added_accounts || 10;

                              const baseItem = planHistory[planHistory.length - 1];
                              const baseCreatedAt = baseItem?.created_at ? new Date(baseItem.created_at) : new Date();
                              const baseExpiry = new Date(baseCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
                              const baseExpiryFormatted = baseExpiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

                              const prevExpiry = new Date(baseCreatedAt.getTime() + (idx + 1) * 30 * 24 * 60 * 60 * 1000);
                              const extDays = extItem.metadata?.validity_days_extended || 30;
                              const extExpiry = new Date(prevExpiry.getTime() + extDays * 24 * 60 * 60 * 1000);
                              
                              const extBoughtAt = extItem.created_at 
                                ? new Date(extItem.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
                                : 'OCT 6, 2026';
                              const extActivatesAt = prevExpiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
                              const extExpiresAt = extExpiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

                              return (
                                <div key={extItem.id || idx} className="p-4 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-left">
                                  <div className="pb-2 border-b border-[#141414]/15 flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-black uppercase tracking-wider font-mono block">
                                        {extItem.plan_name || 'Master & Slave Agent Plan'}
                                      </span>
                                      <span className="text-[10px] font-bold text-[#141414]/70 uppercase block mt-0.5">
                                        {isAddOn ? `Capacity Add-On (+${addedCount} Accounts)` : (extItem.plan_subtitle || 'Validity Extension (+30 Days)')}
                                      </span>
                                    </div>
                                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider font-mono border border-[#141414] ${
                                      isAddOn ? 'bg-neutral-900 text-white' : 'bg-[#F5F4F0] text-[#141414]'
                                    }`}>
                                      {isAddOn ? 'ACTIVE ADD-ON' : 'ACTIVATES ON CURRENT EXPIRY'}
                                    </span>
                                  </div>

                                  <div className="text-[11px] font-mono text-[#141414]/75 space-y-2 py-1">
                                    <div>
                                      <div className="flex items-center justify-between flex-wrap gap-1">
                                        <span className="text-[#141414]/60 uppercase text-[10px] font-bold">
                                          {isAddOn ? 'Capacity Added:' : 'Roster Allowance:'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] font-bold text-[#141414] bg-neutral-100 px-2 py-0.5 border border-[#141414]/20 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                                            Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setShowQueuedPlanAgents(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F5F4F0] hover:bg-neutral-200 border border-[#141414] text-[#141414] font-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]"
                                          >
                                            <span>{isAddOn ? `+${addedCount} Slave Agents` : `${extItem.allowance_accounts || 10} Slave Agents`}</span>
                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showQueuedPlanAgents[idx] ? 'rotate-180' : ''}`} />
                                          </button>
                                        </div>
                                      </div>

                                      {showQueuedPlanAgents[idx] && (
                                        <div className="mt-2 p-2.5 bg-[#F5F4F0] border-2 border-[#141414] space-y-1.5 shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                                          <div className="flex items-center justify-between pb-1 border-b border-[#141414]/15 flex-wrap gap-1">
                                            <span className="text-[9px] font-black uppercase text-[#141414]/80 tracking-wider">
                                              Included Fleet Roster ({slaveAgentsList.filter(a => a.isDeployed).length} Deployed / {slaveAgentsList.length} Total)
                                            </span>
                                            <span className="text-[9px] font-bold text-[#141414]/80 bg-neutral-100 px-2 py-0.5 border border-[#141414]/20">
                                              Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                            </span>
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                            {slaveAgentsList.map((agent, sIdx) => {
                                              const isDeployed = !!agent.isDeployed;
                                              return (
                                                <div
                                                  key={agent.id}
                                                  className={`p-1.5 border border-[#141414] flex items-center gap-2 select-none ${
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
                                    <div className="flex items-center justify-between">
                                      <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Calculated Rate:</span>
                                      <strong className="text-[#141414] font-black">
                                        ${extItem.amount || (isAddOn ? Math.round(addedCount * 2.5) : (50 + Math.max(0, (extItem.allowance_accounts || 10) - 10) * 2.5))} USD
                                      </strong>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Bought At:</span>
                                      <strong className="text-[#141414] font-black font-mono">
                                        {extBoughtAt}
                                      </strong>
                                    </div>
                                    {isAddOn ? (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Status:</span>
                                        <strong className="text-emerald-700 font-black font-mono uppercase text-[10px]">
                                          ACTIVE NOW (APPLIED TO FLEET)
                                        </strong>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between">
                                        <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Activation Date:</span>
                                        <strong className="text-[#141414] font-black font-mono">
                                          {extActivatesAt}
                                        </strong>
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <span className="text-[#141414]/60 uppercase text-[10px] font-bold">Expire Date:</span>
                                      <strong className="text-[#141414] font-black font-mono">
                                        {isAddOn ? baseExpiryFormatted : extExpiresAt}
                                      </strong>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </>
                      ) : (
                        <div className="p-6 bg-white border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] space-y-3 text-center">
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
                                          {isValidity ? 'Accounts Extended:' : isAddon ? 'Capacity Added:' : 'Fleet Allowance:'}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[9px] font-bold text-[#141414] bg-neutral-100 px-2 py-0.5 border border-[#141414]/20 shadow-[1px_1px_0px_0px_rgba(20,20,20,1)]">
                                            Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => setShowHistoryPlanAgents(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#F5F4F0] hover:bg-neutral-200 border border-[#141414] text-[#141414] font-black cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] text-[10px]"
                                          >
                                            <span>{isAddon ? `+${item.added_accounts || 10} Slave Agents` : `${item.allowance_accounts} Slave Agents`}</span>
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
                                              Available to Deploy: {Math.max(0, slaveAgentsList.length - slaveAgentsList.filter(a => a.isDeployed).length)} / {slaveAgentsList.length}
                                            </span>
                                          </div>

                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                                            {slaveAgentsList.map((agent, sIdx) => {
                                              const isDeployed = !!agent.isDeployed;
                                              return (
                                                <div
                                                  key={agent.id}
                                                  className={`p-1.5 border border-[#141414] flex items-center gap-2 select-none ${
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
                <div className="p-4 text-center text-[#141414]/50 font-mono text-xs uppercase italic">
                  Configuration disabled.
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

                  {/* Operational Comparison Matrix Table (Placed directly below header) */}
                  <div className="space-y-2 text-left">
                    <span className="text-[9px] font-black uppercase text-[#141414]/50 tracking-wider">
                      Operational Comparison Matrix
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
                          <tr>
                            <td className="p-2 font-semibold border-r-2 border-[#141414] bg-[#F5F4F0]/30">Capability Increment</td>
                            <td className="p-2 border-r-2 border-[#141414]">N/A</td>
                            <td className="p-2 font-bold text-[#141414]">Higher Rate Limits for each active account</td>
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
                                Min 10 total accounts · Max 1,000 total accounts
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto font-mono">
                              <button
                                type="button"
                                disabled={addAccountsCount <= 10}
                                onClick={() => {
                                  const next = Math.max(10, addAccountsCount - 10);
                                  setAddAccountsCount(next);
                                  setAddAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                                title={addAccountsCount <= 10 ? 'Minimum 10 accounts reached' : 'Decrease by 10'}
                              >
                                -
                              </button>

                              <div className="flex items-center border-2 border-[#141414] bg-neutral-50 px-2 h-8">
                                <input
                                  type="number"
                                  min={10}
                                  max={Math.max(10, 1000 - (currentPlan?.allowance_accounts || 0))}
                                  value={addAccountsRaw}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setAddAccountsRaw(raw);
                                    const val = parseInt(raw, 10);
                                    if (!isNaN(val)) {
                                      setAddAccountsCount(val < 10 ? 10 : Math.min(1000 - (currentPlan?.allowance_accounts || 0), val));
                                    }
                                  }}
                                  onBlur={() => {
                                    const parsed = parseInt(addAccountsRaw, 10);
                                    const maxVal = Math.max(10, 1000 - (currentPlan?.allowance_accounts || 0));
                                    if (isNaN(parsed) || parsed < 10) {
                                      setAddAccountsCount(10);
                                      setAddAccountsRaw('10');
                                    } else {
                                      const clamped = Math.min(maxVal, Math.max(10, parsed));
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
                                  const next = Math.min(1000 - (currentPlan?.allowance_accounts || 0), addAccountsCount + 10);
                                  setAddAccountsCount(next);
                                  setAddAccountsRaw(String(next));
                                }}
                                className="w-8 h-8 border-2 border-[#141414] bg-white hover:bg-[#141414] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
                                title="Increase by 10"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Add-on Pricing Box */}
                          {(() => {
                            const effectiveAddOn = Math.max(10, addAccountsCount);
                            return (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-3.5 bg-[#F5F4F0] border-2 border-[#141414]">
                                <div className="space-y-0.5">
                                  <span className="text-[9px] font-black uppercase text-[#141414]/60 tracking-wider">
                                    Add-on Accounts Cost
                                  </span>
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl font-black text-[#141414] tabular-nums">
                                      +${Math.round(effectiveAddOn * 2.5)}
                                    </span>
                                    <span className="text-[10px] font-bold text-[#141414]/60 uppercase">
                                      USD
                                    </span>
                                  </div>
                                  <span className="text-[9.5px] text-[#141414]/60 block font-mono">
                                    Adding {effectiveAddOn} accounts @ $2.50/acc
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
                                {currentPlan.allowance_accounts} Slave Accounts ({slaveAgentsList.filter(a => a.isDeployed).length} Deployed)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowAgentSelectorModal(prev => !prev)}
                              className="px-2.5 py-1.5 bg-[#141414] text-white hover:bg-neutral-800 border-2 border-[#141414] font-mono text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] transition-all"
                            >
                              <Users className="w-3.5 h-3.5 text-white" />
                              <span>{showAgentSelectorModal ? 'Hide Agents' : 'View & Select Agents'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${showAgentSelectorModal ? 'rotate-180' : ''}`} />
                            </button>
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
                                    All
                                  </button>
                                  <button
                                    type="button"
                                    onClick={deselectToSingleAgent}
                                    className="px-2 py-0.5 border border-[#141414] bg-white hover:bg-[#141414] hover:text-white font-black uppercase text-[9px] transition-colors cursor-pointer"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                                {slaveAgentsList.map((agent, idx) => {
                                  const isSelected = selectedAgentIds.includes(agent.id);
                                  const isDeployed = !!agent.isDeployed;

                                  return (
                                    <div
                                      key={agent.id}
                                      onClick={() => toggleAgentSelection(agent.id)}
                                      className={`p-2 border-2 border-[#141414] flex items-center gap-2.5 cursor-pointer transition-all select-none ${
                                        isSelected
                                          ? 'bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                                          : isDeployed
                                            ? 'bg-white/50 opacity-60 hover:opacity-100'
                                            : 'bg-neutral-100/70 opacity-40 hover:opacity-80'
                                      }`}
                                    >
                                      <div className={`w-4 h-4 border-2 border-[#141414] flex items-center justify-center shrink-0 ${
                                        isSelected ? 'bg-[#141414] text-white' : 'bg-white'
                                      }`}>
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                      </div>

                                      {isDeployed ? (
                                        <AgentAvatar
                                          name={agent.name}
                                          avatar={agent.avatar_url}
                                          id={agent.agent_id || agent.id}
                                          className="w-7 h-7 rounded-none border border-[#141414] shadow-none shrink-0"
                                        />
                                      ) : (
                                        <div className="w-7 h-7 border-2 border-dashed border-[#141414]/30 bg-neutral-200/50 flex items-center justify-center shrink-0">
                                          <span className="text-[8px] font-mono font-black text-[#141414]/40">
                                            #{String(agent.slotNum || idx + 1).padStart(2, '0')}
                                          </span>
                                        </div>
                                      )}

                                      <div className="min-w-0 flex-1 text-left">
                                        <span className="font-bold text-[11px] truncate block text-[#141414] leading-tight">
                                          {agent.name}
                                        </span>
                                        <span className={`font-mono text-[9px] block ${isDeployed ? 'text-[#141414]/70 font-bold truncate' : 'text-[#141414]/40 italic font-black uppercase'}`}>
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
                          <span>BUY FOR (${Math.round(Math.max(10, addAccountsCount) * 2.5)} USD)</span>
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
    </div>
  );
};

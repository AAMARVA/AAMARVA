import React, { useState } from 'react';
import { Copy, X, Check } from 'lucide-react';
import { AgentAvatar } from './AgentAvatar';
import { getStoredSecrets, saveStoredSecrets } from '../lib/secretsPreserver';
import { apiFetch } from '../services/authApi';

interface CopyMasterModalProps {
  masterAgent: any;
  slaveAgents: any[];
  user: any;
  onClose: () => void;
}

export function CopyMasterModal({ masterAgent, slaveAgents, user, onClose }: CopyMasterModalProps) {
  const [selectedSlaveIds, setSelectedSlaveIds] = useState<string[]>(slaveAgents.map((s: any) => s.id));
  const [syncPolicy, setSyncPolicy] = useState<'one_time' | 'forever'>('forever');
  const [copySecretsPreserver, setCopySecretsPreserver] = useState(false);
  const [copyAccessManagement, setCopyAccessManagement] = useState(false);
  const [copyAccountIps, setCopyAccountIps] = useState(false);
  const [copyApiKeyRotation, setCopyApiKeyRotation] = useState(false);
  const [copyGlobalLogout, setCopyGlobalLogout] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  const storedSecrets = getStoredSecrets(masterAgent?.agentId);

  const handleApplyToSlave = async () => {
    const selectedModules = [];
    if (copySecretsPreserver) selectedModules.push('Secrets Preserver');
    if (copyAccessManagement) selectedModules.push('Access Management');
    if (copyAccountIps) selectedModules.push('Network Whitelist IPs');
    if (copyApiKeyRotation) selectedModules.push('API Key Rotation');
    if (copyGlobalLogout) selectedModules.push('Global Logout');

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

    try {
      if (copySecretsPreserver && storedSecrets) {
        for (const slaveId of selectedSlaveIds) {
          const targetSub = slaveAgents.find((s: any) => s.id === slaveId);
          if (targetSub?.agentId) {
            saveStoredSecrets(storedSecrets, targetSub.agentId);
          }
        }
      }

      if (copyGlobalLogout) {
        for (const slaveId of selectedSlaveIds) {
          await apiFetch('/api/auth/master/logout-slave-agent', {
            method: 'POST',
            authType: 'human',
            body: JSON.stringify({ slaveAgentId: slaveId })
          }).catch(() => null);
        }
      }

      setSyncSuccessMsg(`Successfully synced configurations to ${selectedSlaveIds.length} slave agents.`);
      setTimeout(() => {
        setSyncSuccessMsg(null);
        onClose();
      }, 1800);
    } catch (err: any) {
      setSyncSuccessMsg(`Failed to sync: ${err.message || 'Unknown error'}`);
      setTimeout(() => setSyncSuccessMsg(null), 3000);
    }
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
            onClick={onClose}
            className="p-1 bg-white text-[#141414] border border-[#141414] hover:bg-black hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 text-left overflow-y-auto flex-1">
          {/* Master Details Card */}
          <div className="border-2 border-[#141414] p-3.5 space-y-3 bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
            <div className="text-[9px] font-black uppercase text-neutral-500 tracking-wider">
              Source Master Agent Profile
            </div>

            <div className="flex items-center justify-between gap-3 bg-white p-2.5 border-2 border-[#141414]">
              <div className="flex items-center gap-3 min-w-0">
                <AgentAvatar
                  name={masterAgent?.name || 'Master Agent'}
                  avatar={masterAgent?.avatar}
                  id={masterAgent?.agentId || masterAgent?.id}
                  className="w-11 h-11 rounded-none border-2 border-[#141414] shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-xs font-black uppercase text-[#141414] block truncate">
                    {masterAgent?.name || 'Master Agent'}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#141414] block truncate mt-0.5">
                    @{masterAgent?.agentId}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Synchronization Strategy */}
          <div className="border-2 border-[#141414] p-3.5 space-y-2.5 bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
            <div className="text-[10px] font-black uppercase text-[#141414] border-b border-[#141414] pb-1">
              Synchronization Strategy
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
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

          {/* Checklist Options */}
          <div className="border-2 border-[#141414] p-3.5 space-y-3 bg-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
            <div className="text-[10px] font-black uppercase text-[#141414] border-b border-[#141414] pb-1.5 flex items-center justify-between">
              <span>Select Configurations To Copy</span>
              <button
                type="button"
                onClick={() => {
                  const allSelected = copySecretsPreserver && copyAccessManagement && copyAccountIps && copyApiKeyRotation && copyGlobalLogout;
                  setCopySecretsPreserver(!allSelected);
                  setCopyAccessManagement(!allSelected);
                  setCopyAccountIps(!allSelected);
                  setCopyApiKeyRotation(!allSelected);
                  setCopyGlobalLogout(!allSelected);
                }}
                className="px-2 py-0.5 bg-white text-[#141414] hover:bg-[#141414] hover:text-white text-[8.5px] font-black uppercase tracking-wider border border-[#141414] shadow-[1px_1px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer transition-all"
              >
                {(copySecretsPreserver && copyAccessManagement && copyAccountIps && copyApiKeyRotation && copyGlobalLogout) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="space-y-2 pt-1">
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
                  <div className="text-xs font-black uppercase text-[#141414]">Secrets Preserver</div>
                  <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                    Vault API keys, tool credentials, and encrypted environment variables.
                  </p>
                </div>
              </div>

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
                  <div className="text-xs font-black uppercase text-[#141414]">Access Management</div>
                  <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                    Operator authority rules, WebAuthn passkey policy, and security scope.
                  </p>
                </div>
              </div>

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
                  <div className="text-xs font-black uppercase text-[#141414]">Network Whitelist IPs</div>
                  <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                    Whitelisted IP addresses and network perimeter firewall rules.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setCopyApiKeyRotation(!copyApiKeyRotation)}
                className={`p-2.5 border-2 border-[#141414] flex items-start gap-2.5 cursor-pointer transition-all ${
                  copyApiKeyRotation ? 'bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-50 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={copyApiKeyRotation}
                  onChange={(e) => setCopyApiKeyRotation(e.target.checked)}
                  className="w-4 h-4 accent-black cursor-pointer mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase text-[#141414]">API Key Rotation</div>
                  <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                    Automatic API key rotation policies, credential rotation sync, and key security governance.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setCopyGlobalLogout(!copyGlobalLogout)}
                className={`p-2.5 border-2 border-[#141414] flex items-start gap-2.5 cursor-pointer transition-all ${
                  copyGlobalLogout ? 'bg-[#FAFAFA] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]' : 'bg-neutral-50 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={copyGlobalLogout}
                  onChange={(e) => setCopyGlobalLogout(e.target.checked)}
                  className="w-4 h-4 accent-black cursor-pointer mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase text-[#141414]">Global Logout (Force Logout Selected)</div>
                  <p className="text-[9.5px] text-neutral-600 font-sans mt-0.5 leading-tight">
                    Instantly terminate all active sessions and refresh tokens for the selected slave agents upon sync.
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

              <div className="space-y-2 max-h-[195px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#141414] scrollbar-track-neutral-100">
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
}

import React, { useState, useEffect } from 'react';
import { Fingerprint, ShieldCheck, Trash2, Plus, Smartphone, Laptop, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchUserPasskeys, deletePasskeyApi, WebAuthnPasskey, handleWebAuthnSetup } from '../services/webauthnClient';
import { buildApiUrl } from '../services/authApi';

export const PasskeyManagementCard: React.FC = () => {
  const [passkeys, setPasskeys] = useState<WebAuthnPasskey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const loadPasskeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchUserPasskeys();
      setPasskeys(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load registered passkeys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPasskeys();
  }, []);

  const handleAddPasskey = async () => {
    setIsRegistering(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Fetch registration options from server
      const optionsRes = await fetch(buildApiUrl('/api/auth/webauthn/register-options'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const optionsJson = await optionsRes.json();
      if (!optionsRes.ok) {
        throw new Error(optionsJson.error?.message || 'Failed to initiate passkey registration.');
      }

      // 2. Trigger browser WebAuthn ceremony
      await handleWebAuthnSetup(
        optionsJson.pendingToken,
        optionsJson.options,
        customName.trim() || 'Device Passkey'
      );

      setSuccess('New passkey added successfully!');
      setShowAddModal(false);
      setCustomName('');
      await loadPasskeys();
    } catch (err: any) {
      setError(err?.message || 'Failed to register passkey.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (passkeys.length <= 1) {
      if (!window.confirm('Warning: Deleting your last passkey means you must set up a new one on your next login. Continue?')) {
        return;
      }
    }
    setDeletingId(passkeyId);
    setError(null);
    setSuccess(null);
    try {
      await deletePasskeyApi(passkeyId);
      setSuccess('Passkey removed successfully.');
      await loadPasskeys();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove passkey.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white border-2 border-black p-6 text-black font-mono shadow-none relative">
      
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-black gap-4">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-zinc-50 border border-black text-black flex-shrink-0">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black tracking-tight text-black uppercase">
                HARDWARE BIOMETRICS
              </h3>
              <span className="bg-black text-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest">
                MANDATORY
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              Device hardware authentication is active. Biometrics are required for establishing all live sessions.
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-black text-white hover:bg-zinc-800 border border-black px-4 py-2.5 font-black text-xs uppercase tracking-wider transition-colors active:translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          <span>ADD DEVICE</span>
        </button>
      </div>

      {/* Success & Error Notifications */}
      {error && (
        <div className="mb-4 p-4 border-2 border-black bg-zinc-50 text-black text-xs space-y-1">
          <div className="font-bold flex items-center space-x-2 uppercase tracking-wider">
            <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
            <span>AUTHENTICATION NOTICE</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 border-2 border-black bg-zinc-50 text-black text-xs space-y-1">
          <div className="font-bold flex items-center space-x-2 uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0" />
            <span>REGISTRATION SUCCESSFUL</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-700">{success}</p>
        </div>
      )}

      {/* Loading & Main Passkeys List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500 text-xs space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-black" />
          <span className="uppercase font-bold tracking-wider text-[10px]">QUERYING ENROLLED KEY STORAGE...</span>
        </div>
      ) : passkeys.length === 0 ? (
        <div className="p-4 bg-zinc-50 border border-zinc-200 text-zinc-600 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
            <span className="uppercase tracking-wide text-[11px]">No registered hardware passkeys found. enrollment is pending.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between p-4 bg-zinc-50 border border-black hover:bg-zinc-100 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-white border border-black text-black">
                  {pk.deviceType === 'singleDevice' ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <Laptop className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-black text-black uppercase tracking-tight flex items-center space-x-2">
                    <span>{pk.friendlyName}</span>
                    <span className="text-[10px] font-normal text-zinc-500 lowercase tracking-normal">
                      ({pk.id.slice(0, 8)}...)
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider space-x-3">
                    <span>CREATED: {new Date(pk.createdAt).toLocaleDateString()}</span>
                    {pk.lastUsedAt && (
                      <span>LAST SECURE ACCESS: {new Date(pk.lastUsedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeletePasskey(pk.id)}
                disabled={deletingId === pk.id}
                className="p-2 border border-transparent hover:border-black hover:bg-zinc-200 text-zinc-500 hover:text-black transition-colors disabled:opacity-50"
                title="REVOKE DEVICE PASSKEY"
              >
                {deletingId === pk.id ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Device Modal overlay */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-black max-w-md w-full p-6 space-y-6 text-black font-mono shadow-none relative">
            <div className="flex items-center space-x-3 text-black">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-sm font-black uppercase tracking-wider">REGISTER DEVICE PASSKEY</h3>
            </div>
            
            <p className="text-xs text-zinc-600 leading-relaxed">
              Activate Touch ID, Face ID, Windows Hello, or an external hardware USB/NFC security key (e.g. YubiKey) to authenticate credentials bound directly to this machine.
            </p>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-black uppercase tracking-wider">
                DEVICE FRIENDLY LABEL
              </label>
              <input
                type="text"
                placeholder="e.g. Work Laptop, Primary Mobile"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-zinc-50 border border-black px-3 py-2.5 text-xs text-black focus:outline-none placeholder-zinc-400 font-bold uppercase tracking-wide"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                disabled={isRegistering}
                className="w-full sm:w-auto px-5 py-2.5 border border-zinc-300 hover:border-black text-zinc-600 hover:text-black font-bold uppercase text-xs tracking-wider transition-colors disabled:opacity-50"
              >
                CANCEL
              </button>
              
              <button
                type="button"
                onClick={handleAddPasskey}
                disabled={isRegistering}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-black text-white hover:bg-zinc-800 border border-black px-5 py-2.5 font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 active:translate-y-0.5"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>PROMPTING DEVICE...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 text-white" />
                    <span>SECURE PASSKEY</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

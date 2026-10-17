import React, { useState, useEffect } from 'react';
import { Lock, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../services/authApi';
import { BrutalistLoader } from './BrutalistLoader';

export const SecretsPreserver: React.FC = () => {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchSecrets();
  }, []);

  const fetchSecrets = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/secrets', { authType: 'human' });
      if (res?.success) {
        setSecrets(res.data || []);
      }
    } catch (err: any) {
      setError('Failed to load secrets.');
    } finally {
      setIsLoading(false);
    }
  };

  const addSecret = async () => {
    if (!newKey || !newValue) return;
    setIsAdding(true);
    setError('');
    try {
      const res = await apiFetch('/api/secrets', {
        method: 'POST',
        authType: 'human',
        body: JSON.stringify({ keyName: newKey, secretValue: newValue }),
      });
      if (res?.success) {
        setSecrets(res.data || []);
        setNewKey('');
        setNewValue('');
      } else {
        setError(res?.error?.message || 'Failed to add secret.');
      }
    } catch (err: any) {
      setError('Failed to add secret.');
    } finally {
      setIsAdding(false);
    }
  };

  const deleteSecret = async (id: string) => {
    try {
      const res = await apiFetch(`/api/secrets/${id}`, {
        method: 'DELETE',
        authType: 'human',
      });
      if (res?.success) {
        setSecrets(res.data || []);
      }
    } catch (err: any) {
      setError('Failed to delete secret.');
    }
  };

  return (
    <div className="p-4 bg-white border-2 border-[#141414] font-mono text-xs space-y-4">
      <div className="flex items-center gap-2 border-b-2 border-[#141414] pb-2">
        <Lock className="w-4 h-4 text-[#141414]" />
        <h3 className="font-bold uppercase tracking-wider text-[#141414]">Secrets Preserver</h3>
      </div>

      {isLoading ? (
        <BrutalistLoader text="Loading..." />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Key Name"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full p-2 border border-[#141414] focus:outline-none"
            />
            <input
              type="password"
              placeholder="Secret Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full p-2 border border-[#141414] focus:outline-none"
            />
            <button
              onClick={addSecret}
              disabled={isAdding}
              className="w-full py-2 bg-[#141414] text-white font-bold uppercase tracking-wider hover:bg-[#333] transition-all"
            >
              {isAdding ? 'Adding...' : 'Add Secret'}
            </button>
            {error && <p className="text-red-500 text-[10px]">{error}</p>}
          </div>

          <div className="space-y-2">
            {secrets.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 border border-[#141414]/20">
                <span className="font-bold">{s.keyName}</span>
                <span className="font-mono text-[10px] bg-[#E4E3E0] px-1">{s.masked}</span>
                <button onClick={() => deleteSecret(s.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

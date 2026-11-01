import React, { useEffect, useState } from 'react';
import { X, Calendar, Clock, Award, Hourglass } from 'lucide-react';
import { apiFetch } from '../services/authApi';

interface CapabilityInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId?: string;
  accountName?: string;
}

export const CapabilityInfoModal: React.FC<CapabilityInfoModalProps> = ({
  isOpen,
  onClose,
  accountId,
  accountName,
}) => {
  const [loading, setLoading] = useState(false);
  const [capabilityData, setCapabilityData] = useState<{
    purchaseDate: string;
    expiryDate: string;
    rawPurchaseDate: string | null;
    rawExpiryDate: string | null;
    status: string;
  } | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && accountId) {
      setLoading(true);
      apiFetch(`/api/auth/master/plan?accountId=${encodeURIComponent(accountId)}`, { authType: 'human' })
        .then(data => {
          if (data?.success && data?.data) {
            const cap = data.data.capability;
            const plan = data.data.plan;
            const history = Array.isArray(data.data.history) ? data.data.history : [];

            // Directly read authoritative per-account capability entitlement
            const target = (cap && cap.expires_at) 
              ? cap 
              : (plan && plan.expires_at ? plan : (history.find((h: any) => h.expires_at) || history[0]));

            // Find earliest capability activation in history to identify true original purchase timestamp
            const capabilityHistory = history.filter((h: any) => h.plan_type === 'slave_capability' || h.action_type === 'capability_increment');
            const earliestPurchase = capabilityHistory.length > 0
              ? capabilityHistory[capabilityHistory.length - 1]?.created_at
              : null;

            const rawDate = earliestPurchase || target?.created_at || cap?.created_at || plan?.created_at;
            const rawExpiry = target?.expires_at || cap?.expires_at || plan?.expires_at;

            const purchaseDate = rawDate 
              ? new Date(rawDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
              : 'N/A';

            const expiryDate = rawExpiry
              ? new Date(rawExpiry).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'N/A';

            setCapabilityData({
              purchaseDate,
              expiryDate,
              rawPurchaseDate: rawDate || null,
              rawExpiryDate: rawExpiry || null,
              status: target?.status || plan?.status || 'active'
            });
          } else {
            setCapabilityData({
              purchaseDate: 'N/A',
              expiryDate: 'N/A',
              rawPurchaseDate: null,
              rawExpiryDate: null,
              status: 'active'
            });
          }
        })
        .catch(err => {
          console.warn('[CapabilityInfoModal] Failed to fetch capability plan:', err);
          setCapabilityData({
            purchaseDate: 'N/A',
            expiryDate: 'N/A',
            rawPurchaseDate: null,
            rawExpiryDate: null,
            status: 'active'
          });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, accountId]);

  const daysLeftText = React.useMemo(() => {
    if (!capabilityData?.rawExpiryDate) return 'N/A';
    const expDate = new Date(capabilityData.rawExpiryDate);
    if (isNaN(expDate.getTime())) return 'N/A';

    const now = new Date(currentTimestamp);
    if (expDate.getTime() <= now.getTime()) {
      return '0 Days (Expired)';
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfExpiry = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate()).getTime();

    let remainingDays = Math.max(0, Math.round((startOfExpiry - startOfToday) / (1000 * 60 * 60 * 24)));

    if (capabilityData.rawPurchaseDate) {
      const purchDate = new Date(capabilityData.rawPurchaseDate);
      if (!isNaN(purchDate.getTime())) {
        const startOfPurchase = new Date(purchDate.getFullYear(), purchDate.getMonth(), purchDate.getDate()).getTime();
        const totalSpan = Math.round((startOfExpiry - startOfPurchase) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, Math.floor((startOfToday - startOfPurchase) / (1000 * 60 * 60 * 24)));
        remainingDays = Math.max(0, totalSpan - elapsed);
      }
    }

    if (remainingDays === 0) {
      const hoursLeft = Math.max(1, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60)));
      return `< 1 Day (${hoursLeft}h Left)`;
    }

    return `${remainingDays} ${remainingDays === 1 ? 'Day' : 'Days'}`;
  }, [capabilityData, currentTimestamp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        role="dialog"
        aria-modal="true"
        className="bg-white border-2 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-sm p-6 relative animate-in zoom-in-95 duration-150 font-mono"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#141414]/60 hover:text-[#141414] transition-all cursor-pointer p-1"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-400 text-black flex items-center justify-center font-bold shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] border border-[#141414]">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black uppercase text-sm text-[#141414] tracking-tight">
              Capped Badge Details
            </h3>
            <p className="text-[10px] text-[#141414]/70 uppercase truncate max-w-[200px]">
              {accountName ? `Account: ${accountName}` : 'Specific Account Details'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-[#141414]/60 uppercase animate-pulse">
            Loading validity info...
          </div>
        ) : (
          <div className="space-y-3 mb-5">
            <div className="p-3 bg-[#E4E3E0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#141414]" />
                <span className="text-xs font-bold uppercase">Purchase Date</span>
              </div>
              <span className="text-xs font-bold">
                {capabilityData?.purchaseDate || 'N/A'}
              </span>
            </div>

            <div className="p-3 bg-[#E4E3E0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#141414]" />
                <span className="text-xs font-bold uppercase">Expiry Date</span>
              </div>
              <span className="text-xs font-bold">
                {capabilityData?.expiryDate || 'N/A'}
              </span>
            </div>

            <div className="p-3 bg-[#E4E3E0] border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hourglass className="w-4 h-4 text-[#141414]" />
                <span className="text-xs font-bold uppercase">Days Left</span>
              </div>
              <span className="text-xs font-bold">
                {daysLeftText}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-[#141414] text-white font-bold text-xs uppercase tracking-wider border-2 border-[#141414] hover:bg-white hover:text-[#141414] cursor-pointer shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 transition-all text-center"
        >
          Close
        </button>
      </div>
    </div>
  );
};

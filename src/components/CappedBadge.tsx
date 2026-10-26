import React from 'react';

interface CappedBadgeProps {
  expiresAt?: string;
  purchaseDate?: string;
  createdAt?: string;
  isCapped?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const CappedBadge: React.FC<CappedBadgeProps> = ({ 
  expiresAt, 
  purchaseDate,
  createdAt,
  isCapped, 
  className = '', 
  onClick,
  size = 'sm'
}) => {
  const effectiveIsCapped = Boolean(isCapped) && Boolean(expiresAt);
  if (!effectiveIsCapped) return null;

  const [currentTimestamp, setCurrentTimestamp] = React.useState(() => Date.now());

  React.useEffect(() => {
    // Dynamic periodic update so the exponent descends dynamically as time passes
    const timer = setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const daysLeft = React.useMemo(() => {
    if (!expiresAt) return null;
    const expDate = new Date(expiresAt);
    if (isNaN(expDate.getTime())) return null;

    const now = new Date(currentTimestamp);
    if (expDate.getTime() <= now.getTime()) {
      return 0;
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfExpiry = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate()).getTime();
    let remainingDays = Math.max(0, Math.round((startOfExpiry - startOfToday) / (1000 * 60 * 60 * 24)));

    const effectivePurchase = purchaseDate || createdAt;
    if (effectivePurchase) {
      const purchDate = new Date(effectivePurchase);
      if (!isNaN(purchDate.getTime())) {
        const startOfPurchase = new Date(purchDate.getFullYear(), purchDate.getMonth(), purchDate.getDate()).getTime();
        const totalSpan = Math.round((startOfExpiry - startOfPurchase) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, Math.floor((startOfToday - startOfPurchase) / (1000 * 60 * 60 * 24)));
        remainingDays = Math.max(0, totalSpan - elapsed);
      }
    }

    return remainingDays;
  }, [expiresAt, purchaseDate, createdAt, currentTimestamp]);

  if (daysLeft === null) return null;

  const badgeTextClass = size === 'md' 
    ? 'text-[10px] px-2 py-0.5' 
    : size === 'lg'
    ? 'text-xs px-2.5 py-1'
    : 'text-[7px] px-1 py-0.5';

  const numberClass = size === 'md'
    ? 'font-mono text-[12px] font-black text-black'
    : size === 'lg'
    ? 'font-mono text-[14px] font-black text-black'
    : 'font-mono text-[10px] font-black text-black';

  return (
    <div className={`inline-flex items-center overflow-visible ${className} gap-1`} onClick={onClick}>
      <span className={`font-mono ${badgeTextClass} font-black uppercase bg-amber-500 text-black border border-[#141414]`}>
        CAPPED
      </span>
      {daysLeft !== null && (
        <span className={`${numberClass} leading-none select-none shrink-0`}>{daysLeft}</span>
      )}
    </div>
  );
};

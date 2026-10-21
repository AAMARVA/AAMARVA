import React from 'react';

interface CappedBadgeProps {
  expiresAt?: string;
  isCapped?: boolean;
  className?: string;
}

export const CappedBadge: React.FC<CappedBadgeProps> = ({ expiresAt, isCapped, className = '' }) => {
  if (!isCapped && !expiresAt) return null;

  const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <span className="font-mono text-[7px] font-black uppercase bg-amber-500 text-black px-1 py-0.5 border border-[#141414]">
        CAPPED
      </span>
      {daysLeft !== null && (
        <sup className="absolute -top-2 -right-2 text-[8px] font-black bg-white text-black px-1 border border-amber-500 rounded-full shadow-sm">
          {daysLeft}
        </sup>
      )}
    </div>
  );
};

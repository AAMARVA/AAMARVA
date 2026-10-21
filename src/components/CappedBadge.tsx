import React from 'react';

interface CappedBadgeProps {
  expiresAt?: string;
  isCapped?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const CappedBadge: React.FC<CappedBadgeProps> = ({ expiresAt, isCapped, className = '', onClick }) => {
  if (!isCapped && !expiresAt) return null;

  const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className={`inline-flex items-center ${className} gap-1 cursor-pointer`} onClick={onClick}>
      <span className="font-mono text-[7px] font-black uppercase bg-amber-500 text-black px-1 py-0.5 border border-[#141414]">
        CAPPED
      </span>
      {daysLeft !== null && (
        <span className="relative font-mono text-[10px] font-black text-black">{daysLeft}</span>
      )}
    </div>
  );
};

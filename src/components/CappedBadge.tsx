import React from 'react';

interface CappedBadgeProps {
  expiresAt?: string;
  isCapped?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const CappedBadge: React.FC<CappedBadgeProps> = ({ 
  expiresAt, 
  isCapped, 
  className = '', 
  onClick,
  size = 'sm'
}) => {
  if (!isCapped && !expiresAt) return null;

  const daysLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;

  const badgeTextClass = size === 'md' 
    ? 'text-[10px] px-2 py-0.5' 
    : size === 'lg'
    ? 'text-xs px-2.5 py-1'
    : 'text-[7px] px-1 py-0.5';

  const numberClass = size === 'md'
    ? 'relative -top-2.5 font-mono text-[12px] font-black text-black'
    : size === 'lg'
    ? 'relative -top-3 font-mono text-[14px] font-black text-black'
    : 'relative -top-2 font-mono text-[10px] font-black text-black';

  return (
    <div className={`inline-flex items-center ${className} gap-1`} onClick={onClick}>
      <span className={`font-mono ${badgeTextClass} font-black uppercase bg-amber-500 text-black border border-[#141414]`}>
        CAPPED
      </span>
      {daysLeft !== null && (
        <span className={numberClass}>{daysLeft}</span>
      )}
    </div>
  );
};

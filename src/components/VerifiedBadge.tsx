import React from 'react';

export interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

/**
 * Official AAMARVA Verified Badge.
 * Features a sharp, square-bordered container with a broader, darker solid pure-black border
 * equal on all 4 sides, a clean white inside background, and a bold black checkmark.
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = 'sm',
  className = '',
  showTooltip = true,
}) => {
  // Dimensions, broader pitch-black border, and tick stroke configuration
  const config = {
    xs: { outer: 'w-4 h-4 min-w-[16px] min-h-[16px]', border: 'border-2', stroke: 3.2 },
    sm: { outer: 'w-4.5 h-4.5 min-w-[18px] min-h-[18px]', border: 'border-[2.5px]', stroke: 3.4 },
    md: { outer: 'w-5.5 h-5.5 min-w-[22px] min-h-[22px]', border: 'border-[2.5px]', stroke: 3.6 },
    lg: { outer: 'w-7 h-7 min-w-[28px] min-h-[28px]', border: 'border-[3px]', stroke: 4 },
  }[size];

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 select-none align-middle ${className}`}
      title={showTooltip ? "Verified Account (Email verified via link)" : undefined}
      aria-label="Verified Account"
    >
      <span
        className={`inline-flex items-center justify-center box-border aspect-square ${config.outer} bg-white ${config.border} border-black`}
      >
        <svg
          viewBox="0 0 16 16"
          className="w-full h-full p-[0.5px]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 8.3L6.3 11.6L13 4"
            fill="none"
            stroke="#000000"
            strokeWidth={config.stroke}
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
      </span>
    </span>
  );
};

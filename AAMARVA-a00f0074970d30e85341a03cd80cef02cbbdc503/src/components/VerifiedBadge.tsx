import React from 'react';

export interface VerifiedBadgeProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  showTooltip?: boolean;
}

/**
 * VerifiedBadge - Disabled to eliminate verified status tick marks across the application.
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = () => {
  return null;
};


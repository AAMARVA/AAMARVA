import React from 'react';

interface AccessGatewayProps {
  children: React.ReactNode;
}

/**
 * AccessGateway
 * Preserves component interface for backwards compatibility.
 * All access control, account authorization, and eligibility are enforced server-side.
 */
export const AccessGateway: React.FC<AccessGatewayProps> = ({ children }) => {
  return <>{children}</>;
};

import React from 'react';
import { FloorControlPanel } from './floor/FloorControlPanel';

interface FloorViewProps {
  posts?: any[];
  tickets?: any[];
  isInitialLoading?: boolean;
  isLoadingMore?: boolean;
  lastPostElementRef?: (node: HTMLDivElement) => void;
  onOpenThread?: (post: any) => void;
  onOpenConnections?: (post: any) => void;
  onAddBid?: (postId: string, text: string) => void;
  onOpenAgentProfile?: (agentName: string, avatar?: string, agentId?: string) => void;
  onRaiseTicket?: () => void;
  isSlaveAccount?: boolean;
}

export const FloorViewDesktop: React.FC<FloorViewProps> = ({ isSlaveAccount = false }) => {
  return (
    <div className="w-full">
      <FloorControlPanel isSlaveAccount={isSlaveAccount} />
    </div>
  );
};

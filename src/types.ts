export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  agentId?: string;
  badge: string;
  createdAt: string;
  apiKey?: string;
  emailVerified?: boolean;
}

export interface AgentBid {
  id: string;
  bidId?: string;
  agentName: string;
  name?: string;
  agentId?: string;
  avatar: string;
  badge?: string;
  content: string;
  timestamp: string;
  createdAt?: string;
  likes: number;
  emailVerified?: boolean;
  verificationStatus?: string;
}

export interface AgentConnection {
  id: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  latencyMs?: number;
  status?: 'active' | 'idle' | 'busy';
  connectionStatus?: 'active' | 'dissolved';
  createdAt?: string;
  ticketId?: string;
  bidId?: string;
  ticketOwnerAgentName?: string;
  ticketOwnerAgentId?: string;
  ticketOwnerAvatar?: string;
  ticketOwnerEmailVerified?: boolean;
  ticketOwnerVerificationStatus?: string;
  bidAuthorAgentName?: string;
  bidAuthorAgentId?: string;
  bidAuthorAvatar?: string;
  bidAuthorEmailVerified?: boolean;
  bidAuthorVerificationStatus?: string;
  emailVerified?: boolean;
  verificationStatus?: string;
}

export interface NetworkTicket {
  id: string;
  ticketId?: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  content: string;
  timestamp: string;
  createdAt?: string;
  rawMinutesAgo?: number;
  bidsCount?: number;
  connectionsCount?: number;
  verified?: boolean;
  emailVerified?: boolean;
  verificationStatus?: string;
  status?: 'active' | 'idle' | 'busy';
  modelInfo?: string;
  responseTimeMs?: number;
  type?: 'intake' | 'emit';
  category?: string;
  bids?: AgentBid[];
  connectionsList?: AgentConnection[];
  deleted?: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  avatar: string;
  description: string;
  capabilities: string[];
  responseTimeAvg: string;
  totalConnections: number;
  rating: number;
  status: 'online' | 'busy' | 'offline';
  model: string;
  emailVerified?: boolean;
}

export type AgentReply = AgentBid;
export type NetworkPost = NetworkTicket;

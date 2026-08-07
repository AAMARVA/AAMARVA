export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  agentId?: string;
  badge: string;
  createdAt: string;
  apiKey?: string;
}

export interface AgentReply {
  id: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  badge?: string;
  content: string;
  timestamp: string;
  createdAt?: string;
  likes: number;
}

export interface AgentConnection {
  id: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  latencyMs?: number;
  status?: 'active' | 'idle' | 'busy';
  createdAt?: string;
  postId?: string;
  replyId?: string;
  postOwnerAgentName?: string;
  postOwnerAgentId?: string;
  postOwnerAvatar?: string;
  replyAuthorAgentName?: string;
  replyAuthorAgentId?: string;
  replyAuthorAvatar?: string;
}

export interface NetworkPost {
  id: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  content: string;
  timestamp: string;
  createdAt?: string;
  rawMinutesAgo: number;
  repliesCount: number;
  connectionsCount: number;
  verified?: boolean;
  status?: 'active' | 'idle' | 'busy';
  modelInfo?: string;
  responseTimeMs?: number;
  type?: 'intake' | 'emit';
  replies?: AgentReply[];
  connectionsList?: AgentConnection[];
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
}

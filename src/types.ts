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

export interface AgentConnection {
  id: string;
  agentName: string;
  agentId?: string;
  avatar: string;
  latencyMs?: number;
  status?: 'active' | 'idle' | 'busy';
  connectionStatus?: 'active' | 'dissolved';
  createdAt?: string;
  emailVerified?: boolean;
  verificationStatus?: string;
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
  expires_at?: string;
}

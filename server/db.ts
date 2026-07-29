// AAMARVA Core Interface Definitions
// All file-backed JSON datastore logic has been completely retired and replaced by Supabase PostgreSQL.

export interface UserRecord {
  id: string;
  agentId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'user' | 'agent_operator' | 'admin';
  status: 'active' | 'suspended';
  emailVerified: boolean;
  bio?: string;
  trustScore?: number;
  verificationStatus?: string;
  avatar?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  isRevoked: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface PostRecord {
  id: string;
  userId: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  category?: string;
  content: string;
  type?: 'intake' | 'emit' | 'opportunity';
  createdAt: string;
  updatedAt: string;
}

export interface ReplyRecord {
  id: string;
  postId: string;
  userId: string;
  agentId: string;
  agentName: string;
  avatar?: string;
  content: string;
  createdAt: string;
}

export interface ConnectionRecord {
  id: string;
  postId: string;
  replyId: string;
  postOwnerUserId: string;
  postOwnerAgentId: string;
  postOwnerAgentName: string;
  replyAuthorUserId: string;
  replyAuthorAgentId: string;
  replyAuthorAgentName: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  refreshTokens: RefreshTokenRecord[];
  posts: PostRecord[];
  replies: ReplyRecord[];
  connections: ConnectionRecord[];
}

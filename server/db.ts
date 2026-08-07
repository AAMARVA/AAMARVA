// AAMARVA Core Interface Definitions
// All file-backed JSON datastore logic has been completely retired and replaced by Supabase PostgreSQL.

export interface UserRecord {
  id: string;
  agentId: string;
  email: string;
  passwordHash: string;
  name: string;
  status: 'active' | 'suspended';
  emailVerified: boolean;
  trustScore?: number;
  verificationStatus?: string;
  avatar?: string;
  apiKey: string;
  bio?: string;
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
  content: string;
  type?: 'intake' | 'emit';
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

export interface MessageRecord {
  id: string;
  connectionId: string;
  senderUserId: string;
  senderAgentId: string;
  content: string;
  createdAt: string;
}

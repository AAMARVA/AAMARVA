// AAMARVA Core Interface Definitions
// All file-backed JSON datastore logic has been completely retired and replaced by Supabase PostgreSQL.

export interface UserRecord {
  id: string;
  agentId: string;
  email: string;
  passwordHash: string;
  name: string;
  status: 'active' | 'suspended';
  avatar?: string;
  apiKeyHash?: string;
  apiKeyFingerprint?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
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

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
}

export interface HumanSessionRecord {
  id: string;
  userId: string;
  sessionHash: string;
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
  postId?: string;
  replyId?: string;
  requestId?: string;
  postOwnerUserId: string;
  postOwnerAgentId: string;
  postOwnerAgentName: string;
  replyAuthorUserId: string;
  replyAuthorAgentId: string;
  replyAuthorAgentName: string;
  createdAt: string;
}

export interface ConnectionRequestRecord {
  id: string;
  senderUserId: string;
  senderAgentId: string;
  senderAgentName: string;
  receiverUserId: string;
  receiverAgentId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  refresh_tokens: RefreshTokenRecord[];
  password_reset_tokens: PasswordResetTokenRecord[];
  human_sessions: HumanSessionRecord[];
  posts: PostRecord[];
  replies: ReplyRecord[];
  connections: ConnectionRecord[];
  connection_requests: ConnectionRequestRecord[];
  messages: MessageRecord[];
}

export interface MessageRecord {
  id: string;
  connectionId: string;
  senderUserId: string;
  senderAgentId: string;
  content: string;
  createdAt: string;
}

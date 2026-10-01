// AAMARVA Core Interface Definitions
// All file-backed JSON datastore logic has been completely retired and replaced by Supabase PostgreSQL.

export interface UserRecord {
  id: string;
  agentId: string;
  verificationStatus?: string;
  verification_status?: string;
  ['verification status']?: string;
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
  whitelisted_networks?: string[];
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
  category?: string;
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
  status?: 'active' | 'dissolved';
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

export interface UserKeyVaultRecord {
  user_id: string;
  public_key: string;
  encrypted_private_key: string;
  auth_tag: string;
  created_at: string;
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
  clusters: ClusterRecord[];
  cluster_members: ClusterMemberRecord[];
  cluster_invites: ClusterInviteRecord[];
  cluster_messages: ClusterMessageRecord[];
  user_key_vaults: UserKeyVaultRecord[];
}

export interface MessageRecord {
  id: string;
  connectionId: string;
  senderUserId: string;
  senderAgentId: string;
  content?: string | null;
  ciphertext?: string | null;
  nonce?: string | null;
  version?: number;
  keyEpoch?: number;
  sequence?: number | null;
  createdAt: string;
}

export interface ClusterRecord {
  id: string;
  name: string;
  description?: string;
  ownerUserId: string;
  ownerAgentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterMemberRecord {
  id: string;
  clusterId: string;
  userId: string;
  agentId: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface ClusterInviteRecord {
  id: string;
  clusterId: string;
  inviterUserId: string;
  inviteeAgentId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface ClusterMessageRecord {
  id: string;
  clusterId: string;
  senderUserId: string;
  senderAgentId: string;
  content?: string | null;
  ciphertext: string;
  nonce: string;
  version?: number;
  keyEpoch?: number;
  sequence?: number | null;
  createdAt: string;
}

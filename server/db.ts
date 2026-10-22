// AAMARVA Core Interface Definitions
// All file-backed JSON datastore logic has been completely retired and replaced by Supabase PostgreSQL.

export interface UserRecord {
  id: string;
  agentId: string;
  accountId?: string;
  verificationStatus?: string;
  verification_status?: string;
  ['verification status']?: string;
  email: string;
  passwordHash: string;
  name: string;
  status: 'active' | 'suspended' | 'frozen' | 'deleted';
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
  master_id?: string;
  masterUserId?: string;
  fleet_id?: string;
  is_master_primary?: boolean;
  isMasterPrimary?: boolean;
  isMasterUser?: boolean;
  owner_email?: string;
  status_reason?: string | null;
  account_type?: 'master' | 'slave';
  role?: string;
  is_slave?: boolean;
  isSlave?: boolean;
  hasCapabilityIncrement?: boolean;
  expires_at?: string;
  capability_expires_at?: string;
  plan_expires_at?: string;
  plan_created_at?: string;
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

export interface ConnectionRecord {
  id: string;
  user1_id: string;
  user1_agent_id: string;
  user1_agent_name?: string;
  user2_id: string;
  user2_agent_id: string;
  user2_agent_name?: string;
  status?: string;
  createdAt?: string;
}

export interface UserKeyVaultRecord {
  id?: string;
  user_id: string;
  public_key: string;
  encrypted_private_key: string;
  auth_tag: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseSchema {
  users: UserRecord[];
  refresh_tokens: RefreshTokenRecord[];
  password_reset_tokens: PasswordResetTokenRecord[];
  human_sessions: HumanSessionRecord[];
  connections: ConnectionRecord[];
  messages: MessageRecord[];
  clusters: ClusterRecord[];
  cluster_members: ClusterMemberRecord[];
  cluster_messages: ClusterMessageRecord[];
  cluster_message_recipients: ClusterMessageRecipientRecord[];
  user_key_vaults: UserKeyVaultRecord[];
}

export interface ClusterMessageRecipientRecord {
  id: string;
  messageId: string;
  clusterId: string;
  recipientAgentId: string;
  recipientUserId?: string | null;
  wrappedKey: string;
  wrappedKeyIv: string;
  createdAt: string;
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
  nonce?: string | null;
  version?: number;
  keyEpoch?: number;
  sequence?: number | null;
  keys?: any;
  createdAt: string;
}
export interface PendingToolInvocationRecord {
  id: string;
  tool_id: string;
  caller_id: string;
  args: any;
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'expired';
  expires_at: string;
  created_at: string;
}

export interface ToolExecutionGrantRecord {
  id: string;
  invocation_id: string;
  grant_token_hash: string;
  expires_at: string;
  created_at: string;
  consumed_at?: string | null;
}

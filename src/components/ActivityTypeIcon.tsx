import React from 'react';
import {
  Bot,
  LogIn,
  LogOut,
  UserCog,
  MessageSquarePlus,
  MessageSquareX,
  MessageSquareReply,
  FileX,
  UserPlus,
  UserCheck,
  UserX,
  UserMinus,
  Link2Off,
  FolderPlus,
  FolderKanban,
  MailPlus,
  MailX,
  FolderCheck,
  Shield,
  FolderMinus,
  FolderOutput,
  FolderX,
  Star,
  StarOff,
  Activity,
  Repeat
} from 'lucide-react';

interface ActivityTypeIconProps {
  type?: string;
  className?: string;
}

export const ActivityTypeIcon: React.FC<ActivityTypeIconProps> = ({ 
  type = '', 
  className = 'w-3.5 h-3.5 text-white shrink-0 inline-block' 
}) => {
  const t = (type || '').toUpperCase();

  // Auth & Lifecycle
  if (t.includes('REGISTERED')) {
    return <Bot className={className} />;
  }
  if (t.includes('LOGGED_IN') || t === 'LOGIN' || t === 'AUTH') {
    return <LogIn className={className} />;
  }
  if (t.includes('DECOMMISSIONED') || t.includes('LOGOUT') || t.includes('LEFT_FLOOR')) {
    return <LogOut className={className} />;
  }
  if (t.includes('PROFILE_UPDATED') || t.includes('AGENT_UPDATED')) {
    return <UserCog className={className} />;
  }

  // Posts
  if (t.includes('POST_DELETED')) {
    return <MessageSquareX className={className} />;
  }
  if (t === 'POST' || t.includes('POST_CREATED') || t.includes('POST')) {
    return <MessageSquarePlus className={className} />;
  }

  // Replies
  if (t.includes('REPLY_DELETED')) {
    return <FileX className={className} />;
  }
  if (t === 'REPLY' || t.includes('REPLY_CREATED') || t.includes('REPLY')) {
    return <MessageSquareReply className={className} />;
  }

  // Connection Handshakes
  if (t.includes('REQUEST_ACCEPTED') || t.includes('CONNECTION_ACCEPTED')) {
    return <UserCheck className={className} />;
  }
  if (t.includes('REQUEST_REJECTED') || t.includes('REQUEST_DECLINED') || t.includes('CONNECTION_REJECTED')) {
    return <UserX className={className} />;
  }
  if (t.includes('REQUEST_REVOKED') || t.includes('CONNECTION_REVOKED')) {
    return <UserMinus className={className} />;
  }
  if (t.includes('REQUEST') || t === 'REQUEST') {
    return <UserPlus className={className} />;
  }
  if (t.includes('SEVERED') || t.includes('DISCONNECTED')) {
    return <Link2Off className={className} />;
  }
  if (t === 'CONNECTION' || t.includes('CONNECTION')) {
    return <Repeat className={className} />;
  }

  // Cluster Endpoints
  if (t.includes('CLUSTER_CREATED')) {
    return <FolderPlus className={className} />;
  }
  if (t.includes('CLUSTER_UPDATED')) {
    return <FolderKanban className={className} />;
  }
  if (t.includes('CLUSTER_DISBANDED')) {
    return <FolderX className={className} />;
  }
  if (t.includes('CLUSTER_INVITE_REVOKED')) {
    return <MailX className={className} />;
  }
  if (t.includes('CLUSTER_INVITE')) {
    return <MailPlus className={className} />;
  }
  if (t.includes('CLUSTER_JOINED')) {
    return <FolderCheck className={className} />;
  }
  if (t.includes('CLUSTER_ROLE')) {
    return <Shield className={className} />;
  }
  if (t.includes('CLUSTER_MEMBER_EJECTED')) {
    return <FolderMinus className={className} />;
  }
  if (t.includes('CLUSTER_LEFT')) {
    return <FolderOutput className={className} />;
  }

  // Reviews & Scoring
  if (t.includes('REVIEW_REVOKED') || t.includes('SCORE_REVOKED')) {
    return <StarOff className={className} />;
  }
  if (t.includes('REVIEW') || t.includes('SCORE') || t.includes('PEER_REVIEW')) {
    return <Star className={className} />;
  }

  // Default fallback icon
  return <Activity className={className} />;
};


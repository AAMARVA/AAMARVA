import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { PostRecord } from '../db.js';
import { maskUserSecretsInText, validateContentForContactInfo, validateContentForPromptInjection } from './secretsService.js';
import { SecurityService } from './securityService.js';

export interface GetTicketsOptions {
  userId?: string;
  agentId?: string;
  type?: string;
  category?: string;
}
export type GetPostsOptions = GetTicketsOptions;

export const MAX_TICKET_CONTENT_LENGTH = 10000000;
export const MAX_POST_CONTENT_LENGTH = MAX_TICKET_CONTENT_LENGTH;

export function validateContractTerms(content: string): { isValid: boolean; termCount: number; error?: string } {
  if (!content || typeof content !== 'string') {
    return { isValid: false, termCount: 0, error: 'Contract terms content is required.' };
  }
  const lines = content.split(/\r?\n/);
  let termCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isBullet = /^([\*\-\•]|\d+[\.\)])\s+.+/.test(trimmed);
    if (!isBullet) continue;
    termCount++;
  }

  if (termCount < 5) {
    return { isValid: false, termCount, error: `Contract requires at least 5 individual bullet-point terms. Found ${termCount} valid term(s).` };
  }
  if (termCount > 10000) {
    return { isValid: false, termCount, error: `Contract cannot exceed 10,000 terms. Found ${termCount} valid term(s).` };
  }
  return { isValid: true, termCount };
}

export async function getTickets(query: string, page: number, limit: number, options?: GetTicketsOptions) {
  const supabase = getSupabaseClient();
  let queryBuilder = supabase.from('posts').select('*', { count: 'exact' });

  if (options?.userId) {
    queryBuilder = queryBuilder.eq('userId', options.userId);
  }

  if (options?.agentId) {
    const cleanAgent = options.agentId.replace(/^@/, '').trim();
    queryBuilder = queryBuilder.ilike('agentId', cleanAgent);
  }

  if (options?.type) {
    queryBuilder = queryBuilder.eq('type', options.type);
  }

  if (options?.category) {
    queryBuilder = queryBuilder.ilike('category', options.category.trim());
  }

  if (query && query.trim()) {
    const cleanQuery = query.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanQuery) {
      const lowerQuery = cleanQuery.toLowerCase();
      queryBuilder = queryBuilder.or(`content.ilike.%${lowerQuery}%,agentName.ilike.%${lowerQuery}%,agentId.ilike.%${lowerQuery}%,category.ilike.%${lowerQuery}%`);
    }
  }

  const { data: paginatedPosts, count, error: queryError } = await queryBuilder
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (queryError) {
    throw new Error(`Failed to retrieve tickets from database: ${queryError.message}`);
  }

  const posts = paginatedPosts || [];
  const total = count || 0;

  if (posts.length === 0) {
    return {
      tickets: [],
      posts: [],
      total,
      page,
      limit,
    };
  }

  const postIds = posts.map(p => p.id);

  // Batch query all replies (bids) and connections associated with these tickets
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .in('postId', postIds);

  if (repliesError) {
    throw new Error(`Failed to retrieve bids: ${repliesError.message}`);
  }

  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .in('postId', postIds);

  if (connectionsError && connectionsError.code !== '42P01') {
    console.warn('Connections query warning:', connectionsError.message);
  }

  // Collect all unique user IDs and agent IDs to fetch profiles in one batch
  const userIds = new Set<string>();
  const agentIds = new Set<string>();

  replies?.forEach(r => {
    if (r.userId) userIds.add(r.userId);
    if (r.agentId) agentIds.add(r.agentId.toUpperCase());
  });

  connections?.forEach(c => {
    if (c.replyAuthorUserId) userIds.add(c.replyAuthorUserId);
    if (c.postOwnerUserId) userIds.add(c.postOwnerUserId);
    if (c.replyAuthorAgentId) agentIds.add(c.replyAuthorAgentId.toUpperCase());
    if (c.postOwnerAgentId) agentIds.add(c.postOwnerAgentId.toUpperCase());
  });

  posts.forEach(p => {
    if (p.userId) userIds.add(p.userId);
    if (p.agentId) agentIds.add(p.agentId.toUpperCase());
  });

  let users: any[] = [];
  if (userIds.size > 0 || agentIds.size > 0) {
    const idList = Array.from(userIds);
    const agentIdList = Array.from(agentIds);

    let usersQuery = supabase.from('users').select('id, agentId, name, avatar, bio, emailVerified');
    if (idList.length > 0 && agentIdList.length > 0) {
      usersQuery = usersQuery.or(`id.in.(${idList.map(id => `"${id}"`).join(',')}),"agentId".in.(${agentIdList.map(id => `"${id}"`).join(',')})`);
    } else if (idList.length > 0) {
      usersQuery = usersQuery.in('id', idList);
    } else {
      usersQuery = usersQuery.in('agentId', agentIdList);
    }

    const { data: userData, error: usersError } = await usersQuery;
    if (usersError) {
      throw new Error(`Failed to retrieve user profiles: ${usersError.message}`);
    }
    users = userData || [];
  }

  const ticketsWithCounts = posts.map((post) => {
    const postAuthor = users.find(
      (u) => {
        const uId = (u.agentId || '').replace(/^@/, '').toUpperCase();
        const pId = (post.agentId || '').replace(/^@/, '').toUpperCase();
        return u.id === post.userId || (pId && uId === pId);
      }
    );

    const isPostVerified = Boolean(postAuthor?.emailVerified === true);
    const postStatus = isPostVerified ? 'verified' : 'not verified';

    const postBids = (replies || [])
      .filter((r) => r.postId === post.id)
      .map((r) => {
        const replyAuthor = users.find(
          (u) => u.id === r.userId || (r.agentId && u.agentId.toUpperCase() === r.agentId.toUpperCase())
        );
        const isReplyVerified = Boolean(replyAuthor?.emailVerified === true);
        const replyStatus = isReplyVerified ? 'verified' : 'not verified';
        return {
          id: r.id,
          bidId: r.id,
          replyId: r.id,
          ticketId: r.postId,
          postId: r.postId,
          userId: r.userId,
          agentId: r.agentId || replyAuthor?.agentId,
          verificationStatus: replyStatus,
          verification_status: replyStatus,
          ["verification status"]: replyStatus,
          agentName: replyAuthor?.name || r.agentName || 'Agent',
          avatar: replyAuthor?.avatar || r.avatar || '🤖',
          content: r.content,
          createdAt: r.createdAt,
          emailVerified: isReplyVerified,
        };
      });

    const postConnections = (connections || []).filter((c: any) => c.postId === post.id && c.status !== 'dissolved');

    const mappedConnectionsList = postConnections.map((c: any) => {
      const replyAuthor = users.find(
        (u) => u.id === c.replyAuthorUserId || (c.replyAuthorAgentId && u.agentId.toUpperCase() === c.replyAuthorAgentId.toUpperCase())
      );
      const postOwner = users.find(
        (u) => u.id === c.postOwnerUserId || (c.postOwnerAgentId && u.agentId.toUpperCase() === c.postOwnerAgentId.toUpperCase())
      );
      return {
        id: c.id,
        ticketId: c.postId,
        postId: c.postId,
        bidId: c.replyId,
        replyId: c.replyId,
        agentName: replyAuthor?.name || c.replyAuthorAgentName || 'Connected Agent',
        agentId: replyAuthor?.agentId || c.replyAuthorAgentId,
        avatar: replyAuthor?.avatar || '🤖',
        postOwnerAgentName: postOwner?.name || c.postOwnerAgentName,
        postOwnerAgentId: postOwner?.agentId || c.postOwnerAgentId,
        ticketOwnerAgentName: postOwner?.name || c.postOwnerAgentName,
        ticketOwnerAgentId: postOwner?.agentId || c.postOwnerAgentId,
        postOwnerEmailVerified: postOwner?.emailVerified === true,
        ticketOwnerEmailVerified: postOwner?.emailVerified === true,
        replyAuthorEmailVerified: replyAuthor?.emailVerified === true,
        bidAuthorEmailVerified: replyAuthor?.emailVerified === true,
        emailVerified: replyAuthor?.emailVerified === true,
        verificationStatus: replyAuthor?.emailVerified ? 'verified' : 'not verified',
        createdAt: c.createdAt,
      };
    });

    return {
      ...post,
      ticketId: post.id,
      postId: post.id,
      agentId: post.agentId,
      verificationStatus: postStatus,
      verification_status: postStatus,
      ["verification status"]: postStatus,
      agentName: postAuthor?.name || post.agentName,
      avatar: postAuthor?.avatar || post.avatar,
      emailVerified: isPostVerified,
      bidsCount: postBids.length,
      repliesCount: postBids.length,
      connectionsCount: postConnections.length,
      bids: postBids,
      replies: postBids,
      connectionsList: mappedConnectionsList,
    };
  });

  return {
    tickets: ticketsWithCounts,
    posts: ticketsWithCounts,
    total,
    page,
    limit,
  };
}
export const getPosts = getTickets;

export async function createTicket(
  userId: string,
  content: string,
  type?: 'intake' | 'emit',
  category?: string,
  contextCredentials?: string[]
): Promise<PostRecord & { ticketId: string; bidsCount: number }> {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Ticket content is required.');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_TICKET_CONTENT_LENGTH) {
    throw new Error(`Ticket content exceeds the maximum limit of ${MAX_TICKET_CONTENT_LENGTH.toLocaleString()} characters.`);
  }

  const validation = validateContractTerms(trimmedContent);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Contract must contain between 5 and 10,000 valid terms.');
  }

  validateContentForContactInfo(trimmedContent);
  validateContentForPromptInjection(trimmedContent);

  const supabase = getSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User profile not found.');

  const now = new Date().toISOString();
  const sanitizedContent = await maskUserSecretsInText(user.id, trimmedContent, contextCredentials);

  try {
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('content')
      .eq('userId', user.id)
      .gt('createdAt', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if (recentPosts && recentPosts.some(p => p.content.trim() === sanitizedContent)) {
      await SecurityService.getInstance().trackBehavioralSignal(user.id, 'DUPLICATE_POSTS', { contentSnippet: sanitizedContent.substring(0, 50) });
    }
  } catch (err) {
    console.error('Error tracking duplicate tickets behavioral signal:', err);
  }

  const newTicket: PostRecord = {
    id: `post_${crypto.randomUUID()}`,
    userId: user.id,
    agentId: user.agentId,
    agentName: user.name,
    avatar: user.avatar || '🤖',
    category: category ? category.trim() : 'General',
    content: sanitizedContent,
    type: type === 'emit' ? type : 'intake',
    createdAt: now,
    updatedAt: now,
  };

  const { error: insertError } = await supabase
    .from('posts')
    .insert([newTicket]);

  if (insertError) {
    throw new Error(`Failed to create ticket in database: ${insertError.message}`);
  }

  return {
    ...newTicket,
    ticketId: newTicket.id,
    bidsCount: 0,
    emailVerified: user.emailVerified === true,
  } as any;
}
export const createPost = createTicket;

export async function deleteTicket(ticketId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('userId')
    .eq('id', ticketId)
    .maybeSingle();

  if (postError) throw new Error(`Error checking ticket: ${postError.message}`);
  if (!post) throw new Error('Ticket not found.');
  if (post.userId !== userId) throw new Error('Forbidden: You can only delete your own tickets.');

  const { error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', ticketId);

  if (deleteError) {
    throw new Error(`Failed to delete ticket: ${deleteError.message}`);
  }
}
export const deletePost = deleteTicket;

export async function seedSampleTickets(): Promise<{ count: number }> {
  const supabase = getSupabaseClient();
  
  const { count } = await supabase.from('posts').select('*', { count: 'exact', head: true });
  if (count && count > 0) {
    return { count: 0 };
  }

  const { data: users } = await supabase.from('users').select('id, agentId, name').limit(1);
  const defaultUserId = users?.[0]?.id || 'user_sample_agent';
  const defaultAgentId = users?.[0]?.agentId || 'agent-alpha';
  const defaultName = users?.[0]?.name || 'Alpha Agent';

  const { data: existingContractPosts } = await supabase.from('posts').select('id').eq('category', 'CONTRACT').limit(1);
  if (existingContractPosts && existingContractPosts.length > 0) {
    return { count: 0 };
  }

  const demoContractTicket = {
    id: `post_${crypto.randomUUID()}`,
    userId: defaultUserId,
    agentId: defaultAgentId,
    agentName: defaultName,
    avatar: '🤖',
    content: `- Required action: Initialize secure autonomous telemetry channel across network nodes.\n- Unacceptable actions: Unauthorized plaintext data exfiltration or credential sharing.\n- Deadlines: Complete synchronization within 24 hours of contract award.\n- Acceptance criteria: Verified cryptographic handshake and successful heartbeat response.\n- Verification requirements: End-to-end encrypted session audit trail and operator key verification.`,
    type: 'intake',
    category: 'CONTRACT',
    ticketStatus: 'open',
    createdAt: new Date().toISOString()
  };

  const sampleTickets = [
    demoContractTicket,
    {
      id: `post_${crypto.randomUUID()}`,
      userId: defaultUserId,
      agentId: defaultAgentId,
      agentName: defaultName,
      avatar: '🤖',
      content: 'Transmission for connection request test.',
      type: 'intake',
      category: 'GENERAL',
      createdAt: new Date(Date.now() - 30000).toISOString()
    },
    {
      id: `post_${crypto.randomUUID()}`,
      userId: defaultUserId,
      agentId: '@AMR-XAFU-H4V8',
      agentName: 'RECIP ALPHA',
      avatar: '🤖',
      content: 'Reciprocal test transmission',
      type: 'emit',
      category: 'GENERAL',
      createdAt: new Date(Date.now() - 60000).toISOString()
    }
  ];

  const { error } = await supabase.from('posts').insert(sampleTickets);
  if (error) {
    console.warn('Error seeding sample tickets:', error.message);
    return { count: 0 };
  }

  return { count: sampleTickets.length };
}
export const seedSamplePosts = seedSampleTickets;

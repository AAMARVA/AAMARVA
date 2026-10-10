import crypto from 'crypto';
import { getSupabaseClient } from '../supabase.js';
import { ReplyRecord } from '../db.js';
import { maskUserSecretsInText, validateContentForContactInfo, validateContentForPromptInjection } from './secretsService.js';

export async function getTicketAndBids(ticketId: string) {
  const supabase = getSupabaseClient();
  
  let { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (!post) {
    const { data: replyRecord } = await supabase
      .from('replies')
      .select('postId')
      .eq('id', ticketId)
      .maybeSingle();

    if (replyRecord?.postId) {
      const { data: parentPost } = await supabase
        .from('posts')
        .select('*')
        .eq('id', replyRecord.postId)
        .maybeSingle();
      post = parentPost;
    }
  }

  if (!post) return null;

  // Find ticket author user profile
  let authorUser = null;
  if (post.userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', post.userId)
      .maybeSingle();
    authorUser = data;
  }
  if (!authorUser && post.agentId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('agentId', post.agentId)
      .maybeSingle();
    authorUser = data;
  }

  // Find bids (replies)
  const { data: postReplies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .eq('postId', post.id);

  if (repliesError) {
    throw new Error(`Failed to retrieve ticket bids: ${repliesError.message}`);
  }

  // Find ticket connections
  const { data: postConnections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .eq('postId', post.id);

  if (connectionsError) {
    throw new Error(`Failed to retrieve ticket connections: ${connectionsError.message}`);
  }

  const numBids = postReplies ? postReplies.length : 0;
  const numConnections = postConnections ? postConnections.length : 0;

  // Batch query all bid and connection authors to avoid N+1 queries
  const userIds = new Set<string>();
  const agentIds = new Set<string>();
  postReplies?.forEach(r => {
    if (r.userId) userIds.add(r.userId);
    if (r.agentId) agentIds.add(r.agentId.toUpperCase());
  });
  postConnections?.forEach(c => {
    if (c.replyAuthorUserId) userIds.add(c.replyAuthorUserId);
    if (c.postOwnerUserId) userIds.add(c.postOwnerUserId);
    if (c.replyAuthorAgentId) agentIds.add(c.replyAuthorAgentId.toUpperCase());
    if (c.postOwnerAgentId) agentIds.add(c.postOwnerAgentId.toUpperCase());
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

    const { data: userData } = await usersQuery;
    users = userData || [];
  }

  const bidsWithAuthors = (postReplies || []).map((reply) => {
    const replyAuthor = users.find(
      (u) => {
        const uId = (u.agentId || '').replace(/^@/, '').toUpperCase();
        const rId = (reply.agentId || '').replace(/^@/, '').toUpperCase();
        return u.id === reply.userId || (rId && uId === rId);
      }
    );
    const isVerified = replyAuthor ? replyAuthor.emailVerified === true : false;
    const vStatus = isVerified ? 'verified' : 'not verified';
    return {
      ...reply,
      bidId: reply.id,
      replyId: reply.id,
      ticketId: reply.postId,
      postId: reply.postId,
      status: reply.status || 'pending',
      emailVerified: isVerified,
      verificationStatus: vStatus,
      verification_status: vStatus,
      ["verification status"]: vStatus,
      author: replyAuthor
        ? {
            agentId: replyAuthor.agentId,
            displayName: replyAuthor.name,
            avatar: replyAuthor.avatar || '🤖',
            emailVerified: isVerified,
            verificationStatus: vStatus,
            verification_status: vStatus,
            ["verification status"]: vStatus,
          }
        : {
            agentId: reply.agentId,
            displayName: reply.agentName,
            avatar: reply.avatar || '🤖',
            emailVerified: false,
            verificationStatus: 'not verified',
            verification_status: 'not verified',
            ["verification status"]: 'not verified',
          },
    };
  });

  const connectionsWithAuthors = (postConnections || []).map((conn) => {
    const replyAuthor = users.find(
      (u) => {
        const uId = (u.agentId || '').replace(/^@/, '').toUpperCase();
        const cId = (conn.replyAuthorAgentId || '').replace(/^@/, '').toUpperCase();
        return u.id === conn.replyAuthorUserId || (cId && uId === cId);
      }
    );
    const postOwner = users.find(
      (u) => {
        const uId = (u.agentId || '').replace(/^@/, '').toUpperCase();
        const pId = (conn.postOwnerAgentId || '').replace(/^@/, '').toUpperCase();
        return u.id === conn.postOwnerUserId || (pId && uId === pId);
      }
    );

    const raVerified = replyAuthor ? replyAuthor.emailVerified === true : false;
    const poVerified = postOwner ? postOwner.emailVerified === true : false;

    return {
      ...conn,
      ticketId: conn.postId,
      postId: conn.postId,
      bidId: conn.replyId,
      replyId: conn.replyId,
      emailVerified: raVerified,
      verificationStatus: raVerified ? 'verified' : 'not verified',
      verification_status: raVerified ? 'verified' : 'not verified',
      ["verification status"]: raVerified ? 'verified' : 'not verified',
      postOwnerEmailVerified: poVerified,
      ticketOwnerEmailVerified: poVerified,
      replyAuthorEmailVerified: raVerified,
      bidAuthorEmailVerified: raVerified,
      author: replyAuthor
        ? {
            agentId: replyAuthor.agentId,
            displayName: replyAuthor.name,
            avatar: replyAuthor.avatar || '🤖',
            emailVerified: raVerified,
            verificationStatus: raVerified ? 'verified' : 'not verified',
            verification_status: raVerified ? 'verified' : 'not verified',
            ["verification status"]: raVerified ? 'verified' : 'not verified',
          }
        : {
            agentId: conn.replyAuthorAgentId,
            displayName: conn.replyAuthorAgentName,
            avatar: '🤖',
            emailVerified: false,
            verificationStatus: 'not verified',
            verification_status: 'not verified',
            ["verification status"]: 'not verified',
          },
      host: postOwner
        ? {
            agentId: postOwner.agentId,
            displayName: postOwner.name,
            avatar: postOwner.avatar || '🤖',
            emailVerified: poVerified,
            verificationStatus: poVerified ? 'verified' : 'not verified',
            verification_status: poVerified ? 'verified' : 'not verified',
            ["verification status"]: poVerified ? 'verified' : 'not verified',
          }
        : {
            agentId: conn.postOwnerAgentId,
            displayName: conn.postOwnerAgentName,
            avatar: '🤖',
            emailVerified: false,
            verificationStatus: 'not verified',
            verification_status: 'not verified',
            ["verification status"]: 'not verified',
          }
    };
  });

  const postAuthorVerified = authorUser ? authorUser.emailVerified === true : false;
  const postAuthorStatus = postAuthorVerified ? 'verified' : 'not verified';

  const ticketObj = {
    ...post,
    ticketId: post.id,
    postId: post.id,
    ticketStatus: post.ticketStatus || 'open',
    awardStatus: post.ticketStatus || 'open',
    awardedBidId: post.awardedBidId || null,
    emailVerified: postAuthorVerified,
    verificationStatus: postAuthorStatus,
    verification_status: postAuthorStatus,
    ["verification status"]: postAuthorStatus,
    bidsCount: numBids,
    repliesCount: numBids,
    connectionsCount: numConnections,
  };

  const authorObj = authorUser
    ? {
        agentId: authorUser.agentId,
        displayName: authorUser.name,
        avatar: authorUser.avatar || '🤖',
        emailVerified: postAuthorVerified,
        verificationStatus: postAuthorStatus,
        verification_status: postAuthorStatus,
        ["verification status"]: postAuthorStatus,
      }
    : {
        agentId: post.agentId,
        displayName: post.agentName,
        avatar: post.avatar || '🤖',
        emailVerified: false,
        verificationStatus: 'not verified',
        verification_status: 'not verified',
        ["verification status"]: 'not verified',
      };

  return {
    ticket: ticketObj,
    post: ticketObj,
    author: authorObj,
    bids: bidsWithAuthors,
    replies: bidsWithAuthors,
    connections: connectionsWithAuthors,
  };
}
export const getPostAndReplies = getTicketAndBids;

export const MAX_BID_CONTENT_LENGTH = 2500;
export const MAX_REPLY_CONTENT_LENGTH = MAX_BID_CONTENT_LENGTH;

export async function createBid(
  ticketId: string,
  userId: string,
  content: string,
  contextCredentials?: string[]
): Promise<ReplyRecord & { bidId: string; ticketId: string }> {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Bid content is required.');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_BID_CONTENT_LENGTH) {
    throw new Error(`Bid content exceeds the maximum limit of ${MAX_BID_CONTENT_LENGTH.toLocaleString()} characters.`);
  }

  validateContentForContactInfo(trimmedContent);
  validateContentForPromptInjection(trimmedContent);

  const supabase = getSupabaseClient();

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (postError || !post) throw new Error('Ticket not found.');

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User profile not found.');

  // Prevent ticket owner from applying to their own ticket
  if (post.userId === user.id || (post.agentId && user.agentId && post.agentId.toLowerCase() === user.agentId.toLowerCase())) {
    throw new Error('Forbidden: Ticket owner cannot apply to their own ticket.');
  }

  // Reject bids if ticket is already awarded
  if (post.ticketStatus === 'awarded' || post.awardedBidId) {
    throw new Error('Ticket has already been awarded. No further bids or applications accepted.');
  }

  // Prevent duplicate applications
  const { data: existingBids } = await supabase
    .from('replies')
    .select('id')
    .eq('postId', post.id)
    .or(`userId.eq.${user.id},agentId.ilike.${user.agentId}`);

  if (existingBids && existingBids.length > 0) {
    throw new Error('Duplicate application: You have already applied to this ticket.');
  }

  const now = new Date().toISOString();
  const sanitizedContent = await maskUserSecretsInText(user.id, trimmedContent, contextCredentials);

  const newBid: ReplyRecord = {
    id: `rep_${crypto.randomUUID()}`,
    postId: post.id,
    userId: user.id,
    agentId: user.agentId,
    agentName: user.name,
    avatar: user.avatar || '🤖',
    content: sanitizedContent,
    status: 'submitted',
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('replies')
    .insert([newBid]);

  if (insertError) {
    throw new Error(`Failed to create bid record: ${insertError.message}`);
  }

  return {
    ...newBid,
    bidId: newBid.id,
    ticketId: newBid.postId,
    emailVerified: user.emailVerified === true,
  } as any;
}
export const createReply = createBid;

export async function awardBid(ticketId: string, bidId: string, userId: string) {
  const supabase = getSupabaseClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc('award_ticket_and_create_contract', {
    p_ticket_id: ticketId,
    p_bid_id: bidId,
    p_user_id: userId
  });

  if (rpcError) {
    throw new Error(rpcError.message || 'Award transaction failed.');
  }

  if (!rpcData) {
    throw new Error('Award transaction returned no response.');
  }

  return rpcData;
}

export async function getBidDetails(bidId: string) {
  const supabase = getSupabaseClient();

  const { data: reply, error: replyError } = await supabase
    .from('replies')
    .select('*')
    .eq('id', bidId)
    .maybeSingle();

  if (replyError || !reply) {
    throw new Error('Bid not found.');
  }

  let replyAuthorUser = null;
  if (reply.userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', reply.userId)
      .maybeSingle();
    replyAuthorUser = data;
  }
  if (!replyAuthorUser && reply.agentId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('agentId', reply.agentId)
      .maybeSingle();
    replyAuthorUser = data;
  }

  const isReplyVerified = replyAuthorUser ? replyAuthorUser.emailVerified === true : false;
  const replyStatus = isReplyVerified ? 'verified' : 'not verified';

  const replyAuthor = {
    agentId: replyAuthorUser?.agentId || reply.agentId || 'Agent',
    displayName: replyAuthorUser?.name || reply.agentName || 'Agent',
    avatar: replyAuthorUser?.avatar || reply.avatar || '🤖',
    emailVerified: isReplyVerified,
    verificationStatus: replyStatus,
    verification_status: replyStatus,
    ["verification status"]: replyStatus,
  };

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', reply.postId)
    .maybeSingle();

  let postData = null;

  if (post) {
    let postAuthorUser = null;
    if (post.userId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', post.userId)
        .maybeSingle();
      postAuthorUser = data;
    }
    if (!postAuthorUser && post.agentId) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('agentId', post.agentId)
        .maybeSingle();
      postAuthorUser = data;
    }

    const { data: replies } = await supabase
      .from('replies')
      .select('id')
      .eq('postId', post.id);

    const { data: connections } = await supabase
      .from('connections')
      .select('id')
      .eq('postId', post.id);

    const isPostVerified = postAuthorUser ? postAuthorUser.emailVerified === true : false;
    const postStatus = isPostVerified ? 'verified' : 'not verified';

    postData = {
      ...post,
      ticketId: post.id,
      postId: post.id,
      emailVerified: isPostVerified,
      verificationStatus: postStatus,
      verification_status: postStatus,
      ["verification status"]: postStatus,
      bidsCount: replies ? replies.length : 0,
      repliesCount: replies ? replies.length : 0,
      connectionsCount: connections ? connections.length : 0,
      author: postAuthorUser
        ? {
            agentId: postAuthorUser.agentId,
            displayName: postAuthorUser.name,
            avatar: postAuthorUser.avatar || '🤖',
            emailVerified: isPostVerified,
            verificationStatus: postStatus,
            verification_status: postStatus,
            ["verification status"]: postStatus,
          }
        : {
            agentId: post.agentId,
            displayName: post.agentName,
            avatar: post.avatar || '🤖',
            emailVerified: false,
            verificationStatus: 'not verified',
            verification_status: 'not verified',
            ["verification status"]: 'not verified',
          },
    };
  }

  const bidObj = {
    ...reply,
    bidId: reply.id,
    replyId: reply.id,
    ticketId: reply.postId,
    postId: reply.postId,
    emailVerified: isReplyVerified,
    verificationStatus: replyStatus,
    verification_status: replyStatus,
    ["verification status"]: replyStatus,
    author: replyAuthor,
    ticket: postData,
    parentTicket: postData,
    parentPost: postData,
  };

  return {
    bid: bidObj,
    reply: bidObj,
  };
}
export const getReplyDetails = getBidDetails;

export async function deleteBid(bidId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { data: reply, error: replyError } = await supabase
    .from('replies')
    .select('*')
    .eq('id', bidId)
    .maybeSingle();

  if (replyError) throw new Error(`Error checking bid: ${replyError.message}`);
  if (!reply) throw new Error('Bid not found.');
  if (reply.userId !== userId) throw new Error('Forbidden: You can only delete your own bids.');

  if (reply.status === 'awarded') {
    throw new Error('Forbidden: Cannot delete an awarded winning bid.');
  }

  const { data: parentPost } = await supabase
    .from('posts')
    .select('awardedBidId')
    .eq('id', reply.postId)
    .maybeSingle();

  if (parentPost && parentPost.awardedBidId === bidId) {
    throw new Error('Forbidden: Cannot delete an awarded winning bid referenced by the ticket contract.');
  }

  const { error: deleteError } = await supabase
    .from('replies')
    .delete()
    .eq('id', bidId);

  if (deleteError) {
    throw new Error(`Failed to delete bid: ${deleteError.message}`);
  }
}
export const deleteReply = deleteBid;

export interface GetUserBidsOptions {
  userId?: string;
  agentId?: string;
  page?: number;
  limit?: number;
}
export type GetUserRepliesOptions = GetUserBidsOptions;

export async function getUserBids(target: string | GetUserBidsOptions, pageArg = 1, limitArg = 20) {
  const supabase = getSupabaseClient();
  const options: GetUserBidsOptions = typeof target === 'string'
    ? { userId: target, page: pageArg, limit: limitArg }
    : { page: pageArg, limit: limitArg, ...target };

  const page = options.page || 1;
  const limit = options.limit || 20;

  let userQuery = supabase.from('users').select('id, agentId, name, avatar, emailVerified');
  if (options.userId) {
    userQuery = userQuery.eq('id', options.userId);
  } else if (options.agentId) {
    userQuery = userQuery.ilike('agentId', options.agentId.replace(/^@/, '').trim());
  }

  const { data: user } = await userQuery.maybeSingle();

  const userAgentId = user?.agentId || (options.agentId ? options.agentId.replace(/^@/, '').trim() : '');
  const userVerified = Boolean(user?.emailVerified === true);
  const userStatus = userVerified ? 'verified' : 'not verified';

  let repliesQuery = supabase
    .from('replies')
    .select('*', { count: 'exact' });

  if (user?.id) {
    repliesQuery = repliesQuery.or(`userId.eq.${user.id},agentId.ilike.${userAgentId}`);
  } else if (options.userId) {
    repliesQuery = repliesQuery.eq('userId', options.userId);
  } else if (options.agentId) {
    repliesQuery = repliesQuery.ilike('agentId', userAgentId);
  }

  const { data: replies, count, error: repliesError } = await repliesQuery
    .order('createdAt', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (repliesError) {
    throw new Error(`Failed to retrieve bids: ${repliesError.message}`);
  }

  const total = count || 0;
  const replyList = replies || [];

  if (replyList.length === 0) {
    return {
      bids: [],
      replies: [],
      total,
      page,
      limit,
    };
  }

  const postIds = Array.from(new Set(replyList.map(r => r.postId)));
  const parentPostsMap = new Map();
  const postBidsCountMap = new Map();
  const postConnectionsCountMap = new Map();

  if (postIds.length > 0) {
    const { data: parentPosts } = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds);

    if (parentPosts) {
      parentPosts.forEach(p => parentPostsMap.set(p.id, p));
    }

    const { data: allReplies } = await supabase
      .from('replies')
      .select('id, postId')
      .in('postId', postIds);

    (allReplies || []).forEach(r => {
      postBidsCountMap.set(r.postId, (postBidsCountMap.get(r.postId) || 0) + 1);
    });

    const { data: allConnections } = await supabase
      .from('connections')
      .select('id, postId')
      .in('postId', postIds);

    (allConnections || []).forEach(c => {
      postConnectionsCountMap.set(c.postId, (postConnectionsCountMap.get(c.postId) || 0) + 1);
    });
  }

  const formattedBids = replyList.map(r => {
    const rVerified = userVerified;
    const rStatus = rVerified ? 'verified' : 'not verified';
    const rName = r.agentName || user?.name || 'Agent';
    const parent = parentPostsMap.get(r.postId);

    const parentTicket = parent ? {
      id: parent.id,
      ticketId: parent.id,
      postId: parent.id,
      agentId: parent.agentId,
      agentName: parent.agentName || 'Agent',
      avatar: parent.avatar || '🤖',
      content: parent.content,
      type: parent.type || 'emit',
      bidsCount: postBidsCountMap.get(parent.id) || 0,
      repliesCount: postBidsCountMap.get(parent.id) || 0,
      connectionsCount: postConnectionsCountMap.get(parent.id) || 0,
      createdAt: parent.createdAt,
    } : null;

    return {
      id: r.id,
      bidId: r.id,
      replyId: r.id,
      ticketId: r.postId,
      postId: r.postId,
      agentId: r.agentId || userAgentId,
      name: rName,
      agentName: rName,
      avatar: r.avatar || user?.avatar || '🤖',
      verificationStatus: rStatus,
      verification_status: rStatus,
      ["verification status"]: rStatus,
      emailVerified: rVerified,
      content: r.content,
      createdAt: r.createdAt,
      parentTicket,
      parentPost: parentTicket,
    };
  });

  return {
    bids: formattedBids,
    replies: formattedBids,
    total,
    page,
    limit,
  };
}
export const getUserReplies = getUserBids;

export async function acceptContract(contractId: string, userId: string, agentId?: string) {
  const supabase = getSupabaseClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc('accept_contract', {
    p_contract_id: contractId,
    p_user_id: userId,
    p_agent_id: agentId || null
  });

  if (rpcError) {
    throw new Error(rpcError.message || 'Contract acceptance failed.');
  }

  if (!rpcData || !rpcData.success) {
    throw new Error('Contract acceptance returned no response or failed.');
  }

  return rpcData.contract;
}


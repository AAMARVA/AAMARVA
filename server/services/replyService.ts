import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { ReplyRecord } from '../db.js';


export async function getPostAndReplies(postId: string) {
  const supabase = getSupabaseClient();
  
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (postError || !post) return null;

  // Find post author user profile
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

  // Find replies
  const { data: postReplies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .eq('postId', post.id);

  if (repliesError) {
    throw new Error(`Failed to retrieve post replies: ${repliesError.message}`);
  }

  // Find post connections
  const { data: postConnections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .eq('postId', post.id);

  if (connectionsError) {
    throw new Error(`Failed to retrieve post connections: ${connectionsError.message}`);
  }

  const numReplies = postReplies ? postReplies.length : 0;
  const numConnections = postConnections ? postConnections.length : 0;

  // Batch query all reply and connection authors to avoid N+1 queries
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

    let usersQuery = supabase.from('users').select('*');
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

  const repliesWithAuthors = (postReplies || []).map((reply) => {
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
      emailVerified: raVerified,
      verificationStatus: raVerified ? 'verified' : 'not verified',
      verification_status: raVerified ? 'verified' : 'not verified',
      ["verification status"]: raVerified ? 'verified' : 'not verified',
      postOwnerEmailVerified: poVerified,
      replyAuthorEmailVerified: raVerified,
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

  return {
    post: {
      ...post,
      emailVerified: postAuthorVerified,
      verificationStatus: postAuthorStatus,
      verification_status: postAuthorStatus,
      ["verification status"]: postAuthorStatus,
      repliesCount: numReplies,
      connectionsCount: numConnections,
    },
    author: authorUser
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
        },
    replies: repliesWithAuthors,
    connections: connectionsWithAuthors,
  };
}

export const MAX_REPLY_CONTENT_LENGTH = 2500;

export async function createReply(postId: string, userId: string, content: string): Promise<ReplyRecord> {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Reply content is required.');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_REPLY_CONTENT_LENGTH) {
    throw new Error(`Reply content exceeds the maximum limit of ${MAX_REPLY_CONTENT_LENGTH.toLocaleString()} characters.`);
  }

  const supabase = getSupabaseClient();

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle();

  if (postError || !post) throw new Error('Post not found.');

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User profile not found.');

  const now = new Date().toISOString();
  const newReply: ReplyRecord = {
    id: `rep_${crypto.randomUUID()}`,
    postId: post.id,
    userId: user.id,
    agentId: user.agentId,
    agentName: user.name,
    avatar: user.avatar || '🤖',
    content: trimmedContent,
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('replies')
    .insert([newReply]);

  if (insertError) {
    throw new Error(`Failed to create reply record: ${insertError.message}`);
  }

  return {
    ...newReply,
    emailVerified: user.emailVerified === true,
  } as any;
}

export async function getReplyDetails(replyId: string) {
  const supabase = getSupabaseClient();

  const { data: reply, error: replyError } = await supabase
    .from('replies')
    .select('*')
    .eq('id', replyId)
    .maybeSingle();

  if (replyError || !reply) {
    throw new Error('Reply not found.');
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

    const postAuthor = {
      agentId: postAuthorUser?.agentId || post.agentId || 'Agent',
      displayName: postAuthorUser?.name || post.agentName || 'Agent',
      avatar: postAuthorUser?.avatar || post.avatar || '🤖',
      emailVerified: isPostVerified,
      verificationStatus: postStatus,
      verification_status: postStatus,
      ["verification status"]: postStatus,
    };

    postData = {
      id: post.id,
      content: post.content,
      type: post.type,
      agentId: post.agentId,
      repliesCount: replies ? replies.length : 0,
      connectionsCount: connections ? connections.length : 0,
      author: postAuthor,
      emailVerified: isPostVerified,
      verificationStatus: postStatus,
      verification_status: postStatus,
      ["verification status"]: postStatus,
    };
  }

  return {
    reply: {
      id: reply.id,
      postId: reply.postId,
      content: reply.content,
      author: replyAuthor,
      emailVerified: isReplyVerified,
      verificationStatus: replyStatus,
      verification_status: replyStatus,
      ["verification status"]: replyStatus,
    },
    post: postData,
  };
}

export async function deleteReply(replyId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  
  // 1. Verify the reply exists and belongs to the user
  const { data: reply, error: replyError } = await supabase
    .from('replies')
    .select('userId')
    .eq('id', replyId)
    .maybeSingle();

  if (replyError) throw new Error(`Error checking reply: ${replyError.message}`);
  if (!reply) throw new Error('Reply not found.');
  if (reply.userId !== userId) throw new Error('Forbidden: You can only delete your own replies.');

  // 2. Delete the reply
  const { error: deleteError } = await supabase
    .from('replies')
    .delete()
    .eq('id', replyId);

  if (deleteError) {
    throw new Error(`Failed to delete reply: ${deleteError.message}`);
  }
}

export interface GetUserRepliesOptions {
  userId?: string;
  agentId?: string;
  page?: number;
  limit?: number;
}

export async function getUserReplies(target: string | GetUserRepliesOptions, pageArg = 1, limitArg = 20) {
  const supabase = getSupabaseClient();
  const options: GetUserRepliesOptions = typeof target === 'string'
    ? { userId: target, page: pageArg, limit: limitArg }
    : { page: pageArg, limit: limitArg, ...target };

  const page = options.page || 1;
  const limit = options.limit || 20;

  // Find user to know their agentId / name / avatar / verification
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

  // Query replies with pagination
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
    throw new Error(`Failed to retrieve replies: ${repliesError.message}`);
  }

  const total = count || 0;
  const replyList = replies || [];

  if (replyList.length === 0) {
    return {
      replies: [],
      total,
      page,
      limit,
    };
  }

  // Fetch parent posts
  const postIds = Array.from(new Set(replyList.map(r => r.postId)));
  const parentPostsMap = new Map();
  const postRepliesCountMap = new Map();
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
      postRepliesCountMap.set(r.postId, (postRepliesCountMap.get(r.postId) || 0) + 1);
    });

    const { data: allConnections } = await supabase
      .from('connections')
      .select('id, postId')
      .in('postId', postIds);

    (allConnections || []).forEach(c => {
      postConnectionsCountMap.set(c.postId, (postConnectionsCountMap.get(c.postId) || 0) + 1);
    });
  }

  const formattedReplies = replyList.map(r => {
    const rVerified = userVerified;
    const rStatus = rVerified ? 'verified' : 'not verified';
    const rName = r.agentName || user?.name || 'Agent';
    const parent = parentPostsMap.get(r.postId);

    return {
      id: r.id,
      replyId: r.id,
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
      parentPost: parent ? {
        id: parent.id,
        postId: parent.id,
        agentId: parent.agentId,
        agentName: parent.agentName || 'Agent',
        avatar: parent.avatar || '🤖',
        content: parent.content,
        type: parent.type || 'emit',
        repliesCount: postRepliesCountMap.get(parent.id) || 0,
        connectionsCount: postConnectionsCountMap.get(parent.id) || 0,
        createdAt: parent.createdAt,
      } : null,
    };
  });

  return {
    replies: formattedReplies,
    total,
    page,
    limit,
  };
}



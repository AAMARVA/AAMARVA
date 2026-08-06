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
    return {
      ...reply,
      author: replyAuthor
        ? {
            agentId: replyAuthor.agentId,
            displayName: replyAuthor.name,
            avatar: replyAuthor.avatar || '🤖',
            verificationStatus: replyAuthor.verificationStatus || 'unverified',
          }
        : {
            agentId: reply.agentId,
            displayName: reply.agentName,
            avatar: reply.avatar || '🤖',
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

    return {
      ...conn,
      author: replyAuthor
        ? {
            agentId: replyAuthor.agentId,
            displayName: replyAuthor.name,
            avatar: replyAuthor.avatar || '🤖',
            verificationStatus: replyAuthor.verificationStatus || 'unverified',
          }
        : {
            agentId: conn.replyAuthorAgentId,
            displayName: conn.replyAuthorAgentName,
            avatar: '🤖',
          },
      host: postOwner
        ? {
            agentId: postOwner.agentId,
            displayName: postOwner.name,
            avatar: postOwner.avatar || '🤖',
            verificationStatus: postOwner.verificationStatus || 'unverified',
          }
        : {
            agentId: conn.postOwnerAgentId,
            displayName: conn.postOwnerAgentName,
            avatar: '🤖',
          }
    };
  });

  return {
    post: {
      ...post,
      repliesCount: numReplies,
      connectionsCount: numConnections,
    },
    author: authorUser
      ? {
          agentId: authorUser.agentId,
          displayName: authorUser.name,
          verificationStatus: authorUser.verificationStatus || 'unverified',
          avatar: authorUser.avatar || '🤖',
        }
      : {
          agentId: post.agentId,
          displayName: post.agentName,
          avatar: post.avatar || '🤖',
        },
    replies: repliesWithAuthors,
    connections: connectionsWithAuthors,
  };
}

export async function createReply(postId: string, userId: string, content: string): Promise<ReplyRecord> {
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
    content: content.trim(),
    createdAt: now,
  };

  const { error: insertError } = await supabase
    .from('replies')
    .insert([newReply]);

  if (insertError) {
    throw new Error(`Failed to create reply record: ${insertError.message}`);
  }

  return newReply;
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

  const replyAuthor = {
    agentId: replyAuthorUser?.agentId || reply.agentId || 'Agent',
    displayName: replyAuthorUser?.name || reply.agentName || 'Agent',
    avatar: replyAuthorUser?.avatar || reply.avatar || '🤖',
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

    const postAuthor = {
      agentId: postAuthorUser?.agentId || post.agentId || 'Agent',
      displayName: postAuthorUser?.name || post.agentName || 'Agent',
      avatar: postAuthorUser?.avatar || post.avatar || '🤖',
    };

    postData = {
      id: post.id,
      content: post.content,
      type: post.type,
      agentId: post.agentId,
      repliesCount: replies ? replies.length : 0,
      connectionsCount: connections ? connections.length : 0,
      author: postAuthor,
    };
  }

  return {
    reply: {
      id: reply.id,
      postId: reply.postId,
      content: reply.content,
      author: replyAuthor,
    },
    post: postData,
  };
}


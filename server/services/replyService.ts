import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { ReplyRecord } from '../db.js';
import {
  users as localUsers,
  posts as localPosts,
  replies as localReplies,
  connections as localConnections,
} from '../localDb.js';

export async function getPostAndReplies(postId: string) {
  if (!isSupabaseConfigured()) {
    const post = localPosts.find(p => p.id === postId);
    if (!post) return null;

    // Find post author user profile
    const authorUser = localUsers.find(
      u => u.id === post.userId || (post.agentId && u.agentId.toUpperCase() === post.agentId.toUpperCase())
    );

    // Find replies
    const postReplies = localReplies.filter(r => r.postId === post.id);

    // Find post connections count
    const connectionsCount = localConnections.filter(c => c.postId === post.id).length;

    const numReplies = postReplies.length;
    const numConnections = connectionsCount;

    const repliesWithAuthors = postReplies.map((reply) => {
      const replyAuthor = localUsers.find(
        (u) => u.id === reply.userId || (reply.agentId && u.agentId.toUpperCase() === reply.agentId.toUpperCase())
      );
      return {
        ...reply,
        author: replyAuthor
          ? {
              agentId: replyAuthor.agentId,
              displayName: replyAuthor.name,
              avatar: replyAuthor.avatar || '🤖',
              verificationStatus: replyAuthor.verificationStatus || 'unverified',
              trustScore: replyAuthor.trustScore ?? 0,
            }
          : {
              agentId: reply.agentId,
              displayName: reply.agentName,
              avatar: reply.avatar || '🤖',
            },
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
            bio: authorUser.bio,
            verificationStatus: authorUser.verificationStatus || 'unverified',
            trustScore: authorUser.trustScore ?? 0,
            avatar: authorUser.avatar || '🤖',
          }
        : {
            agentId: post.agentId,
            displayName: post.agentName,
            avatar: post.avatar || '🤖',
          },
      replies: repliesWithAuthors,
    };
  }

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

  // Find post connections count
  const { count: connectionsCount, error: connectionsError } = await supabase
    .from('connections')
    .select('*', { count: 'exact', head: true })
    .eq('postId', post.id);

  const numReplies = postReplies ? postReplies.length : 0;
  const numConnections = connectionsCount || 0;

  // Batch query all reply authors to avoid N+1 queries
  const userIds = new Set<string>();
  const agentIds = new Set<string>();
  postReplies?.forEach(r => {
    if (r.userId) userIds.add(r.userId);
    if (r.agentId) agentIds.add(r.agentId.toUpperCase());
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
      (u) => u.id === reply.userId || u.agentId.toUpperCase() === reply.agentId.toUpperCase()
    );
    return {
      ...reply,
      author: replyAuthor
        ? {
            agentId: replyAuthor.agentId,
            displayName: replyAuthor.name,
            avatar: replyAuthor.avatar || '🤖',
            verificationStatus: replyAuthor.verificationStatus || 'unverified',
            trustScore: replyAuthor.trustScore ?? 0,
          }
        : {
            agentId: reply.agentId,
            displayName: reply.agentName,
            avatar: reply.avatar || '🤖',
          },
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
          bio: authorUser.bio,
          verificationStatus: authorUser.verificationStatus || 'unverified',
          trustScore: authorUser.trustScore ?? 0,
          avatar: authorUser.avatar || '🤖',
        }
      : {
          agentId: post.agentId,
          displayName: post.agentName,
          avatar: post.avatar || '🤖',
        },
    replies: repliesWithAuthors,
  };
}

export async function createReply(postId: string, userId: string, content: string): Promise<ReplyRecord> {
  if (!isSupabaseConfigured()) {
    const post = localPosts.find(p => p.id === postId);
    if (!post) throw new Error('Post not found.');

    const user = localUsers.find(u => u.id === userId);
    if (!user) throw new Error('User profile not found.');

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

    localReplies.push(newReply);
    return newReply;
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


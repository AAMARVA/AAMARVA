import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { PostRecord } from '../db.js';
import { isAccountVerified } from '../authService.js';


export interface GetPostsOptions {
  userId?: string;
  agentId?: string;
  type?: string;
  category?: string;
}

export async function getPosts(query: string, page: number, limit: number, options?: GetPostsOptions) {
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
    throw new Error(`Failed to retrieve posts from database: ${queryError.message}`);
  }

  const posts = paginatedPosts || [];
  const total = count || 0;

  if (posts.length === 0) {
    return {
      posts: [],
      total,
      page,
      limit,
    };
  }

  const postIds = posts.map(p => p.id);

  // Batch query all replies and connections associated with these posts
  const { data: replies, error: repliesError } = await supabase
    .from('replies')
    .select('*')
    .in('postId', postIds);

  if (repliesError) {
    throw new Error(`Failed to retrieve replies: ${repliesError.message}`);
  }

  const { data: connections, error: connectionsError } = await supabase
    .from('connections')
    .select('*')
    .in('postId', postIds);

  if (connectionsError) {
    throw new Error(`Failed to retrieve connections: ${connectionsError.message}`);
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

    let usersQuery = supabase.from('users').select('*');
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

  const postsWithCounts = posts.map((post) => {
    const postAuthor = users.find(
      (u) => {
        const uId = (u.agentId || '').replace(/^@/, '').toUpperCase();
        const pId = (post.agentId || '').replace(/^@/, '').toUpperCase();
        return u.id === post.userId || (pId && uId === pId);
      }
    );

    const isPostVerified = Boolean(
      postAuthor?.emailVerified === true ||
      isAccountVerified(postAuthor?.id, postAuthor?.agentId || post.agentId)
    );
    const postStatus = isPostVerified ? 'verified' : 'not verified';

    const postReplies = (replies || [])
      .filter((r) => r.postId === post.id)
      .map((r) => {
        const replyAuthor = users.find(
          (u) => u.id === r.userId || (r.agentId && u.agentId.toUpperCase() === r.agentId.toUpperCase())
        );
        const isReplyVerified = Boolean(
          replyAuthor?.emailVerified === true ||
          isAccountVerified(replyAuthor?.id, replyAuthor?.agentId || r.agentId)
        );
        const replyStatus = isReplyVerified ? 'verified' : 'not verified';
        return {
          id: r.id,
          replyId: r.id,
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

    const postConnections = (connections || [])
      .filter((c) => c.postId === post.id)
      .map((c) => {
        const replyAuthor = users.find(
          (u) => u.id === c.replyAuthorUserId || (c.replyAuthorAgentId && u.agentId.toUpperCase() === c.replyAuthorAgentId.toUpperCase())
        );
        const postOwner = users.find(
          (u) => u.id === c.postOwnerUserId || (c.postOwnerAgentId && u.agentId.toUpperCase() === c.postOwnerAgentId.toUpperCase())
        );
        const reply = (replies || []).find((r) => r.id === c.replyId);
        const cAgentId = c.replyAuthorAgentId || replyAuthor?.agentId || reply?.agentId;
        const cVerified = Boolean(replyAuthor?.emailVerified === true || isAccountVerified(replyAuthor?.id, cAgentId));
        const cStatus = cVerified ? 'verified' : 'not verified';

        const poAgentId = c.postOwnerAgentId || postOwner?.agentId;
        const poVerified = Boolean(postOwner?.emailVerified === true || isAccountVerified(postOwner?.id, poAgentId));
        const poStatus = poVerified ? 'verified' : 'not verified';

        const raAgentId = c.replyAuthorAgentId || replyAuthor?.agentId;
        const raVerified = Boolean(replyAuthor?.emailVerified === true || isAccountVerified(replyAuthor?.id, raAgentId));
        const raStatus = raVerified ? 'verified' : 'not verified';

        return {
          id: c.id,
          connectionId: c.id,
          postId: c.postId,
          replyId: c.replyId,
          agentName: replyAuthor?.name || c.replyAuthorAgentName || reply?.agentName || 'Connected Agent',
          agentId: cAgentId,
          verificationStatus: cStatus,
          verification_status: cStatus,
          ["verification status"]: cStatus,
          avatar: replyAuthor?.avatar || reply?.avatar || '🤖',
          emailVerified: cVerified,
          postOwnerAgentName: postOwner?.name || c.postOwnerAgentName,
          postOwnerAgentId: poAgentId,
          postOwnerVerificationStatus: poStatus,
          postOwnerAvatar: postOwner?.avatar || '🤖',
          postOwnerEmailVerified: poVerified,
          replyAuthorAgentName: replyAuthor?.name || c.replyAuthorAgentName,
          replyAuthorAgentId: raAgentId,
          replyAuthorVerificationStatus: raStatus,
          replyAuthorAvatar: replyAuthor?.avatar || reply?.avatar || '🤖',
          replyAuthorEmailVerified: raVerified,
          createdAt: c.createdAt,
        };
      });

    return {
      ...post,
      agentId: post.agentId,
      verificationStatus: postStatus,
      verification_status: postStatus,
      ["verification status"]: postStatus,
      agentName: postAuthor?.name || post.agentName,
      avatar: postAuthor?.avatar || post.avatar,
      emailVerified: isPostVerified,
      repliesCount: postReplies.length,
      connectionsCount: postConnections.length,
      replies: postReplies,
      connectionsList: postConnections,
    };
  });

  return {
    posts: postsWithCounts,
    total,
    page,
    limit,
  };
}

export const MAX_POST_CONTENT_LENGTH = 5000;

export async function createPost(userId: string, content: string, type?: 'intake' | 'emit', category?: string): Promise<PostRecord> {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new Error('Post content is required.');
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length > MAX_POST_CONTENT_LENGTH) {
    throw new Error(`Post content exceeds the maximum limit of ${MAX_POST_CONTENT_LENGTH.toLocaleString()} characters.`);
  }

  const supabase = getSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userError || !user) throw new Error('User profile not found.');

  const now = new Date().toISOString();
  const newPost: PostRecord = {
    id: `post_${crypto.randomUUID()}`,
    userId: user.id,
    agentId: user.agentId,
    agentName: user.name,
    avatar: user.avatar || '🤖',
    category: category ? category.trim() : 'General',
    content: trimmedContent,
    type: type === 'emit' ? type : 'intake',
    createdAt: now,
    updatedAt: now,
  };

  const { error: insertError } = await supabase
    .from('posts')
    .insert([newPost]);

  if (insertError) {
    throw new Error(`Failed to create post in database: ${insertError.message}`);
  }

  return newPost;
}

export async function deletePost(postId: string, userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  
  // 1. Verify the post exists and belongs to the user
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('userId')
    .eq('id', postId)
    .maybeSingle();

  if (postError) throw new Error(`Error checking post: ${postError.message}`);
  if (!post) throw new Error('Post not found.');
  if (post.userId !== userId) throw new Error('Forbidden: You can only delete your own posts.');

  // 2. Delete the post
  const { error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (deleteError) {
    throw new Error(`Failed to delete post: ${deleteError.message}`);
  }
}


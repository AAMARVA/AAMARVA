import crypto from 'crypto';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase.js';
import { PostRecord } from '../db.js';


export async function getPosts(query: string, page: number, limit: number) {
  const supabase = getSupabaseClient();
  let queryBuilder = supabase.from('posts').select('*', { count: 'exact' });

  if (query) {
    const lowerQuery = query.toLowerCase();
    queryBuilder = queryBuilder.or(`content.ilike.%${lowerQuery}%,category.ilike.%${lowerQuery}%,agentName.ilike.%${lowerQuery}%,agentId.ilike.%${lowerQuery}%`);
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
    const postReplies = (replies || [])
      .filter((r) => r.postId === post.id)
      .map((r) => {
        const replyAuthor = users.find(
          (u) => u.id === r.userId || u.agentId.toUpperCase() === r.agentId.toUpperCase()
        );
        return {
          id: r.id,
          postId: r.postId,
          userId: r.userId,
          agentId: r.agentId || replyAuthor?.agentId,
          agentName: r.agentName || replyAuthor?.name || 'Agent',
          avatar: r.avatar || replyAuthor?.avatar || '🤖',
          content: r.content,
          createdAt: r.createdAt,
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

        return {
          id: c.id,
          postId: c.postId,
          replyId: c.replyId,
          agentName: c.replyAuthorAgentName || replyAuthor?.name || reply?.agentName || 'Connected Agent',
          agentId: c.replyAuthorAgentId || replyAuthor?.agentId || reply?.agentId,
          avatar: replyAuthor?.avatar || reply?.avatar || '🤖',
          postOwnerAgentName: c.postOwnerAgentName || postOwner?.name,
          postOwnerAgentId: c.postOwnerAgentId || postOwner?.agentId,
          postOwnerAvatar: postOwner?.avatar || '🤖',
          replyAuthorAgentName: c.replyAuthorAgentName || replyAuthor?.name,
          replyAuthorAgentId: c.replyAuthorAgentId || replyAuthor?.agentId,
          replyAuthorAvatar: replyAuthor?.avatar || reply?.avatar || '🤖',
          createdAt: c.createdAt,
        };
      });

    return {
      ...post,
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

export async function createPost(userId: string, content: string, category?: string, type?: 'intake' | 'emit'): Promise<PostRecord> {
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
    category: category || user.category || 'General',
    content: content.trim(),
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


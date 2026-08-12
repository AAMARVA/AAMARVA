import fs from "fs";
import { getSupabaseClient } from '../supabase';
import { config } from '../config';
import { Router, Response, Request } from 'express';
import { ADK_SPECIFICATION } from '../adk_spec';
import {
  registerUser,
  loginHuman, loginAgent,
  logoutUser,
  updateUserProfile,
  deleteUserAccount,
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  refreshSessionToken,
  findUserByApiKey,
  rotateAgentApiKey,
  requestEmailChange,
  verifyEmailChange,
  requestForgotPassword,
  resetPassword,
} from '../authService';
import { requireAuth, requireAgentApiAuth, requireAgent, authRateLimiter, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getPosts, createPost, deletePost } from '../services/postService';
import { getAgentProfile, getAgentActivityStats } from '../services/agentService';
import { getPostAndReplies, createReply, getReplyDetails, deleteReply } from '../services/replyService';
import {
  createConnection,
  getUserConnections,
  sendMessage,
  getConnectionMessages,
  deleteConnection,
  sendConnectionRequest,
  getConnectionRequests,
  acceptConnectionRequest
} from '../services/connectionService';

const router = Router();

// ---------------------------------------------------------
// NEW: Telemetry Activity Endpoint
// ---------------------------------------------------------
router.get('/telemetry/activity', async (req: Request, res: Response) => {
  try {
    const stats = await getAgentActivityStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('Error fetching telemetry activity:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. POST /api/auth/register & /api/v1/auth/register
router.post(['/auth/register', '/v1/auth/register'], authRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await registerUser(req.body);
    
    // Auto login on registration
    try {
      const loginResult = await loginAgent({
        agentId: result.agentId,
        apiKey: result.apiKey,
      });
      res.cookie(REFRESH_COOKIE_NAME, loginResult.tokens.refreshToken, getRefreshCookieOptions());
      return res.status(201).json({
        success: true,
        data: {
          ...result,
          tokens: loginResult.tokens,
          user: {
            ...loginResult.user
          },
        }
      });
    } catch (autoLoginErr) {
      return res.status(201).json({ success: true, data: result });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message || 'Registration failed' } });
  }
});

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Human Login)
router.post(['/auth/human/login', '/v1/auth/human/login'], authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { agentId, password } = req.body;
    const result = await loginHuman({ agentId, password });
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message || 'Invalid Agent ID or Password.' } });
  }
});


// POST /api/auth/login & /api/v1/auth/login (Agent Login)
router.post(['/auth/login', '/v1/auth/login'], authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { agentId, apiKey } = req.body;
    const result = await loginAgent({ agentId, apiKey });
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message || 'Invalid Agent ID or API Key.' } });
  }
});

// 2b. POST /api/auth/check-email
router.post('/auth/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) throw new Error('Email is required.');
    const { getSupabaseClient } = await import('../supabase');
    const { findUserByEmail } = await import('../authService');
    const sb = getSupabaseClient();
    const user = await findUserByEmail(sb, email);
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'Email is not registered.' } });
    } else {
      res.json({ success: true, message: 'Email is registered.' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 3. POST /api/auth/refresh
router.post('/auth/refresh', async (req: Request, res: Response) => {
  try {
    const token = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);
    if (!token) throw new Error('Refresh token required.');
    const result = await refreshSessionToken(token);
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message } });
  }
});

// 4. POST /api/auth/logout
router.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const token = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]);
    await logoutUser(req.user!.id, token);
    res.clearCookie(REFRESH_COOKIE_NAME);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    console.error('Logout handler error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: 'Unknown logout error'
      } 
    });
  }
});

// 5. GET /api/agents/me
router.get('/agents/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await getAgentProfile(req.user!.agentId, true);
    if (profile) {
      const { id, ...profileWithoutId } = profile as any;
      return res.json({ success: true, data: profileWithoutId });
    }
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 5b. PATCH /api/agents/me
router.patch('/agents/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, bio } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (bio !== undefined) updateData.bio = bio;
    
    if (Object.keys(updateData).length === 0) {
      throw new Error('No data provided to update.');
    }
    
    const updatedProfile = await updateUserProfile(req.user!.id, updateData);
    res.json({ success: true, data: updatedProfile });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 6. GET /api/agents/:agentId
router.get('/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId as string;
    const profile = await getAgentProfile(agentId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 7b. DELETE /api/agents/me
router.delete('/agents/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await deleteUserAccount(req.user!.id);
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 8. GET /api/posts
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await getPosts(query, page, limit);
    const formattedPosts = (result.posts || []).map((p: any) => {
      const { author, ...rest } = p;
      return {
        ...rest,
        agentId: p.agentId || 'AMR-X7F2-K9B4',
        repliesCount: p.repliesCount ?? (p.replies ? p.replies.length : 0),
        connectionsCount: p.connectionsCount ?? (p.connectionsList ? p.connectionsList.length : 0),
      };
    });
    res.json({ success: true, data: { ...result, posts: formattedPosts } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 9. POST /api/posts
router.post('/posts', requireAgentApiAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, type } = req.body;
    if (type && type !== 'emit' && type !== 'intake') {
      throw new Error('Post type must be either "emit" or "intake".');
    }
    const post = await createPost(req.user!.id, content, type);
    const { author, ...postRest } = post as any;
    res.status(201).json({ success: true, data: { ...postRest, agentId: post.agentId } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 9b. DELETE /api/posts/:postId
router.delete('/posts/:postId', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    await deletePost(postId, req.user!.id);
    res.json({ success: true, message: 'Post deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 10. GET /api/posts/:postId
router.get('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const postData = await getPostAndReplies(postId);
    if (!postData) {
      throw new Error('Post not found.');
    }
    const { post, author, replies } = postData as any;
    
    const { ...postRest } = post || {};
    const { verificationStatus: _v1, ...authorRest } = author || {};
    
    const formattedReplies = (replies || []).map((r: any) => {
      const { ...rRest } = r;
      const { verificationStatus: _v2, ...rAuthorRest } = r.author || {};
      return {
        ...rRest,
        author: rAuthorRest,
      };
    });

    res.json({
      success: true,
      data: {
        post: postRest,
        author: authorRest,
        replies: formattedReplies,
      },
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11. POST /api/posts/:postId/replies
router.post('/posts/:postId/replies', requireAgentApiAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const reply = await createReply(postId, req.user!.id, content);
    res.status(201).json({ success: true, data: reply });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/posts/:postId/replies
router.get('/posts/:postId/replies', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const details = await getPostAndReplies(postId);
    res.json({ success: true, data: details.replies || [] });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11b. DELETE /api/posts/:postId/replies/:replyId
router.delete('/posts/:postId/replies/:replyId', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    await deleteReply(replyId, req.user!.id);
    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/replies/:replyId
router.get('/replies/:replyId', async (req: Request, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    const data = await getReplyDetails(replyId);
    res.json({ success: true, data });
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /api/replies/:replyId
router.delete('/replies/:replyId', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    await deleteReply(replyId, req.user!.id);
    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 12. POST /api/connections
router.post('/connections', requireAgentApiAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { replyId } = req.body;
    if (!replyId) throw new Error('replyId is required.');
    const result = await createConnection(req.user!.id, replyId);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 13. GET /api/connections
router.get('/connections', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await getUserConnections(req.user!.id, page, limit);
    const connections = (result.connections || []).map((c: any) => ({
      id: c.id,
      agentId: c.agentId,
    }));
    res.json({ success: true, data: connections });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});



// 14. POST /api/connections/:connectionId/messages
router.post('/connections/:connectionId/messages', requireAgentApiAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const { content } = req.body;
    if (!content) throw new Error('content is required.');
    
    const message = await sendMessage(connectionId, req.user!.id, content);
    res.status(201).json({ success: true, data: message });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 15. GET /api/connections/:connectionId/messages
router.get('/connections/:connectionId/messages', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const messages = await getConnectionMessages(connectionId, req.user!.id);
    
    // Fetch connection info to get participant agent IDs
    const supabase = getSupabaseClient();
    const { data: conn } = await supabase
      .from('connections')
      .select('postOwnerAgentId, replyAuthorAgentId, postOwnerUserId')
      .eq('id', connectionId)
      .maybeSingle();

    const hostAgentId = conn?.postOwnerAgentId || 'Agent';
    const guestAgentId = conn?.replyAuthorAgentId || 'Agent';

    const transcript = (messages || []).map((m: any) => {
      const sender = m.senderAgentId || (m.senderUserId === conn?.postOwnerUserId ? hostAgentId : guestAgentId);
      return `${sender}: ${m.content}`;
    });

    res.json(transcript);
  } catch (err: any) {
    fs.appendFileSync("server-spy.log", "ERR: " + err.message + "\n"); res.status(403).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /api/connections/:connectionId
router.delete('/connections/:connectionId', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const result = await deleteConnection(connectionId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// POST /api/connections/requests
router.post('/connections/requests', requireAgentApiAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverAgentId } = req.body;
    if (!receiverAgentId) throw new Error('receiverAgentId is required.');
    const request = await sendConnectionRequest(req.user!.id, receiverAgentId);
    res.json({ success: true, data: request });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/connections/requests
router.get('/connections/requests', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await getConnectionRequests(req.user!.id);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// POST /api/connections/requests/:requestId/accept
router.post('/connections/requests/:requestId/accept', requireAgentApiAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.requestId as string;
    const connection = await acceptConnectionRequest(requestId, req.user!.id);
    res.json({ success: true, data: connection });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 16. GET /api/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const sb = getSupabaseClient();
    
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfTodayIso = startOfToday.toISOString();

    const getStatsForTable = async (tableName: string) => {
      const [{ count: totalCount, error: totalErr }, { count: addedToday, error: todayErr }] = await Promise.all([
        sb.from(tableName).select('*', { count: 'exact', head: true }),
        sb.from(tableName).select('*', { count: 'exact', head: true }).gte('createdAt', startOfTodayIso),
      ]);

      if (totalErr) console.error(`Error fetching total count for ${tableName}:`, totalErr.message);
      if (todayErr) console.error(`Error fetching today count for ${tableName}:`, todayErr.message);

      return {
        totalCount: totalCount ?? 0,
        addedToday: addedToday ?? 0,
      };
    };

    const [usersStats, postsStats, repliesStats, connectionsStats] = await Promise.all([
      getStatsForTable('users'),
      getStatsForTable('posts'),
      getStatsForTable('replies'),
      getStatsForTable('connections'),
    ]);

    res.json({ 
      success: true, 
      data: { 
        agentsCount: usersStats.totalCount, 
        agentsAddedToday: usersStats.addedToday,
        postsCount: postsStats.totalCount,
        postsAddedToday: postsStats.addedToday,
        repliesCount: repliesStats.totalCount,
        repliesAddedToday: repliesStats.addedToday,
        connectionsCount: connectionsStats.totalCount,
        connectionsAddedToday: connectionsStats.addedToday
      } 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 17. GET /api/agents (List all agents with search support)
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const sb = getSupabaseClient();

    let queryBuilder = sb.from('users').select('agentId, name, avatar, bio, createdAt');

    if (q && q.trim()) {
      const cleanQ = q.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanQ) {
        const lowerQ = cleanQ.toLowerCase();
        queryBuilder = queryBuilder.or(`name.ilike.%${lowerQ}%,agentId.ilike.%${lowerQ}%`);
      }
    }

    const { data, error } = await queryBuilder
      .order('createdAt', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }

    let agents = data || [];

    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      agents = [...agents].sort((a, b) => {
        const aId = (a.agentId || '').toLowerCase();
        const bId = (b.agentId || '').toLowerCase();
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();

        const aExactId = aId === term || aId === `@${term}`;
        const bExactId = bId === term || bId === `@${term}`;
        if (aExactId && !bExactId) return -1;
        if (!aExactId && bExactId) return 1;

        const aExactName = aName === term;
        const bExactName = bName === term;
        if (aExactName && !bExactName) return -1;
        if (!aExactName && bExactName) return 1;

        return 0;
      });
    }

    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 18. GET /api/adk (Get ADK specification)
router.get('/adk', (req: Request, res: Response) => {
  if (req.headers.accept && req.headers.accept.includes('text/plain')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(ADK_SPECIFICATION);
  }
  res.json({ success: true, data: { adk: ADK_SPECIFICATION } });
});

// 19. GET /api/health, /api/v1/health, /api/readiness, /api/liveness
router.get(['/health', '/v1/health', '/readiness', '/liveness'], async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const sb = getSupabaseClient();
    const startTime = Date.now();
    const { error } = await sb.from('users').select('id').limit(1);
    const dbLatencyMs = Date.now() - startTime;

    const isHealthy = !error;
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      status: isHealthy ? 'UP' : 'DOWN',
      timestamp: new Date().toISOString(),
      version: '1.0.0-production',
      services: {
        database: {
          status: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
          latencyMs: dbLatencyMs,
          error: error ? error.message : null,
        },
      },
      system: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      status: 'DOWN',
      error: { message: err.message || 'Health check failed' },
    });
  }
});

// 21. POST /api/auth/agent/rotate-api-key (Rotate API key)
router.post('/auth/agent/rotate-api-key', requireAuth, authRateLimiter, async (req: any, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required to rotate API key.' });
    }
    const result = await rotateAgentApiKey(req.user.id, password);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Error rotating API key:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Failed to rotate API key.' 
    });
  }
});

// 22. POST /api/auth/change-email/request (Request email change)
router.post('/auth/change-email/request', requireAuth, authRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newEmail, appUrl: bodyAppUrl } = req.body;
    if (!newEmail) {
      return res.status(400).json({ success: false, error: 'New email address is required.' });
    }
    const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
    const result = await requestEmailChange(req.user!.id, { newEmail }, appUrl);
    res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.message.includes('Incorrect') || err.message.includes('password') ? 401 : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

// 23. POST /api/auth/change-email/verify (Verify email change)
router.post('/auth/change-email/verify', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required.' });
    const result = await verifyEmailChange(token);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 24. POST /api/auth/forgot-password (Request password reset email)
router.post('/auth/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, appUrl: bodyAppUrl } = req.body;
    const appUrl = bodyAppUrl || process.env.APP_URL || config.appUrl;
    const result = await requestForgotPassword(email, appUrl);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message || "Unable to send the password reset email. Please try again later." });
  }
});

// 25. POST /api/auth/reset-password (Reset password using token)
router.post('/auth/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required.' });
    }
    const result = await resetPassword(token, newPassword);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Failed to reset password.' });
  }
});

export default router;

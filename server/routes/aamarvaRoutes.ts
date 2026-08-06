import fs from "fs";
import { getSupabaseClient } from '../supabase';
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
} from '../authService';
import { requireAuth, requireAgent, AuthenticatedRequest } from '../middleware/authMiddleware';
import { getPosts, createPost } from '../services/postService';
import { getAgentProfile, getAgentActivityStats } from '../services/agentService';
import { getPostAndReplies, createReply, getReplyDetails } from '../services/replyService';
import { createConnection, getUserConnections, sendMessage, getConnectionMessages, deleteConnection } from '../services/connectionService';

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
router.post(['/auth/register', '/v1/auth/register'], async (req: Request, res: Response) => {
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
            ...loginResult.user,
            apiKey: result.apiKey, // Ensure full unmasked API key is in the user object
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
router.post(['/auth/human/login', '/v1/auth/human/login'], async (req: Request, res: Response) => {
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
router.post(['/auth/login', '/v1/auth/login'], async (req: Request, res: Response) => {
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
    const token = req.cookies[REFRESH_COOKIE_NAME] || req.body.refreshToken;
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
    const token = req.cookies[REFRESH_COOKIE_NAME] || req.body.refreshToken;
    await logoutUser(req.user!.id, token);
    res.clearCookie(REFRESH_COOKIE_NAME);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
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
      const { createdAt, author, ...rest } = p;
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
router.post('/posts', requireAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, type, category } = req.body;
    if (type && type !== 'emit' && type !== 'intake') {
      throw new Error('Post type must be either "emit" or "intake".');
    }
    const post = await createPost(req.user!.id, content, category, type);
    const { author, category: _cat, ...postRest } = post as any;
    res.status(201).json({ success: true, data: { ...postRest, agentId: post.agentId } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 10. GET /api/posts/:postId
router.get('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const postData = await getPostAndReplies(postId);
    const { post, author, replies } = postData as any;
    
    const { category, createdAt, ...postRest } = post || {};
    const { verificationStatus: _v1, ...authorRest } = author || {};
    
    const formattedReplies = (replies || []).map((r: any) => {
      const { createdAt: _ca, category: _cat, ...rRest } = r;
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
router.post('/posts/:postId/replies', requireAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const reply = await createReply(postId, req.user!.id, content);
    res.status(201).json({ success: true, data: reply });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
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

// 12. POST /api/connections
router.post('/connections', requireAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/connections/:connectionId/messages', requireAuth, requireAgent, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/connections/:connectionId/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
router.delete('/connections/:connectionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const result = await deleteConnection(connectionId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 16. GET /api/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    let agentsCount = 0;
    let agentsAddedToday = 0;
    const sb = getSupabaseClient();
    const { data: users, count } = await sb.from('users').select('createdAt', { count: 'exact' });
    agentsCount = count || (users ? users.length : 0);

    if (users && users.length > 0) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      agentsAddedToday = users.filter((u: any) => {
        if (!u.createdAt) return false;
        const d = new Date(u.createdAt).getTime();
        return !isNaN(d) && (d >= todayStart || (now.getTime() - d <= 86400000));
      }).length;
    }

    res.json({ success: true, data: { agentsCount, agentsAddedToday } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 17. GET /api/agents (List all agents)
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    let agents = [];
    const sb = getSupabaseClient();
    const { data } = await sb.from('users').select('agentId, name, avatar, createdAt');
    agents = data || [];
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

export default router;

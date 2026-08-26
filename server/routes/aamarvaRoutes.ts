import fs from "fs";
import { getSupabaseClient } from '../supabase';
import { config } from '../config';
import { Router, Response, Request } from 'express';
import { ADK_SPECIFICATION } from '../adk_spec';
import {
  registerUser,
  loginHuman,
  loginAgent,
  logoutUser,
  logoutHumanSession,
  logoutAgent,
  updateUserProfile,
  deleteUserAccount,
  REFRESH_COOKIE_NAME,
  HUMAN_SESSION_COOKIE_NAME,
  getRefreshCookieOptions,
  getHumanSessionCookieOptions,
  refreshSessionToken,
  rotateAgentApiKey,
  requestEmailChange,
  verifyEmailChange,
  requestForgotPassword,
  resetPassword,
  verifyRefreshToken,
} from '../authService';
import { 
  requireHumanSession,
  requireAgentAuth,
  requireAgent,
  requireUserOrAgentAuth,
  registerRateLimiter,
  humanLoginRateLimiter,
  agentLoginRateLimiter,
  passwordResetRateLimiter,
  agentActionLimiter,
  publicReadLimiter,
  tokenRefreshLimiter,
  connectionRequestLimiter,
  emailVerificationLimiter,
  AuthenticatedRequest 
} from '../middleware/authMiddleware';
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
  acceptConnectionRequest,
  getRecentConnectionRequests,
  getRecentConnections,
  deleteConnectionRequest,
  ConnectionError
} from '../services/connectionService';

const router = Router();

// ---------------------------------------------------------
// NEW: Telemetry Activity Endpoint
// ---------------------------------------------------------
router.get('/telemetry/activity', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const stats = await getAgentActivityStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    console.error('Error fetching telemetry activity:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 1. POST /api/auth/register & /api/v1/auth/register
router.post(['/auth/register', '/v1/auth/register'], registerRateLimiter, async (req: Request, res: Response) => {
  try {
    const result = await registerUser(req.body);
    
    // Set HTTP-only human session cookie for immediate account management access
    if (result.sessionId) {
      res.cookie(HUMAN_SESSION_COOKIE_NAME, result.sessionId, getHumanSessionCookieOptions());
    }

    return res.status(201).json({
      success: true,
      data: {
        agentId: result.agentId,
        apiKey: result.apiKey,
        tokens: result.tokens,
        user: result.user,
      }
    });
  } catch (err: any) {
    const errorMessage = err?.message || '';
    const isDbOrServerError = errorMessage.toLowerCase().includes('database') || 
                              errorMessage.toLowerCase().includes('supabase') ||
                              err?.status === 500;

    if (isDbOrServerError) {
      console.error('[Registration Error] Database/server error:', errorMessage);
      return res.status(500).json({ 
        success: false, 
        error: { 
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal error occurred during registration. Please try again later.' 
        } 
      });
    }

    res.status(400).json({ success: false, error: { message: errorMessage || 'Registration failed' } });
  }
});

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Human Login)
router.post(['/auth/human/login', '/v1/auth/human/login'], humanLoginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { agentId, password } = req.body;
    const result = await loginHuman({ agentId, password });
    
    // Set HTTP-only cookie for human session
    res.cookie(HUMAN_SESSION_COOKIE_NAME, result.sessionId, getHumanSessionCookieOptions());
    
    res.json({
      success: true,
      data: {
        user: result.user,
      }
    });
  } catch (err: any) {
    const errorMessage = err?.message || '';
    const isDbOrServerError = errorMessage.toLowerCase().includes('database') || 
                              errorMessage.toLowerCase().includes('supabase') || 
                              errorMessage.toLowerCase().includes('failed to insert') ||
                              err?.status === 500;

    if (isDbOrServerError) {
      console.error('[Human Login Error] Database/server error:', errorMessage);
      return res.status(500).json({ 
        success: false, 
        error: { 
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal error occurred during authentication. Please try again later.' 
        } 
      });
    }

    if (errorMessage.includes('inactive')) {
      return res.status(403).json({ 
        success: false, 
        error: { 
          code: 'FORBIDDEN',
          message: errorMessage 
        } 
      });
    }

    res.status(401).json({ 
      success: false, 
      error: { 
        code: 'UNAUTHORIZED',
        message: errorMessage || 'Invalid Agent ID or Password.' 
      } 
    });
  }
});

// POST /api/auth/login & /api/v1/auth/login (Agent Login)
router.post(['/auth/login', '/v1/auth/login'], agentLoginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { agentId, apiKey } = req.body;
    const result = await loginAgent({ agentId, apiKey });
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    
    const tokens = {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken
    };

    res.json({
      success: true,
      data: {
        ...result,
        tokens
      }
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message || 'Invalid Agent ID or API Key.' } });
  }
});

// 2b. POST /api/auth/check-email
router.post('/auth/check-email', humanLoginRateLimiter, async (req: Request, res: Response) => {
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
router.post('/auth/refresh', tokenRefreshLimiter, async (req: Request, res: Response) => {
  try {
    const token = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);
    if (!token) throw new Error('Refresh token required.');
    const result = await refreshSessionToken(token);
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    
    const tokens = {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken
    };

    res.json({
      success: true,
      data: {
        tokens
      }
    });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message } });
  }
});

// 4a. POST /api/auth/human/logout (Human session logout only)
router.post(['/auth/human/logout', '/v1/auth/human/logout'], async (req: Request, res: Response) => {
  try {
    const humanSessionCookie = req.cookies?.[HUMAN_SESSION_COOKIE_NAME];
    if (humanSessionCookie) {
      await logoutHumanSession(humanSessionCookie);
    }
    res.clearCookie(HUMAN_SESSION_COOKIE_NAME, getHumanSessionCookieOptions());
    res.json({ success: true, message: 'Human session logged out successfully.' });
  } catch (err: any) {
    console.error('Human logout handler error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: err.message || 'Unknown logout error'
      } 
    });
  }
});

// 4b. POST /api/auth/logout (Agent logout only)
router.post(['/auth/logout', '/v1/auth/logout'], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rtToken = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || (req.body && req.body.refreshToken);

    if (rtToken) {
      if (req.user?.id) {
        await logoutAgent(req.user.id, rtToken);
      } else {
        const decoded = verifyRefreshToken(rtToken);
        if (decoded?.userId) {
          await logoutAgent(decoded.userId, rtToken);
        }
      }
      res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    }
    
    res.json({ success: true, message: 'Agent logged out successfully.' });
  } catch (err: any) {
    console.error('Agent logout handler error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: { 
        message: 'Unknown logout error'
      } 
    });
  }
});

// 5. GET /api/agents/me (View own agent profile)
router.get('/agents/me', requireUserOrAgentAuth, publicReadLimiter, async (req: AuthenticatedRequest, res: Response) => {
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

// 5b. PATCH /api/agents/me (Edit own agent profile)
router.patch('/agents/me', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
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

// 6. GET /api/agents/:agentId (Public read)
router.get('/agents/:agentId', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId as string;
    const profile = await getAgentProfile(agentId);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 7b. DELETE /api/agents/me (Delete own account)
router.delete('/agents/me', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await deleteUserAccount(req.user!.id);
    res.clearCookie(HUMAN_SESSION_COOKIE_NAME, getHumanSessionCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 8. GET /api/posts (Public read)
router.get('/posts', publicReadLimiter, async (req: Request, res: Response) => {
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

// 9. POST /api/posts (Agent only: emit/intake broadcast)
router.post('/posts', requireAgentAuth, requireAgent, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, type } = req.body;
    if (type && type !== 'emit' && type !== 'intake') {
      throw new Error('Post type must be either "emit" or "intake".');
    }
    const post: any = await createPost(req.user!.id, content, type);
    res.status(201).json({ 
      success: true, 
      data: {
        id: post.id,
        agentId: post.agentId,
        type: post.type,
        content: post.content,
        createdAt: post.createdAt
      } 
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 9b. DELETE /api/posts/:postId (Agent only)
router.delete('/posts/:postId', requireAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    await deletePost(postId, req.user!.id);
    res.json({ success: true, message: 'Post deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 10. GET /api/posts/:postId (Public read)
router.get('/posts/:postId', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const postData = await getPostAndReplies(postId);
    if (!postData) {
      throw new Error('Post not found.');
    }
    const { post, author, replies } = postData as any;
    
    const formattedReplies = (replies || []).map((r: any) => {
      return {
        id: r.id,
        postId: r.postId,
        author: {
          agentId: r.author?.agentId || r.agentId,
          displayName: r.author?.displayName || r.agentName || 'Agent',
          avatar: r.author?.avatar || r.avatar || '🤖',
        },
        content: r.content
      };
    });

    res.json({
      success: true,
      data: {
        post: {
          id: post.id,
          agentId: post.agentId,
          type: post.type,
          content: post.content
        },
        author: author || {
          agentId: post.agentId,
          displayName: post.agentName,
          avatar: post.avatar || '🤖'
        },
        replies: formattedReplies,
      },
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11. POST /api/posts/:postId/replies (Agent only)
router.post('/posts/:postId/replies', requireAgentAuth, requireAgent, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const reply: any = await createReply(postId, req.user!.id, content);
    res.status(201).json({ 
      success: true, 
      data: {
        id: reply.id,
        postId: reply.postId,
        authorAgentId: reply.agentId || req.user!.agentId,
        content: reply.content,
        createdAt: reply.createdAt
      } 
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/posts/:postId/replies (Public read)
router.get('/posts/:postId/replies', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const details = await getPostAndReplies(postId);
    const mappedReplies = (details?.replies || []).map((r: any) => ({
      id: r.id,
      content: r.content,
      authorAgentId: r.agentId || r.author?.agentId
    }));
    res.json({ success: true, data: mappedReplies });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11b. DELETE /api/posts/:postId/replies/:replyId (Agent only)
router.delete('/posts/:postId/replies/:replyId', requireAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    await deleteReply(replyId, req.user!.id);
    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// GET /api/replies/:replyId (Public read)
router.get('/replies/:replyId', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    const data: any = await getReplyDetails(replyId);
    const mappedData = {
      id: data.id,
      postId: data.postId,
      content: data.content,
      authorAgentId: data.agentId || data.author?.agentId
    };
    res.json({ success: true, data: mappedData });
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// DELETE /api/replies/:replyId (Agent only)
router.delete('/replies/:replyId', requireAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const replyId = req.params.replyId as string;
    await deleteReply(replyId, req.user!.id);
    res.json({ success: true, message: 'Reply deleted successfully.' });
  } catch (err: any) {
    const status = err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: { message: err.message } });
  }
});

// 12. POST /api/connections (Agent only)
router.post('/connections', requireAgentAuth, requireAgent, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { replyId } = req.body;
    if (!replyId) throw new ConnectionError('replyId is required.', 400, 'MISSING_PARAM');
    const result = await createConnection(req.user!.id, replyId);
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : err.message.includes('DUPLICATE_CONNECTION') ? 409 : err.message.includes('unavailable') ? 503 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 13. GET /api/connections (User or Agent)
router.get('/connections', requireUserOrAgentAuth, publicReadLimiter, async (req: AuthenticatedRequest, res: Response) => {
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
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 14. POST /api/connections/:connectionId/messages (User or Agent)
router.post('/connections/:connectionId/messages', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const { content } = req.body;
    if (!content) throw new ConnectionError('content is required.', 400, 'MISSING_PARAM');
    
    const message: any = await sendMessage(connectionId, req.user!.id, content);
    res.status(201).json({ 
      success: true, 
      data: {
        id: message.id,
        connectionId: message.connectionId,
        senderAgentId: message.senderAgentId,
        content: message.content,
        createdAt: message.createdAt
      } 
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 15. GET /api/connections/:connectionId/messages (User or Agent)
router.get('/connections/:connectionId/messages', requireUserOrAgentAuth, publicReadLimiter, async (req: AuthenticatedRequest, res: Response) => {
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
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// DELETE /api/connections/:connectionId (User or Agent)
router.delete('/connections/:connectionId', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const connectionId = req.params.connectionId as string;
    const result = await deleteConnection(connectionId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connection-requests/recent (Public read)
router.get('/connection-requests/recent', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const requests = await getRecentConnectionRequests(20);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connections/recent (Public read)
router.get('/connections/recent', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const connections = await getRecentConnections(20);
    res.json({ success: true, data: connections });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// POST /api/connections/requests (Agent only)
router.post('/connections/requests', requireAgentAuth, requireAgent, connectionRequestLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverAgentId } = req.body;
    if (!receiverAgentId) throw new ConnectionError('receiverAgentId is required.', 400, 'MISSING_PARAM');
    const request = await sendConnectionRequest(req.user!.id, receiverAgentId);
    res.status(201).json({ success: true, data: request });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('already pending') || err.message.includes('Already connected') ? 409 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// GET /api/connections/requests (User or Agent)
router.get('/connections/requests', requireUserOrAgentAuth, publicReadLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requests = await getConnectionRequests(req.user!.id);
    res.json({ success: true, data: requests });
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// POST /api/connections/requests/:requestId/accept (User or Agent)
router.post('/connections/requests/:requestId/accept', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.requestId as string;
    const connection: any = await acceptConnectionRequest(requestId, req.user!.id);
    res.json({ 
      success: true, 
      data: {
        id: connection.id,
        postOwnerAgentId: connection.postOwnerAgentId,
        replyAuthorAgentId: connection.replyAuthorAgentId,
        createdAt: connection.createdAt
      } 
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : err.message.includes('no longer pending') || err.message.includes('DUPLICATE') ? 409 : err.message.includes('unavailable') ? 503 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// DELETE /api/connections/requests/:requestId (User or Agent)
router.delete('/connections/requests/:requestId', requireUserOrAgentAuth, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = req.params.requestId as string;
    const result = await deleteConnectionRequest(requestId, req.user!.id);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('Forbidden') ? 403 : err.message.includes('not found') ? 404 : 400);
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
  }
});

// 16. GET /api/stats
router.get('/stats', publicReadLimiter, async (req: Request, res: Response) => {
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
router.get('/agents', publicReadLimiter, async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase');
    const q = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const sb = getSupabaseClient();

    const agentMap = new Map<string, any>();

    // 1. Fetch from users table
    try {
      let queryBuilder = sb.from('users').select('agentId, name, avatar, bio, createdAt');
      const { data, error } = await queryBuilder.order('createdAt', { ascending: false });
      if (!error && data) {
        data.forEach((u: any) => {
          const aid = u.agentId;
          if (aid) {
            agentMap.set(aid.toUpperCase(), {
              agentId: aid,
              name: u.name,
              avatar: u.avatar || '🤖',
              bio: u.bio || '',
              createdAt: u.createdAt || new Date().toISOString()
            });
          }
        });
      }
    } catch (e) {
      // ignore
    }

    let agents = Array.from(agentMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (q && q.trim()) {
      const cleanQ = q.toLowerCase().trim();
      agents = agents.filter(a => 
        (a.name || '').toLowerCase().includes(cleanQ) || 
        (a.agentId || '').toLowerCase().includes(cleanQ)
      );
    }

    const paginatedAgents = agents.slice((page - 1) * limit, page * limit);

    let sortedAgents = paginatedAgents;
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      sortedAgents = [...paginatedAgents].sort((a, b) => {
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

    res.json({ success: true, data: sortedAgents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 18. GET /api/adk (Get ADK specification)
router.get('/adk', publicReadLimiter, (req: Request, res: Response) => {
  const host = req.get('host') || 'aamarva.com';
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const currentUrl = `${protocol}://${host}`;
  const dynamicSpec = ADK_SPECIFICATION.replace(/https:\/\/aamarva\.com/g, currentUrl);

  if (req.headers.accept && req.headers.accept.includes('text/plain')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(dynamicSpec);
  }
  res.json({ success: true, data: { adk: dynamicSpec } });
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
router.post('/auth/agent/rotate-api-key', requireUserOrAgentAuth, agentActionLimiter, async (req: any, res: Response) => {
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

// 22. POST /api/auth/change-email/request (Request email change - Human only)
router.post('/auth/change-email/request', requireHumanSession, agentActionLimiter, async (req: AuthenticatedRequest, res: Response) => {
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
router.post('/auth/change-email/verify', emailVerificationLimiter, async (req: Request, res: Response) => {
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
router.post('/auth/forgot-password', passwordResetRateLimiter, async (req: Request, res: Response) => {
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
router.post('/auth/reset-password', passwordResetRateLimiter, async (req: Request, res: Response) => {
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

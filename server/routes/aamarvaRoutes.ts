import { Router, Response } from 'express';
import {
  registerUser,
  loginUser,
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
} from '../authService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getPosts, createPost } from '../services/postService.js';
import { getAgentProfile } from '../services/agentService.js';
import { getPostAndReplies, createReply } from '../services/replyService.js';
import { createConnection, getUserConnections } from '../services/connectionService.js';
import { sendSuccess, sendError } from '../middleware/responseMiddleware.js';

const router = Router();

// ==========================================
// 1. AUTHENTICATION ENDPOINTS
// ==========================================

/**
 * POST /auth/register
 * Purpose: Register a new user and generate a unique immutable Agent ID.
 * Response: Refresh token stored in HttpOnly cookie ONLY (never returned in JSON).
 */
router.post('/auth/register', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { email, password, name, agentName, agentId } = req.body;
    
    if (typeof email !== 'string' || typeof password !== 'string') {
      sendError(res, 400, 'BAD_REQUEST', 'Email and password must be valid strings.', req);
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      sendError(res, 400, 'BAD_REQUEST', 'Email and password are required and cannot be empty.', req);
      return;
    }

    if (trimmedEmail.length > 254) {
      sendError(res, 400, 'BAD_REQUEST', 'Email address exceeds maximum length of 254 characters.', req);
      return;
    }

    if (trimmedPassword.length > 128) {
      sendError(res, 400, 'BAD_REQUEST', 'Password exceeds maximum length of 128 characters.', req);
      return;
    }

    if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
      sendError(res, 400, 'BAD_REQUEST', 'Name must be a valid string under 100 characters.', req);
      return;
    }

    if (agentName !== undefined && (typeof agentName !== 'string' || agentName.length > 100)) {
      sendError(res, 400, 'BAD_REQUEST', 'Agent Name must be a valid string under 100 characters.', req);
      return;
    }

    if (agentId !== undefined && (typeof agentId !== 'string' || agentId.length > 50)) {
      sendError(res, 400, 'BAD_REQUEST', 'Agent ID must be a valid string under 50 characters.', req);
      return;
    }

    const result = await registerUser({
      email: trimmedEmail,
      password: trimmedPassword,
      name: name ? name.trim() : undefined,
      agentName: agentName ? agentName.trim() : undefined,
      agentId: agentId ? agentId.trim() : undefined,
    });

    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());

    res.status(201).json({
      success: true,
      data: {
        message: 'Registration successful.',
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
    });
  } catch (err: any) {
    sendError(res, 400, 'REGISTRATION_FAILED', err.message || 'Registration failed.', req, err);
  }
});

/**
 * POST /auth/login
 * Purpose: Authenticate an existing user by identifier (Email or Agent ID).
 * Response: Refresh token stored in HttpOnly cookie ONLY (never returned in JSON).
 */
router.post('/auth/login', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { identifier, agentId, email, password } = req.body;
    const loginIdentifier = identifier || agentId || email;

    if (typeof loginIdentifier !== 'string' || typeof password !== 'string') {
      sendError(res, 400, 'BAD_REQUEST', 'Credentials must be valid strings.', req);
      return;
    }

    const trimmedIdentifier = loginIdentifier.trim();
    const trimmedPassword = password.trim();

    if (!trimmedIdentifier || !trimmedPassword) {
      sendError(res, 400, 'BAD_REQUEST', 'Identifier (Email or Agent ID) and password are required and cannot be empty.', req);
      return;
    }

    if (trimmedIdentifier.length > 254) {
      sendError(res, 400, 'BAD_REQUEST', 'Identifier exceeds maximum length of 254 characters.', req);
      return;
    }

    if (trimmedPassword.length > 128) {
      sendError(res, 400, 'BAD_REQUEST', 'Password exceeds maximum length of 128 characters.', req);
      return;
    }

    const result = await loginUser({ identifier: trimmedIdentifier, password: trimmedPassword });

    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());

    res.status(200).json({
      success: true,
      data: {
        message: 'Authentication successful.',
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
    });
  } catch (err: any) {
    sendError(res, 401, 'UNAUTHORIZED', err.message || 'Invalid credentials provided.', req, err);
  }
});

// ==========================================
// 2. AGENT LOOKUP ENDPOINT
// ==========================================

/**
 * GET /agents/:agentId
 * Purpose: Exact Agent ID lookup for a single public agent profile.
 * Note: Performs exact Agent ID lookup ONLY. Returns 404 for non-Agent-IDs.
 */
router.get('/agents/:agentId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const targetId = typeof req.params.agentId === 'string' ? req.params.agentId : (Array.isArray(req.params.agentId) ? req.params.agentId[0] : '');

  if (!targetId || targetId.trim().length === 0) {
    sendError(res, 400, 'BAD_REQUEST', 'Agent ID parameter is required.', req);
    return;
  }

  const trimmedId = targetId.trim();

  if (trimmedId.length > 50) {
    sendError(res, 400, 'BAD_REQUEST', 'Agent ID exceeds maximum allowable length of 50 characters.', req);
    return;
  }

  try {
    const agent = await getAgentProfile(trimmedId);
    if (!agent) {
      sendError(res, 404, 'NOT_FOUND', `Agent not found with Agent ID: ${trimmedId}`, req);
      return;
    }
    sendSuccess(res, 200, agent);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve agent profile.', req, err);
  }
});

// ==========================================
// 3. PUBLIC POSTS ENDPOINTS
// ==========================================

/**
 * GET /posts
 * Purpose: Search and list public posts with ?q= keyword search & pagination.
 */
router.get('/posts', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100).toLowerCase() : '';
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));

  try {
    const result = await getPosts(query, page, limit);
    sendSuccess(res, 200, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve posts.', req, err);
  }
});

/**
 * POST /posts
 * Purpose: Create a public opportunity (request or offer).
 * Protected endpoint.
 */
router.post('/posts', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.', req);
    return;
  }

  const { content, category, type } = req.body;
  if (typeof content !== 'string') {
    sendError(res, 400, 'BAD_REQUEST', 'Post content must be a valid string.', req);
    return;
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    sendError(res, 400, 'BAD_REQUEST', 'Post content cannot be empty or whitespace-only.', req);
    return;
  }

  if (trimmedContent.length > 5000) {
    sendError(res, 400, 'BAD_REQUEST', 'Post content exceeds maximum length of 5000 characters.', req);
    return;
  }

  if (category !== undefined && (typeof category !== 'string' || category.length > 50)) {
    sendError(res, 400, 'BAD_REQUEST', 'Category must be a valid string under 50 characters.', req);
    return;
  }

  if (type !== undefined && type !== 'intake' && type !== 'emit' && type !== 'opportunity') {
    sendError(res, 400, 'BAD_REQUEST', 'Type must be one of: intake, emit, opportunity.', req);
    return;
  }

  try {
    const newPost = await createPost(req.user.id, trimmedContent, category ? category.trim() : undefined, type);
    sendSuccess(res, 201, {
      message: 'Opportunity post created successfully.',
      post: {
        ...newPost,
        repliesCount: 0,
        connectionsCount: 0,
      },
    });
  } catch (err: any) {
    sendError(res, 400, 'POST_CREATION_FAILED', err.message || 'Failed to create post.', req, err);
  }
});

// ==========================================
// 4. REPLIES ENDPOINTS
// ==========================================

/**
 * GET /posts/:postId
 * Purpose: Return single post, author details, replies, and reply authors.
 */
router.get('/posts/:postId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const rawPostId = req.params.postId;
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId;

  if (typeof postId !== 'string' || postId.length > 100) {
    sendError(res, 400, 'BAD_REQUEST', 'Invalid or malformed Post ID parameter.', req);
    return;
  }

  try {
    const postData = await getPostAndReplies(postId);
    if (!postData) {
      sendError(res, 404, 'NOT_FOUND', 'Post not found.', req);
      return;
    }
    sendSuccess(res, 200, postData);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve post.', req, err);
  }
});

/**
 * POST /posts/:postId/replies
 * Purpose: Reply to a public post.
 * Protected endpoint. Public replies, no nested replies.
 */
router.post('/posts/:postId/replies', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.', req);
    return;
  }

  const rawPostId = req.params.postId;
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId;

  if (typeof postId !== 'string' || postId.length > 100) {
    sendError(res, 400, 'BAD_REQUEST', 'Invalid or malformed Post ID parameter.', req);
    return;
  }

  const { content } = req.body;

  if (typeof content !== 'string') {
    sendError(res, 400, 'BAD_REQUEST', 'Reply content must be a valid string.', req);
    return;
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length === 0) {
    sendError(res, 400, 'BAD_REQUEST', 'Reply content cannot be empty or whitespace-only.', req);
    return;
  }

  if (trimmedContent.length > 5000) {
    sendError(res, 400, 'BAD_REQUEST', 'Reply content exceeds maximum length of 5000 characters.', req);
    return;
  }

  try {
    const newReply = await createReply(postId, req.user.id, trimmedContent);
    sendSuccess(res, 201, {
      message: 'Reply published successfully.',
      reply: newReply,
    });
  } catch (err: any) {
    sendError(res, 400, 'REPLY_CREATION_FAILED', err.message || 'Failed to create reply.', req, err);
  }
});

// ==========================================
// 5. CONNECTIONS ENDPOINTS
// ==========================================

/**
 * POST /connections
 * Purpose: Establish connection after reviewing replies.
 * Authorization Requirement: Authenticated user MUST own the original post.
 */
router.post('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.', req);
    return;
  }

  const { replyId } = req.body;
  if (!replyId || typeof replyId !== 'string' || replyId.length > 100) {
    sendError(res, 400, 'BAD_REQUEST', 'replyId must be a valid string under 100 characters.', req);
    return;
  }

  try {
    const newConnection = await createConnection(req.user.id, replyId);
    sendSuccess(res, 201, {
      message: 'Bidirectional trusted connection established successfully.',
      connection: newConnection,
    });
  } catch (err: any) {
    if (err.message === 'DUPLICATE_CONNECTION') {
      sendError(res, 400, 'DUPLICATE_CONNECTION', 'A connection has already been established for this reply.', req, err);
    } else {
      sendError(res, 400, 'CONNECTION_FAILED', err.message || 'Failed to establish connection.', req, err);
    }
  }
});

/**
 * GET /connections
 * Purpose: Return established connections belonging to the authenticated user with pagination.
 */
router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized.', req);
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));

  try {
    const result = await getUserConnections(req.user.id, page, limit);
    sendSuccess(res, 200, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Failed to retrieve connections.', req, err);
  }
});

export default router;

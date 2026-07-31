import { Router, Response, Request } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  updateUserProfile,
  deleteUserAccount,
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  refreshSessionToken,
} from '../authService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getPosts, createPost } from '../services/postService.js';
import { getAgentProfile } from '../services/agentService.js';
import { getPostAndReplies, createReply } from '../services/replyService.js';
import { createConnection, getUserConnections } from '../services/connectionService.js';

const router = Router();

// 1. POST /api/auth/register
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const result = await registerUser(req.body);
    
    // Auto login on registration
    try {
      const loginResult = await loginUser({
        agentId: result.agentId,
        password: req.body.password,
        
      });
      res.cookie(REFRESH_COOKIE_NAME, loginResult.tokens.refreshToken, getRefreshCookieOptions());
      return res.status(201).json({
        success: true,
        data: {
          ...result,
          tokens: loginResult.tokens,
          user: loginResult.user,
        }
      });
    } catch (autoLoginErr) {
      return res.status(201).json({ success: true, data: result });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message || 'Registration failed' } });
  }
});

// 2. POST /api/auth/login
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const result = await loginUser(req.body);
    res.cookie(REFRESH_COOKIE_NAME, result.tokens.refreshToken, getRefreshCookieOptions());
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: { message: err.message } });
  }
});

// 2b. POST /api/auth/check-email
router.post('/auth/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) throw new Error('Email is required.');
    const { getSupabaseClient } = await import('../supabase.js');
    const { findUserByEmail } = await import('../authService.js');
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

// 2c. POST /api/auth/send-otp
router.post('/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error('Unauthorized');
    const token = authHeader.split(' ')[1];
    
    if (!email) throw new Error('Email is required.');
    
    // Mock OTP generation
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Mock OTP for ${email}: ${otp}`);

    // Send email using Gmail API
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    console.log(`Attempting to send email to ${email} with token ${token.substring(0, 5)}...`);

    const message = [
      `To: ${email}`,
      `From: AAMARVA <noreply@aamarva.net>`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      'Subject: Your OTP for AAMARVA',
      '',
      `Your OTP is: ${otp}`
    ].join('\r\n');
    
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    
    console.log(`OTP for ${email}: ${otp}`);
    
    // Gmail API disabled for now


    res.json({ success: true, message: 'OTP sent.', otp });
  } catch (err: any) {
    console.error('Error sending OTP:', err);
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

// 7. PUT /api/agents/me
router.put('/agents/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await updateUserProfile(req.user!.id, req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
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
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 9. POST /api/posts
router.post('/posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, category, type } = req.body;
    if (type === 'opportunity') throw new Error('Post type "opportunity" is not supported.');
    const post = await createPost(req.user!.id, content, category, type);
    res.status(201).json({ success: true, data: post });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 10. GET /api/posts/:postId
router.get('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const post = await getPostAndReplies(postId);
    res.json({ success: true, data: post });
  } catch (err: any) {
    res.status(404).json({ success: false, error: { message: err.message } });
  }
});

// 11. POST /api/posts/:postId/replies
router.post('/posts/:postId/replies', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = req.params.postId as string;
    const { content } = req.body;
    const reply = await createReply(postId, req.user!.id, content);
    res.status(201).json({ success: true, data: reply });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// 12. POST /api/connections
router.post('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 14. GET /api/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase.js');
    let agentsCount = 0;
    const sb = getSupabaseClient();
    const { count } = await sb.from('users').select('*', { count: 'exact', head: true });
    agentsCount = count || 0;
    res.json({ success: true, data: { agentsCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// 15. GET /api/agents (List all agents)
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const { getSupabaseClient } = await import('../supabase.js');
    let agents = [];
    const sb = getSupabaseClient();
    const { data } = await sb.from('users').select('agentId, name, avatar');
    agents = data || [];
    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

export default router;

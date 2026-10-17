import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../supabase';
import {
  registerUser,
  loginHuman,
  verifyHumanPasswordCredentials,
  createHumanSession,
  getUserById,
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
  requestAgentApiKeyRotation,
  confirmAgentApiKeyRotation,
  requestEmailChange,
  verifyEmailChange,
  requestAccountVerificationEmail,
  confirmAccountEmailVerification,
  requestForgotPassword,
  resetPassword,
  getResetTokenUser,
  verifyRefreshToken,
  invalidateAllHumanSessionsForUser,
  getVerificationStatus,
  updateUserWhitelist,
} from '../authService';
import { securityLayer } from '../middleware/securityLayerMiddleware';
import { humanLoginFirewall } from '../middleware/humanLoginFirewallMiddleware';
import { getClientIp } from '../utils/networkWhitelist.js';
import { floorActivityService } from '../services/floorActivityService';
import { generateLoginChallenge, verifySetupResponse, verifyLoginResponse } from '../services/webauthnService';
import { SecurityService } from '../services/securityService';

const router = Router();

// 1. POST /api/auth/register & /api/v1/auth/register
router.post(['/auth/register', '/v1/auth/register'], securityLayer('auth_register'), async (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    
    const emailToRegister = req.body?.email;
    if (!emailToRegister || typeof emailToRegister !== 'string' || !emailToRegister.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Please enter a valid email address.'
        }
      });
    }

    // Input validation constraints
    const nameInput = req.body?.agentName !== undefined ? req.body.agentName : (req.body?.name !== undefined ? req.body.name : req.body?.registerAgentName);
    if (nameInput !== undefined) {
      const trimmedName = nameInput.toString().trim();
      if (trimmedName.length < 1 || trimmedName.length > 50) {
        throw new Error('Agent name must be between 1 and 50 characters.');
      }
    }

    const bioInput = req.body?.bio;
    if (bioInput !== undefined) {
      const bioStr = bioInput.toString();
      if (bioStr.length > 220) {
        throw new Error('Agent bio description cannot exceed 220 characters.');
      }
    }

    const result = await registerUser(req.body, clientIp);
    
    // Broadcast floor activity: [Agent Name] registered on the floor
    floorActivityService.recordFloorActivity({
      agentId: result.agentId,
      agentName: result.user?.name || result.agentId,
      avatar: result.user?.avatar || '🤖',
      emailVerified: result.user?.verificationStatus === 'verified' || result.user?.emailVerified === true,
      text: 'registered on the floor',
      type: 'AGENT_REGISTERED',
      entityId: result.agentId,
      activityKey: `reg:${result.agentId}`
    }).catch(console.warn);

    return res.status(201).json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        agentId: result.agentId || result.user.agentId,
        name: result.user.name,
        bio: result.user.bio,
        whitelisted_networks: result.user.whitelisted_networks || []
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

// 2. POST /api/auth/human/login & /api/v1/auth/human/login (Human Login with Mandatory WebAuthn)
router.post(['/auth/human/login', '/v1/auth/human/login'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  const agentId = req.body?.agentId;
  try {
    const { password } = req.body;
    // Step 1: Verify human password credentials
    const safeUser = await verifyHumanPasswordCredentials({ agentId, password });
    
    // Step 2: Generate WebAuthn Challenge (WEBAUTHN_REQUIRED if passkey exists, WEBAUTHN_SETUP_REQUIRED if not)
    const challengeResult = await generateLoginChallenge(safeUser as any, req);

    res.json({
      success: true,
      status: challengeResult.status,
      pendingToken: challengeResult.pendingToken,
      options: challengeResult.options,
      user: {
        agentId: safeUser.agentId,
        name: safeUser.name,
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

    try {
      await SecurityService.getInstance().trackBehavioralSignal(agentId || req.ip || 'anonymous', 'BRUTE_FORCE_GUESS', { agentId, ip: req.ip });
    } catch (e) {}

    res.status(401).json({ 
      success: false, 
      error: { 
        code: 'UNAUTHORIZED',
        message: errorMessage || 'Invalid Account ID or Password.' 
      } 
    });
  }
});

// 2a. POST /api/auth/webauthn/verify-setup & /api/v1/auth/webauthn/verify-setup (Setup first device passkey during login)
router.post(['/auth/webauthn/verify-setup', '/v1/auth/webauthn/verify-setup'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { pendingToken, credentialResponse, friendlyName } = req.body;
    if (!pendingToken || !credentialResponse) {
      return res.status(400).json({ success: false, error: { message: 'Missing pendingToken or credentialResponse' } });
    }

    const { userId } = await verifySetupResponse(pendingToken, credentialResponse, friendlyName, req);
    const userRecord = await getUserById(userId);
    if (!userRecord) {
      return res.status(400).json({ success: false, error: { message: 'User record not found.' } });
    }

    const sessionId = await createHumanSession(userId);
    res.cookie(HUMAN_SESSION_COOKIE_NAME, sessionId, getHumanSessionCookieOptions());

    const { passwordHash: _, apiKeyHash: __, ...safeUser } = userRecord;
    res.json({
      success: true,
      data: {
        user: safeUser,
      }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { message: err?.message || 'WebAuthn device passkey registration failed.' }
    });
  }
});

// 2b. POST /api/auth/webauthn/verify-login & /api/v1/auth/webauthn/verify-login (Device passkey authentication during login)
router.post(['/auth/webauthn/verify-login', '/v1/auth/webauthn/verify-login'], humanLoginFirewall, securityLayer('auth_login'), async (req: Request, res: Response) => {
  try {
    const { pendingToken, credentialResponse } = req.body;
    if (!pendingToken || !credentialResponse) {
      return res.status(400).json({ success: false, error: { message: 'Missing pendingToken or credentialResponse' } });
    }

    const { userId } = await verifyLoginResponse(pendingToken, credentialResponse, req);
    const userRecord = await getUserById(userId);
    if (!userRecord) {
      return res.status(400).json({ success: false, error: { message: 'User record not found.' } });
    }

    const sessionId = await createHumanSession(userId);
    res.cookie(HUMAN_SESSION_COOKIE_NAME, sessionId, getHumanSessionCookieOptions());

    const { passwordHash: _, apiKeyHash: __, ...safeUser } = userRecord;
    res.json({
      success: true,
      data: {
        user: safeUser,
      }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { message: err?.message || 'WebAuthn device passkey authentication failed.' }
    });
  }
});

export default router;

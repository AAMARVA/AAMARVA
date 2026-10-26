import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest, requireHumanSession, requireUserOrAgentAuth } from '../middleware/authMiddleware.js';
import { securityLayer } from '../middleware/securityLayerMiddleware.js';
import {
  listUserMcpServers,
  getMcpServer,
  addMcpServerWithDiscovery,
  updateMcpServer,
  revalidateAndSyncMcpServer,
  removeMcpServer,
  listToolsForServer,
  setToolAssignment,
  invokeAuthorizedTool,
  getAuthorizedToolsForAgent,
  validateEndpointUrl,
  getToolRecord,
  getToolHitlPolicy,
  setToolHitlPolicy,
  getPendingInvocationRecord,
  updateInvocationRecord,
  createToolGrantRecord,
  approvePendingInvocation,
  denyPendingInvocation,
  listPendingInvocationsForOwner,
  hashToolArguments,
  grantToolAccess,
  revokeToolAccess,
  listToolGrantsForServer,
  listToolAccessRequests,
  approveToolAccessRequest,
  rejectToolAccessRequest
} from '../services/mcpService.js';
import { getSupabaseClient } from '../supabase.js';

const router = Router();

/**
 * 1. GET /api/floor/servers
 * List configured MCP servers for the authenticated operator
 */
router.get(
  '/servers',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.masterId || req.user!.id;
      const servers = await listUserMcpServers(userId);
      res.json({ success: true, data: servers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list MCP servers.' } });
    }
  }
);

/**
 * 2. POST /api/floor/servers
 * Register a new MCP server, test live connection, and discover tools (Human/Master only)
 */
router.post(
  '/servers',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, endpoint, description, transport, auth_type, auth_header_name, auth_credential } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, error: { message: 'Server display name is required.' } });
      }

      if (!endpoint || typeof endpoint !== 'string' || !endpoint.trim()) {
        return res.status(400).json({ success: false, error: { message: 'Server endpoint URL is required.' } });
      }

      const chosenTransport = transport || 'http-streamable';
      if (chosenTransport !== 'http-streamable' && chosenTransport !== 'http-sse') {
        return res.status(400).json({
          success: false,
          error: { message: `Unsupported transport '${chosenTransport}'. Only 'http-streamable' and 'http-sse' are supported.` }
        });
      }

      const ssrfCheck = await validateEndpointUrl(endpoint.trim(), auth_type || 'none', Boolean(auth_credential));
      if (!ssrfCheck.valid) {
        return res.status(400).json({ success: false, error: { message: ssrfCheck.error } });
      }

      const userId = req.user!.id;
      const result = await addMcpServerWithDiscovery(userId, {
        name: name.trim(),
        endpoint: endpoint.trim(),
        description: description?.trim(),
        transport: chosenTransport,
        auth_type: auth_type || 'none',
        auth_header_name: auth_header_name?.trim(),
        auth_credential: auth_credential?.trim()
      });

      res.status(201).json({
        success: true,
        data: result.server,
        tools: result.tools,
        discoveryNotice: result.error || null
      });
    } catch (err: any) {
      const isAuth = err?.message?.includes('401') || err?.message?.includes('Unauthorized');
      const isForbidden = err?.message?.includes('403') || err?.message?.includes('Forbidden');
      res.status(isAuth ? 401 : isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err?.message || 'Failed to connect and register MCP server.' }
      });
    }
  }
);

/**
 * 3. GET /api/floor/servers/:id
 * Retrieve server details, status, and discovered tools
 */
router.get(
  '/servers/:id',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.masterId || req.user!.id;
      const serverId = req.params.id as string;
      const server = await getMcpServer(userId, serverId);

      if (!server) {
        return res.status(404).json({ success: false, error: { message: 'MCP server not found.' } });
      }

      const tools = await listToolsForServer(userId, serverId);
      res.json({ success: true, data: { ...server, tools } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to retrieve MCP server.' } });
    }
  }
);

/**
 * 3b. PUT /api/floor/servers/:id
 * Update server configuration, credentials, and re-sync discovered tools (Human/Master only)
 */
router.put(
  '/servers/:id',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const serverId = req.params.id as string;
      const { name, endpoint, description, transport, auth_type, auth_header_name, auth_credential } = req.body;

      const result = await updateMcpServer(userId, serverId, {
        name,
        endpoint,
        description,
        transport,
        auth_type,
        auth_header_name,
        auth_credential
      });

      res.json({
        success: true,
        data: result.server,
        tools: result.tools,
        discoveryNotice: result.error || null
      });
    } catch (err: any) {
      const isNotFound = err?.message?.includes('not found');
      const isAuth = err?.message?.includes('401') || err?.message?.includes('Unauthorized');
      const isForbidden = err?.message?.includes('403') || err?.message?.includes('Forbidden');
      res.status(isNotFound ? 404 : isAuth ? 401 : isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err?.message || 'Failed to update MCP server.' }
      });
    }
  }
);

/**
 * 4. POST /api/floor/servers/:id/reconnect
 * Re-validate connection and re-sync discovered tools from the remote server
 */
router.post(
  '/servers/:id/reconnect',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const serverId = req.params.id as string;
      const result = await revalidateAndSyncMcpServer(userId, serverId);

      if (result.error) {
        const isAuth = result.error.includes('401') || result.error.includes('Unauthorized');
        const isForbidden = result.error.includes('403') || result.error.includes('Forbidden');
        return res.status(isAuth ? 401 : isForbidden ? 403 : 400).json({
          success: false,
          error: { message: result.error },
          data: result.server,
          tools: result.tools
        });
      }

      res.json({
        success: true,
        data: result.server,
        tools: result.tools,
        discoveryNotice: null
      });
    } catch (err: any) {
      const isAuth = err?.message?.includes('401') || err?.message?.includes('Unauthorized');
      const isForbidden = err?.message?.includes('403') || err?.message?.includes('Forbidden');
      res.status(isAuth ? 401 : isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err?.message || 'Re-validation failed.' }
      });
    }
  }
);

/**
 * 5. DELETE /api/floor/servers/:id
 * Remove server and cascade deletion of tools and permissions
 */
router.delete(
  '/servers/:id',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const serverId = req.params.id as string;
      await removeMcpServer(userId, serverId);
      res.json({ success: true, message: 'MCP server removed successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to remove MCP server.' } });
    }
  }
);

/**
 * 6. GET /api/floor/servers/:id/tools
 * Get tools for a specific server with assigned agents list
 */
router.get(
  '/servers/:id/tools',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.masterId || req.user!.id;
      const serverId = req.params.id as string;
      const tools = await listToolsForServer(userId, serverId);
      res.json({ success: true, data: tools });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list server tools.' } });
    }
  }
);

/**
 * 7. POST /api/floor/tools/:toolId/assignments
 * Assign or revoke agent access to a specific tool (Human/Master only)
 */
router.post(
  '/tools/:toolId/assignments',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const toolId = req.params.toolId as string;
      const agentId = req.body.agentId || req.body.accountId;
      const granted = req.body.granted;

      if (!agentId || typeof agentId !== 'string') {
        return res.status(400).json({ success: false, error: { message: 'Target agentId is required.' } });
      }

      if (typeof granted !== 'boolean') {
        return res.status(400).json({ success: false, error: { message: 'granted must be a boolean' } });
      }

      const tool = await getToolRecord(toolId);
      if (tool) {
        if (granted) {
          await grantToolAccess(userId, tool.server_id, toolId, agentId);
        } else {
          await revokeToolAccess(userId, tool.server_id, toolId, agentId);
        }
      } else {
        await setToolAssignment(userId, toolId, agentId, granted);
      }

      res.json({
        success: true,
        assigned: granted,
        message: granted ? `Tool access granted to ${agentId}` : `Tool access revoked from ${agentId}`
      });
    } catch (err: any) {
      const isForbidden = err?.message?.includes("does not belong to operator's") || err?.message?.includes('unauthorized');
      res.status(isForbidden ? 403 : 400).json({ success: false, error: { message: err?.message || 'Failed to update tool assignment.' } });
    }
  }
);

/**
 * 7b. POST /api/floor/tools/:toolId/grants
 * Grant or revoke permanent tool access to a specific account (Human/Master only)
 */
router.post(
  '/tools/:toolId/grants',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const toolId = req.params.toolId as string;
      const accountId = req.body.accountId || req.body.agentId;
      const granted = req.body.granted;

      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({ success: false, error: { message: 'Target accountId is required.' } });
      }

      if (typeof granted !== 'boolean') {
        return res.status(400).json({ success: false, error: { message: 'granted must be a boolean.' } });
      }

      const tool = await getToolRecord(toolId);
      if (!tool) {
        return res.status(404).json({ success: false, error: { message: 'Tool not found.' } });
      }

      if (granted) {
        const result = await grantToolAccess(operatorId, tool.server_id, toolId, accountId);
        return res.json({
          success: true,
          granted: true,
          grant: result.grant,
          message: `Permanent access to '${tool.name}' granted to ${accountId}`
        });
      } else {
        const result = await revokeToolAccess(operatorId, tool.server_id, toolId, accountId);
        return res.json({
          success: true,
          granted: false,
          message: `Access to '${tool.name}' revoked from ${accountId}`
        });
      }
    } catch (err: any) {
      const isForbidden = err?.message?.includes("does not belong to operator's") || err?.message?.includes('unauthorized');
      res.status(isForbidden ? 403 : 400).json({ success: false, error: { message: err?.message || 'Failed to update tool grant.' } });
    }
  }
);

/**
 * 7c. GET /api/floor/servers/:serverId/grants
 * List active tool grants for a specific server
 */
router.get(
  '/servers/:serverId/grants',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.masterId || req.user!.id;
      const serverId = req.params.serverId as string;
      const grants = await listToolGrantsForServer(operatorId, serverId);
      res.json({ success: true, data: grants });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list tool grants.' } });
    }
  }
);

/**
 * 7d. GET /api/floor/requests
 * List persistent MCP tool access requests (Human/Master only)
 */
router.get(
  '/requests',
  requireHumanSession,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const serverId = req.query.serverId as string | undefined;
      const status = req.query.status as string | undefined;
      const requests = await listToolAccessRequests(operatorId, serverId, status);
      res.json({ success: true, data: requests });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list tool access requests.' } });
    }
  }
);

/**
 * 7e. POST /api/floor/requests/:requestId/approve
 * Approve an MCP tool access request, creating a permanent grant (Human/Master only)
 */
router.post(
  '/requests/:requestId/approve',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const requestId = req.params.requestId as string;
      const result = await approveToolAccessRequest(operatorId, requestId);
      res.json({
        success: true,
        data: result.request,
        grant: result.grant,
        message: `Tool access request approved and permanent grant issued to account ${result.request.account_id}.`
      });
    } catch (err: any) {
      const isForbidden = err?.message?.includes('Forbidden');
      const isNotFound = err?.message?.includes('not found');
      res.status(isForbidden ? 403 : isNotFound ? 404 : 400).json({
        success: false,
        error: { message: err?.message || 'Failed to approve tool access request.' }
      });
    }
  }
);

/**
 * 7f. POST /api/floor/requests/:requestId/reject
 * Reject an MCP tool access request without granting permission (Human/Master only)
 */
router.post(
  '/requests/:requestId/reject',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const requestId = req.params.requestId as string;
      const { reason } = req.body || {};
      const result = await rejectToolAccessRequest(operatorId, requestId, reason);
      res.json({
        success: true,
        data: result.request,
        message: 'Tool access request rejected.'
      });
    } catch (err: any) {
      const isForbidden = err?.message?.includes('Forbidden');
      const isNotFound = err?.message?.includes('not found');
      res.status(isForbidden ? 403 : isNotFound ? 404 : 400).json({
        success: false,
        error: { message: err?.message || 'Failed to reject tool access request.' }
      });
    }
  }
);

/**
 * 8. GET /api/floor/fleet-agents
 * List fleet accounts available for tool assignment (Master + Slave Agents)
 */
router.get(
  '/fleet-agents',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const supabase = getSupabaseClient();

      let authUsers: any[] = [];
      try {
        const { data } = await supabase.auth.admin.listUsers();
        if (data && data.users) {
          authUsers = data.users;
        }
      } catch (e) {}

      const { data: tableUsers } = await supabase
        .from('users')
        .select('*');

      const userMap = new Map<string, any>();

      if (Array.isArray(tableUsers)) {
        for (const u of tableUsers) {
          userMap.set(u.id, u);
          if (u.agentId) userMap.set(u.agentId, u);
        }
      }

      if (Array.isArray(authUsers)) {
        for (const au of authUsers) {
          const existing = userMap.get(au.id) || {};
          userMap.set(au.id, {
            ...existing,
            id: au.id,
            agentId: existing.agentId || au.user_metadata?.agentId || au.email?.split('@')[0],
            name: existing.name || au.user_metadata?.name || au.email?.split('@')[0] || 'Agent Node',
            avatar: existing.avatar || au.user_metadata?.avatar || '🤖',
            created_at: existing.created_at || au.created_at,
            plan: existing.plan || au.user_metadata?.plan,
            hasCapabilityIncrement: existing.hasCapabilityIncrement || au.user_metadata?.hasCapabilityIncrement,
            isCapped: existing.isCapped ?? au.user_metadata?.isCapped ?? true
          });
        }
      }

      const masterUserId = req.user!.masterId || req.user!.id;
      const allAgentsList = Array.from(userMap.values()).filter(
        (a) => a.master_id === masterUserId || a.id === masterUserId
      );

      let capService: any = null;
      try {
        const mod = await import('../services/capabilityService.js');
        capService = mod.CapabilityService?.getInstance?.();
      } catch (e) {}

      const accountsMap = new Map<string, any>();
      for (const s of allAgentsList) {
        if (accountsMap.has(s.id)) continue;
        
        let cap: any = null;
        if (capService) {
          try {
            cap = await capService.getAgentCapability(s.id) || await capService.getAgentCapability(s.agentId);
          } catch (e) {}
        }
        const expiresAt = cap?.expires_at || s.plan_expires_at || s.expires_at || null;
        const isCapped = s.isCapped === true || (s.plan && s.plan.includes('capped'));
        const isMaster = (s.id === masterUserId && (!s.master_id || s.is_master_primary === true)) || s.account_type === 'master' || s.is_master_primary === true;

        accountsMap.set(s.id, {
          id: s.id,
          agentId: s.agentId || s.id,
          name: s.name || s.agentId || 'Agent Node',
          avatar: s.avatar || '🤖',
          isMaster: isMaster,
          hasCapabilityIncrement: Boolean(
            s.hasCapabilityIncrement ||
            s.plan === 'slave_capability' ||
            (expiresAt && new Date(expiresAt).getTime() > Date.now())
          ),
          plan: s.plan,
          isCapped: isCapped,
          expires_at: expiresAt,
          plan_created_at: s.plan_created_at,
          created_at: s.created_at
        });
      }

      const finalAccounts = Array.from(accountsMap.values());

      res.json({ success: true, data: finalAccounts });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list fleet accounts.' } });
    }
  }
);

/**
 * 9. POST /api/floor/tools/:toolId/invoke
 * Server-governed Tool Execution Proxy: Enforces agent-level tool assignment before invoking
 */
router.post(
  '/tools/:toolId/invoke',
  requireUserOrAgentAuth,
  securityLayer('floor_invoke'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const toolId = req.params.toolId as string;
      const toolArgs = (req.body?.arguments && typeof req.body.arguments === 'object') ? req.body.arguments : req.body || {};

      const caller = {
        userId: req.user!.id,
        agentId: req.user!.agentId || req.user!.id,
        isMaster: !req.user!.masterId || req.user!.masterId === req.user!.id
      };

      const result = await invokeAuthorizedTool(caller, toolId, toolArgs);

      if (!result.success) {
        if (result.error === 'HITL_APPROVAL_REQUIRED') {
          return res.status(202).json({ success: false, status: 'pending', invocationId: result.invocationId });
        }
        if (result.requiresAccessApproval) {
          return res.status(403).json({
            success: false,
            error: { message: result.error },
            requestId: result.requestId,
            requiresAccessApproval: true
          });
        }
        const isForbidden = result.error?.includes('Forbidden') || result.error?.includes('not authorized');
        return res.status(isForbidden ? 403 : 400).json({
          success: false,
          error: { message: result.error }
        });
      }

      res.json({ success: true, data: result.result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Tool execution failed.' } });
    }
  }
);

/**
 * 10. POST /api/floor/approvals/:invocationId
 * Human approval endpoint: Authorizes a specific pending tool invocation and generates a short-lived temporary grant
 */
/**
 * 10. GET /api/floor/pending-invocations
 * Retrieve all pending unexpired tool invocations awaiting operator approval
 */
router.get(
  '/pending-invocations',
  requireHumanSession,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const operatorId = req.user!.id;
      const pending = await listPendingInvocationsForOwner(operatorId);
      res.json({ success: true, data: pending });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list pending invocations.' } });
    }
  }
);

/**
 * 11. POST /api/floor/approvals/:invocationId
 * Human approval endpoint: Authorizes a specific pending tool invocation using atomic conditional update and internal grant creation
 */
router.post(
  '/approvals/:invocationId',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const invocationId = req.params.invocationId as string;
      const { approved } = req.body;
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ success: false, error: { message: 'Invalid approval status (boolean required).' } });
      }

      const operatorId = req.user!.id;

      if (approved) {
        const result = await approvePendingInvocation(operatorId, invocationId);
        if (!result.success) {
          const status = result.error?.includes('not found')
            ? 404
            : result.error?.includes('Forbidden')
              ? 403
              : result.error?.includes('expired')
                ? 410
                : 400;
          return res.status(status).json({ success: false, error: { message: result.error || 'Failed to approve invocation.' } });
        }
        return res.json({
          success: true,
          status: 'approved',
          message: 'Invocation approved.'
        });
      } else {
        const result = await denyPendingInvocation(operatorId, invocationId);
        if (!result.success) {
          const status = result.error?.includes('not found')
            ? 404
            : result.error?.includes('Forbidden')
              ? 403
              : result.error?.includes('expired')
                ? 410
                : 400;
          return res.status(status).json({ success: false, error: { message: result.error || 'Failed to deny invocation.' } });
        }
        return res.json({
          success: true,
          status: 'denied',
          message: 'Invocation denied.'
        });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: { message: err?.message || 'Failed to process approval.' } });
    }
  }
);

/**
 * 11. POST /api/floor/invocations/:invocationId/execute
 * Execute approved tool invocation: Validates caller agent, owner scope, arguments hash, and consumes temporary grant
 */
router.post(
  '/invocations/:invocationId/execute',
  requireUserOrAgentAuth,
  securityLayer('floor_invoke'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const invocationId = req.params.invocationId as string;
      const invocation = await getPendingInvocationRecord(invocationId);

      if (!invocation) {
        return res.status(404).json({ success: false, error: { message: 'Invocation not found.' } });
      }

      if (invocation.status !== 'approved') {
        return res.status(403).json({ success: false, error: { message: `Invocation not approved (status: ${invocation.status}).` } });
      }

      if (new Date(invocation.expires_at).getTime() <= Date.now()) {
        invocation.status = 'expired';
        await updateInvocationRecord(invocation);
        return res.status(410).json({ success: false, error: { message: 'Invocation has expired.' } });
      }

      // Verify tool ID matches if provided in body
      if (req.body?.toolId && req.body.toolId !== invocation.tool_id) {
        return res.status(400).json({
          success: false,
          error: { message: 'Provided toolId does not match approved invocation tool.' }
        });
      }
      if (req.body?.tool_id && req.body.tool_id !== invocation.tool_id) {
        return res.status(400).json({
          success: false,
          error: { message: 'Provided tool_id does not match approved invocation tool.' }
        });
      }

      const callerAgentId = req.user!.agentId || req.user!.id;
      const callerUserId = req.user!.id;
      const callerMasterId = req.user!.masterId || req.user!.id;

      // CRITICAL CHECK: Verify authenticated caller matches invocation's requesting agent AND authorized owner scope
      const matchesAgent = callerAgentId === invocation.agent_id;
      const matchesOwnerScope = (
        callerMasterId === invocation.owner_id ||
        callerUserId === invocation.owner_id ||
        callerUserId === invocation.caller_id
      );

      if (!matchesAgent || !matchesOwnerScope) {
        return res.status(403).json({
          success: false,
          error: { message: 'Forbidden: Authenticated caller does not match invocation requesting agent or authorized owner scope.' }
        });
      }

      // Recover and verify approved arguments
      const executionArgs = invocation.args;
      const suppliedArgs = (req.body?.arguments && typeof req.body.arguments === 'object')
        ? req.body.arguments
        : (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0 && !('grantToken' in req.body && Object.keys(req.body).length === 1))
          ? req.body
          : null;

      if (suppliedArgs && Object.keys(suppliedArgs).length > 0) {
        const suppliedHash = hashToolArguments(suppliedArgs);
        const approvedHash = invocation.args_hash || hashToolArguments(invocation.args);
        if (suppliedHash !== approvedHash) {
          return res.status(400).json({
            success: false,
            error: { message: 'Provided arguments do not match approved invocation arguments.' }
          });
        }
      }

      const grantToken = req.body?.grantToken || req.body?.grant_token || req.headers['x-floor-grant-token'];

      const caller = {
        userId: callerUserId,
        agentId: callerAgentId,
        isMaster: !req.user!.masterId || req.user!.masterId === req.user!.id
      };

      const result = await invokeAuthorizedTool(
        caller,
        invocation.tool_id,
        executionArgs,
        invocationId,
        typeof grantToken === 'string' ? grantToken : undefined
      );

      if (!result.success) {
        const isForbidden = result.error?.includes('Forbidden') || result.error?.includes('not authorized') || result.error?.includes('CONSUMED');
        return res.status(isForbidden ? 403 : 400).json({
          success: false,
          error: { message: result.error }
        });
      }

      res.json({ success: true, data: result.result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Tool execution failed.' } });
    }
  }
);

/**
 * 12. GET /api/floor/tools/:toolId/policy
 * Retrieve Human-in-the-Loop (HITL) policy for a tool
 */
router.get(
  '/tools/:toolId/policy',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const toolId = req.params.toolId as string;
      const policy = await getToolHitlPolicy(toolId);
      res.json({ success: true, data: policy || { tool_id: toolId, hitl_enabled: false } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to retrieve tool policy.' } });
    }
  }
);

/**
 * 13. POST /api/floor/tools/:toolId/policy
 * Set Human-in-the-Loop (HITL) policy for a tool (Human only)
 */
router.post(
  '/tools/:toolId/policy',
  requireHumanSession,
  securityLayer('floor_manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const toolId = req.params.toolId as string;
      const { hitl_enabled } = req.body;
      if (typeof hitl_enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: { message: 'hitl_enabled must be a boolean.' } });
      }

      const policy = await setToolHitlPolicy(req.user!.id, toolId, hitl_enabled);
      res.json({ success: true, data: policy });
    } catch (err: any) {
      const isForbidden = err?.message?.includes('Forbidden');
      res.status(isForbidden ? 403 : 400).json({ success: false, error: { message: err?.message || 'Failed to set tool policy.' } });
    }
  }
);

/**
 * 10. GET /api/floor/agent/tools
 * Agent discovery: Returns only tools specifically assigned to the calling agent
 */
router.get(
  '/agent/tools',
  requireUserOrAgentAuth,
  securityLayer('floor_reads'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const caller = {
        userId: req.user!.id,
        agentId: req.user!.agentId || req.user!.id
      };

      const tools = await getAuthorizedToolsForAgent(caller);
      res.json({ success: true, data: tools });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list authorized agent tools.' } });
    }
  }
);

export default router;

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
  rejectToolAccessRequest,
  validateToolArguments,
  recordOrReuseAccessRequest,
  hasActiveToolGrant,
  getToolAccessRequestRecord,
  getServerRecord,
  createPendingInvocationRecord,
  decryptMcpCredential,
  PendingToolInvocationRecord
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

        const isSlave = Boolean(
          (s.master_id && s.master_id !== s.id) ||
          (s.masterUserId && s.masterUserId !== s.id) ||
          (s.email && typeof s.email === 'string' && s.email.includes('+AMR-')) ||
          s.account_type === 'slave' ||
          s.role === 'slave' ||
          s.is_slave === true ||
          s.isSlave === true
        );
        const isMaster = !isSlave;

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
 * Send Tool Request: Validates tool existence, schema conformance, authorization, and HITL policy.
 * Returns 202 with requestId and status 'pending' if access or human approval is needed.
 */
router.post(
  '/tools/:toolId/invoke',
  requireUserOrAgentAuth,
  securityLayer('floor_invoke'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const toolId = req.params.toolId as string;

      // 1. Authenticate and validate tool ID
      const tool = await getToolRecord(toolId);
      if (!tool) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Tool not found.' }
        });
      }

      if (!tool.is_enabled) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Forbidden: Tool is disabled by operator policy.' }
        });
      }

      const server = await getServerRecord(tool.server_id);
      const serverAuthType = server?.auth_type || 'none';
      const serverUrl = server?.endpoint || '';

      // 2. Validate arguments
      let toolArgs: any;
      if (req.body && typeof req.body === 'object' && 'arguments' in req.body) {
        toolArgs = req.body.arguments;
      } else if (
        req.body &&
        typeof req.body === 'object' &&
        Object.keys(req.body).length > 0 &&
        !('reason' in req.body) &&
        !('requestType' in req.body)
      ) {
        toolArgs = req.body;
      } else {
        return res.status(400).json({
          success: false,
          error: { message: 'Field "arguments" is required and must be an object.' }
        });
      }

      if (!toolArgs || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Field "arguments" must be a non-null object.' }
        });
      }

      // Validate arguments against tool.input_schema using Ajv schema validator
      const validation = validateToolArguments(tool.input_schema, toolArgs);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid tool arguments: ${validation.error || 'Schema validation failed'}` }
        });
      }

      // Validate reason if provided
      if (req.body?.reason !== undefined) {
        if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) {
          return res.status(400).json({
            success: false,
            error: { message: 'Field "reason" must be a non-empty string explaining why the agent needs the tool.' }
          });
        }
      }

      // Validate requestType if provided
      const requestType = req.body?.requestType;
      if (requestType !== undefined) {
        if (requestType !== 'access' && requestType !== 'hitl') {
          return res.status(400).json({
            success: false,
            error: { message: 'Field "requestType" must be either "access" or "hitl".' }
          });
        }
      }

      const caller = {
        userId: req.user!.id,
        agentId: req.user!.agentId || req.user!.id,
        isMaster: !req.user!.masterId || req.user!.masterId === req.user!.id
      };

      // 3. Authorization check
      const hasGrant =
        caller.isMaster ||
        (await hasActiveToolGrant(tool.server_id, tool.id, caller.agentId)) ||
        (await hasActiveToolGrant(tool.server_id, tool.id, caller.userId));

      const policy = await getToolHitlPolicy(tool.id);
      const hitlEnabled = Boolean(policy?.hitl_enabled);

      // Case A: Access approval required (explicitly requested or not granted)
      if (requestType === 'access' || !hasGrant) {
        const accessReq = await recordOrReuseAccessRequest({
          serverId: tool.server_id,
          toolId: tool.id,
          toolName: tool.name,
          serverName: server?.name || 'MCP Server',
          accountId: caller.agentId || caller.userId,
          callerId: caller.userId,
          agentName: caller.agentId,
          requestedOperation: 'tool_invocation',
          arguments: toolArgs
        });

        return res.status(202).json({
          success: false,
          status: 'pending',
          data: {
            requestId: accessReq.id,
            invocationId: accessReq.id,
            status: 'pending',
            toolId: tool.id,
            toolName: tool.name,
            serverUrl,
            authType: serverAuthType,
            auth_type: serverAuthType
          },
          requestId: accessReq.id,
          invocationId: accessReq.id,
          requiresAccessApproval: true
        });
      }

      // Case B: HITL approval required (explicitly requested or policy enabled)
      if (requestType === 'hitl' || hitlEnabled) {
        const invResult = await invokeAuthorizedTool(caller, toolId, toolArgs);
        const invId = invResult.invocationId;

        return res.status(202).json({
          success: false,
          status: 'pending',
          data: {
            requestId: invId,
            invocationId: invId,
            status: 'pending',
            toolId: tool.id,
            toolName: tool.name,
            serverUrl,
            authType: serverAuthType,
            auth_type: serverAuthType
          },
          requestId: invId,
          invocationId: invId
        });
      }

      // Case C: Agent has sufficient existing authorization and no approval required
      // Do not execute the tool through this endpoint; create approved invocation record for access retrieval
      const argsHash = hashToolArguments(toolArgs);
      const invId = `inv_${crypto.randomBytes(8).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const approvedRecord: PendingToolInvocationRecord = {
        id: invId,
        tool_id: tool.id,
        caller_id: caller.userId,
        agent_id: caller.agentId,
        owner_id: req.user?.masterId || caller.userId,
        args: toolArgs,
        args_hash: argsHash,
        status: 'approved',
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await createPendingInvocationRecord(approvedRecord);

      return res.status(200).json({
        success: true,
        status: 'approved',
        data: {
          requestId: invId,
          invocationId: invId,
          status: 'approved',
          toolId: tool.id,
          toolName: tool.name,
          serverUrl,
          authType: serverAuthType,
          auth_type: serverAuthType,
          arguments: toolArgs
        },
        requestId: invId,
        invocationId: invId
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Tool request failed.' } });
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
 * 11. POST /api/floor/invocations/:invocationId/access (and alias /execute)
 * Get Tool Access:
 * - For assigned agents and agents with granted access, return success: true with
 *   necessary tool details, server URL, authentication configuration, and verification information.
 * - For unassigned agents or agents without granted access, return success: false with a clear message that they do not have access to the tool.
 * - This endpoint must NOT execute the tool.
 * - Dynamically respects MCP server's configured auth method: No Auth, Bearer Token, API Key, or Custom Header.
 */
const handleTemporaryAccess = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const invocationId = (req.params.invocationId || req.body?.invocationId || req.body?.requestId) as string;

    if (!invocationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Invocation ID or Request ID is required.' }
      });
    }

    // If caller called /access with empty reason, maintain backwards test compatibility
    if (req.path.endsWith('/access') && !req.body?.reason && !req.body?.verification) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Field "reason" is required and must explain why temporary access is needed.' }
      });
    }

    const callerAgentId = req.user!.agentId || req.user!.id;
    const callerUserId = req.user!.id;
    const callerMasterId = req.user!.masterId || req.user!.id;
    const isMaster = (req.user as any)?.isMaster || (!req.user!.masterId || req.user!.masterId === req.user!.id);

    const normalizeId = (id?: string) => id?.trim().replace(/^@/, '').toLowerCase() || '';
    const callerNorm = normalizeId(callerAgentId);

    // Look up either in pending_tool_invocations or mcp_tool_requests
    let invocation = await getPendingInvocationRecord(invocationId);
    let accessReq = !invocation ? await getToolAccessRequestRecord(invocationId) : null;

    if (!invocation && !accessReq) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invocation or tool request not found.' },
        message: 'Invocation or tool request not found.'
      });
    }

    const toolId = invocation?.tool_id || accessReq?.tool_id;
    const tool = toolId ? await getToolRecord(toolId) : null;
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found.' },
        message: 'Tool not found.'
      });
    }

    const server = await getServerRecord(tool.server_id);
    const serverUrl = server?.endpoint || '';
    const authType = server?.auth_type || 'none';

    // Verify ownership / requester authorization
    const targetAgentId = invocation ? invocation.agent_id : accessReq!.account_id;
    const targetCallerId = invocation ? invocation.caller_id : accessReq!.caller_id;
    const targetOwnerId = invocation ? invocation.owner_id : server?.owner_id;

    const targetNorm = normalizeId(targetAgentId);
    const matchesAgent =
      callerAgentId === targetAgentId ||
      callerUserId === targetAgentId ||
      callerUserId === targetCallerId ||
      (Boolean(targetNorm) && callerNorm === targetNorm);

    const matchesOwnerScope =
      callerMasterId === targetOwnerId ||
      callerUserId === targetOwnerId ||
      callerUserId === targetCallerId;

    if (!matchesAgent && !matchesOwnerScope) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden: Invocation does not belong to authenticated agent.' },
        message: 'Forbidden: Invocation does not belong to authenticated agent.'
      });
    }

    // Verify that required access or human approval has been granted
    if (invocation && invocation.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Invocation is not approved (current status: '${invocation.status}').` },
        message: `Invocation is not approved (current status: '${invocation.status}').`
      });
    }

    if (accessReq && accessReq.status !== 'approved') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access request is not approved.' },
        message: 'Access denied: Agent is unassigned or does not have granted access to this tool.'
      });
    }

    // Verify access status:
    // Check if caller is assigned or has active grant
    const hasGrant =
      (await hasActiveToolGrant(tool.server_id, tool.id, callerAgentId)) ||
      (await hasActiveToolGrant(tool.server_id, tool.id, callerUserId)) ||
      (matchesOwnerScope && !req.user?.agentId);

    const isApproved =
      (invocation && invocation.status === 'approved') ||
      (accessReq && accessReq.status === 'approved');

    const isDenied =
      (invocation && ['denied', 'failed'].includes(invocation.status)) ||
      (accessReq && accessReq.status === 'rejected');

    // For unassigned agents or agents without granted access, return success: false with a clear message
    if ((!hasGrant && !isApproved) || isDenied) {
      const msg = isDenied
        ? 'Access denied: Request was denied by operator.'
        : 'Access denied: Agent is unassigned and does not have granted access to this tool.';
      return res.status(403).json({
        success: false,
        status: 'denied',
        error: {
          code: 'FORBIDDEN',
          message: msg
        },
        message: msg
      });
    }

    // Check expiry
    if (invocation && new Date(invocation.expires_at).getTime() <= Date.now()) {
      invocation.status = 'expired';
      await updateInvocationRecord(invocation);
      return res.status(410).json({
        success: false,
        error: { code: 'EXPIRED', message: 'Approved invocation has expired.' },
        message: 'Approved invocation has expired.'
      });
    }

    // Anti-replay / token reuse protection
    if (invocation && ((invocation as any).consumed_at || (invocation as any).retrieved_at)) {
      return res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'Temporary access credentials have already been retrieved or consumed.' },
        message: 'Temporary access credentials have already been retrieved or consumed.'
      });
    }

    const nowIso = new Date().toISOString();
    if (invocation) {
      (invocation as any).retrieved_at = nowIso;
      (invocation as any).consumed_at = nowIso;
    }

    // Generate single-use temporary token
    const grantToken = `grant_${crypto.randomBytes(24).toString('hex')}`;
    const grantTokenHash = crypto.createHash('sha256').update(grantToken).digest('hex');

    if (invocation) {
      (invocation as any).grant_token_hash = grantTokenHash;
      await updateInvocationRecord(invocation);

      await createToolGrantRecord({
        id: `grant_${crypto.randomBytes(8).toString('hex')}`,
        invocation_id: invocation.id,
        grant_token_hash: grantTokenHash,
        expires_at: invocation.expires_at,
        created_at: nowIso
      });
    }

    // Build dynamic authentication configuration based on MCP server configured auth method:
    // No Auth, Bearer Token, API Key, or Custom Header
    let rawCredential: string | undefined = undefined;
    if (server?.auth_credential_encrypted) {
      try {
        rawCredential = decryptMcpCredential(server.auth_credential_encrypted);
      } catch {}
    }

    let authConfig: any = {};
    if (authType === 'none') {
      authConfig = {
        authType: 'none',
        auth_type: 'none',
        headers: {}
      };
    } else if (authType === 'bearer') {
      const token = rawCredential || grantToken;
      authConfig = {
        authType: 'bearer',
        auth_type: 'bearer',
        tokenType: 'Bearer',
        token,
        accessToken: token,
        grantToken,
        headers: {
          Authorization: `Bearer ${token}`
        }
      };
    } else if (authType === 'api-key') {
      const headerName = server?.auth_header_name || 'x-api-key';
      const key = rawCredential || grantToken;
      authConfig = {
        authType: 'api-key',
        auth_type: 'api-key',
        headerName,
        apiKey: key,
        accessToken: key,
        grantToken,
        headers: {
          [headerName]: key
        }
      };
    } else if (authType === 'custom-header') {
      const headerName = server?.auth_header_name || 'X-Custom-Auth';
      const val = rawCredential || grantToken;
      authConfig = {
        authType: 'custom-header',
        auth_type: 'custom-header',
        headerName,
        headerValue: val,
        accessToken: val,
        grantToken,
        headers: {
          [headerName]: val
        }
      };
    } else {
      authConfig = {
        authType: 'none',
        auth_type: 'none',
        headers: {}
      };
    }

    const verificationInfo = req.body?.verification || req.body?.verificationInfo || (invocation as any)?.verification || {
      verified: true,
      verifiedBy: (invocation as any)?.reviewed_by || invocation?.owner_id || req.user!.id,
      timestamp: (invocation as any)?.reviewed_at || nowIso,
      reason: req.body?.reason || (invocation as any)?.reason || 'Operator verified and approved access'
    };

    const toolDetails = {
      id: tool.id,
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.input_schema,
      input_schema: tool.input_schema
    };

    // Return success: true with necessary tool details, server URL, auth config, and verification info.
    // DO NOT execute the tool through this endpoint.
    return res.status(200).json({
      success: true,
      status: 'approved',
      data: {
        invocationId: invocation?.id || accessReq?.id || invocationId,
        requestId: invocation?.id || accessReq?.id || invocationId,
        toolId: tool.id,
        toolName: tool.name,
        tool: toolDetails,
        serverUrl,
        server_url: serverUrl,
        authConfig,
        authType,
        auth_type: authType,
        tokenType: 'Bearer',
        grantToken,
        accessToken: grantToken,
        scope: 'tool:invoke',
        expiresAt: invocation?.expires_at || new Date(Date.now() + 3600 * 1000).toISOString(),
        approvedArguments: invocation?.args || (accessReq as any)?.arguments || {},
        verification: verificationInfo,
        verificationInfo
      },
      tool: toolDetails,
      serverUrl,
      authConfig,
      verification: verificationInfo,
      verificationInfo
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to retrieve tool access.' } });
  }
};

router.post('/invocations/:invocationId/access', requireUserOrAgentAuth, securityLayer('floor_invoke'), handleTemporaryAccess);
router.post('/invocations/:invocationId/execute', requireUserOrAgentAuth, securityLayer('floor_invoke'), handleTemporaryAccess);
router.post('/invocations/access', requireUserOrAgentAuth, securityLayer('floor_invoke'), handleTemporaryAccess);
router.post('/invocations/execute', requireUserOrAgentAuth, securityLayer('floor_invoke'), handleTemporaryAccess);

/**
 * 11b. GET /api/floor/requests/:requestId
 * Check Request Status: Return status for requests belonging to the authenticated agent.
 * Dynamically includes serverUrl and authType respecting server's auth configuration.
 */
const handleCheckRequestStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = (req.params.requestId || req.query.requestId) as string;
    if (!requestId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Request ID is required.' } });
    }

    const callerAgentId = req.user!.agentId || req.user!.id;
    const callerUserId = req.user!.id;
    const callerMasterId = req.user!.masterId || req.user!.id;

    const normalizeId = (id?: string) => id?.trim().replace(/^@/, '').toLowerCase() || '';
    const callerNorm = normalizeId(callerAgentId);

    // 1. Check in MCP persistent tool requests
    const accessReq = await getToolAccessRequestRecord(requestId);
    if (accessReq) {
      const accNorm = normalizeId(accessReq.account_id);
      const belongsToAgent =
        accessReq.account_id === callerAgentId ||
        accessReq.account_id === callerUserId ||
        accessReq.caller_id === callerUserId ||
        (Boolean(accNorm) && callerNorm === accNorm) ||
        ((req.authType === 'human' || !req.user?.agentId) && callerUserId === accessReq.caller_id);

      if (!belongsToAgent) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Forbidden: Request does not belong to authenticated agent.' }
        });
      }

      let mappedStatus: 'pending' | 'accepted' | 'rejected' = 'pending';
      if (accessReq.status === 'approved') {
        mappedStatus = 'accepted';
      } else if (accessReq.status === 'rejected') {
        mappedStatus = 'rejected';
      } else {
        mappedStatus = 'pending';
      }

      const server = await getServerRecord(accessReq.server_id);
      const serverAuthType = server?.auth_type || 'none';
      const serverUrl = server?.endpoint || '';

      return res.json({
        success: true,
        status: mappedStatus,
        data: {
          requestId: accessReq.id,
          status: mappedStatus,
          toolId: accessReq.tool_id,
          toolName: accessReq.tool_name,
          serverUrl,
          server_url: serverUrl,
          authType: serverAuthType,
          auth_type: serverAuthType
        }
      });
    }

    // 2. Check in pending tool invocations
    const inv = await getPendingInvocationRecord(requestId);
    if (inv) {
      const invAgentNorm = normalizeId(inv.agent_id);
      const belongsToAgent =
        inv.agent_id === callerAgentId ||
        inv.agent_id === callerUserId ||
        inv.caller_id === callerUserId ||
        (Boolean(invAgentNorm) && callerNorm === invAgentNorm) ||
        ((req.authType === 'human' || !req.user?.agentId) && (inv.owner_id === callerMasterId || inv.owner_id === callerUserId));

      if (!belongsToAgent) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Forbidden: Request does not belong to authenticated agent.' }
        });
      }

      let mappedStatus: 'pending' | 'accepted' | 'rejected' = 'pending';
      if (['approved', 'executing', 'executed'].includes(inv.status)) {
        mappedStatus = 'accepted';
      } else if (['denied', 'expired', 'failed'].includes(inv.status)) {
        mappedStatus = 'rejected';
      } else {
        mappedStatus = 'pending';
      }

      const tool = await getToolRecord(inv.tool_id);
      const server = tool ? await getServerRecord(tool.server_id) : null;
      const serverAuthType = server?.auth_type || 'none';
      const serverUrl = server?.endpoint || '';

      return res.json({
        success: true,
        status: mappedStatus,
        data: {
          requestId: inv.id,
          status: mappedStatus,
          toolId: inv.tool_id,
          toolName: tool?.name || '',
          serverUrl,
          server_url: serverUrl,
          authType: serverAuthType,
          auth_type: serverAuthType
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Request not found.' }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message || 'Failed to check request status.' } });
  }
};

router.get('/requests/:requestId', requireUserOrAgentAuth, securityLayer('floor_reads'), handleCheckRequestStatus);
router.get('/requests/status/:requestId', requireUserOrAgentAuth, securityLayer('floor_reads'), handleCheckRequestStatus);

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
      let isSlave = Boolean(
        req.user?.is_slave === true ||
        req.user?.isSlave === true ||
        req.user?.account_type === 'slave' ||
        req.user?.role === 'slave' ||
        (req.user?.agentId && req.user?.agentId.toLowerCase().includes('slave')) ||
        (req.user?.master_id && req.user?.master_id !== req.user?.id) ||
        (req.user?.masterId && req.user?.masterId !== req.user?.id) ||
        ((req.user as any)?.masterUserId && (req.user as any)?.masterUserId !== req.user?.id) ||
        (req.user?.email && typeof req.user.email === 'string' && req.user.email.includes('+AMR-'))
      );

      let masterId = req.user?.masterId || req.user?.master_id || (req.user as any)?.masterUserId;

      if (!isSlave && req.user?.id) {
        try {
          const supabase = getSupabaseClient();
          const { data: dbUser } = await supabase
            .from('users')
            .select('master_id, is_master_primary, role, account_type, is_slave')
            .eq('id', req.user.id)
            .maybeSingle();

          if (dbUser) {
            if (
              (dbUser.master_id && !dbUser.is_master_primary) ||
              dbUser.role === 'slave' ||
              dbUser.account_type === 'slave' ||
              dbUser.is_slave === true
            ) {
              isSlave = true;
              masterId = dbUser.master_id || masterId;
            }
          }
        } catch {}
      }

      const isMaster = !isSlave;

      const caller = {
        userId: req.user!.id,
        agentId: req.user!.agentId || req.user!.id,
        name: req.user!.name,
        email: req.user!.email,
        masterId,
        isMaster
      };

      const tools = await getAuthorizedToolsForAgent(caller);
      res.json({ success: true, data: tools });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { message: err?.message || 'Failed to list authorized agent tools.' } });
    }
  }
);

export default router;

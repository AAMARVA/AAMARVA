import React, { useState, useEffect } from 'react';
import { X, Server, Shield, AlertCircle, ArrowRight } from 'lucide-react';
import { addMcpServerApi, updateMcpServerApi, McpServer, McpTool } from '../../services/floorApi';

interface AddIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (server: McpServer, tools: McpTool[]) => void;
  serverToEdit?: McpServer | null;
}

export const AddIntegrationModal: React.FC<AddIntegrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  serverToEdit
}) => {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [transport] = useState<'http-streamable'>('http-streamable');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'api-key' | 'custom-header'>('none');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [authCredential, setAuthCredential] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = Boolean(serverToEdit);

  useEffect(() => {
    if (isOpen) {
      if (serverToEdit) {
        setName(serverToEdit.name || '');
        setEndpoint(serverToEdit.endpoint || '');
        setDescription(serverToEdit.description || '');
        setAuthType(serverToEdit.auth_type || 'none');
        setAuthHeaderName(
          serverToEdit.auth_header_name ||
          (serverToEdit.auth_type === 'custom-header' ? 'X-Custom-Auth' : 'X-API-Key')
        );
        setAuthCredential('');
      } else {
        setName('');
        setEndpoint('');
        setDescription('');
        setAuthType('none');
        setAuthHeaderName('X-API-Key');
        setAuthCredential('');
      }
      setError(null);
    }
  }, [isOpen, serverToEdit]);

  if (!isOpen) return null;

  const handleAuthTypeChange = (newType: 'none' | 'bearer' | 'api-key' | 'custom-header') => {
    setAuthType(newType);
    // Clear credential so previous type's secret is never accidentally reused
    setAuthCredential('');
    if (newType === 'api-key' && (!authHeaderName || authHeaderName === 'X-Custom-Auth')) {
      setAuthHeaderName('X-API-Key');
    } else if (newType === 'custom-header' && (!authHeaderName || authHeaderName === 'X-API-Key')) {
      setAuthHeaderName('X-Custom-Auth');
    }
  };

  const hasPreservedCredential = Boolean(
    isEditMode &&
    serverToEdit?.has_credential &&
    authType === serverToEdit.auth_type
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
      setError('Server endpoint URL is required.');
      return;
    }

    if (
      !trimmedEndpoint.startsWith('http://') &&
      !trimmedEndpoint.startsWith('https://') &&
      !trimmedEndpoint.startsWith('mock://')
    ) {
      setError('Endpoint must begin with https:// or http://');
      return;
    }

    if (authType === 'api-key' || authType === 'custom-header') {
      const trimmedHeader = (authHeaderName || '').trim();
      if (!trimmedHeader) {
        setError('Header name cannot be empty for API Key or Custom Header authentication.');
        return;
      }
      if (!/^[a-zA-Z0-9!#$%&'*+-.^_`|~]+$/.test(trimmedHeader)) {
        setError('Invalid header name. Header must contain only valid RFC 7230 token characters and no whitespace.');
        return;
      }
    }

    if (authType !== 'none' && !hasPreservedCredential && !authCredential.trim()) {
      setError(`Secret / Token is required for ${authType === 'bearer' ? 'Bearer Token' : authType === 'api-key' ? 'API Key' : 'Custom Header'} authentication.`);
      return;
    }

    setIsLoading(true);
    try {
      if (isEditMode && serverToEdit) {
        const res = await updateMcpServerApi(serverToEdit.id, {
          name: name.trim(),
          endpoint: trimmedEndpoint,
          description: description.trim() || undefined,
          transport,
          auth_type: authType,
          auth_header_name:
            authType === 'custom-header' || authType === 'api-key'
              ? authHeaderName.trim()
              : undefined,
          auth_credential: authCredential.trim() ? authCredential.trim() : undefined
        });

        onSuccess(res.server, res.tools);
        onClose();
      } else {
        const res = await addMcpServerApi({
          name: name.trim(),
          endpoint: trimmedEndpoint,
          description: description.trim() || undefined,
          transport,
          auth_type: authType,
          auth_header_name:
            authType === 'custom-header' || authType === 'api-key'
              ? authHeaderName.trim()
              : undefined,
          auth_credential: authType !== 'none' ? authCredential.trim() : undefined
        });

        onSuccess(res.server, res.tools);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect and discover tools from MCP server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border-4 border-[#141414] shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] w-full max-w-xl font-mono text-[#141414] my-auto">
        {/* Header */}
        <div className="bg-[#141414] text-white px-4 py-3 flex items-center justify-between border-b-2 border-[#141414] select-none">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-white" />
            <span className="text-xs font-black uppercase tracking-wider">
              {isEditMode ? 'EDIT MCP SERVER / INTEGRATION' : 'CONNECT MCP SERVER / INTEGRATION'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 text-white hover:bg-white hover:text-[#141414] transition-colors cursor-pointer border border-transparent hover:border-white"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-left">
          {error && (
            <div className="p-3 bg-red-50 border-2 border-red-600 text-red-700 text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Integration Type Banner */}
          <div className="p-3 bg-[#FAF9F5] border-2 border-[#141414] text-xs space-y-1">
            <span className="font-black uppercase tracking-wide flex items-center gap-1.5 text-[11px]">
              <Shield className="w-3.5 h-3.5" />
              Remote Model Context Protocol (MCP) Stream
            </span>
            <p className="text-[10px] text-[#141414]/70 leading-relaxed font-sans">
              Connects to an external MCP server via Streamable HTTP/SSE. The server performs a live protocol initialization handshake (<code className="bg-white px-1 border border-[#141414]/20">initialize</code> & <code className="bg-white px-1 border border-[#141414]/20">tools/list</code>) and automatically discovers all exposed capabilities.
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
              Integration Display Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Production Analytics MCP, Vector Store Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono font-bold focus:outline-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
            />
          </div>

          {/* Transport & Endpoint */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                Transport Protocol
              </label>
              <div className="w-full bg-[#FAF9F5] border-2 border-[#141414] p-2 text-xs font-mono font-bold text-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                Streamable HTTP
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
                Server Endpoint URL <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="https://mcp.external-service.com/mcp"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono font-bold focus:outline-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]"
              />
            </div>
          </div>

          {/* Authentication Configuration */}
          <div className="p-3 bg-white border-2 border-[#141414] space-y-3 shadow-[2px_2px_0px_0px_rgba(20,20,20,0.5)]">
            <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#141414]">
                Authentication Method
              </span>
              <span className="text-[9px] font-bold text-[#141414]/60">
                Credentials encrypted & never returned to client
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['none', 'bearer', 'api-key', 'custom-header'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => handleAuthTypeChange(method)}
                  className={`p-2 border-2 border-[#141414] text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    authType === method
                      ? 'bg-[#141414] text-white shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]'
                      : 'bg-white text-[#141414] hover:bg-neutral-100'
                  }`}
                >
                  {method === 'none' ? 'No Auth' : method === 'bearer' ? 'Bearer Token' : method === 'api-key' ? 'API Key' : 'Custom Header'}
                </button>
              ))}
            </div>

            {authType !== 'none' && (
              <div className="space-y-2 pt-1">
                {(authType === 'api-key' || authType === 'custom-header') && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-wider text-[#141414]/70 mb-1">
                      Header Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={authType === 'api-key' ? 'X-API-Key' : 'X-Custom-Auth'}
                      value={authHeaderName}
                      onChange={(e) => setAuthHeaderName(e.target.value)}
                      className="w-full bg-[#FAF9F5] border-2 border-[#141414] p-1.5 text-xs font-mono"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-[#141414]/70">
                      {authType === 'bearer' ? 'Bearer Token' : 'Secret / Key Value'}{' '}
                      {!hasPreservedCredential && <span className="text-red-600">*</span>}
                    </label>
                    {hasPreservedCredential && (
                      <span className="text-[9px] font-bold text-green-700 bg-green-50 px-1 border border-green-300">
                        Existing Credential Stored
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    required={!hasPreservedCredential}
                    placeholder={
                      hasPreservedCredential
                        ? 'Leave blank to keep existing credential, or enter new secret'
                        : authType === 'bearer'
                        ? 'Enter bearer access token...'
                        : 'Enter secret or API key value...'
                    }
                    value={authCredential}
                    onChange={(e) => setAuthCredential(e.target.value)}
                    className="w-full bg-[#FAF9F5] border-2 border-[#141414] p-1.5 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-wider text-[#141414]">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Operational description or scope of this MCP server..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white border-2 border-[#141414] p-2 text-xs font-mono leading-normal focus:outline-hidden shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t-2 border-[#141414]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 bg-white text-[#141414] hover:bg-neutral-100 text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !endpoint.trim()}
              className="px-5 py-2 bg-[#141414] text-white hover:bg-black text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-white animate-pulse" />
                  </div>
                  <span>{isEditMode ? 'Validating & Re-syncing...' : 'Handshaking & Discovering...'}</span>
                </>
              ) : (
                <>
                  <span>{isEditMode ? 'Save & Re-sync Tools' : 'Connect & Discover Tools'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

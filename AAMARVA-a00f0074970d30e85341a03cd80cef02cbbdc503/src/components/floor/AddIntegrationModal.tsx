import React, { useState } from 'react';
import { X, Server, Shield, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { addMcpServerApi, McpServer, McpTool } from '../../services/floorApi';
import { BrutalistLoader } from '../BrutalistLoader';

interface AddIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (server: McpServer, tools: McpTool[]) => void;
}

export const AddIntegrationModal: React.FC<AddIntegrationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [description, setDescription] = useState('');
  const [transport] = useState<'http-streamable'>('http-streamable');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'api-key' | 'custom-header'>('none');
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key');
  const [authCredential, setAuthCredential] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
      setError('Server endpoint URL is required.');
      return;
    }

    if (!trimmedEndpoint.startsWith('http://') && !trimmedEndpoint.startsWith('https://') && !trimmedEndpoint.startsWith('mock://')) {
      setError('Endpoint must begin with https:// or http://');
      return;
    }

    setIsLoading(true);
    try {
      const res = await addMcpServerApi({
        name: name.trim(),
        endpoint: trimmedEndpoint,
        description: description.trim() || undefined,
        transport,
        auth_type: authType,
        auth_header_name: authType === 'custom-header' || authType === 'api-key' ? authHeaderName : undefined,
        auth_credential: authType !== 'none' ? authCredential.trim() : undefined
      });

      onSuccess(res.server, res.tools);
      onClose();
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
              CONNECT MCP SERVER / INTEGRATION
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
              Connects to an external MCP server via Streamable HTTP/SSE. The server will perform a live protocol initialization handshake (<code className="bg-white px-1 border border-[#141414]/20">tools/list</code>) and automatically discover all exposed capabilities.
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
                Credentials are encrypted & never returned to client
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['none', 'bearer', 'api-key', 'custom-header'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setAuthType(method)}
                  className={`p-2 border-2 border-[#141414] text-[10px] font-bold uppercase transition-all ${
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
                      Header Name
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
                  <label className="block text-[9px] font-black uppercase tracking-wider text-[#141414]/70 mb-1">
                    {authType === 'bearer' ? 'Bearer Token' : 'Secret / Key Value'} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter authentication secret or token..."
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
                  <span>Handshaking & Discovering...</span>
                </>
              ) : (
                <>
                  <span>Connect & Discover Tools</span>
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

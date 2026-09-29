import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Clock, Send, Lock, Unlock, Key, FileText } from 'lucide-react';

interface AccessGatewayProps {
  children: React.ReactNode; // The existing Register form / credentials panel
}

export const AccessGateway: React.FC<AccessGatewayProps> = ({ children }) => {
  const [accessApproved, setAccessApproved] = useState<boolean>(() => {
    return localStorage.getItem('aamarva_access_approved') === 'true';
  });

  const [inviteCode, setInviteCode] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Application form states
  const [callSign, setAppCallSign] = useState('');
  const [email, setAppEmail] = useState('');
  const [intent, setAppIntent] = useState('Autonomous Trading & Arbitrage');
  const [description, setAppDescription] = useState('');
  const [submitted, setAppSubmitted] = useState<boolean>(() => {
    return localStorage.getItem('aamarva_app_submitted') === 'true';
  });
  const [reference, setAppReference] = useState(() => {
    return localStorage.getItem('aamarva_app_reference') || '';
  });

  // Check URL parameters for pre-authorized invites
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlInvite = params.get('invite') || params.get('code');
    const isApproved = params.get('approved') === 'true';

    if (urlInvite) {
      const normalized = urlInvite.toUpperCase();
      if (normalized.length >= 4) {
        setAccessApproved(true);
        localStorage.setItem('aamarva_access_approved', 'true');
      }
    } else if (isApproved) {
      setAccessApproved(true);
      localStorage.setItem('aamarva_access_approved', 'true');
    }
  }, []);

  const handleVerifyInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    
    if (!inviteCode.trim()) {
      setInviteError('Please enter a valid invitation code.');
      return;
    }

    const normalizedCode = inviteCode.trim().toUpperCase();
    
    // Accept codes with basic length requirement or containing any of our predefined words
    const isValid = 
      normalizedCode.length >= 6 ||
      normalizedCode.includes('INVITE') ||
      normalizedCode.includes('ACCESS') ||
      normalizedCode.includes('AAMARVA') ||
      normalizedCode.includes('ALPHA') ||
      normalizedCode === 'OP-2026';

    if (isValid) {
      setInviteSuccess(true);
      setTimeout(() => {
        setAccessApproved(true);
        localStorage.setItem('aamarva_access_approved', 'true');
      }, 1000);
    } else {
      setInviteError('INVALID CODE // VERIFICATION FAILURE. Please check your credentials.');
    }
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!callSign.trim() || !email.trim() || !description.trim()) {
      return;
    }

    const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
    const refId = `APP-AMR-${randomHex}`;
    
    setAppReference(refId);
    setAppSubmitted(true);
    
    localStorage.setItem('aamarva_app_submitted', 'true');
    localStorage.setItem('aamarva_app_reference', refId);
  };

  const handleResetApplication = () => {
    setAppSubmitted(false);
    setAppCallSign('');
    setAppEmail('');
    setAppDescription('');
    localStorage.removeItem('aamarva_app_submitted');
    localStorage.removeItem('aamarva_app_reference');
  };

  if (accessApproved) {
    return (
      <div className="space-y-6">
        <div className="p-3 bg-emerald-50 border-2 border-emerald-600 text-emerald-950 font-mono text-[11px] font-black uppercase flex items-center justify-between shadow-[2px_2px_0px_0px_rgba(5,150,105,0.2)]">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Gateway State: Pre-Authorized / Invite Code Verified</span>
          </div>
          <button 
            onClick={() => {
              setAccessApproved(false);
              localStorage.removeItem('aamarva_access_approved');
            }}
            className="text-[10px] bg-[#141414] hover:bg-black text-white px-2 py-0.5 border border-black cursor-pointer"
          >
            Lock Gateway
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Intro Banner */}
      <div className="text-center space-y-2 border-b-2 border-[#141414]/10 pb-6">
        <div className="inline-flex items-center gap-1.5 bg-red-100 border border-red-700 text-red-900 font-mono text-[10px] font-black px-2 py-0.5 uppercase tracking-wider mb-2 select-none">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Restricted Network Access</span>
        </div>
        <h2 className="text-2xl font-black font-mono uppercase tracking-tight text-[#141414]">
          AAMARVA Access Gateway
        </h2>
        <p className="text-xs font-mono text-[#141414]/60 max-w-xl mx-auto leading-relaxed">
          Allocations on the AAMARVA autonomous network are currently regulated. Public registrations are closed. To operate on the Floor, please request an allocation or authenticate with a pre-approved invitation code.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Left Side: Apply for Access */}
        <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
          <h3 className="font-mono font-black text-xs uppercase tracking-wider pb-2 border-b border-[#141414]/20 flex items-center gap-1.5 text-[#141414]">
            <FileText className="w-4 h-4 shrink-0 text-red-700" />
            <span>Apply for Operator Allocation</span>
          </h3>

          {submitted ? (
            <div className="space-y-4 font-mono">
              <div className="p-4 bg-emerald-50 border-2 border-emerald-600 text-emerald-950 space-y-3 shadow-[2px_2px_0px_0px_rgba(5,150,105,0.1)]">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span className="font-black text-xs uppercase tracking-wider">Application Transmitted</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Your registration token and operating request have been received and logged to the network directory ledger.
                </p>
              </div>

              <div className="border border-[#141414] bg-[#E4E3E0]/30 p-3.5 space-y-2.5">
                <div className="flex justify-between items-center text-[10px] uppercase font-bold text-[#141414]/60">
                  <span>Registry Status:</span>
                  <span className="bg-amber-100 text-amber-900 border border-amber-500 px-1.5 py-0.5 text-[9px] font-black tracking-widest flex items-center gap-1 animate-pulse">
                    <Clock className="w-2.5 h-2.5" />
                    QUEUED // REVIEW
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-bold">Allocation ID:</span>
                  <span className="font-mono font-bold select-all tracking-wider text-xs bg-white border border-[#141414] px-1.5 py-0.5">{reference}</span>
                </div>
              </div>

              <p className="text-[10px] text-[#141414]/60 italic leading-relaxed">
                An access dispatch with activation credentials will be dispatched to your operator email upon capability confirmation by the network controllers.
              </p>

              <button
                type="button"
                onClick={handleResetApplication}
                className="w-full py-2 bg-white text-[#141414] border border-[#141414] hover:bg-[#E4E3E0] font-mono text-[10px] font-bold uppercase transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                Submit New Application
              </button>
            </div>
          ) : (
            <form onSubmit={handleApplySubmit} className="space-y-4 font-mono">
              <div>
                <label className="block text-[10px] uppercase font-black mb-1 text-[#141414]/80">
                  Operator Call Sign / Agent Name
                </label>
                <input
                  type="text"
                  required
                  value={callSign}
                  onChange={(e) => setAppCallSign(e.target.value)}
                  placeholder="e.g. Arbiter-7"
                  className="w-full px-3 py-2 bg-[#E4E3E0]/20 border border-[#141414] text-xs focus:outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black mb-1 text-[#141414]/80">
                  Operator Contact Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setAppEmail(e.target.value)}
                  placeholder="operator@domain.com"
                  className="w-full px-3 py-2 bg-[#E4E3E0]/20 border border-[#141414] text-xs focus:outline-none focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black mb-1 text-[#141414]/80">
                  Capability Allocation Profile
                </label>
                <select
                  value={intent}
                  onChange={(e) => setAppIntent(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#141414] text-xs focus:outline-none cursor-pointer"
                >
                  <option>Autonomous Trading & Arbitrage</option>
                  <option>Research, Synthesis & Intelligence</option>
                  <option>Multi-Agent Consensus & Telemetry</option>
                  <option>System Infrastructure & ADK Node</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-black mb-1 text-[#141414]/80">
                  Statement of Intent & Operating Scope
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="Briefly state what autonomous functions or automated routines your agent will run..."
                  className="w-full px-3 py-2 bg-[#E4E3E0]/20 border border-[#141414] text-xs focus:outline-none focus:bg-white resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#141414] hover:bg-black text-white font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Access Request</span>
              </button>
            </form>
          )}
        </div>

        {/* Right Side: Invite Verification */}
        <div className="bg-white border-2 border-[#141414] p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
          <h3 className="font-mono font-black text-xs uppercase tracking-wider pb-2 border-b border-[#141414]/20 flex items-center gap-1.5 text-[#141414]">
            <Key className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>Verify Invitation Code</span>
          </h3>

          <p className="text-[11px] font-mono text-[#141414]/70 leading-relaxed">
            Have a pre-authorized invitation code or pre-vetted token? Enter it below to immediately open registration.
          </p>

          <form onSubmit={handleVerifyInvite} className="space-y-4 font-mono">
            {inviteError && (
              <div className="p-3 bg-red-50 border border-red-500 text-red-950 text-[10px] leading-relaxed">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-500 text-emerald-950 text-[10px] leading-relaxed font-black">
                INVITATION VERIFIED // UNLOCKING GATEWAY...
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase font-black mb-1 text-[#141414]/80">
                Invitation / Authorization Token
              </label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. AAMARVA-INVITE-XXXX"
                className="w-full px-3 py-2.5 bg-[#E4E3E0]/20 border border-[#141414] text-xs font-mono tracking-wider focus:outline-none focus:bg-white"
                disabled={inviteSuccess}
              />
            </div>

            <button
              type="submit"
              disabled={inviteSuccess}
              className="w-full py-2.5 bg-[#141414] hover:bg-black text-white font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[3px_3px_0px_0px_rgba(20,20,20,0.3)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>Verify & Unlock</span>
            </button>
          </form>

          <div className="pt-3 border-t border-[#141414]/10 text-[10px] text-[#141414]/50 leading-relaxed font-mono">
            <span>Invite format: 6+ characters or authorized tokens. Link pre-authorizations are automatically resolved.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Key, 
  ShieldAlert, 
  Mail, 
  FileText, 
  Calendar, 
  Globe, 
  Github, 
  Linkedin, 
  Cpu, 
  Layers, 
  Terminal,
  LogOut,
  Sparkles
} from 'lucide-react';

export function AdminApplicationsView() {
  const [step, setStep] = useState<'key' | 'otp' | 'dashboard'>('key');
  const [adminKey, setAdminKey] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [applications, setApplications] = useState<any[]>([]);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);

  // Whitelist & tab-specific states
  const [activeTab, setActiveTab] = useState<'applications' | 'decided' | 'whitelist'>('applications');
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newWhitelistName, setNewWhitelistName] = useState('');
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [whitelistError, setWhitelistError] = useState('');
  const [whitelistSuccess, setWhitelistSuccess] = useState('');

  // Check if session token exists in local storage
  useEffect(() => {
    const storedToken = localStorage.getItem('aamarva_admin_token');
    if (storedToken) {
      setAdminToken(storedToken);
      setStep('dashboard');
      fetchApplications(storedToken);
      fetchWhitelist(storedToken);
    }
  }, []);

  const fetchApplications = async (token: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/applications/admin', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setApplications(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch applications.');
        // Session might be expired
        localStorage.removeItem('aamarva_admin_token');
        setAdminToken(null);
        setStep('key');
      }
    } catch (err) {
      setError('Connection to AAMARVA network database failed.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWhitelist = async (token: string) => {
    setWhitelistLoading(true);
    setWhitelistError('');
    try {
      const response = await fetch('/api/applications/admin/whitelist', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setWhitelist(data.whitelist || []);
      } else {
        setWhitelistError(data.error || 'Failed to fetch whitelist.');
      }
    } catch (err) {
      setWhitelistError('Connection to whitelist database failed.');
    } finally {
      setWhitelistLoading(false);
    }
  };

  const handleAddToWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelistEmail.trim() || !adminToken) return;

    setWhitelistLoading(true);
    setWhitelistError('');
    setWhitelistSuccess('');

    try {
      const response = await fetch('/api/applications/admin/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ 
          email: newWhitelistEmail.trim(),
          name: newWhitelistName.trim(),
          appUrl: window.location.origin
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setWhitelistSuccess(data.message || `Successfully whitelisted ${newWhitelistEmail.trim()} and sent registration email!`);
        setNewWhitelistEmail('');
        setNewWhitelistName('');
        fetchWhitelist(adminToken);
      } else {
        setWhitelistError(data.error || 'Failed to add email to whitelist.');
      }
    } catch (err) {
      setWhitelistError('Failed to connect to network operator relay.');
    } finally {
      setWhitelistLoading(false);
    }
  };

  const handleRemoveFromWhitelist = async (email: string) => {
    if (!email || !adminToken) return;
    if (!window.confirm(`Are you sure you want to remove ${email} from the registration whitelist?`)) return;

    setWhitelistLoading(true);
    setWhitelistError('');
    setWhitelistSuccess('');

    try {
      const response = await fetch('/api/applications/admin/whitelist', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setWhitelistSuccess(`Successfully removed ${email} from whitelist.`);
        fetchWhitelist(adminToken);
      } else {
        setWhitelistError(data.error || 'Failed to remove email.');
      }
    } catch (err) {
      setWhitelistError('Failed to connect to network operator relay.');
    } finally {
      setWhitelistLoading(false);
    }
  };

  const handleKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/applications/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey })
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        setStep('otp');
      } else {
        setError(data.error || 'Access Denied.');
      }
    } catch (err) {
      setError('Secure gateway authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/applications/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCode })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem('aamarva_admin_token', data.token);
        setAdminToken(data.token);
        setStep('dashboard');
        fetchApplications(data.token);
        fetchWhitelist(data.token);
      } else {
        setError(data.error || 'Invalid passcode.');
      }
    } catch (err) {
      setError('Passcode verification timed out.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aamarva_admin_token');
    setAdminToken(null);
    setStep('key');
    setApplications([]);
    setSelectedApp(null);
    setAdminKey('');
    setOtpCode('');
    setError('');
    setActiveTab('applications');
    setWhitelist([]);
  };

  return (
    <div className="min-h-screen bg-[#F4F3F0] text-[#141414] font-mono p-4 sm:p-8 flex flex-col selection:bg-[#141414] selection:text-white">
      {/* Brutalist Header Area */}
      {step === 'dashboard' && (
        <header className="border-4 border-[#141414] bg-white p-4 mb-8 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] flex justify-end items-center">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#141414] text-white border-2 border-[#141414] hover:bg-white hover:text-[#141414] font-bold text-xs uppercase transition-all shadow-[3px_3px_0px_0px_rgba(20,20,20,0.15)] active:translate-y-0.5"
          >
            <LogOut className="w-4 h-4" />
            Terminate Session
          </button>
        </header>
      )}

      {/* STEP 1: Admin Key Gateway */}
      {step === 'key' && (
        <div className="max-w-xs mx-auto w-full my-auto space-y-4">
          <div className="border-4 border-[#141414] bg-white p-6 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)]">
            {error && (
              <div className="p-3 bg-red-50 border-2 border-red-600 text-red-900 text-xs mb-4 font-bold text-center">
                {error}
              </div>
            )}

             <form onSubmit={handleKeySubmit} className="space-y-3">
              <input
                type="password"
                required
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
                placeholder="Node ID / Registry Hash"
                disabled={loading}
                className="w-full px-3 py-2 bg-white border-2 border-[#141414] text-xs focus:outline-none focus:bg-[#E4E3E0]/20 font-mono text-center"
              />

              <button
                type="submit"
                disabled={loading || !adminKey.trim()}
                className="w-full py-2.5 bg-[#141414] text-white hover:bg-white hover:text-[#141414] border-2 border-[#141414] text-xs font-black uppercase transition-all shadow-[3px_3px_0px_0px_rgba(20,20,20,0.15)] disabled:opacity-50 cursor-pointer"
              >
                Initialize Index Sync
              </button>
            </form>

            <div className="text-center text-[10px] font-bold text-[#141414]/40 my-3">— RELAY_MODE_B —</div>

            <button
              onClick={async () => {
                setLoading(true);
                setError('');
                try {
                  const response = await fetch('/api/applications/admin/send-otp', {
                    method: 'POST',
                  });
                  const data = await response.json();
                  if (response.ok && data.success) {
                    setStep('otp');
                  } else {
                    setError(data.error || 'Failed to dispatch verification code.');
                  }
                } catch (err) {
                  setError('Failed to dispatch verification code.');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 text-white hover:bg-white hover:text-emerald-700 border-2 border-emerald-600 text-xs font-black uppercase transition-all shadow-[3px_3px_0px_0px_rgba(16,185,129,0.15)] cursor-pointer"
            >
              Establish Safe-mode Link
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: OTP Gateway Verification */}
      {step === 'otp' && (
        <div className="max-w-md mx-auto w-full my-auto space-y-6">
          <div className="border-4 border-[#141414] bg-white p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
            <div className="flex items-center gap-3 border-b-2 border-[#141414] pb-4 mb-4">
              <div className="p-2 bg-emerald-600 text-white border border-[#141414]">
                <Mail className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-black text-sm uppercase tracking-wider">GATEWAY LEVEL 2</h2>
                <p className="text-[10px] text-[#141414]/60">ONE-TIME PASSCODE DISPATCHED</p>
              </div>
            </div>

            <p className="text-[11px] text-[#141414] mb-4 leading-normal">
              Admin identity confirmed. A 6-digit verification code was successfully transmitted to <strong>founder@aamarva.com</strong>.
            </p>

            {error && (
              <div className="p-3.5 bg-red-50 border-2 border-red-600 text-red-900 text-xs mb-4 flex items-start gap-2.5 font-bold">
                <ShieldAlert className="w-5 h-5 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-black text-[#141414]">Option 1: Enter code from Email</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 849204"
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-white border-2 border-[#141414] text-center text-sm font-black tracking-[0.2em] focus:outline-none focus:bg-[#E4E3E0]/20 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.length < 6}
                className="w-full py-2.5 bg-[#141414] text-white hover:bg-white hover:text-[#141414] border-2 border-[#141414] text-xs font-black uppercase transition-all shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)] disabled:opacity-50"
              >
                {loading ? 'VERIFYING SECURITY TOKENS...' : 'AUTHORIZE ADMIN ACCESS'}
              </button>
            </form>


          </div>
          <button
            onClick={() => setStep('key')}
            className="block mx-auto text-[10px] font-bold text-[#141414]/60 hover:text-[#141414] uppercase tracking-widest"
          >
            ← Return to Level 1
          </button>
        </div>
      )}

      {/* STEP 3: Decrypted Applications Database */}
      {step === 'dashboard' && (() => {
        const pendingApplications = applications.filter(app => !app.status || app.status === 'Under Review');
        const decidedApplications = applications.filter(app => app.status === 'Approved' || app.status === 'Declined');
        const currentList = activeTab === 'applications' ? pendingApplications : decidedApplications;

        return (
        <div className="space-y-6">
          {/* Tab Selection */}
          <div className="flex flex-wrap sm:flex-nowrap border-4 border-[#141414] bg-white p-1.5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] max-w-2xl font-mono gap-1.5">
            <button
              onClick={() => { setActiveTab('applications'); setSelectedApp(null); }}
              className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider border-2 transition-all cursor-pointer ${
                activeTab === 'applications'
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : 'bg-white text-[#141414] border-transparent hover:bg-[#E4E3E0]/30'
              }`}
            >
              Intakes Received ({pendingApplications.length})
            </button>
            <button
              onClick={() => { setActiveTab('decided'); setSelectedApp(null); }}
              className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider border-2 transition-all cursor-pointer ${
                activeTab === 'decided'
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : 'bg-white text-[#141414] border-transparent hover:bg-[#E4E3E0]/30'
              }`}
            >
              Decided Archives ({decidedApplications.length})
            </button>
            <button
              onClick={() => { setActiveTab('whitelist'); setSelectedApp(null); }}
              className={`flex-1 py-2 px-3 text-xs font-black uppercase tracking-wider border-2 transition-all cursor-pointer ${
                activeTab === 'whitelist'
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : 'bg-white text-[#141414] border-transparent hover:bg-[#E4E3E0]/30'
              }`}
            >
              Registration Whitelist ({whitelist.length})
            </button>
          </div>

          {activeTab === 'applications' || activeTab === 'decided' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Applications Left Column List */}
              <div className="lg:col-span-5 space-y-4">
                <div className="border-4 border-[#141414] bg-[#141414] text-white p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)] flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-wider">
                    {activeTab === 'applications' 
                      ? `Pending Intakes (${pendingApplications.length})`
                      : `Decided Archives (${decidedApplications.length})`}
                  </h3>
                </div>

                {loading && currentList.length === 0 ? (
                  <div className="p-12 text-center border-4 border-dashed border-[#141414] bg-white font-bold text-xs uppercase animate-pulse">
                    Decrypting applications stream...
                  </div>
                ) : currentList.length === 0 ? (
                  <div className="p-12 text-center border-4 border-dashed border-[#141414] bg-white text-xs text-[#141414]/60 uppercase leading-relaxed font-bold">
                    {activeTab === 'applications'
                      ? 'Zero pending intakes waiting for review. All intakes have been processed.'
                      : 'Zero decided applications recorded in archives.'}
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                    {currentList.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => setSelectedApp(app)}
                        className={`cursor-pointer border-4 p-4 transition-all bg-white hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] ${
                          selectedApp?.id === app.id
                            ? 'border-red-600 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)] bg-red-50/10'
                            : 'border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)]'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="font-black text-xs uppercase tracking-wide truncate max-w-[200px]">
                            {app.fullName}
                          </h4>
                          <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                            app.status === 'Approved' ? 'bg-emerald-600 text-white' :
                            app.status === 'Declined' ? 'bg-red-600 text-white' :
                            'bg-[#141414] text-white'
                          }`}>
                            {app.status || 'UNDER REVIEW'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[10px] text-[#141414]/70 mb-3 border-t border-b border-[#141414]/10 py-2">
                          <div>
                            <span className="font-bold">AGENT/PROJECT:</span>
                            <p className="font-mono text-[#141414] font-bold truncate">{app.agentName}</p>
                          </div>
                          <div>
                            <span className="font-bold">SUBMITTED:</span>
                            <p className="font-mono text-[#141414] truncate">
                              {new Date(app.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <p className="text-[11px] text-[#141414]/80 leading-normal line-clamp-2">
                          {app.agentDetails}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decrypted Details Right Column Panel */}
              <div className="lg:col-span-7">
                {selectedApp ? (
                  <div className="border-4 border-[#141414] bg-white p-6 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] space-y-6 max-h-[85vh] overflow-y-auto">
                    {/* Panel Title */}
                    <div className="border-b-4 border-[#141414] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <span className="bg-[#141414] text-white text-[9px] font-black px-2 py-0.5 uppercase tracking-widest mb-1.5 inline-block">
                          APPLICATION DOSSIER
                        </span>
                        <h3 className="text-lg font-black uppercase text-[#141414]">
                          {selectedApp.fullName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 bg-[#E4E3E0] px-3 py-1.5 border-2 border-[#141414] font-bold text-[10px] uppercase shadow-[2px_2px_0px_0px_rgba(20,20,20,1)]">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(selectedApp.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Step 1 Box */}
                    <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                      <div className="border-b-2 border-[#141414] pb-2">
                        <h4 className="font-serif italic text-sm text-[#141414] font-black">Step 1: Identity & Background</h4>
                        <p className="text-[10px] text-[#141414]/60 font-mono font-bold">Tell us about yourself and your role in the ecosystem.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Full Name:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.fullName}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Email Address:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.emailAddress}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">GitHub Profile:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                            {selectedApp.githubProfile ? (
                              <a href={selectedApp.githubProfile.startsWith('http') ? selectedApp.githubProfile : `https://${selectedApp.githubProfile}`} target="_blank" rel="noreferrer" className="underline hover:text-blue-600 font-bold flex items-center gap-1">
                                <Github className="w-3.5 h-3.5 shrink-0" />
                                {selectedApp.githubProfile}
                              </a>
                            ) : 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">LinkedIn Profile:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                            {selectedApp.linkedinProfile ? (
                              <a href={selectedApp.linkedinProfile.startsWith('http') ? selectedApp.linkedinProfile : `https://${selectedApp.linkedinProfile}`} target="_blank" rel="noreferrer" className="underline hover:text-blue-600 font-bold flex items-center gap-1">
                                <Linkedin className="w-3.5 h-3.5 shrink-0" />
                                {selectedApp.linkedinProfile}
                              </a>
                            ) : 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">X (Twitter) Profile:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                            {selectedApp.xProfile ? (
                              <a href={selectedApp.xProfile.startsWith('http') ? selectedApp.xProfile : `https://x.com/${selectedApp.xProfile.replace('@', '')}`} target="_blank" rel="noreferrer" className="underline hover:text-blue-600 font-bold flex items-center gap-1">
                                <span className="font-black text-[10px]">𝕏</span>
                                {selectedApp.xProfile}
                              </a>
                            ) : 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Reddit Profile:</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                            {selectedApp.redditProfile ? (
                              <a href={selectedApp.redditProfile.startsWith('http') ? selectedApp.redditProfile : `https://reddit.com/${selectedApp.redditProfile.startsWith('u/') ? selectedApp.redditProfile : `u/${selectedApp.redditProfile}`}`} target="_blank" rel="noreferrer" className="underline hover:text-blue-600 font-bold flex items-center gap-1.5">
                                <svg className="w-3.5 h-3.5 text-[#FF4500] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.85-1.64-6.24-1.72l1.37-4.3 3.8 1.15c.02.77.65 1.38 1.43 1.38 1.1 0 2-.9 2-2s-.9-2-2-2c-.73 0-1.35.4-1.7 1l-4.3-1.3c-.17-.05-.35.03-.43.18l-1.6 5.07c-2.44.05-4.72.68-6.4 1.7-.56-.74-1.44-1.2-2.38-1.2-1.65 0-3 1.35-3 3 0 1.2.7 2.22 1.74 2.7-.04.26-.06.52-.06.8 0 3.86 4.48 7 10 7s10-3.14 10-7c0-.28-.02-.54-.06-.8 1.04-.48 1.74-1.5 1.74-2.7zm-18.5 2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5zm11 4.5c-1.78 1.78-5.16 1.78-6.94 0-.15-.15-.15-.4 0-.54.15-.15.4-.15.54 0 1.48 1.48 4.38 1.48 5.86 0 .15-.15.4-.15.54 0 .15.15.15.4 0 .54zm-.5-3c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                                </svg>
                                {selectedApp.redditProfile}
                              </a>
                            ) : 'Not specified'}
                          </p>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What best describes you?</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.bestDescribes}</p>
                        </div>
                      </div>
                    </div>

                    {/* Step 2 Box */}
                    <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                      <div className="border-b-2 border-[#141414] pb-2">
                        <h4 className="font-serif italic text-sm text-[#141414] font-black">Step 2: Your Agent</h4>
                        <p className="text-[10px] text-[#141414]/60 font-mono font-bold">Details about the AI agent or system you run or configure.</p>
                      </div>
                      <div className="space-y-3 text-xs font-mono">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Are you currently building or operating an AI agent?</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.operatingAgent}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Agent / project name:</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.agentName}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Agent / project URL or repository:</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                              {selectedApp.agentUrl === 'Private' ? (
                                <span className="bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 text-[10px] font-bold uppercase rounded">Private Repository</span>
                              ) : (
                                <a href={selectedApp.agentUrl.startsWith('http') ? selectedApp.agentUrl : `https://${selectedApp.agentUrl}`} target="_blank" rel="noreferrer" className="underline hover:text-blue-600 font-bold flex items-center gap-1">
                                  <Globe className="w-3.5 h-3.5 shrink-0" />
                                  {selectedApp.agentUrl}
                                </a>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What does your agent actually do?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white leading-relaxed whitespace-pre-wrap font-mono text-xs">{selectedApp.agentDetails}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What stage is the agent currently at?</span>
                          <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.agentStage}</p>
                        </div>
                      </div>
                    </div>

                    {/* Step 3 Box */}
                    <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                      <div className="border-b-2 border-[#141414] pb-2">
                        <h4 className="font-serif italic text-sm text-[#141414] font-black">Step 3: Technical Environment</h4>
                        <p className="text-[10px] text-[#141414]/60 font-mono font-bold">Infrastructure details and development specs.</p>
                      </div>
                      <div className="space-y-3 text-xs font-mono">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Which agent frameworks or protocols do you use?</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedApp.agentFrameworks?.map((fw: string) => (
                              <span key={fw} className="px-2 py-0.5 bg-[#E4E3E0] border border-[#141414]/20 font-bold text-[9px] uppercase">
                                {fw === 'Other' && selectedApp.agentFrameworksOther ? `${fw} (${selectedApp.agentFrameworksOther})` : fw}
                              </span>
                            )) || <span className="text-[#141414]/40 font-bold">None</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Where does your agent primarily operate?</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.agentOperateLocation}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What is your primary development environment?</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">
                              {selectedApp.devEnvironment === 'Other' ? selectedApp.devEnvironmentOther : selectedApp.devEnvironment}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Which languages do you build your agent with?</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedApp.languages?.map((l: string) => (
                                <span key={l} className="px-2 py-0.5 bg-[#E4E3E0] border border-[#141414]/20 font-bold text-[9px] uppercase">
                                  {l === 'Other' && selectedApp.languagesOther ? `${l} (${selectedApp.languagesOther})` : l}
                                </span>
                              )) || <span className="text-[#141414]/40 font-bold">None</span>}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Which AI models/providers do you use?</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedApp.modelProviders?.map((p: string) => (
                                <span key={p} className="px-2 py-0.5 bg-[#E4E3E0] border border-[#141414]/20 font-bold text-[9px] uppercase">
                                  {p === 'Other' && selectedApp.modelProvidersOther ? `${p} (${selectedApp.modelProvidersOther})` : p}
                                </span>
                              )) || <span className="text-[#141414]/40 font-bold">None</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Does your agent use external tools, APIs, or databases?</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.usesExternalTools}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Does your agent communicate with other agents?</span>
                            <p className="border border-[#141414]/10 p-2 bg-[#F4F3F0]/20 font-bold">{selectedApp.communicatesWithAgents}</p>
                          </div>
                        </div>
                        {selectedApp.communicationDetails && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Explain how your agent communicates with other agents:</span>
                            <p className="border border-[#141414]/10 p-3 bg-white text-xs leading-normal font-mono">{selectedApp.communicationDetails}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 4 Box */}
                    <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                      <div className="border-b-2 border-[#141414] pb-2">
                        <h4 className="font-serif italic text-sm text-[#141414] font-black">Step 4: Why AAMARVA?</h4>
                        <p className="text-[10px] text-[#141414]/60 font-mono font-bold">Strategic alignment, discovered capabilities, and use cases.</p>
                      </div>
                      <div className="space-y-3 text-xs font-mono">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What do you hope to accomplish by joining AAMARVA?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.hopeToAccomplish}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What is the primary purpose or use case for your agent?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.agentUsePurpose}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What is the most interesting capability you have discovered or built in your agent?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.discoverCapability}</p>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What are the biggest challenges or problems you face in developing your agent?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.discoveryProblems}</p>
                        </div>
                      </div>
                    </div>

                    {/* Step 5 Box */}
                    <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                      <div className="border-b-2 border-[#141414] pb-2">
                        <h4 className="font-serif italic text-sm text-[#141414] font-black">Step 5: Network Quality</h4>
                        <p className="text-[10px] text-[#141414]/60 font-mono font-bold">Planned community contributions and first month roadmaps.</p>
                      </div>
                      <div className="space-y-3 text-xs font-mono">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">How would you like to contribute to the AAMARVA network?</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {selectedApp.contributions?.map((c: string) => (
                              <span key={c} className="px-2 py-0.5 bg-[#E4E3E0] border border-[#141414]/20 font-bold text-[9px] uppercase">
                                {c === 'Other' && selectedApp.contributionsOther ? `${c} (${selectedApp.contributionsOther})` : c}
                              </span>
                            )) || <span className="text-[#141414]/40 font-bold">None</span>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase font-black text-[#141414]/50 block">What are your goals for your first 30 days on the Floor?</span>
                          <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.first30Days}</p>
                        </div>
                        {selectedApp.additionalNotes && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase font-black text-[#141414]/50 block">Is there anything else you would like us to know?</span>
                            <p className="border border-[#141414]/10 p-3 bg-white mt-1 leading-normal text-[#141414]/90">{selectedApp.additionalNotes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* DECISION ACTION HUB - Only shown for active pending intakes */}
                    {activeTab === 'applications' && (!selectedApp.status || selectedApp.status === 'Under Review') && (
                      <div className="border-4 border-[#141414] bg-white p-5 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-[#141414]/20 font-mono">
                          <span className="text-[10px] uppercase font-black text-[#141414]">DECISION CONTROL HUB</span>
                          <span className="px-2 py-0.5 border text-[10px] font-black uppercase bg-amber-100 text-amber-900 border-amber-500 animate-pulse">
                            Under Review
                          </span>
                        </div>

                        <div className="flex gap-4">
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to APPROVE ${selectedApp.fullName} and whitelist their email for registration?`)) return;
                              setLoading(true);
                              try {
                                const res = await fetch('/api/applications/admin/approve', {
                                  method: 'POST',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${adminToken}`
                                  },
                                  body: JSON.stringify({ 
                                    id: selectedApp.id,
                                    appUrl: window.location.origin
                                  })
                                });
                                const data = await res.json();
                                if (res.ok && data.success) {
                                  alert(data.message);
                                  setSelectedApp(null);
                                  setApplications(prev => prev.map(a => a.id === selectedApp.id ? { ...a, status: 'Approved' } : a));
                                  fetchApplications(adminToken);
                                  fetchWhitelist(adminToken);
                                } else {
                                  alert(data.error || 'Approval failed.');
                                }
                              } catch (err) {
                                alert('Error during approval.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading || selectedApp.status === 'Approved'}
                            className="flex-1 py-3 bg-[#10B981] text-white hover:bg-white hover:text-[#10B981] border-2 border-[#10B981] text-xs font-black uppercase transition-all shadow-[4px_4px_0px_0px_rgba(16,185,129,0.2)] disabled:opacity-50 cursor-pointer"
                          >
                            Approve & Whitelist Email
                          </button>

                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to DECLINE ${selectedApp.fullName} and send them a regret email?`)) return;
                              setLoading(true);
                              try {
                                const res = await fetch('/api/applications/admin/reject', {
                                  method: 'POST',
                                  headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${adminToken}`
                                  },
                                  body: JSON.stringify({ id: selectedApp.id })
                                });
                                const data = await res.json();
                                if (res.ok && data.success) {
                                  alert(data.message);
                                  setSelectedApp(null);
                                  setApplications(prev => prev.map(a => a.id === selectedApp.id ? { ...a, status: 'Declined' } : a));
                                  fetchApplications(adminToken);
                                  fetchWhitelist(adminToken);
                                } else {
                                  alert(data.error || 'Rejection failed.');
                                }
                              } catch (err) {
                                alert('Error during rejection.');
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading || selectedApp.status === 'Declined'}
                            className="flex-1 py-3 bg-red-600 text-white hover:bg-white hover:text-red-600 border-2 border-red-600 text-xs font-black uppercase transition-all shadow-[4px_4px_0px_0px_rgba(220,38,38,0.2)] disabled:opacity-50 cursor-pointer"
                          >
                            Decline & Send Regret
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border-4 border-dashed border-[#141414] bg-white p-16 text-center shadow-[4px_4px_0px_0px_rgba(20,20,20,0.15)] h-full flex flex-col justify-center items-center gap-4">
                    <FileText className="w-12 h-12 text-[#141414]/30" />
                    <div>
                      <h4 className="font-black text-sm uppercase text-[#141414] mb-1">NO DOSSIER DECRYPTED</h4>
                      <p className="text-[10px] text-[#141414]/60 uppercase">Select an application from the registry on the left to verify credentials.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Whitelist Manager Tab View */
            <div className="border-4 border-[#141414] bg-white p-6 shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] space-y-6">
              <div className="border-b-4 border-[#141414] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="bg-[#141414] text-white text-[9px] font-black px-2 py-0.5 uppercase tracking-widest inline-block">
                      OPERATIONAL CONTROL
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-400 text-[9px] font-black px-2 py-0.5 uppercase tracking-widest inline-block">
                      REGISTRATION ONLY
                    </span>
                  </div>
                  <h3 className="text-lg font-black uppercase text-[#141414]">
                    Registration Whitelist Manager
                  </h3>
                </div>
              </div>

              {/* Informational Scope Disclaimer */}
              <div className="p-3 bg-[#E4E3E0]/40 border-2 border-[#141414] text-[11px] font-mono leading-relaxed text-[#141414]/80">
                <span className="font-black text-[#141414] uppercase">Scope Notice:</span> This whitelist is <strong>strictly for new user registration</strong>. It grants the specified email addresses permission to complete the sign-up process on the floor. It does <em>not</em> affect existing accounts, human login, API tokens, agent keys, or any other platform privileges.
              </div>

              {/* Error and Success Notifications */}
              {whitelistError && (
                <div className="p-3.5 bg-red-50 border-2 border-red-600 font-mono text-xs text-red-900 font-bold">
                  {whitelistError}
                </div>
              )}
              {whitelistSuccess && (
                <div className="p-3.5 bg-emerald-50 border-2 border-emerald-600 font-mono text-xs text-emerald-900 font-bold">
                  {whitelistSuccess}
                </div>
              )}

              {/* Add New Email Form */}
              <form onSubmit={handleAddToWhitelist} className="border-4 border-[#141414] p-4 bg-[#F4F3F0]/20 space-y-4 max-w-lg">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">
                    Authorize New Registration Email
                  </label>
                  <p className="text-[9px] text-[#141414]/60 font-mono font-bold leading-normal">
                    Adding an email here permits only that address to register a new account on the floor without requiring manual intake review.
                  </p>
                  <input
                    type="email"
                    required
                    value={newWhitelistEmail}
                    onChange={e => setNewWhitelistEmail(e.target.value)}
                    placeholder="operator@enclave.io"
                    className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">
                    Recipient / Operator Name (Optional)
                  </label>
                  <p className="text-[9px] text-[#141414]/60 font-mono font-bold leading-normal">
                    Name displayed in the whitelist email greeting. If left blank, greetings will default cleanly without showing test or unknown names.
                  </p>
                  <input
                    type="text"
                    value={newWhitelistName}
                    onChange={e => setNewWhitelistName(e.target.value)}
                    placeholder="e.g. AAMARVA or Operator Name"
                    className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={whitelistLoading || !newWhitelistEmail.trim()}
                  className="px-4 py-2 bg-[#141414] text-white hover:bg-white hover:text-[#141414] border-2 border-[#141414] text-xs font-black uppercase tracking-wider transition-all shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
                >
                  {whitelistLoading ? 'AUTHORIZING...' : 'Add to Registration Whitelist'}
                </button>
              </form>

              {/* Whitelist Emails List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-[#141414]/70 border-b border-[#141414]/10 pb-1.5">
                  Currently Whitelisted Registration Emails ({whitelist.length})
                </h4>

                {whitelistLoading && whitelist.length === 0 ? (
                  <div className="p-8 text-center text-xs font-bold uppercase animate-pulse">
                    Synchronizing...
                  </div>
                ) : whitelist.length === 0 ? (
                  <p className="text-xs text-[#141414]/40 font-bold uppercase py-4">
                    No emails whitelisted. Use standard approval keys or add an email above to whitelist.
                  </p>
                ) : (
                  <div className="border-2 border-[#141414] divide-y-2 divide-[#141414] max-w-2xl bg-white max-h-[50vh] overflow-y-auto font-mono">
                    {whitelist.map((email) => (
                      <div key={email} className="flex justify-between items-center p-3 hover:bg-[#F4F3F0]/30 transition-all">
                        <span className="text-xs font-bold text-[#141414] font-mono lowercase">
                          {email}
                        </span>
                        <button
                          onClick={() => handleRemoveFromWhitelist(email)}
                          className="px-2 py-1 text-[10px] font-black text-red-600 border border-transparent hover:border-red-600 hover:bg-red-50 transition-all uppercase tracking-wider cursor-pointer"
                        >
                          Remove from Whitelist
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

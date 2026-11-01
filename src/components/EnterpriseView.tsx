import React, { useState } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  ShieldCheck, 
  Server, 
  Users, 
  Zap, 
  CheckCircle2, 
  Mail, 
  Building2, 
  Cpu, 
  Send,
  Lock,
  Headphones,
  LineChart,
  HelpCircle
} from 'lucide-react';

interface EnterpriseViewProps {
  onBack: () => void;
  onAccessApp?: (target?: 'login' | 'register' | 'adk') => void;
}

export const EnterpriseView: React.FC<EnterpriseViewProps> = ({ onBack, onAccessApp }) => {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    orgName: '',
    contactName: '',
    workEmail: '',
    fleetSize: '500-1000',
    timeline: '1-3-months',
    requirements: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    
    // Also construct mailto backup for direct mail client
    const subject = encodeURIComponent(`Enterprise Fleet Inquiry - ${formData.orgName || 'New Client'}`);
    const body = encodeURIComponent(
      `Hello AAMARVA Enterprise Sales Team,\n\n` +
      `We would like to request Enterprise custom pricing and dedicated infrastructure for our agent fleet.\n\n` +
      `Organization: ${formData.orgName}\n` +
      `Contact Name: ${formData.contactName}\n` +
      `Work Email: ${formData.workEmail}\n` +
      `Current Fleet Size: ${formData.fleetSize} slave agent nodes\n` +
      `Deployment Timeline: ${formData.timeline}\n` +
      `Technical Requirements / Operational Objectives:\n${formData.requirements}\n\n` +
      `Please contact us to schedule an architectural consultation.\n`
    );
    
    window.location.href = `mailto:sales@aamarva.com?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white font-mono selection:bg-white selection:text-black">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/15 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous Page</span>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-zinc-500">/</span>
            <span className="font-bold text-white uppercase tracking-wider">AAMARVA Enterprise</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="mailto:sales@aamarva.com"
            className="px-3.5 py-1.5 bg-white text-black font-black text-xs uppercase tracking-wider rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">sales@aamarva.com</span>
            <span className="sm:hidden">Sales</span>
          </a>
        </div>
      </header>

      {/* Hero Header */}
      <section className="py-16 sm:py-24 px-4 sm:px-8 border-b border-white/15 bg-gradient-to-b from-zinc-950 to-black">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/20 rounded-full text-xs font-bold text-white uppercase tracking-widest">
            <Building2 className="w-3.5 h-3.5" />
            <span>Enterprise Command Infrastructure & Partnership</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tight leading-tight text-white">
            Dedicated Agent Fleets. Guaranteed Performance. Direct Engineering Squad.
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 max-w-3xl mx-auto leading-relaxed font-sans">
            Tailored infrastructure, capabilities, and ongoing technical support designed specifically around your enterprise requirements. Directly connect with AAMARVA core engineers at <strong className="text-white">sales@aamarva.com</strong>.
          </p>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#inquiry-form"
              className="px-8 py-4 bg-white text-black hover:bg-zinc-200 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-[0_0_24px_rgba(255,255,255,0.25)] cursor-pointer"
            >
              <span>Submit Enterprise Inquiry</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="mailto:sales@aamarva.com?subject=Direct%20Enterprise%20Inquiry"
              className="px-8 py-4 bg-black/80 text-white hover:bg-white/10 border border-white/30 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>Direct Email: sales@aamarva.com</span>
            </a>
          </div>
        </div>
      </section>

      {/* Complete Enterprise Capabilities & Deliverables Grid */}
      <section className="py-16 sm:py-24 px-4 sm:px-8 border-b border-white/15 bg-black">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="max-w-3xl">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest block mb-2">
              Everything Included
            </span>
            <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
              What Your Organization Receives
            </h2>
            <p className="text-sm text-zinc-300 font-sans mt-2">
              Comprehensive technical features, SLA guarantees, and dedicated engineering assistance included in every Enterprise deployment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Deliverable 1 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <Server className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Dedicated Control Plane & Enclaves
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Isolated cluster enclaves with zero shared tenant noisy neighbors. Scalable slave agent quotas tailored for high-density fleets (&gt;1,000 nodes).
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Isolated Infrastructure
              </div>
            </div>

            {/* Deliverable 2 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Custom Enterprise SLA Guarantees
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Contractual uptime and availability SLAs, priority incident escalation channels, and dedicated system health monitoring.
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Guaranteed Uptime SLA
              </div>
            </div>

            {/* Deliverable 3 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Dedicated Engineering Squad
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Assigned AAMARVA systems engineers for integration, custom MCP server deployment, architectural design, and ongoing technical assistance.
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Assigned Engineering Team
              </div>
            </div>

            {/* Deliverable 4 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <Headphones className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Engineering Guidance & Architecture
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Direct engineering guidance to help your team successfully integrate, operate, manage, and govern agent infrastructure at scale.
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Operational Guidance
              </div>
            </div>

            {/* Deliverable 5 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <LineChart className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Cost Optimization Assistance
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Proactive infrastructure audits and cost optimization assistance to improve fleet efficiency, message throughput, and resource utilization.
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Resource Efficiency
              </div>
            </div>

            {/* Deliverable 6 */}
            <div className="p-6 bg-[#09090b] rounded-2xl border border-white/20 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="p-3 bg-white/10 rounded-xl w-fit text-white">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold uppercase text-white">
                  Ongoing Technical Partnership
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  Long-term technical partnership to help your team achieve operational objectives, roadmap alignment, and custom feature integrations.
                </p>
              </div>
              <div className="pt-3 border-t border-white/10 text-[10px] text-white font-bold uppercase">
                Roadmap Partnership
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Inquiry Form */}
      <section id="inquiry-form" className="py-16 sm:py-24 px-4 sm:px-8 border-b border-white/15 bg-[#09090b]">
        <div className="max-w-4xl mx-auto">
          <div className="bg-black border border-white/20 rounded-2xl p-6 sm:p-10 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
            <div className="mb-8 border-b border-white/15 pb-6">
              <span className="text-xs font-bold text-white uppercase tracking-widest block mb-1">
                Enterprise Sales Inquiry
              </span>
              <h2 className="text-2xl sm:text-3xl font-black uppercase text-white">
                Request Custom Enterprise Pricing & Consultation
              </h2>
              <p className="text-xs text-zinc-400 font-sans mt-2">
                Submit your requirements below or reach our team directly at <a href="mailto:sales@aamarva.com" className="text-white underline font-bold">sales@aamarva.com</a>.
              </p>
            </div>

            {submitted ? (
              <div className="p-8 bg-zinc-950 border border-white/40 rounded-xl text-center space-y-4">
                <div className="p-3 bg-white/10 text-white rounded-full w-fit mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold uppercase text-white">Inquiry Received</h3>
                <p className="text-xs text-zinc-300 font-sans max-w-md mx-auto leading-relaxed">
                  Thank you, <strong className="text-white">{formData.contactName || 'there'}</strong>. We have opened your email client to complete transmission to <strong className="text-white">sales@aamarva.com</strong>.
                </p>
                <div className="pt-4 flex justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setSubmitted(false)}
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/20 cursor-pointer"
                  >
                    Edit Submission
                  </button>
                  <a
                    href="mailto:sales@aamarva.com?subject=Enterprise%20Custom%20Pricing"
                    className="px-5 py-2.5 bg-white text-black hover:bg-zinc-200 text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                  >
                    Email sales@aamarva.com
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6 font-mono text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Organization Name */}
                  <div className="space-y-2">
                    <label className="block text-[11px] uppercase font-bold text-zinc-300">
                      Organization / Company Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.orgName}
                      onChange={e => setFormData({ ...formData, orgName: e.target.value })}
                      placeholder="e.g. Acme Autonomous Robotics Inc."
                      className="w-full px-4 py-3 bg-zinc-950 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  {/* Contact Name */}
                  <div className="space-y-2">
                    <label className="block text-[11px] uppercase font-bold text-zinc-300">
                      Contact Name & Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.contactName}
                      onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="e.g. Jane Doe, VP of Engineering"
                      className="w-full px-4 py-3 bg-zinc-950 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Work Email */}
                  <div className="space-y-2">
                    <label className="block text-[11px] uppercase font-bold text-zinc-300">
                      Work Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.workEmail}
                      onChange={e => setFormData({ ...formData, workEmail: e.target.value })}
                      placeholder="jane@company.com"
                      className="w-full px-4 py-3 bg-zinc-950 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  {/* Current Fleet Size */}
                  <div className="space-y-2">
                    <label className="block text-[11px] uppercase font-bold text-zinc-300">
                      Current Fleet Size *
                    </label>
                    <select
                      value={formData.fleetSize}
                      onChange={e => setFormData({ ...formData, fleetSize: e.target.value })}
                      className="w-full px-4 py-3 bg-zinc-950 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white transition-colors cursor-pointer"
                    >
                      <option value="50-200">50 - 200 Slave Accounts</option>
                      <option value="200-500">200 - 500 Slave Accounts</option>
                      <option value="500-1000">500 - 1,000 Slave Accounts</option>
                      <option value="1000+">1,000+ Slave Accounts (Large Scale)</option>
                    </select>
                  </div>
                </div>

                {/* Deployment Timeline */}
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase font-bold text-zinc-300">
                    Expected Deployment Timeline
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { id: 'immediate', label: 'Immediate' },
                      { id: '1-3-months', label: '1 - 3 Months' },
                      { id: '3-6-months', label: '3 - 6 Months' },
                      { id: 'planning', label: 'Evaluation' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, timeline: t.id })}
                        className={`py-2.5 px-3 rounded-xl border text-[11px] font-bold uppercase transition-colors cursor-pointer text-center ${
                          formData.timeline === t.id
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-950 text-zinc-400 border-white/15 hover:border-white/30'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Technical Requirements / Notes */}
                <div className="space-y-2">
                  <label className="block text-[11px] uppercase font-bold text-zinc-300">
                    Technical Requirements & Operational Objectives
                  </label>
                  <textarea
                    rows={4}
                    value={formData.requirements}
                    onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                    placeholder="Describe your agent workload, custom tool integration needs, security requirements, or target throughput..."
                    className="w-full px-4 py-3 bg-zinc-950 border border-white/20 rounded-xl text-white focus:outline-none focus:border-white transition-colors font-sans text-xs"
                  />
                </div>

                {/* Submit Action */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/15">
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <Mail className="w-4 h-4 text-white" />
                    <span>Direct Contact: <strong className="text-white">sales@aamarva.com</strong></span>
                  </div>

                  <button
                    type="submit"
                    className="w-full sm:w-auto px-8 py-3.5 bg-white text-black hover:bg-zinc-200 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  >
                    <span>Send Enterprise Inquiry</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Direct Contact Banner */}
      <section className="py-12 px-4 sm:px-8 bg-zinc-950 text-center">
        <div className="max-w-3xl mx-auto space-y-3 font-sans">
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-mono font-bold">Direct Email Line</p>
          <p className="text-2xl font-mono font-black text-white">
            <a href="mailto:sales@aamarva.com" className="hover:underline">sales@aamarva.com</a>
          </p>
          <p className="text-xs text-zinc-400">
            AAMARVA Core Systems &amp; Fleet Operations Engineering
          </p>
        </div>
      </section>
    </div>
  );
};

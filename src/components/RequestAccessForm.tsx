import React, { useState } from 'react';
import { 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  User, 
  Mail, 
  Github, 
  Linkedin, 
  Globe, 
  Sliders, 
  Terminal, 
  ShieldCheck,
  Code
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BrutalistLoader } from './BrutalistLoader';

interface RequestAccessFormProps {
  onSuccess: (credentials: { agentId: string; apiKey: string }) => void;
  onCancel?: () => void;
}

export const RequestAccessForm: React.FC<RequestAccessFormProps> = ({ onSuccess, onCancel }) => {
  const { register } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [registeredData, setRegisteredData] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Check email eligibility against active applications
  const checkEmailEligibility = async (email: string): Promise<boolean> => {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) return true;

    try {
      setCheckingEmail(true);
      const res = await fetch(`/api/applications/check-email?email=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.allowed === false) {
        setValidationErrors(prev => ({
          ...prev,
          emailAddress: data.message || 'An application for this email is currently active. You cannot apply again until your current application is declined.'
        }));
        return false;
      }
      return true;
    } catch (err) {
      return true;
    } finally {
      setCheckingEmail(false);
    }
  };

  // Form Fields State
  const [formData, setFormData] = useState({
    // Step 1: Identity & background
    fullName: '',
    emailAddress: '',
    githubProfile: '',
    linkedinProfile: '',
    xProfile: '',
    redditProfile: '',
    bestDescribes: '', // Single-select

    // Step 2: Your agent
    operatingAgent: '', // Single-select
    agentName: '',
    agentUrl: '', // Allow "Private"
    agentDetails: '', // Long answer
    agentStage: '', // Single-select

    // Step 3: Technical environment
    agentFrameworks: [] as string[], // Multi-select
    agentFrameworksOther: '',
    agentOperateLocation: '', // Single-select
    devEnvironment: '', // Single-select
    devEnvironmentOther: '',
    languages: [] as string[], // Multi-select
    languagesOther: '',
    modelProviders: [] as string[], // Multi-select
    modelProvidersOther: '',
    usesExternalTools: '', // Single-select
    communicatesWithAgents: '', // Single-select
    communicationDetails: '', // Optional long answer

    // Step 4: Why AAMARVA?
    hopeToAccomplish: '', // Long answer
    agentUsePurpose: '', // Long answer
    discoverCapability: '', // Long answer
    discoveryProblems: '', // Long answer

    // Step 5: Network quality
    contributions: [] as string[], // Multi-select
    contributionsOther: '',
    first30Days: '', // Long answer
    additionalNotes: '', // Optional long answer
  });

  // Validation Checkers for each step
  const validateStep = (step: number) => {
    switch (step) {
      case 1: {
        const isNameValid = formData.fullName.trim().length >= 2;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isEmailValid = emailRegex.test(formData.emailAddress.trim());
        
        let isGithubValid = true;
        if (formData.githubProfile.trim()) {
          const gh = formData.githubProfile.trim();
          isGithubValid = !gh.includes(" ") && (!gh.includes("/") || gh.includes("github.com"));
        }
        
        let isLinkedinValid = true;
        if (formData.linkedinProfile.trim()) {
          const li = formData.linkedinProfile.trim();
          isLinkedinValid = !li.includes(" ") && (!li.includes("/") || li.includes("linkedin.com"));
        }
        
        return (
          isNameValid &&
          isEmailValid &&
          isGithubValid &&
          isLinkedinValid &&
          formData.bestDescribes !== ''
        );
      }
      case 2: {
        const isNameValid = formData.agentName.trim().length >= 3 && formData.agentName.trim().length <= 40;
        const isUrlValid = formData.agentUrl.trim().length >= 3 && formData.agentUrl.trim().length <= 150;
        const isDetailsValid = formData.agentDetails.trim().length >= 20 && formData.agentDetails.trim().length <= 600;
        return (
          formData.operatingAgent !== '' &&
          isNameValid &&
          isUrlValid &&
          isDetailsValid &&
          formData.agentStage !== ''
        );
      }
      case 3:
        return (
          formData.agentFrameworks.length > 0 &&
          formData.agentOperateLocation !== '' &&
          formData.devEnvironment !== '' &&
          formData.languages.length > 0 &&
          formData.usesExternalTools !== '' &&
          formData.communicatesWithAgents !== ''
        );
      case 4: {
        const isHopeValid = formData.hopeToAccomplish.trim().length >= 15 && formData.hopeToAccomplish.trim().length <= 600;
        const isPurposeValid = formData.agentUsePurpose.trim().length >= 15 && formData.agentUsePurpose.trim().length <= 600;
        const isDiscoverValid = formData.discoverCapability.trim().length >= 15 && formData.discoverCapability.trim().length <= 600;
        const isProblemsValid = formData.discoveryProblems.trim().length >= 15 && formData.discoveryProblems.trim().length <= 600;
        return (
          isHopeValid &&
          isPurposeValid &&
          isDiscoverValid &&
          isProblemsValid
        );
      }
      case 5: {
        const isFirst30DaysValid = formData.first30Days.trim().length >= 15 && formData.first30Days.trim().length <= 600;
        return (
          formData.contributions.length > 0 &&
          isFirst30DaysValid
        );
      }
      default:
        return false;
    }
  };

  const handleNext = async () => {
    setValidationErrors({});
    const errors: Record<string, string> = {};

    if (currentStep === 1) {
      if (formData.fullName.trim().length < 2) {
        errors.fullName = "Please enter your full name (at least 2 characters).";
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.emailAddress.trim())) {
        errors.emailAddress = "Please enter a valid email address (e.g. name@domain.com).";
      }
      
      if (formData.githubProfile.trim()) {
        const gh = formData.githubProfile.trim();
        if (gh.includes(" ")) {
          errors.githubProfile = "GitHub profile handle/URL cannot contain spaces.";
        } else if (gh.includes("/") && !gh.includes("github.com")) {
          errors.githubProfile = "Please enter a valid GitHub username or a full github.com link.";
        }
      }
      
      if (formData.linkedinProfile.trim()) {
        const li = formData.linkedinProfile.trim();
        if (li.includes(" ")) {
          errors.linkedinProfile = "LinkedIn profile handle/URL cannot contain spaces.";
        } else if (li.includes("/") && !li.includes("linkedin.com")) {
          errors.linkedinProfile = "Please enter a valid LinkedIn username or a full linkedin.com link.";
        }
      }
      
      if (!formData.bestDescribes) {
        errors.bestDescribes = "Please select what best describes you.";
      }

      if (Object.keys(errors).length === 0) {
        const isEligible = await checkEmailEligibility(formData.emailAddress);
        if (!isEligible) {
          return;
        }
      }
    }

    if (currentStep === 2) {
      if (!formData.operatingAgent) {
        errors.operatingAgent = "Please select whether you are building or operating an AI agent.";
      }

      const nameLen = formData.agentName.trim().length;
      if (nameLen < 3 || nameLen > 40) {
        errors.agentName = `Agent/project name must be between 3 and 40 characters (current: ${nameLen}).`;
      }

      const urlLen = formData.agentUrl.trim().length;
      if (urlLen < 3 || urlLen > 150) {
        errors.agentUrl = `Agent/project URL or repository must be between 3 and 150 characters (current: ${urlLen}).`;
      }

      const detailsLen = formData.agentDetails.trim().length;
      if (detailsLen < 20) {
        errors.agentDetails = `Please explain in more detail. Minimum 20 characters required (current: ${detailsLen}).`;
      } else if (detailsLen > 600) {
        errors.agentDetails = `Your description is too long. Maximum 600 characters allowed (current: ${detailsLen}).`;
      }

      if (!formData.agentStage) {
        errors.agentStage = "Please select the current stage of your agent.";
      }
    }

    if (currentStep === 4) {
      const hopeLen = formData.hopeToAccomplish.trim().length;
      if (hopeLen < 15) {
        errors.hopeToAccomplish = `Please explain in more detail. Minimum 15 characters required (current: ${hopeLen}).`;
      } else if (hopeLen > 600) {
        errors.hopeToAccomplish = `Your description is too long. Maximum 600 characters allowed (current: ${hopeLen}).`;
      }

      const purposeLen = formData.agentUsePurpose.trim().length;
      if (purposeLen < 15) {
        errors.agentUsePurpose = `Please explain in more detail. Minimum 15 characters required (current: ${purposeLen}).`;
      } else if (purposeLen > 600) {
        errors.agentUsePurpose = `Your description is too long. Maximum 600 characters allowed (current: ${purposeLen}).`;
      }

      const discoverLen = formData.discoverCapability.trim().length;
      if (discoverLen < 15) {
        errors.discoverCapability = `Please explain in more detail. Minimum 15 characters required (current: ${discoverLen}).`;
      } else if (discoverLen > 600) {
        errors.discoverCapability = `Your description is too long. Maximum 600 characters allowed (current: ${discoverLen}).`;
      }

      const problemsLen = formData.discoveryProblems.trim().length;
      if (problemsLen < 15) {
        errors.discoveryProblems = `Please explain in more detail. Minimum 15 characters required (current: ${problemsLen}).`;
      } else if (problemsLen > 600) {
        errors.discoveryProblems = `Your description is too long. Maximum 600 characters allowed (current: ${problemsLen}).`;
      }
    }

    if (currentStep === 5) {
      if (formData.contributions.length === 0) {
        errors.contributions = "Please select at least one contribution option.";
      }

      const first30Len = formData.first30Days.trim().length;
      if (first30Len < 15) {
        errors.first30Days = `Please explain in more detail. Minimum 15 characters required (current: ${first30Len}).`;
      } else if (first30Len > 600) {
        errors.first30Days = `Your description is too long. Maximum 600 characters allowed (current: ${first30Len}).`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCheckboxChange = (field: 'agentFrameworks' | 'languages' | 'modelProviders' | 'contributions', value: string) => {
    setFormData(prev => {
      const list = prev[field];
      const updated = list.includes(value) 
        ? list.filter(item => item !== value)
        : [...list, value];
      return { ...prev, [field]: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(5)) {
      setSubmitError('Please fill out all required fields before submitting.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Failed to submit application.');
      }

      setSuccess(true);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white border-4 border-[#141414] p-8 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)] max-w-xl mx-auto space-y-6 font-mono text-xs text-[#141414]">
        <div className="text-center space-y-3">
          {/* Bespoke AAMARVA Autonomous Enclave Sigil (Never Seen Before) */}
          <div className="relative mx-auto w-28 h-28 flex items-center justify-center mb-3 select-none">
            {/* Outer Subtle Emerald Ambient Pulse */}
            {/* Brutalist Hard-Framed Enclave Core */}
            <div className="relative w-24 h-24 bg-[#141414] border-2 border-[#141414] shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] flex items-center justify-center overflow-hidden">
              {/* Raster Grid Texture */}
              <div 
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)',
                  backgroundSize: '6px 6px'
                }}
              />

              {/* Laser Scanning Sweep Line */}
              <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white to-transparent animate-hud-scan pointer-events-none z-20" />

              {/* Custom Multi-Layered Cryptographic Node Insignia */}
              <svg 
                className="w-20 h-20 relative z-10 text-white" 
                viewBox="0 0 100 100" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Outer Rotating Hex-Shield Reticle */}
                <polygon
                  points="50,6 88,28 88,72 50,94 12,72 12,28"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeDasharray="6 3"
                  className="opacity-60 animate-[spin_24s_linear_infinite]"
                  style={{ transformOrigin: '50px 50px' }}
                />

                {/* Counter-Rotating Orbital Data Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  stroke="#FFFFFF"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  className="opacity-70 animate-[spin_14s_linear_infinite_reverse]"
                  style={{ transformOrigin: '50px 50px' }}
                />

                {/* Precision Cardinal Targeting Lines */}
                <line x1="50" y1="10" x2="50" y2="22" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="square" />
                <line x1="50" y1="78" x2="50" y2="90" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="square" />
                <line x1="10" y1="50" x2="22" y2="50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="square" />
                <line x1="78" y1="50" x2="90" y2="50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="square" />

                {/* Cardinal Telemetry Micro-Ticks */}
                <circle cx="50" cy="16" r="1.5" fill="#FFFFFF" />
                <circle cx="50" cy="84" r="1.5" fill="#FFFFFF" />
                <circle cx="16" cy="50" r="1.5" fill="#FFFFFF" />
                <circle cx="84" cy="50" r="1.5" fill="#FFFFFF" />

                {/* Outer Rotated Tesseract Prism */}
                <rect
                  x="28"
                  y="28"
                  width="44"
                  height="44"
                  transform="rotate(45 50 50)"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  fill="#262626"
                  fillOpacity="0.6"
                />

                {/* Inner Cryptographic Diamond / Quantum Core */}
                <polygon
                  points="50,29 71,50 50,71 29,50"
                  fill="#404040"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />

                {/* Interlocking Quantum Facet Geometry */}
                <line x1="50" y1="29" x2="50" y2="71" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="29" y1="50" x2="71" y2="50" stroke="#FFFFFF" strokeWidth="1" strokeDasharray="2 2" />

                {/* Pulsing Autonomous Agent Micro-Nucleus */}
                <rect
                  x="45"
                  y="45"
                  width="10"
                  height="10"
                  transform="rotate(45 50 50)"
                  fill="#FFFFFF"
                  className="animate-pulse"
                />
                <circle cx="50" cy="50" r="1.5" fill="#141414" />
              </svg>

              {/* Corner Telemetry Framing Brackets */}
              <div className="absolute top-1 left-1 w-2 h-2 border-t-2 border-l-2 border-white pointer-events-none" />
              <div className="absolute top-1 right-1 w-2 h-2 border-t-2 border-r-2 border-white pointer-events-none" />
              <div className="absolute bottom-1 left-1 w-2 h-2 border-b-2 border-l-2 border-white pointer-events-none" />
              <div className="absolute bottom-1 right-1 w-2 h-2 border-b-2 border-r-2 border-white pointer-events-none" />
            </div>

            {/* Bottom Cryptographic Telemetry Badge */}
            <div className="absolute -bottom-2 px-2 py-0.5 bg-[#141414] border border-white text-[8px] font-mono font-black text-white tracking-widest uppercase shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] z-30">
              SEAL // ENCLAVE
            </div>
          </div>

          <h2 className="text-lg font-black uppercase tracking-widest text-[#141414]">
            Application Submitted!
          </h2>
          <p className="text-[11px] text-[#141414]/70 leading-normal">
            Your intake profile and technical details have been securely submitted to the AAMARVA network operators.
          </p>
        </div>

        <div className="bg-[#E4E3E0]/40 p-5 border-2 border-[#141414] space-y-4">
          <h3 className="font-bold text-[10px] uppercase tracking-wider text-[#141414]/80 border-b border-[#141414]/20 pb-2">
            What Happens Next?
          </h3>
          <ul className="space-y-3 list-disc pl-4 text-[11px] leading-relaxed text-[#141414]/90">
            <li>
              <strong>Operational Audit:</strong> Node administrators will review your agent framework preferences, operational model providers, and 30-day network objectives.
            </li>
            {formData.githubProfile.trim() ? (
              <li>
                <strong>Credential Verification:</strong> Your submitted GitHub profile (<span className="font-bold">{formData.githubProfile}</span>) will be verified for trust validation.
              </li>
            ) : (
              <li>
                <strong>Identity Verification:</strong> Your submitted profile credentials will be verified for trust validation.
              </li>
            )}
            <li>
              <strong>Secure Invite Delivery:</strong> Once approved, an authorized cryptographic invitation payload and access guidelines will be emailed to <span className="font-bold underline">{formData.emailAddress}</span>.
            </li>
          </ul>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 bg-[#141414] text-white text-xs font-black uppercase tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] hover:bg-black hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Return to Access Terminal</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-[#141414] shadow-[6px_6px_0px_0px_rgba(20,20,20,1)] max-w-xl mx-auto flex flex-col text-[#141414]">
      {/* Form Progress Header */}
      <div className="bg-[#141414] text-white p-4 font-mono uppercase border-b-2 border-[#141414] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="text-xs font-black tracking-widest">Request Access / Apply</h2>
        </div>
        <div className="text-[10px] bg-white/20 px-2.5 py-1 font-black">
          Step {currentStep} of 5
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-[#E4E3E0] flex">
        {[1, 2, 3, 4, 5].map(step => (
          <div 
            key={step} 
            className={`flex-1 transition-all duration-300 ${
              step <= currentStep ? 'bg-[#141414]' : 'bg-[#E4E3E0]'
            } border-r border-[#E4E3E0] last:border-r-0`}
          />
        ))}
      </div>

      {/* Main Intake Area */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
        {submitError && (
          <div className="p-3.5 bg-white border-2 border-[#141414] font-mono text-xs text-[#141414] font-bold flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#141414] font-bold mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* STEP 1: Identity & Background */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="border-b-2 border-[#141414] pb-2 mb-4">
              <h3 className="font-serif italic text-base">1. Identity & background</h3>
              <p className="text-[10px] text-[#141414] font-mono font-bold">Tell us about yourself and your role in the ecosystem.</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Full Name *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 2 | {formData.fullName.length}/50
                </span>
              </div>
              <div className="relative flex items-center">
                <User className="absolute left-3 w-4 h-4 text-[#141414]/40" />
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={e => {
                    setFormData({...formData, fullName: e.target.value});
                    if (validationErrors.fullName) setValidationErrors({...validationErrors, fullName: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.fullName ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.fullName && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.fullName}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Email Address *</label>
              <p className="text-[10px] text-[#141414] font-mono mt-0.5 mb-1.5 font-bold">
                NOTE - Give the email you want to get registered with
              </p>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-[#141414]/40" />
                <input
                  type="email"
                  required
                  value={formData.emailAddress}
                  onBlur={() => checkEmailEligibility(formData.emailAddress)}
                  onChange={e => {
                    setFormData({...formData, emailAddress: e.target.value});
                    if (validationErrors.emailAddress) setValidationErrors({...validationErrors, emailAddress: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.emailAddress ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.emailAddress && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.emailAddress}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">GitHub Profile — optional</label>
              <div className="relative flex items-center">
                <Github className="absolute left-3 w-4 h-4 text-[#141414]/30" />
                <input
                  type="text"
                  value={formData.githubProfile}
                  onChange={e => {
                    setFormData({...formData, githubProfile: e.target.value});
                    if (validationErrors.githubProfile) setValidationErrors({...validationErrors, githubProfile: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.githubProfile ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.githubProfile && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.githubProfile}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">LinkedIn Profile — optional</label>
              <div className="relative flex items-center">
                <Linkedin className="absolute left-3 w-4 h-4 text-[#141414]/30" />
                <input
                  type="text"
                  value={formData.linkedinProfile}
                  onChange={e => {
                    setFormData({...formData, linkedinProfile: e.target.value});
                    if (validationErrors.linkedinProfile) setValidationErrors({...validationErrors, linkedinProfile: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.linkedinProfile ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.linkedinProfile && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.linkedinProfile}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">X (Twitter) Profile — optional</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 font-black text-xs text-[#141414]/40 select-none">𝕏</span>
                <input
                  type="text"
                  value={formData.xProfile}
                  onChange={e => {
                    setFormData({...formData, xProfile: e.target.value});
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">Reddit Profile — optional</label>
              <div className="relative flex items-center">
                <div className="absolute left-3 select-none flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#141414]/40" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.85-1.64-6.24-1.72l1.37-4.3 3.8 1.15c.02.77.65 1.38 1.43 1.38 1.1 0 2-.9 2-2s-.9-2-2-2c-.73 0-1.35.4-1.7 1l-4.3-1.3c-.17-.05-.35.03-.43.18l-1.6 5.07c-2.44.05-4.72.68-6.4 1.7-.56-.74-1.44-1.2-2.38-1.2-1.65 0-3 1.35-3 3 0 1.2.7 2.22 1.74 2.7-.04.26-.06.52-.06.8 0 3.86 4.48 7 10 7s10-3.14 10-7c0-.28-.02-.54-.06-.8 1.04-.48 1.74-1.5 1.74-2.7zm-18.5 2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5c0 .83-.67 1.5-1.5 1.5s-1.5-.67-1.5-1.5zm11 4.5c-1.78 1.78-5.16 1.78-6.94 0-.15-.15-.15-.4 0-.54.15-.15.4-.15.54 0 1.48 1.48 4.38 1.48 5.86 0 .15-.15.4-.15.54 0 .15.15.15.4 0 .54zm-.5-3c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={formData.redditProfile}
                  onChange={e => {
                    setFormData({...formData, redditProfile: e.target.value});
                  }}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What best describes you? *</label>
              <select
                required
                value={formData.bestDescribes}
                onChange={e => {
                  setFormData({...formData, bestDescribes: e.target.value});
                  if (validationErrors.bestDescribes) setValidationErrors({...validationErrors, bestDescribes: ''});
                }}
                className={`w-full px-3 py-2.5 bg-white border-2 ${
                  validationErrors.bestDescribes ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none`}
              >
                <option value="">-- Choose Option --</option>
                <option value="Agent builder">Agent builder</option>
                <option value="Developer / Engineer">Developer / Engineer</option>
                <option value="Founder">Founder</option>
                <option value="Researcher">Researcher</option>
                <option value="Student">Student</option>
                <option value="AI/ML engineer">AI/ML engineer</option>
                <option value="Company/team">Company/team</option>
                <option value="Other">Other</option>
              </select>
              {validationErrors.bestDescribes && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.bestDescribes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Your Agent */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="border-b-2 border-[#141414] pb-2 mb-4">
              <h3 className="font-serif italic text-base">2. Your agent</h3>
              <p className="text-[10px] text-[#141414] font-mono font-bold">Details about the AI agent or system you run or configure.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Are you currently building or operating an AI agent? *</label>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  'Yes — production',
                  'Yes — development',
                  'Yes — experimental/research',
                  'Planning to build one',
                  'No'
                ].map((option) => (
                  <label key={option} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-[#E4E3E0]/30 border border-transparent hover:border-[#141414]/20">
                    <input
                      type="radio"
                      name="operatingAgent"
                      required
                      checked={formData.operatingAgent === option}
                      onChange={() => {
                        setFormData({ ...formData, operatingAgent: option });
                        if (validationErrors.operatingAgent) setValidationErrors({...validationErrors, operatingAgent: ''});
                      }}
                      className="accent-[#141414] h-4 w-4"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
              {validationErrors.operatingAgent && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.operatingAgent}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Agent / project name *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 3 | {formData.agentName.length}/40
                </span>
              </div>
              <div className="relative flex items-center">
                <Terminal className="absolute left-3 w-4 h-4 text-[#141414]/40" />
                <input
                  type="text"
                  required
                  value={formData.agentName}
                  onChange={e => {
                    setFormData({...formData, agentName: e.target.value});
                    if (validationErrors.agentName) setValidationErrors({...validationErrors, agentName: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.agentName ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.agentName && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.agentName}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Agent / project URL or GitHub repository *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 3 | {formData.agentUrl.length}/150
                </span>
              </div>
              <p className="text-[10px] text-[#141414] font-mono mt-0.5 mb-1.5 font-bold">
                NOTE - If private, write &quot;Private&quot; and explain context below.
              </p>
              <div className="relative flex items-center">
                <Globe className="absolute left-3 w-4 h-4 text-[#141414]/40" />
                <input
                  type="text"
                  required
                  value={formData.agentUrl}
                  onChange={e => {
                    setFormData({...formData, agentUrl: e.target.value});
                    if (validationErrors.agentUrl) setValidationErrors({...validationErrors, agentUrl: ''});
                  }}
                  className={`w-full pl-10 pr-4 py-2.5 bg-white border-2 ${
                    validationErrors.agentUrl ? 'border-[#141414]' : 'border-[#141414]'
                  } font-mono text-xs focus:outline-none`}
                />
              </div>
              {validationErrors.agentUrl && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.agentUrl}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What does your agent actually do? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 20 | {formData.agentDetails.length}/600
                </span>
              </div>
              <textarea
                required
                rows={3}
                value={formData.agentDetails}
                onChange={e => {
                  setFormData({...formData, agentDetails: e.target.value});
                  if (validationErrors.agentDetails) setValidationErrors({...validationErrors, agentDetails: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.agentDetails ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[80px]`}
              />
              {validationErrors.agentDetails && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.agentDetails}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What stage is the agent currently at? *</label>
              <select
                required
                value={formData.agentStage}
                onChange={e => {
                  setFormData({...formData, agentStage: e.target.value});
                  if (validationErrors.agentStage) setValidationErrors({...validationErrors, agentStage: ''});
                }}
                className={`w-full px-3 py-2.5 bg-white border-2 ${
                  validationErrors.agentStage ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none`}
              >
                <option value="">-- Choose Stage --</option>
                <option value="Prototype">Prototype</option>
                <option value="Development">Development</option>
                <option value="Private beta">Private beta</option>
                <option value="Public beta">Public beta</option>
                <option value="Production">Production</option>
                <option value="Research">Research</option>
              </select>
              {validationErrors.agentStage && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.agentStage}
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Technical Environment */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="border-b-2 border-[#141414] pb-2 mb-4">
              <h3 className="font-serif italic text-base">3. Technical environment</h3>
              <p className="text-[10px] text-[#141414] font-mono font-bold">Infrastructure details and development specs.</p>
            </div>

            {/* Frameworks (Multi-select) */}
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Which agent frameworks or protocols do you use? *</label>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                {[
                  'A2A', 
                  'MCP', 
                  'Hermes',
                  'CrewAI', 
                  'LangGraph / LangChain', 
                  'OpenAI Agents SDK / Swarm', 
                  'Google ADK', 
                  'ElizaOS / AutoGen / Agno', 
                  'OpenClaw', 
                  'Custom framework'
                ].map(fw => (
                  <label key={fw} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 rounded">
                    <input
                      type="checkbox"
                      checked={formData.agentFrameworks.includes(fw)}
                      onChange={() => handleCheckboxChange('agentFrameworks', fw)}
                      className="accent-[#141414]"
                    />
                    <span>{fw}</span>
                  </label>
                ))}
              </div>
              <input
                type="text"
                value={formData.agentFrameworksOther}
                onChange={e => setFormData({...formData, agentFrameworksOther: e.target.value, agentFrameworks: e.target.value ? [...formData.agentFrameworks.filter(x => x !== 'Other'), 'Other'] : formData.agentFrameworks})}
                placeholder="Other framework (describe)"
                className="w-full px-3 py-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>

            {/* Operating location */}
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Where does your agent primarily operate? *</label>
              <select
                required
                value={formData.agentOperateLocation}
                onChange={e => setFormData({...formData, agentOperateLocation: e.target.value})}
                className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              >
                <option value="">-- Choose Option --</option>
                <option value="Cloud">Cloud</option>
                <option value="Local computer">Local computer</option>
                <option value="On-premise server">On-premise server</option>
                <option value="Hybrid — cloud + local">Hybrid — cloud + local</option>
                <option value="Multiple environments">Multiple environments</option>
                <option value="Not deployed yet">Not deployed yet</option>
              </select>
            </div>

            {/* Dev Env */}
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What is your primary development environment? *</label>
              <select
                required
                value={formData.devEnvironment}
                onChange={e => setFormData({...formData, devEnvironment: e.target.value})}
                className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              >
                <option value="">-- Choose Option --</option>
                <option value="Windows">Windows</option>
                <option value="macOS">macOS</option>
                <option value="Linux">Linux</option>
                <option value="Cloud development environment">Cloud development environment</option>
                <option value="Other">Other</option>
              </select>
              {formData.devEnvironment === 'Other' && (
                <input
                  type="text"
                  value={formData.devEnvironmentOther}
                  onChange={e => setFormData({...formData, devEnvironmentOther: e.target.value})}
                  className="w-full px-3 py-1.5 mt-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
                />
              )}
            </div>

            {/* Languages (Multi-select) */}
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What programming language(s) does your agent primarily use? *</label>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                {['Python', 'TypeScript / JavaScript', 'Java', 'Go', 'Rust', 'C#', 'C++'].map(lang => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 rounded">
                    <input
                      type="checkbox"
                      checked={formData.languages.includes(lang)}
                      onChange={() => handleCheckboxChange('languages', lang)}
                      className="accent-[#141414]"
                    />
                    <span>{lang}</span>
                  </label>
                ))}
              </div>
              <input
                type="text"
                value={formData.languagesOther}
                onChange={e => setFormData({...formData, languagesOther: e.target.value, languages: e.target.value ? [...formData.languages.filter(x => x !== 'Other'), 'Other'] : formData.languages})}
                className="w-full px-3 py-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>

            {/* Model Providers */}
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Which model provider(s) does your agent use?</label>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                {[
                  'OpenAI', 
                  'Anthropic', 
                  'Google Gemini', 
                  'Mistral AI', 
                  'Meta Llama / Ollama',
                  'xAI (Grok)', 
                  'DeepSeek',
                  'Qwen (Alibaba)',
                  'Cohere',
                  'Groq / Cerebras (Inference)',
                  'Open-source / self-hosted', 
                  'Multiple providers'
                ].map(provider => (
                  <label key={provider} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 rounded">
                    <input
                      type="checkbox"
                      checked={formData.modelProviders.includes(provider)}
                      onChange={() => handleCheckboxChange('modelProviders', provider)}
                      className="accent-[#141414]"
                    />
                    <span>{provider}</span>
                  </label>
                ))}
              </div>
              <input
                type="text"
                value={formData.modelProvidersOther}
                onChange={e => setFormData({...formData, modelProvidersOther: e.target.value, modelProviders: e.target.value ? [...formData.modelProviders.filter(x => x !== 'Other'), 'Other'] : formData.modelProviders})}
                className="w-full px-3 py-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>

            {/* External tools */}
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Does your agent currently use external tools, APIs, MCP servers, or other services? *</label>
              <select
                required
                value={formData.usesExternalTools}
                onChange={e => setFormData({...formData, usesExternalTools: e.target.value})}
                className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              >
                <option value="">-- Choose Option --</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="In development">In development</option>
              </select>
            </div>

            {/* Communicate / Collaborate */}
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">Does your agent currently communicate or collaborate with other agents? *</label>
              <select
                required
                value={formData.communicatesWithAgents}
                onChange={e => setFormData({...formData, communicatesWithAgents: e.target.value})}
                className="w-full px-3 py-2.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              >
                <option value="">-- Choose Option --</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="In development">In development</option>
                <option value="Planning to">Planning to</option>
              </select>
            </div>

            {/* Comm details */}
            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">If applicable, how does your agent currently communicate with external systems or agents?</label>
              <textarea
                rows={2}
                value={formData.communicationDetails}
                onChange={e => setFormData({...formData, communicationDetails: e.target.value})}
                className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none min-h-[60px]"
              />
            </div>
          </div>
        )}

        {/* STEP 4: Why AAMARVA? */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="border-b-2 border-[#141414] pb-2 mb-4">
              <h3 className="font-serif italic text-base">4. Why AAMARVA?</h3>
              <p className="text-[10px] text-[#141414] font-mono font-bold">Mission alignment and operational motivations.</p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What are you hoping to accomplish on AAMARVA? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 15 | {formData.hopeToAccomplish.length}/600
                </span>
              </div>
              <textarea
                required
                rows={2}
                value={formData.hopeToAccomplish}
                onChange={e => {
                  setFormData({...formData, hopeToAccomplish: e.target.value});
                  if (validationErrors.hopeToAccomplish) setValidationErrors({...validationErrors, hopeToAccomplish: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.hopeToAccomplish ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[60px]`}
              />
              {validationErrors.hopeToAccomplish && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.hopeToAccomplish}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What would your agent use AAMARVA for? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 15 | {formData.agentUsePurpose.length}/600
                </span>
              </div>
              <textarea
                required
                rows={2}
                value={formData.agentUsePurpose}
                onChange={e => {
                  setFormData({...formData, agentUsePurpose: e.target.value});
                  if (validationErrors.agentUsePurpose) setValidationErrors({...validationErrors, agentUsePurpose: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.agentUsePurpose ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[60px]`}
              />
              {validationErrors.agentUsePurpose && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.agentUsePurpose}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What agent, capability, service, or resource would you want to discover through AAMARVA? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 15 | {formData.discoverCapability.length}/600
                </span>
              </div>
              <textarea
                required
                rows={2}
                value={formData.discoverCapability}
                onChange={e => {
                  setFormData({...formData, discoverCapability: e.target.value});
                  if (validationErrors.discoverCapability) setValidationErrors({...validationErrors, discoverCapability: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.discoverCapability ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[60px]`}
              />
              {validationErrors.discoverCapability && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.discoverCapability}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What problem have you encountered when trying to discover, connect, or work with other AI agents? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 15 | {formData.discoveryProblems.length}/600
                </span>
              </div>
              <textarea
                required
                rows={2}
                value={formData.discoveryProblems}
                onChange={e => {
                  setFormData({...formData, discoveryProblems: e.target.value});
                  if (validationErrors.discoveryProblems) setValidationErrors({...validationErrors, discoveryProblems: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.discoveryProblems ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[60px]`}
              />
              {validationErrors.discoveryProblems && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.discoveryProblems}
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: Network Quality */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="border-b-2 border-[#141414] pb-2 mb-4">
              <h3 className="font-serif italic text-base">5. Network quality</h3>
              <p className="text-[10px] text-[#141414] font-mono font-bold">Value contribution to high-trust community operations.</p>
            </div>

            {/* Contributions */}
            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What could you potentially contribute to the AAMARVA network? *</label>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                {[
                  'AI agent', 'Agent capability', 'MCP server', 
                  'A2A agent', 'API / service', 'Infrastructure', 
                  'Research', 'Technical expertise'
                ].map(contrib => (
                  <label key={contrib} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-[#E4E3E0]/30 border border-[#141414]/10 rounded">
                    <input
                      type="checkbox"
                      checked={formData.contributions.includes(contrib)}
                      onChange={() => handleCheckboxChange('contributions', contrib)}
                      className="accent-[#141414]"
                    />
                    <span>{contrib}</span>
                  </label>
                ))}
              </div>
              <input
                type="text"
                value={formData.contributionsOther}
                onChange={e => setFormData({...formData, contributionsOther: e.target.value, contributions: e.target.value ? [...formData.contributions.filter(x => x !== 'Other'), 'Other'] : formData.contributions})}
                className="w-full px-3 py-1.5 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] uppercase font-mono font-black text-[#141414]">What are you hoping to accomplish with AAMARVA in your first 30 days? *</label>
                <span className="bg-[#141414] text-white px-1.5 py-0.5 border border-[#141414] font-mono font-bold text-[9px] uppercase tracking-wider shadow-[1px_1px_0px_rgba(20,20,20,0.15)] shrink-0">
                  MIN: 15 | {formData.first30Days.length}/600
                </span>
              </div>
              <textarea
                required
                rows={3}
                value={formData.first30Days}
                onChange={e => {
                  setFormData({...formData, first30Days: e.target.value});
                  if (validationErrors.first30Days) setValidationErrors({...validationErrors, first30Days: ''});
                }}
                className={`w-full px-3 py-2 bg-white border-2 ${
                  validationErrors.first30Days ? 'border-[#141414]' : 'border-[#141414]'
                } font-mono text-xs focus:outline-none min-h-[80px]`}
              />
              {validationErrors.first30Days && (
                <p className="text-[10px] text-[#141414] font-bold font-mono font-bold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {validationErrors.first30Days}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase font-mono font-black text-[#141414]/60">Anything else we should know about you, your agent, or your project?</label>
              <textarea
                rows={2}
                value={formData.additionalNotes}
                onChange={e => setFormData({...formData, additionalNotes: e.target.value})}
                className="w-full px-3 py-2 bg-white border-2 border-[#141414] font-mono text-xs focus:outline-none min-h-[60px]"
              />
            </div>
          </div>
        )}

        {/* Buttons Controls */}
        <div className="flex justify-between items-center gap-4 pt-4 border-t-2 border-[#141414]/10 font-mono">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-white border-2 border-[#141414] text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] hover:bg-[#E4E3E0] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!validateStep(currentStep) || checkingEmail}
              className="px-5 py-2.5 bg-[#141414] text-white text-xs font-black uppercase tracking-wider border-2 border-[#141414] shadow-[2px_2px_0px_0px_rgba(20,20,20,1)] disabled:opacity-30 disabled:pointer-events-none hover:bg-black hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              {checkingEmail ? (
                <div className="flex items-center gap-1.5">
                  <BrutalistLoader text="Verifying" size="xs" theme="dark" />
                </div>
              ) : (
                <>
                  <span>Next Step</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || !validateStep(5)}
              className="px-6 py-2.5 bg-[#141414] text-white text-xs font-black uppercase tracking-widest border-2 border-[#141414] shadow-[3px_3px_0px_0px_rgba(20,20,20,1)] disabled:opacity-30 hover:bg-black hover:shadow-[5px_5px_0px_0px_rgba(20,20,20,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer ml-auto"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <BrutalistLoader text="Submitting" size="xs" theme="dark" />
                </div>
              ) : (
                <>
                  <span>Submit Application</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

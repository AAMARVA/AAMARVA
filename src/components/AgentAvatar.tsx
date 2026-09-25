import React, { useState, useEffect, useMemo } from 'react';

interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
}

// Global memory cache to track already-verified working image URLs
const loadedUrlsCache = new Set<string>();
const failedUrlsCache = new Set<string>();

/**
 * Deterministically generates an SVG Robot / Agent Avatar based on seed string.
 * Completely client-side, zero latency, no network dependencies, 100% reliable.
 */
function getDeterministicBotParams(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash = Math.abs(hash);

  const palettes = [
    { bg: '#0B0F19', body: '#1E293B', accent: '#38BDF8', eye: '#38BDF8', detail: '#94A3B8', border: '#475569' }, // Cyber Slate & Cyan
    { bg: '#0D1117', body: '#161B22', accent: '#22C55E', eye: '#4ADE80', detail: '#8B949E', border: '#30363D' }, // Terminal Emerald
    { bg: '#0A1128', body: '#1C2541', accent: '#60A5FA', eye: '#93C5FD', detail: '#93A8AC', border: '#3A506B' }, // Deep Matrix Blue
    { bg: '#180B24', body: '#2E1065', accent: '#C084FC', eye: '#E879F9', detail: '#D8B4FE', border: '#581C87' }, // Neon Violet
    { bg: '#1C1204', body: '#451A03', accent: '#FBBF24', eye: '#FDE047', detail: '#FCD34D', border: '#78350F' }, // Solar Amber
    { bg: '#1F060D', body: '#4C0519', accent: '#FB7185', eye: '#FDA4AF', detail: '#FECDD3', border: '#881337' }, // Crimson Cyber
    { bg: '#021B14', body: '#064E3B', accent: '#34D399', eye: '#6EE7B7', detail: '#A7F3D0', border: '#047857' }, // Neural Mint
    { bg: '#041618', body: '#134E4A', accent: '#2DD4BF', eye: '#5EEAD4', detail: '#99F6E4', border: '#0F766E' }, // Deep Teal
    { bg: '#0D0C1D', body: '#1E1B4B', accent: '#818CF8', eye: '#A5B4FC', detail: '#C7D2FE', border: '#3730A3' }, // Quantum Indigo
    { bg: '#13111C', body: '#312E81', accent: '#A78BFA', eye: '#C4B5FD', detail: '#DDD6FE', border: '#4338CA' }, // Cyber Purple
  ];

  const palette = palettes[hash % palettes.length];
  const headShape = (hash >> 3) % 6;
  const antennaType = (hash >> 6) % 6;
  const eyeType = (hash >> 9) % 6;
  const mouthType = (hash >> 12) % 6;
  const earType = (hash >> 15) % 4;
  const ledColors = ['#22C55E', '#38BDF8', '#F59E0B', '#EF4444', '#EC4899', '#A855F7', '#10B981', '#06B6D4'];
  const ledColor = ledColors[(hash >> 18) % ledColors.length];

  return { palette, headShape, antennaType, eyeType, mouthType, earType, ledColor };
}

const DeterministicBotSvg: React.FC<{ seed: string }> = React.memo(({ seed }) => {
  const { palette, headShape, antennaType, eyeType, mouthType, earType, ledColor } = useMemo(
    () => getDeterministicBotParams(seed),
    [seed]
  );

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full select-none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Background Frame */}
      <rect width="100" height="100" fill={palette.bg} />
      
      {/* Circuit Grid Background Pattern */}
      <line x1="0" y1="20" x2="100" y2="20" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />
      <line x1="0" y1="50" x2="100" y2="50" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />
      <line x1="0" y1="80" x2="100" y2="80" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />
      <line x1="20" y1="0" x2="20" y2="100" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />
      <line x1="50" y1="0" x2="50" y2="100" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />
      <line x1="80" y1="0" x2="80" y2="100" stroke={palette.border} strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Top Antenna / Sensors */}
      {antennaType === 0 && (
        <g>
          <line x1="50" y1="30" x2="50" y2="12" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="11" r="4.5" fill={palette.eye} />
          <circle cx="50" cy="11" r="2" fill="#FFFFFF" />
        </g>
      )}
      {antennaType === 1 && (
        <g>
          <line x1="36" y1="30" x2="28" y2="14" stroke={palette.accent} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="27" cy="13" r="3.5" fill={palette.eye} />
          <line x1="64" y1="30" x2="72" y2="14" stroke={palette.accent} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="73" cy="13" r="3.5" fill={palette.eye} />
        </g>
      )}
      {antennaType === 2 && (
        <polygon points="44,30 50,12 56,30" fill={palette.accent} stroke={palette.border} strokeWidth="1" />
      )}
      {antennaType === 3 && (
        <g>
          <path d="M 38 18 Q 50 10 62 18" fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />
          <line x1="50" y1="30" x2="50" y2="14" stroke={palette.detail} strokeWidth="2" />
        </g>
      )}
      {antennaType === 4 && (
        <g>
          <rect x="42" y="16" width="16" height="14" rx="2" fill={palette.body} stroke={palette.border} strokeWidth="1.5" />
          <circle cx="50" cy="22" r="3" fill={palette.accent} />
        </g>
      )}
      {antennaType === 5 && (
        <g>
          <line x1="34" y1="30" x2="34" y2="16" stroke={palette.accent} strokeWidth="2" />
          <line x1="50" y1="30" x2="50" y2="10" stroke={palette.accent} strokeWidth="2.5" />
          <line x1="66" y1="30" x2="66" y2="16" stroke={palette.accent} strokeWidth="2" />
          <circle cx="50" cy="9" r="3" fill={palette.eye} />
        </g>
      )}

      {/* Side Ears / Hardware */}
      {earType === 0 && (
        <g>
          <rect x="15" y="44" width="9" height="16" rx="2" fill={palette.body} stroke={palette.border} strokeWidth="1.5" />
          <rect x="76" y="44" width="9" height="16" rx="2" fill={palette.body} stroke={palette.border} strokeWidth="1.5" />
          <circle cx="19.5" cy="52" r="2" fill={palette.accent} />
          <circle cx="80.5" cy="52" r="2" fill={palette.accent} />
        </g>
      )}
      {earType === 1 && (
        <g>
          <line x1="16" y1="46" x2="24" y2="46" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <line x1="14" y1="52" x2="24" y2="52" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="58" x2="24" y2="58" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <line x1="76" y1="46" x2="84" y2="46" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <line x1="76" y1="52" x2="86" y2="52" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
          <line x1="76" y1="58" x2="84" y2="58" stroke={palette.accent} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {earType === 2 && (
        <g>
          <polygon points="16,42 24,47 24,59 16,54" fill={palette.accent} opacity="0.85" />
          <polygon points="84,42 76,47 76,59 84,54" fill={palette.accent} opacity="0.85" />
        </g>
      )}
      {earType === 3 && (
        <g>
          <circle cx="19" cy="52" r="6" fill={palette.body} stroke={palette.accent} strokeWidth="2" />
          <circle cx="81" cy="52" r="6" fill={palette.body} stroke={palette.accent} strokeWidth="2" />
          <circle cx="19" cy="52" r="2" fill={palette.eye} />
          <circle cx="81" cy="52" r="2" fill={palette.eye} />
        </g>
      )}

      {/* Head Base Shape */}
      {headShape === 0 && (
        <rect x="24" y="30" width="52" height="48" rx="6" fill={palette.body} stroke={palette.border} strokeWidth="2" />
      )}
      {headShape === 1 && (
        <g>
          <rect x="24" y="30" width="52" height="48" rx="4" fill={palette.body} stroke={palette.border} strokeWidth="2" />
          <rect x="28" y="34" width="44" height="40" rx="3" fill={palette.bg} stroke={palette.accent} strokeWidth="1" strokeOpacity="0.5" />
        </g>
      )}
      {headShape === 2 && (
        <polygon points="24,40 34,30 66,30 76,40 76,68 66,78 34,78 24,68" fill={palette.body} stroke={palette.border} strokeWidth="2" />
      )}
      {headShape === 3 && (
        <rect x="24" y="30" width="52" height="48" rx="18" fill={palette.body} stroke={palette.border} strokeWidth="2" />
      )}
      {headShape === 4 && (
        <polygon points="24,48 34,30 66,30 76,48 66,78 34,78" fill={palette.body} stroke={palette.border} strokeWidth="2" />
      )}
      {headShape === 5 && (
        <g>
          <polygon points="24,36 32,30 68,30 76,36 76,72 68,78 32,78 24,72" fill={palette.body} stroke={palette.border} strokeWidth="2" />
          <line x1="26" y1="56" x2="74" y2="56" stroke={palette.border} strokeWidth="1.5" />
        </g>
      )}

      {/* Forehead Micro-LED Status Indicator */}
      <circle cx="70" cy="36" r="2.5" fill={ledColor} />
      <circle cx="70" cy="36" r="1.2" fill="#FFFFFF" />

      {/* Eyes / Optics */}
      {eyeType === 0 && (
        <g>
          <rect x="33" y="44" width="10" height="10" rx="1.5" fill={palette.eye} />
          <rect x="35" y="46" width="3" height="3" fill="#FFFFFF" />
          <rect x="57" y="44" width="10" height="10" rx="1.5" fill={palette.eye} />
          <rect x="59" y="46" width="3" height="3" fill="#FFFFFF" />
        </g>
      )}
      {eyeType === 1 && (
        <g>
          <rect x="30" y="44" width="40" height="9" rx="3" fill="#000000" stroke={palette.border} strokeWidth="1" />
          <rect x="32" y="46" width="36" height="5" rx="2" fill={palette.eye} />
          <line x1="36" y1="48.5" x2="64" y2="48.5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}
      {eyeType === 2 && (
        <g>
          <circle cx="38" cy="48" r="6.5" fill="#000000" stroke={palette.accent} strokeWidth="1.5" />
          <circle cx="38" cy="48" r="4" fill={palette.eye} />
          <circle cx="37" cy="47" r="1.5" fill="#FFFFFF" />
          <circle cx="62" cy="48" r="6.5" fill="#000000" stroke={palette.accent} strokeWidth="1.5" />
          <circle cx="62" cy="48" r="4" fill={palette.eye} />
          <circle cx="61" cy="47" r="1.5" fill="#FFFFFF" />
        </g>
      )}
      {eyeType === 3 && (
        <g>
          <g transform="translate(38, 48)">
            <line x1="-5" y1="0" x2="5" y2="0" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="0" y1="-5" x2="0" y2="5" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <g transform="translate(62, 48)">
            <line x1="-5" y1="0" x2="5" y2="0" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="0" y1="-5" x2="0" y2="5" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
      )}
      {eyeType === 4 && (
        <g>
          <rect x="32" y="47" width="13" height="4" rx="1" fill={palette.eye} />
          <rect x="55" y="47" width="13" height="4" rx="1" fill={palette.eye} />
        </g>
      )}
      {eyeType === 5 && (
        <g>
          <path d="M 44 43 L 34 43 L 34 53 L 44 53" fill="none" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 56 43 L 66 43 L 66 53 L 56 53" fill="none" stroke={palette.eye} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="39" cy="48" r="1.5" fill="#FFFFFF" />
          <circle cx="61" cy="48" r="1.5" fill="#FFFFFF" />
        </g>
      )}

      {/* Mouth / Speaker Grills */}
      {mouthType === 0 && (
        <g>
          <rect x="36" y="65" width="4" height="6" rx="1" fill={palette.accent} />
          <rect x="43" y="62" width="4" height="9" rx="1" fill={palette.accent} />
          <rect x="50" y="60" width="4" height="11" rx="1" fill={palette.accent} />
          <rect x="57" y="62" width="4" height="9" rx="1" fill={palette.accent} />
          <rect x="64" y="65" width="4" height="6" rx="1" fill={palette.accent} />
        </g>
      )}
      {mouthType === 1 && (
        <g>
          <line x1="36" y1="62" x2="64" y2="62" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" />
          <line x1="38" y1="66" x2="62" y2="66" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" />
          <line x1="42" y1="70" x2="58" y2="70" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {mouthType === 2 && (
        <polyline
          points="35,66 40,62 45,69 50,63 55,68 60,62 65,66"
          fill="none"
          stroke={palette.accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {mouthType === 3 && (
        <g>
          <circle cx="38" cy="65" r="2" fill={palette.accent} />
          <circle cx="46" cy="65" r="2" fill={palette.accent} />
          <circle cx="54" cy="65" r="2" fill={palette.accent} />
          <circle cx="62" cy="65" r="2" fill={palette.accent} />
        </g>
      )}
      {mouthType === 4 && (
        <g>
          <rect x="34" y="62" width="32" height="8" rx="2" fill="#000000" stroke={palette.border} strokeWidth="1" />
          <line x1="40" y1="62" x2="40" y2="70" stroke={palette.accent} strokeWidth="1" strokeOpacity="0.7" />
          <line x1="46" y1="62" x2="46" y2="70" stroke={palette.accent} strokeWidth="1" strokeOpacity="0.7" />
          <line x1="52" y1="62" x2="52" y2="70" stroke={palette.accent} strokeWidth="1" strokeOpacity="0.7" />
          <line x1="58" y1="62" x2="58" y2="70" stroke={palette.accent} strokeWidth="1" strokeOpacity="0.7" />
        </g>
      )}
      {mouthType === 5 && (
        <path
          d="M 36 63 Q 50 71 64 63"
          fill="none"
          stroke={palette.accent}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
});

DeterministicBotSvg.displayName = 'DeterministicBotSvg';

export const AgentAvatar: React.FC<AgentAvatarProps> = React.memo(({
  avatar,
  name = 'Agent',
  id,
  className = 'w-10 h-10',
}) => {
  // Clean canonical seed
  const canonicalSeed = useMemo(() => {
    let rawSeed = (id || name || 'agent').trim();
    if (rawSeed.startsWith('@')) {
      rawSeed = rawSeed.substring(1);
    }
    return rawSeed.toLowerCase() || 'agent';
  }, [id, name]);

  // Is this an actual external / custom image (data URL, upload, or full external HTTP link not equal to 'U')
  const isCustomUrl = useMemo(() => {
    if (!avatar) return false;
    const clean = avatar.trim();
    if (clean === 'U' || clean === 'A' || clean === '' || clean.length <= 2) return false;
    if (failedUrlsCache.has(clean)) return false;
    return (
      clean.startsWith('data:image') ||
      clean.startsWith('http://') ||
      clean.startsWith('https://') ||
      clean.startsWith('/')
    );
  }, [avatar]);

  const [imgFailed, setImgFailed] = useState(() => {
    if (!isCustomUrl) return true;
    return failedUrlsCache.has(avatar!.trim());
  });

  const [isImgLoaded, setIsImgLoaded] = useState(() => {
    if (!isCustomUrl) return false;
    return loadedUrlsCache.has(avatar!.trim());
  });

  useEffect(() => {
    if (!isCustomUrl) {
      setImgFailed(true);
      setIsImgLoaded(false);
      return;
    }
    const clean = avatar!.trim();
    if (failedUrlsCache.has(clean)) {
      setImgFailed(true);
      setIsImgLoaded(false);
    } else if (loadedUrlsCache.has(clean)) {
      setImgFailed(false);
      setIsImgLoaded(true);
    } else {
      setImgFailed(false);
      setIsImgLoaded(false);
    }
  }, [avatar, isCustomUrl]);

  const handleImgLoad = () => {
    if (avatar) {
      loadedUrlsCache.add(avatar.trim());
    }
    setIsImgLoaded(true);
    setImgFailed(false);
  };

  const handleImgError = () => {
    if (avatar) {
      failedUrlsCache.add(avatar.trim());
    }
    setImgFailed(true);
    setIsImgLoaded(false);
  };

  return (
    <div
      className={`relative bg-[#0F172A] border border-[#141414] flex items-center justify-center overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
    >
      {/* 1. Instant Deterministic Cyber Bot SVG (renders immediately, zero flash, 100% reliable) */}
      <DeterministicBotSvg seed={canonicalSeed} />

      {/* 2. Optional Custom Image Overlay if user provided an uploaded avatar image */}
      {isCustomUrl && !imgFailed && (
        <img
          src={avatar!.trim()}
          alt={name}
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={`absolute inset-0 w-full h-full object-cover bg-transparent z-10 transition-opacity duration-150 ${
            isImgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';

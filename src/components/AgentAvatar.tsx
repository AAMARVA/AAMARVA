import React, { useState, useEffect, useMemo } from 'react';

interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
}

// Global memory cache to track already-loaded image URLs and prevent blinks on subsequent renders/mounts
const loadedUrlsCache = new Set<string>();

export const AgentAvatar: React.FC<AgentAvatarProps> = React.memo(({
  avatar,
  name = 'Agent',
  id,
  className = 'w-10 h-10',
}) => {
  // Clean identifier seed (e.g., '@AMR-C59G-GX6D' -> 'amr-c59g-gx6d', or 'kd' -> 'kd')
  const canonicalSeed = useMemo(() => {
    let rawSeed = (id || name || 'agent').trim();
    if (rawSeed.startsWith('@')) {
      rawSeed = rawSeed.substring(1);
    }
    return rawSeed.toLowerCase();
  }, [id, name]);

  const canonicalRobotUrl = useMemo(() => {
    return `https://robohash.org/${encodeURIComponent(canonicalSeed)}.png?set=set1`;
  }, [canonicalSeed]);

  const dicebearFallback = useMemo(() => {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(canonicalSeed)}`;
  }, [canonicalSeed]);

  // Determine final image source
  const src = useMemo(() => {
    let result = canonicalRobotUrl;
    if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('data:') || avatar.startsWith('/'))) {
      // Strip bgset parameter if present to prevent Cloudflare 525 origin errors on robohash
      result = avatar.replace(/([?&])bgset=[^&]*&?/g, '$1').replace(/[?&]$/, '');
    }
    return result;
  }, [avatar, canonicalRobotUrl]);

  // Loading state with cache check to bypass animation for already cached images
  const [isLoaded, setIsLoaded] = useState(() => loadedUrlsCache.has(src));
  const [currentSrc, setCurrentSrc] = useState(src);

  // Sync src changes
  useEffect(() => {
    if (loadedUrlsCache.has(src)) {
      setIsLoaded(true);
      setCurrentSrc(src);
    } else {
      setIsLoaded(false);
      setCurrentSrc(src);
    }
  }, [src]);

  const handleLoad = () => {
    loadedUrlsCache.add(currentSrc);
    setIsLoaded(true);
  };

  const handleError = () => {
    if (currentSrc !== dicebearFallback) {
      setCurrentSrc(dicebearFallback);
    }
  };

  // Safe monogram placeholder based on canonical seed
  const monogram = useMemo(() => {
    return canonicalSeed.substring(0, 2).toUpperCase() || 'AG';
  }, [canonicalSeed]);

  return (
    <div
      className={`relative bg-[#D6D4D0] border border-[#141414] text-[#141414] flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
    >
      {/* Monogram or low-fidelity skeleton showing immediately under the image while it loads */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#E4E3E0] text-xs font-bold tracking-wider text-[#7A7875] z-0">
          {monogram}
        </div>
      )}

      <img
        src={currentSrc}
        alt={name}
        onLoad={handleLoad}
        onError={handleError}
        className={`w-full h-full object-cover bg-transparent relative z-10 transition-opacity duration-200 ease-in-out ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';

import React, { useMemo, useState, useEffect } from 'react';

interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = React.memo(({
  avatar,
  name = 'Agent',
  id,
  className = 'w-10 h-10',
}) => {
  // Clean identifier seed (e.g. '@kd' -> 'kd', 'AMR-ZQWT-TSH6' -> 'amr-zqwt-tsh6')
  const canonicalSeed = useMemo(() => {
    let rawSeed = (id || name || 'agent').trim();
    if (rawSeed.startsWith('@')) {
      rawSeed = rawSeed.substring(1);
    }
    return rawSeed.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'agent';
  }, [id, name]);

  const defaultRobohashUrl = useMemo(() => {
    return `https://robohash.org/${encodeURIComponent(canonicalSeed)}.png?set=set1&size=150x150`;
  }, [canonicalSeed]);

  const initialUrl = useMemo(() => {
    if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/'))) {
      if (avatar.includes('robohash.org')) {
        const cleanUrl = avatar.split('?')[0];
        return `${cleanUrl}?set=set1&size=150x150`;
      }
      return avatar;
    }
    return defaultRobohashUrl;
  }, [avatar, defaultRobohashUrl]);

  const [currentSrc, setCurrentSrc] = useState(initialUrl);

  // Sync state if avatar or seed changes
  useEffect(() => {
    setCurrentSrc(initialUrl);
  }, [initialUrl]);

  const handleError = () => {
    // If a custom URL failed, fail over to default RoboHash
    if (currentSrc !== defaultRobohashUrl) {
      setCurrentSrc(defaultRobohashUrl);
    }
  };

  return (
    <div
      className={`relative bg-[#D6D4D0] border border-[#141414] text-[#141414] flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
    >
      <img
        src={currentSrc}
        alt=""
        loading="lazy"
        decoding="async"
        onError={handleError}
        className="w-full h-full object-cover bg-transparent relative z-10 block"
      />
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';

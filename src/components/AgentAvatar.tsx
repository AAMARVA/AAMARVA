import React, { useMemo } from 'react';

export interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
  isMaster?: boolean;
  isSlave?: boolean;
  accountType?: 'master' | 'slave';
}

/**
 * Strict AgentAvatar component that only renders the provided avatar URL/path.
 * No fallbacks (Robohash, initials, etc.) are included.
 */
export const AgentAvatar: React.FC<AgentAvatarProps> = React.memo(({
  avatar,
  className = 'w-10 h-10',
}) => {
  const currentSrc = useMemo(() => {
    if (avatar && typeof avatar === 'string' && avatar.trim().length > 0) {
      const trimmed = avatar.trim();
      // Only render if it looks like a valid image source (URL or path)
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('data:')
      ) {
        return trimmed;
      }
    }
    return '';
  }, [avatar]);

  if (!currentSrc) return null;

  return (
    <div
      className={`relative bg-[#141414] border border-[#141414] text-white flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] select-none ${className}`}
    >
      <img
        src={currentSrc}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover bg-transparent relative z-10 block"
      />
    </div>
  );
});

AgentAvatar.displayName = 'AgentAvatar';

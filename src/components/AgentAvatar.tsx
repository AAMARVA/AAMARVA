import React from 'react';

interface AgentAvatarProps {
  avatar?: string;
  name?: string;
  id?: string;
  className?: string;
  size?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({
  avatar,
  name = 'Agent',
  id,
  className = 'w-10 h-10',
}) => {
  // Clean identifier seed (e.g., '@AMR-C59G-GX6D' -> 'amr-c59g-gx6d', or 'kd' -> 'kd')
  let rawSeed = (id || name || 'agent').trim();
  if (rawSeed.startsWith('@')) {
    rawSeed = rawSeed.substring(1);
  }
  const canonicalSeed = rawSeed.toLowerCase();
  const canonicalRobotUrl = `https://robohash.org/${encodeURIComponent(canonicalSeed)}.png?set=set1`;

  // Determine if avatar is a true custom uploaded image vs a generic/stale avatar
  const isCustomUploadedImage =
    avatar &&
    (avatar.startsWith('data:') || avatar.startsWith('/uploads/')) &&
    !avatar.startsWith('/icon') &&
    !avatar.startsWith('/favicon');

  // If avatar is a Robohash URL for the old generic 'Agentic100.png', ignore it and use canonicalRobotUrl
  const isGenericAgentic100 = avatar && avatar.includes('Agentic100.png');

  let src = canonicalRobotUrl;

  if (isCustomUploadedImage) {
    src = avatar;
  } else if (avatar && (avatar.startsWith('http://') || avatar.startsWith('https://')) && !isGenericAgentic100) {
    // If an explicit URL is provided that is not the generic Agentic100 placeholder, use it
    src = avatar;
  } else {
    // Default to the deterministic canonical robot avatar derived from the agent's unique handle/ID/name
    src = canonicalRobotUrl;
  }

  return (
    <div
      className={`relative bg-[#141414] border border-[#141414] text-[#141414] flex items-center justify-center font-mono overflow-hidden shrink-0 shadow-[1px_1px_0px_0px_rgba(20,20,20,0.3)] ${className}`}
    >
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover bg-[#E4E3E0] relative z-10"
        referrerPolicy="no-referrer"
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src !== canonicalRobotUrl) {
            target.src = canonicalRobotUrl;
          }
        }}
      />
    </div>
  );
};

